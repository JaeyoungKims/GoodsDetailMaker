type InfoKind = "about" | "help" | "privacy" | "terms";

const INFO: Record<InfoKind, { eyebrow: string; title: string; lead: string }> = {
  about: {
    eyebrow: "서비스 소개",
    title: "한 번 입력하고, 구매 퍼널 13장을 각각 만듭니다",
    lead: "상품 정보를 한 번 받아 기획 1회와 독립 이미지 작업 13개로 나누는 BYOK 제작 도구입니다.",
  },
  help: {
    eyebrow: "도움말",
    title: "비용과 설정을 먼저 확인하세요",
    lead: "서버는 무료 한도 안에서 시작할 수 있고, OpenAI 사용료는 본인 부담입니다.",
  },
  privacy: {
    eyebrow: "개인정보 안내",
    title: "필요한 정보만, 정해진 기간만 다룹니다",
    lead: "작업과 이미지는 24시간 보관 후 자동 삭제됩니다. API 키는 Supabase Vault 에 암호화해 저장합니다.",
  },
  terms: {
    eyebrow: "이용 조건",
    title: "상품 정보를 책임 있게 사용해 주세요",
    lead: "근거 없는 효능, 미취득 인증, 조작 후기는 입력하거나 게시하지 마세요.",
  },
};

/** TODO(content): 참고 분석 문서 7절의 안내 문구를 섹션 단위로 채운다 */
export function InfoPage({ kind }: { kind: InfoKind }) {
  const info = INFO[kind];
  return (
    <main className="info-page">
      <div className="info-hero">
        <p>{info.eyebrow}</p>
        <h1>{info.title}</h1>
        <div>{info.lead}</div>
      </div>
    </main>
  );
}
