/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 개발 시 API 서버 주소 (기본 http://127.0.0.1:8787, vite proxy 대상) */
  readonly VITE_API_TARGET?: string;
}
