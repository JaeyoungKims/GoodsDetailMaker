import { useEffect, useRef, useState } from "react";
import { loadTurnstile, type TurnstileApi } from "./turnstile";

interface Props {
  siteKey: string | null;
  /** 값이 바뀌면 위젯을 리셋하고 토큰을 비운다 (제출 후 재사용 방지) */
  resetSignal: number;
  onTokenChange: (token: string | null) => void;
}

interface Status {
  message: string;
  recoverable: boolean;
}

const LOADING: Status = { message: "보안 확인을 불러오는 중입니다.", recoverable: false };

/** 자동 가입 방지용 Turnstile 위젯. 토큰은 signInWithOtp 의 captchaToken 으로 쓴다. */
export function TurnstileWidget({ siteKey, resetSignal, onTokenChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const widgetRef = useRef<string | null>(null);
  const lastReset = useRef(resetSignal);
  const [remount, setRemount] = useState(0);
  const [status, setStatus] = useState<Status>(LOADING);

  // 렌더
  useEffect(() => {
    let active = true;
    if (!siteKey) {
      onTokenChange(null);
      setStatus({
        message: "보안 확인 설정이 없어 로그인할 수 없습니다. 운영자에게 문의해 주세요.",
        recoverable: false,
      });
      return () => {
        active = false;
      };
    }
    setStatus(LOADING);
    loadTurnstile()
      .then((api) => {
        if (!active || !containerRef.current) return;
        apiRef.current = api;
        const fail = (message: string) => {
          if (!active) return;
          onTokenChange(null);
          setStatus({ message, recoverable: true });
        };
        try {
          widgetRef.current = api.render(containerRef.current, {
            sitekey: siteKey,
            language: "ko",
            retry: "never",
            "response-field": false,
            callback: (token) => {
              if (!active || !token) return;
              onTokenChange(token);
              setStatus({ message: "보안 확인이 완료되었습니다.", recoverable: false });
            },
            "expired-callback": () => fail("보안 확인 시간이 만료되었습니다. 다시 확인해 주세요."),
            "error-callback": () => {
              fail("보안 확인 중 오류가 발생했습니다. 다시 시도해 주세요.");
              return true;
            },
            "timeout-callback": () => fail("보안 확인 응답 시간이 지났습니다. 다시 시도해 주세요."),
            "unsupported-callback": () =>
              fail(
                "이 브라우저에서는 보안 확인을 사용할 수 없습니다. 다른 브라우저에서 시도해 주세요.",
              ),
          });
          setStatus({ message: "계속하려면 보안 확인을 완료해 주세요.", recoverable: false });
        } catch {
          fail("보안 확인 위젯을 시작하지 못했습니다. 다시 시도해 주세요.");
        }
      })
      .catch(() => {
        if (!active) return;
        onTokenChange(null);
        setStatus({
          message: "보안 확인을 불러오지 못했습니다. 다시 시도해 주세요.",
          recoverable: true,
        });
      });

    return () => {
      active = false;
      const api = apiRef.current;
      const id = widgetRef.current;
      apiRef.current = null;
      widgetRef.current = null;
      if (api && id) {
        try {
          api.remove(id);
        } catch {
          /* 이미 제거됨 */
        }
      }
    };
  }, [siteKey, remount, onTokenChange]);

  // 외부 리셋 신호
  useEffect(() => {
    if (lastReset.current === resetSignal) return;
    lastReset.current = resetSignal;
    onTokenChange(null);
    const api = apiRef.current;
    const id = widgetRef.current;
    if (!api || !id) return;
    try {
      api.reset(id);
      setStatus({ message: "계속하려면 보안 확인을 다시 완료해 주세요.", recoverable: false });
    } catch {
      setStatus({
        message: "보안 확인을 다시 시작하지 못했습니다. 다시 시도해 주세요.",
        recoverable: true,
      });
    }
  }, [resetSignal, onTokenChange]);

  function retry() {
    onTokenChange(null);
    const api = apiRef.current;
    const id = widgetRef.current;
    if (api && id) {
      try {
        api.reset(id);
        setStatus({ message: "계속하려면 보안 확인을 다시 완료해 주세요.", recoverable: false });
        return;
      } catch {
        /* 아래에서 다시 마운트 */
      }
    }
    setRemount((n) => n + 1);
  }

  return (
    <section className="turnstile" aria-label="자동 가입 방지 확인">
      <div ref={containerRef} className="turnstile-frame" key={remount} />
      <p
        id="turnstile-status"
        className="turnstile-status"
        role="status"
        aria-live="polite"
        data-turnstile-status
      >
        {status.message}
      </p>
      {status.recoverable && (
        <button type="button" className="turnstile-retry" onClick={retry}>
          보안 확인 다시 시도
        </button>
      )}
    </section>
  );
}
