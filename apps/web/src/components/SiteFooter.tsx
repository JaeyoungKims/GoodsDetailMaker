import { Link } from "react-router";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        <strong>상세페이지 13장 제작실</strong>
        <span>사용자 API 키로 만드는 BYOK 상세페이지 도구</span>
      </p>
      <nav aria-label="서비스 안내">
        <Link to="/about">소개</Link>
        <Link to="/help">도움말</Link>
        <Link to="/privacy">개인정보</Link>
        <Link to="/terms">이용 조건</Link>
        <Link to="/settings">API 키 설정</Link>
      </nav>
    </footer>
  );
}
