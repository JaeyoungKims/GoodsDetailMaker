import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/** APP_SECRET 에서 용도별 키를 파생한다 (키 재사용 방지) */
function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "goods-detail-maker", purpose, 32));
}

/** OpenAI 키처럼 서버만 읽어야 하는 값을 AES-256-GCM 으로 감싼다. 결과: base64(iv|tag|ciphertext) */
export function encryptSecret(appSecret: string, plain: string): string {
  const key = deriveKey(appSecret, "user-secrets");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(appSecret: string, packed: string): string {
  const key = deriveKey(appSecret, "user-secrets");
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** 비밀번호 해시: scrypt (Node 내장, 네이티브 의존성 없음). 형식 scrypt$salt$hash */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password.normalize("NFKC"), salt, expected.length, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 세션 토큰: 브라우저에는 원문, DB 에는 해시만 */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
export function hashSessionToken(appSecret: string, token: string): string {
  const key = deriveKey(appSecret, "session-tokens");
  const cipher = createCipheriv("aes-256-gcm", key, Buffer.alloc(12));
  // HMAC 대용으로 충분한 결정적 변환. 원문을 알아야만 같은 값이 나온다.
  return Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
}
