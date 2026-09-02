import { useCallback, useRef, useState, type FormEvent } from "react";
import { TurnstileWidget } from "@/features/auth/TurnstileWidget";
import { resolveSiteKey } from "@/features/auth/turnstile";
import { supabase } from "@/lib/supabase";

const SITE_KEY = resolveSiteKey(import.meta.env.VITE_TURNSTILE_SITE_KEY);

/** 이메일 매직링크 로그인 + Turnstile. 토큰은 1회용이라 제출할 때마다 위젯을 리셋한다. */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const tokenRef = useRef<string | null>(null);
  const busy = useRef(false);

  const onTokenChange = useCallback((token: string | null) => {
    tokenRef.current = token;
    setCaptchaToken(token);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const normalized = email.trim().toLowerCase();
    setMessage(null);
    if (!normalized) {
      setMessage("이메일 주소를 입력해 주세요.");
      return;
    }
    const token = tokenRef.current;
    if (!token) {
      setMessage("먼저 보안 확인을 완료해 주세요.");
      return;
    }

    busy.current = true;
    setSending(true);
    tokenRef.current = null;
    setCaptchaToken(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { captchaToken: token, emailRedirectTo: window.location.origin },
      });
      setMessage(
        error
          ? "로그인 링크를 보내지 못했습니다. 보안 확인 후 다시 시도해 주세요."
          : "로그인 링크를 이메일로 보냈습니다. 받은편지함을 확인해 주세요.",
      );
    } catch {
      setMessage("로그인 링크를 보내지 못했습니다. 보안 확인 후 다시 시도해 주세요.");
    } finally {
      setResetSignal((n) => n + 1);
      busy.current = false;
      setSending(false);
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
          <h2>제작실에 로그인</h2>
          <p>비밀번호 없이 이메일로 받은 안전한 링크를 눌러 로그인합니다.</p>
          <label htmlFor="email">이메일 주소</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={sending}
            placeholder="name@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          <TurnstileWidget
            siteKey={SITE_KEY}
            resetSignal={resetSignal}
            onTokenChange={onTokenChange}
          />
          <button
            type="submit"
            disabled={sending || !captchaToken}
            aria-describedby="turnstile-status"
          >
            {sending ? "보내는 중…" : "이메일 로그인 링크 받기"}
          </button>
          {message && (
            <p className="login-message" role="status" aria-live="polite">
              {message}
            </p>
          )}
          <div className="login-security">
            <span aria-hidden="true">✓</span>
            <p>
              <strong>비밀번호를 저장하지 않아요</strong>
              <small>로그인 링크는 본인 이메일로만 전송됩니다.</small>
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}
