import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { OAUTH_PROVIDER_LABELS, PASSWORD_MIN_LENGTH, type OAuthProvider } from "@gdm/shared";
import { useAuth } from "@/features/auth/useAuth";
import { authApi } from "@/lib/api/auth";
import { ApiRequestError } from "@/lib/api/http";

type Mode = "login" | "signup";

/** 소셜 로그인 콜백이 ?authError=CODE 로 돌려보낸 실패 사유 */
function oauthMessageFor(code: string): string {
  switch (code) {
    case "OAUTH_PROVIDER_DISABLED":
      return "지금은 쓸 수 없는 로그인 방식입니다.";
    case "OAUTH_STATE_INVALID":
      return "로그인 요청이 만료되었습니다. 다시 시도해 주세요.";
    case "OAUTH_EXCHANGE_FAILED":
      return "소셜 로그인 제공자와 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "OAUTH_EMAIL_REQUIRED":
      return "이메일 제공에 동의해야 로그인할 수 있습니다.";
    case "OAUTH_LINK_REQUIRES_LOGIN":
      return "같은 이메일의 계정이 이미 있습니다. 비밀번호로 로그인한 뒤 설정에서 연결해 주세요.";
    case "OAUTH_ALREADY_LINKED":
      return "이 소셜 계정은 다른 계정에 연결돼 있습니다.";
    case "SIGNUP_DISABLED":
      return "지금은 새 계정을 만들 수 없습니다. 운영자에게 문의해 주세요.";
    default:
      return "소셜 로그인을 마치지 못했습니다. 다시 시도해 주세요.";
  }
}

function messageFor(err: unknown, mode: Mode): string {
  const code = err instanceof ApiRequestError ? err.code : "";
  switch (code) {
    case "INVALID_CREDENTIALS":
      return mode === "login"
        ? "이메일 또는 비밀번호가 맞지 않습니다."
        : `이메일 형식과 비밀번호(${PASSWORD_MIN_LENGTH}자 이상)를 확인해 주세요.`;
    case "EMAIL_TAKEN":
      return "이미 가입된 이메일입니다. 로그인해 주세요.";
    case "SIGNUP_DISABLED":
      return "지금은 새 계정을 만들 수 없습니다. 운영자에게 문의해 주세요.";
    default:
      return "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

/** 이메일+비밀번호 로그인·가입. 첫 계정이 관리자가 된다. 소셜 로그인은 추후 이 화면에 버튼으로 추가. */
export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);

  const authError = params.get("authError");

  useEffect(() => {
    authApi
      .providers()
      .then(setProviders)
      .catch(() => setProviders([]));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "login") await signIn(email.trim().toLowerCase(), password);
      else await signUp(email.trim().toLowerCase(), password);
    } catch (err) {
      setMessage(messageFor(err, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="서비스 소개">
        <p className="page-eyebrow">
          <span>13</span> DETAIL PAGE MAKER
        </p>
        <h1>
          한 번 입력하고,
          <br />
          <em>전환 퍼널 13장을</em> 만드세요
        </h1>
        <p>
          상품 하나를 등록하면 AI가 구매까지 이어지는 13단계를 기획하고 각각 독립적으로 생성합니다.
        </p>
        <ol className="login-flow">
          <li>
            <span>01</span>
            <p>
              <strong>상품 정보 입력</strong>
              <small>사진과 핵심 장점을 한 번만</small>
            </p>
          </li>
          <li>
            <span>02</span>
            <p>
              <strong>13장 독립 생성</strong>
              <small>각 이미지가 병렬로 처리</small>
            </p>
          </li>
          <li>
            <span>03</span>
            <p>
              <strong>완성본 다운로드</strong>
              <small>개별 JPG · ZIP · 세로 합본</small>
            </p>
          </li>
        </ol>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={onSubmit}>
          <h2>{mode === "login" ? "제작실에 로그인" : "계정 만들기"}</h2>
          <p>
            {mode === "login"
              ? "이메일과 비밀번호로 로그인합니다."
              : `이메일과 비밀번호(${PASSWORD_MIN_LENGTH}자 이상)로 계정을 만듭니다. 첫 계정은 관리자가 됩니다.`}
          </p>
          <label htmlFor="email">이메일 주소</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={busy}
            placeholder="name@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? "확인 중…" : mode === "login" ? "로그인" : "가입하고 시작하기"}
          </button>
          {(message || authError) && (
            <p className="login-message" role="status" aria-live="polite">
              {message ?? oauthMessageFor(authError as string)}
            </p>
          )}
          {providers.length > 0 && (
            <div className="login-providers">
              <span className="login-divider">또는</span>
              {providers.map((provider) => (
                <a
                  key={provider}
                  className={`login-provider login-provider--${provider}`}
                  href={`/api/auth/oauth/${provider}?next=/`}
                >
                  {OAUTH_PROVIDER_LABELS[provider]} 계정으로 계속하기
                </a>
              ))}
            </div>
          )}
          <button
            type="button"
            className="login-switch"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage(null);
            }}
          >
            {mode === "login" ? "계정이 없으신가요? 만들기" : "이미 계정이 있으신가요? 로그인"}
          </button>
          <div className="login-security">
            <span aria-hidden="true">✓</span>
            <p>
              <strong>비밀번호는 해시로만 저장합니다</strong>
              <small>내 서버에서만 처리되고 외부로 나가지 않습니다.</small>
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}
