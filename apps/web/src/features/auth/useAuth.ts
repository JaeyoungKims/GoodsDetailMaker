import { useContext } from "react";
import { AuthContext, type AuthState } from "./AuthProvider";

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** 로그인이 보장된 화면에서 토큰을 문자열로 받는다 */
export function useAccessToken(): string {
  const { accessToken } = useAuth();
  if (!accessToken) throw new Error("UNAUTHENTICATED");
  return accessToken;
}
