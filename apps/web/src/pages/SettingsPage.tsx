import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useAccessToken } from "@/features/auth/useAuth";
import { settingsApi } from "@/lib/api/settings";

export function SettingsPage() {
  const token = useAccessToken();
  const [key, setKey] = useState("");
  const [lastFour, setLastFour] = useState<string | null>(null);
  const [parallelism, setParallelism] = useState<5 | 10>(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    settingsApi
      .getImageParallelism(token)
      .then(setParallelism)
      .catch(() => setMessage("생성 속도 설정을 불러오지 못했습니다."));
  }, [token]);

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
      </div>
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
    </main>
  );
}
