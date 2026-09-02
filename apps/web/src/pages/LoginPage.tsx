import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

/**
 * 이메일 매직링크 로그인.
 * TODO(turnstile): Cloudflare Turnstile 위젯을 붙이고 captchaToken 을 signInWithOtp 에 넘긴다.
 */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setMessage("이메일 주소를 입력해 주세요.");
      return;
    }
    setSending(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    setMessage(
      error
        ? "로그인 링크를 보내지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "로그인 링크를 이메일로 보냈습니다. 받은편지함을 확인해 주세요.",
    );
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-label="서비스 소개">
        <p className="page-eyebrow">13 DETAIL PAGE MAKER</p>
        <h1>
          한 번 입력하고,
          <br />
          <em>전환 퍼널 13장을</em> 만드세요
        </h1>
        <p>
          상품 하나를 등록하면 AI가 구매까지 이어지는 13단계를 기획하고 각각 독립적으로 생성합니다.
        </p>
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
          <button type="submit" disabled={sending}>
            {sending ? "보내는 중…" : "이메일 로그인 링크 받기"}
          </button>
          {message && <p role="status">{message}</p>}
        </form>
      </section>
    </main>
  );
}
