// 소셜 계정 연결·해제와 관리자 발급 비밀번호 재설정 토큰 처리
import { PASSWORD_RESET_HOURS, type OAuthProvider } from "@gdm/shared";
import type { Sql } from "../db/client.js";
import type { AppConfig } from "../env.js";
import { ApiError } from "../lib/errors.js";
import { hashPassword, hashSessionToken, newSessionToken } from "./crypto.js";
import type { OAuthProfile } from "./oauth.js";

/**
 * 소셜 로그인 결과를 계정에 붙인다.
 * 1) 이미 연결된 identity 면 그 계정으로 로그인
 * 2) 로그인 상태에서 왔으면 현재 계정에 연결
 * 3) 제공자가 검증한 이메일이면 같은 이메일의 기존 계정에 연결 (미검증이면 거부)
 * 4) 계정이 없으면 가입 허용 여부에 따라 새로 만든다
 */
export async function resolveOAuthLogin(
  sql: Sql,
  config: AppConfig,
  provider: OAuthProvider,
  profile: OAuthProfile,
  currentUserId: string | null,
): Promise<string> {
  const [linked] = await sql<{ user_id: string }[]>`
    select user_id from user_identities
     where provider = ${provider} and provider_user_id = ${profile.providerUserId}`;
  if (linked) {
    if (currentUserId && currentUserId !== linked.user_id)
      throw new ApiError("OAUTH_ALREADY_LINKED", 409);
    return linked.user_id;
  }

  if (currentUserId) {
    await linkIdentity(sql, provider, profile, currentUserId);
    return currentUserId;
  }

  const email = profile.email?.trim().toLowerCase() ?? null;
  if (!email) throw new ApiError("OAUTH_EMAIL_REQUIRED", 400);

  const [existing] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
  if (existing) {
    // 제공자가 소유를 확인해 준 이메일일 때만 자동 연결한다. 아니면 기존 계정 탈취가 된다.
    if (!profile.emailVerified) throw new ApiError("OAUTH_LINK_REQUIRES_LOGIN", 409);
    await linkIdentity(sql, provider, profile, existing.id);
    return existing.id;
  }

  if (!config.ALLOW_SIGNUP) throw new ApiError("SIGNUP_DISABLED", 403);
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  const role = (count?.n ?? 0) === 0 ? "admin" : "user"; // 첫 계정이 관리자
  const [created] = await sql<{ id: string }[]>`
    insert into users (email, display_name, role)
    values (${email}, ${profile.displayName}, ${role})
    returning id`;
  if (!created) throw new ApiError("EMAIL_TAKEN", 409);
  await linkIdentity(sql, provider, profile, created.id);
  return created.id;
}

async function linkIdentity(
  sql: Sql,
  provider: OAuthProvider,
  profile: OAuthProfile,
  userId: string,
): Promise<void> {
  await sql`
    insert into user_identities (provider, provider_user_id, user_id, profile)
    values (${provider}, ${profile.providerUserId}, ${userId}, ${sql.json({
      email: profile.email,
      emailVerified: profile.emailVerified,
      displayName: profile.displayName,
    })})
    on conflict (provider, provider_user_id) do nothing`;
}

export interface LinkedIdentity {
  provider: string;
  createdAt: string;
}

export async function listIdentities(sql: Sql, userId: string): Promise<LinkedIdentity[]> {
  const rows = await sql<{ provider: string; created_at: Date }[]>`
    select provider, created_at from user_identities where user_id = ${userId} order by created_at`;
  return rows.map((r) => ({ provider: r.provider, createdAt: r.created_at.toISOString() }));
}

/** 마지막 남은 로그인 수단은 끊지 못하게 막는다 */
export async function unlinkIdentity(
  sql: Sql,
  userId: string,
  provider: OAuthProvider,
): Promise<void> {
  const [user] = await sql<{ password_hash: string | null }[]>`
    select password_hash from users where id = ${userId}`;
  const others = await sql<{ provider: string }[]>`
    select provider from user_identities where user_id = ${userId} and provider <> ${provider}`;
  if (!user?.password_hash && others.length === 0) throw new ApiError("LAST_LOGIN_METHOD", 409);

  const removed = await sql`
    delete from user_identities where user_id = ${userId} and provider = ${provider} returning provider`;
  if (removed.length === 0) throw new ApiError("IDENTITY_NOT_FOUND", 404);
}

export interface ResetLink {
  url: string;
  expiresAt: string;
}

/** 관리자가 사용자를 골라 재설정 링크를 만든다. 링크는 관리자가 직접 전달한다(메일 발송 없음). */
export async function issueResetLink(
  sql: Sql,
  config: AppConfig,
  email: string,
  issuedBy: string,
): Promise<ResetLink> {
  const [user] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
  if (!user) throw new ApiError("USER_NOT_FOUND", 404);

  // 같은 사용자의 이전 링크는 무효화한다
  await sql`delete from password_resets where user_id = ${user.id} and used_at is null`;

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_HOURS * 60 * 60 * 1000);
  await sql`
    insert into password_resets (id, user_id, issued_by, expires_at)
    values (${hashSessionToken(config.APP_SECRET, token)}, ${user.id}, ${issuedBy}, ${expiresAt})`;

  const base = config.PUBLIC_BASE_URL.replace(/\/+$/, "");
  return { url: `${base}/reset?token=${token}`, expiresAt: expiresAt.toISOString() };
}

/** 재설정 적용. 성공하면 그 사용자의 모든 세션을 끊는다. */
export async function applyReset(
  sql: Sql,
  config: AppConfig,
  token: string,
  password: string,
): Promise<void> {
  const id = hashSessionToken(config.APP_SECRET, token);
  const [row] = await sql<{ user_id: string }[]>`
    select user_id from password_resets
     where id = ${id} and used_at is null and expires_at > now()`;
  if (!row) throw new ApiError("RESET_TOKEN_INVALID", 400);

  await sql.begin(async (tx) => {
    await tx`update users set password_hash = ${hashPassword(password)}, updated_at = now()
              where id = ${row.user_id}`;
    await tx`update password_resets set used_at = now() where id = ${id}`;
    await tx`delete from sessions where user_id = ${row.user_id}`;
  });
}
