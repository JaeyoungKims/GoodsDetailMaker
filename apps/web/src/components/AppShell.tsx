import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      {children}
      <SiteFooter />
    </div>
  );
}
