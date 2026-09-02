import { useNavigate } from "react-router";
import { useAuth } from "@/features/auth/useAuth";

export function DashboardPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  return (
    <main className="dashboard">
      <p>상세페이지 13장 제작실</p>
      <h1>상품 하나로 구매 퍼널 13장을 시작하세요</h1>
      <nav aria-label="작업 메뉴">
        <button onClick={() => navigate("/new")}>새 상세페이지</button>
        <button onClick={() => navigate("/settings")}>API 키 설정</button>
        <button onClick={() => void signOut()}>로그아웃</button>
      </nav>
    </main>
  );
}
