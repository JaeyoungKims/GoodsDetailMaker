import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, type AuthUser } from "@/lib/api/auth";

export interface AuthState {
  initialized: boolean;
  user: AuthUser | null;
  /** 쿠키 세션이라 토큰 문자열은 없다. 기존 API 호출부와의 호환을 위해 빈 문자열 대신 "cookie" 를 준다. */
  accessToken: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUser(await authApi.me());
    } catch {
      setUser(null);
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      initialized,
      user,
      accessToken: user ? "cookie" : null,
      signIn: async (email, password) => setUser(await authApi.login(email, password)),
      signUp: async (email, password) => setUser(await authApi.signup(email, password)),
      signOut: async () => {
        await authApi.logout().catch(() => {});
        setUser(null);
      },
      refresh,
    }),
    [initialized, user, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
