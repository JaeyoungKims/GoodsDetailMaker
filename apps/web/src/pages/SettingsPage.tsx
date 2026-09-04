import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { OAUTH_PROVIDER_LABELS, PASSWORD_RESET_HOURS, type OAuthProvider } from "@gdm/shared";
import { useAccessToken, useAuth } from "@/features/auth/useAuth";
import { authApi, type LinkedIdentity } from "@/lib/api/auth";
import { settingsApi } from "@/lib/api/settings";

export function SettingsPage() {
  const token = useAccessToken();
  const { user } = useAuth();
  const [key, setKey] = useState("");
  const [lastFour, setLastFour] = useState<string | null>(null);
  const [parallelism, setParallelism] = useState<5 | 10>(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [identities, setIdentities] = useState<LinkedIdentity[]>([]);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLink, setResetLink] = useState<string | null>(null);

  useEffect(() => {
    settingsApi
      .getImageParallelism(token)
      .then(setParallelism)
      .catch(() => setMessage("생성 속도 설정을 불러오지 못했습니다."));
  }, [token]);

  useEffect(() => {
    authApi
      .providers()
      .then(setProviders)
      .catch(() => setProviders([]));
    void reloadIdentities();
  }, []);

  async function reloadIdentities() {
    setIdentities(await authApi.identities().catch(() => []));
  }

  async function unlink(provider: OAuthProvider) {
    if (!window.confirm(`${OAUTH_PROVIDER_LABELS[provider]} 계정 연결을 끊을까요?`)) return;
    setBusy(true);
    try {
      await authApi.unlinkIdentity(provider);
      await reloadIdentities();
      setMessage(`${OAUTH_PROVIDER_LABELS[provider]} 연결을 끊었습니다.`);
    } catch {
      setMessage("마지막 남은 로그인 수단은 끊을 수 없습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function createResetLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResetLink(null);
    try {
      const link = await authApi.issueResetLink(resetEmail.trim().toLowerCase());
      setResetLink(link.url);
      setMessage(`링크를 만들었습니다. ${PASSWORD_RESET_HOURS}시간 안에 사용해야 합니다.`);
    } catch {
      setMessage("그 이메일의 계정을 찾지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) return setMessage("OpenAI API 키를 입력해 주세요.");
    setBusy(true);
    try {
      const result = await settingsApi.storeOpenAiKey(token, key.trim());
      setLastFour(result.lastFour);
      setKey("");
      setMessage("API 키를 안전하게 저장했습니다.");
    } catch {
      setMessage("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    if (!window.confirm("저장한 OpenAI API 키를 삭제할까요?")) return;
    setBusy(true);
    try {
      await settingsApi.removeOpenAiKey(token);
      setLastFour(null);
      setMessage("저장한 API 키를 삭제했습니다.");
    } catch {
      setMessage("삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function changeSpeed(value: 5 | 10) {
    setBusy(true);
    try {
      setParallelism(await settingsApi.setImageParallelism(token, value));
      setMessage(`${value === 5 ? "가성비 동시 5개" : "고속 동시 10개"}로 저장했습니다.`);
    } catch {
      setMessage("생성 속도를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings-page">
      <nav className="settings-nav" aria-label="설정 메뉴">
        <Link to="/">← 제작실로 돌아가기</Link>
      </nav>
      <header className="settings-hero">
        <h1>내 작업 환경을 설정하세요</h1>
        <p>API 키는 암호화해 보관하고, 이미지 생성 요청에만 사용합니다.</p>
      </header>
      <div className="settings-grid">
        <section className="settings-card" aria-labelledby="openai-key-heading">
          <h2 id="openai-key-heading">OpenAI API 키</h2>
          <form className="api-key-form" onSubmit={saveKey}>
            <label htmlFor="openai-key">API 키</label>
            <input
              id="openai-key"
              type="password"
              autoComplete="off"
              value={key}
              disabled={busy}
              placeholder="sk-proj-••••••••••••••••"
              onChange={(e) => setKey(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              {busy ? "저장 중…" : "안전하게 저장"}
            </button>
          </form>
          <p>
            {lastFour ? (
              <>
                현재 저장된 키 <strong>••••{lastFour}</strong>
              </>
            ) : (
              "저장된 API 키가 없습니다."
            )}
          </p>
          <button
            className="danger-button"
            type="button"
            disabled={busy || !lastFour}
            onClick={removeKey}
          >
            API 키 삭제
          </button>
        </section>
        <section className="settings-card" aria-labelledby="image-speed-heading">
          <h2 id="image-speed-heading">이미지 생성 속도</h2>
          <label className="speed-control" htmlFor="image-speed">
            <span>동시 생성 설정</span>
            <select
              id="image-speed"
              value={parallelism}
              disabled={busy}
              onChange={(e) => void changeSpeed(Number(e.target.value) === 10 ? 10 : 5)}
            >
              <option value={5}>가성비 동시 5개 — 신규 API 계정 권장</option>
              <option value={10}>고속 동시 10개 — 한도가 충분한 계정</option>
            </select>
          </label>
        </section>
        <section className="settings-card" aria-labelledby="identities-heading">
          <h2 id="identities-heading">연결된 로그인</h2>
          <ul className="identity-list">
            {providers.map((provider) => {
              const linked = identities.some((i) => i.provider === provider);
              return (
                <li key={provider} className="identity-row">
                  <span>{OAUTH_PROVIDER_LABELS[provider]}</span>
                  {linked ? (
                    <button type="button" disabled={busy} onClick={() => void unlink(provider)}>
                      연결 끊기
                    </button>
                  ) : (
                    <a href={`/api/auth/oauth/${provider}?next=/settings`}>연결하기</a>
                  )}
                </li>
              );
            })}
          </ul>
          {providers.length === 0 && <p>서버에 소셜 로그인 클라이언트가 설정되지 않았습니다.</p>}
        </section>
        {user?.role === "admin" && (
          <section className="settings-card" aria-labelledby="reset-heading">
            <h2 id="reset-heading">비밀번호 재설정 링크</h2>
            <p>
              메일 발송 기능이 없어 관리자가 링크를 만들어 직접 전달합니다. 유효 시간은{" "}
              {PASSWORD_RESET_HOURS}시간입니다.
            </p>
            <form className="api-key-form" onSubmit={createResetLink}>
              <label htmlFor="reset-email">대상 이메일</label>
              <input
                id="reset-email"
                type="email"
                required
                value={resetEmail}
                disabled={busy}
                placeholder="name@example.com"
                onChange={(e) => setResetEmail(e.target.value)}
              />
              <button type="submit" disabled={busy}>
                {busy ? "만드는 중…" : "링크 만들기"}
              </button>
            </form>
            {resetLink && (
              <code className="reset-link" title="이 주소를 사용자에게 전달하세요">
                {resetLink}
              </code>
            )}
          </section>
        )}
      </div>
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
    </main>
  );
}
