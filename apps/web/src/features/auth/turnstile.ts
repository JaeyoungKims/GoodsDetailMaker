/** Cloudflare Turnstile 스크립트 로더와 사이트 키 검증 */

export interface TurnstileRenderOptions {
  sitekey: string;
  language?: string;
  retry?: "auto" | "never";
  "response-field"?: boolean;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => boolean | void;
  "timeout-callback"?: () => void;
  "unsupported-callback"?: () => void;
}

export interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_SELECTOR = 'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]';
const LOAD_TIMEOUT_MS = 15_000;

/** Cloudflare 가 제공하는 테스트 키. 운영 빌드에서는 거부한다. */
const TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);

/**
 * 사이트 키를 정리한다. 형식이 틀리면 null.
 * 테스트 키는 개발 모드에서만 허용한다.
 */
export function resolveSiteKey(
  raw: string | undefined,
  isDev = import.meta.env.DEV,
): string | null {
  const key = raw?.trim() ?? "";
  if (!key) return null;
  if (TEST_SITE_KEYS.has(key)) return isDev ? key : null;
  return /^0x4[A-Za-z0-9_-]{20,29}$/.test(key) ? key : null;
}

let loading: Promise<TurnstileApi> | null = null;

/** 스크립트를 한 번만 삽입하고 window.turnstile 이 준비되면 돌려준다 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;

  document.querySelectorAll(SCRIPT_SELECTOR).forEach((el) => el.remove());
  const script = document.createElement("script");
  script.src = SCRIPT_URL;
  script.async = true;
  script.defer = true;
  script.dataset["turnstileState"] = "loading";
  document.head.append(script);

  loading = new Promise<TurnstileApi>((resolve, reject) => {
    let timer: number | null = null;
    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (timer !== null) window.clearTimeout(timer);
    };
    const fail = (reason: string) => {
      cleanup();
      script.remove();
      loading = null;
      reject(new Error(reason));
    };
    const onLoad = () => {
      script.dataset["turnstileState"] = "loaded";
      if (window.turnstile) {
        cleanup();
        resolve(window.turnstile);
      } else {
        fail("TURNSTILE_API_UNAVAILABLE");
      }
    };
    const onError = () => fail("TURNSTILE_SCRIPT_FAILED");
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    timer = window.setTimeout(() => fail("TURNSTILE_SCRIPT_TIMEOUT"), LOAD_TIMEOUT_MS);
  });
  return loading;
}
