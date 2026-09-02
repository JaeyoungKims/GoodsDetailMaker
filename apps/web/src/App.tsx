import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./features/auth/useAuth";
import { DashboardPage } from "./pages/DashboardPage";
import { InfoPage } from "./pages/InfoPage";
import { JobPage } from "./pages/JobPage";
import { LoginPage } from "./pages/LoginPage";
import { NewJobPage } from "./pages/NewJobPage";
import { SettingsPage } from "./pages/SettingsPage";

/** 로그인 후에만 보이는 작업 라우트 */
function AuthenticatedRoutes() {
  const { initialized, user } = useAuth();
  if (!initialized) return <main className="page-center">로그인 정보를 확인하는 중…</main>;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/new" element={<NewJobPage />} />
      <Route path="/jobs/:jobId" element={<JobPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/about" element={<InfoPage kind="about" />} />
        <Route path="/help" element={<InfoPage kind="help" />} />
        <Route path="/privacy" element={<InfoPage kind="privacy" />} />
        <Route path="/terms" element={<InfoPage kind="terms" />} />
        <Route path="*" element={<AuthenticatedRoutes />} />
      </Routes>
    </AppShell>
  );
}
