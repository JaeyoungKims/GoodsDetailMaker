// 관리자가 발급한 링크(/reset?token=...)로 새 비밀번호를 지정하는 화면
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { PASSWORD_MIN_LENGTH } from "@gdm/shared";
import { authApi } from "@/lib/api/auth";
import { ApiRequestError } from "@/lib/api/http";

function messageFor(err: unknown): string {
  const code = err instanceof ApiRequestError ? err.code : "";
  if (code === "RESET_TOKEN_INVALID")
    return "링크가 만료되었거나 이미 사용되었습니다. 관리자에게 새 링크를 요청해 주세요.";
  if (code === "INVALID_CREDENTIALS")
    return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  return "비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) return setMessage("두 비밀번호가 서로 다릅니다.");
    setBusy(true);
    setMessage(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setMessage(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-panel auth-standalone">
      <div className="login-card">
        <h2>새 비밀번호 지정</h2>
        {!token ? (
          <>
            <p>링크가 올바르지 않습니다. 관리자에게 재설정 링크를 다시 요청해 주세요.</p>
            <Link className="login-switch" to="/">
              로그인 화면으로
            </Link>
          </>
        ) : done ? (
          <>
            <p>비밀번호를 바꿨습니다. 기존에 로그인돼 있던 기기는 모두 로그아웃됩니다.</p>
            <Link className="login-switch" to="/">
              새 비밀번호로 로그인하기
            </Link>
          </>
        ) : (
          <form className="login-card" onSubmit={onSubmit}>
            <p>{PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.</p>
            <label htmlFor="new-password">새 비밀번호</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label htmlFor="confirm-password">새 비밀번호 확인</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              {busy ? "바꾸는 중…" : "비밀번호 바꾸기"}
            </button>
            {message && (
              <p className="login-message" role="status" aria-live="polite">
                {message}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
