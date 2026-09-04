import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  IMAGE_AUTO_ATTEMPT_MAX,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  INPUT_IMAGE_MAX,
  JOB_ACTIVE_LIMIT,
  JOB_DAILY_LIMIT,
  SECTION_COUNT,
  SECTION_MANUAL_RETRY_MAX,
} from "@gdm/shared";

type InfoKind = "about" | "help" | "privacy" | "terms";

interface InfoSection {
  title: string;
  body: ReactNode;
}

interface InfoContent {
  eyebrow: string;
  title: string;
  lead: string;
  sections: InfoSection[];
}

const ext = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {label}
  </a>
);

const CONTENT: Record<InfoKind, InfoContent> = {
  about: {
    eyebrow: "서비스 소개",
    title: `상품 정보 한 번으로 구매 퍼널 최대 ${SECTION_COUNT}장을 만듭니다`,
    lead: `제품 사진과 알고 있는 정보만 입력하면, AI가 내가 고른 설득 단계(최대 ${SECTION_COUNT}개)를 기획하고 각 단계를 독립된 이미지로 만들어 주는 BYOK 제작 도구입니다.`,
    sections: [
      {
        title: "왜 한 장이 아니라 여러 장인가요?",
        body: (
          <>
            <p>
              긴 상세페이지를 통째로 생성하면 한 군데만 마음에 안 들어도 전체를 다시 만들어야
              합니다. 이 도구는 후킹부터 제품 정보까지 역할이 다른 장을 각각 만들기 때문에,
              실패했거나 아쉬운 장만 골라 다시 만들 수 있습니다. 필요한 단계만 골라 짧게 만들 수도
              있습니다.
            </p>
            <p>
              각 장은 {IMAGE_WIDTH}×{IMAGE_HEIGHT} 세로 이미지이고, 한글 문구는 브라우저에서 이미지
              위에 얹습니다. 그래서 문구만 고칠 때는 AI 비용이 들지 않습니다.
            </p>
          </>
        ),
      },
      {
        title: "어떻게 진행되나요?",
        body: (
          <ol>
            <li>
              제품 사진 1~{INPUT_IMAGE_MAX}장과 상품명·장점·근거·금지 표현·스타일을 입력합니다.
              사진만 필수입니다.
            </li>
            <li>AI가 내가 고른 설득 흐름에 맞춰 장별 문구와 장면을 한 번에 기획합니다.</li>
            <li>
              기획된 장면을 이미지 AI가 한 장씩 만듭니다. 완성된 장부터 바로 확인할 수 있습니다.
            </li>
            <li>
              문구를 다듬고 개별 JPG, ZIP, 세로 합본으로 내려받아 스마트스토어·쿠팡 등에 올립니다.
            </li>
          </ol>
        ),
      },
      {
        title: "BYOK 방식",
        body: (
          <p>
            BYOK(Bring Your Own Key)는 사용자가 본인의 OpenAI API 키를 연결해 쓰는 방식입니다. 생성
            비용이 사용자 계정에 직접 청구되므로 운영자가 비용을 대신 부담하지 않고, 그만큼 서비스는
            무료 서버 한도 안에서 운영할 수 있습니다. 키는 <Link to="/settings">설정</Link>에서
            저장·삭제할 수 있습니다.
          </p>
        ),
      },
      {
        title: "잘 맞는 상품, 덜 맞는 상품",
        body: (
          <>
            <p>
              형태가 분명한 실물 상품(생활용품, 소형가전, 패션 잡화, 식품 패키지 등)에 잘 맞습니다.
              사진이 깨끗할수록 결과가 안정적입니다.
            </p>
            <p>
              의료기기·건강기능식품처럼 표현 규제가 엄격한 상품, 서비스·디지털 상품처럼 실물이 없는
              상품은 기획 단계에서 보수적으로 처리하지만 최종 검수는 반드시 사용자가 해야 합니다.
            </p>
          </>
        ),
      },
    ],
  },

  help: {
    eyebrow: "도움말",
    title: "시작 전에 비용과 한도를 확인하세요",
    lead: "개발 지식 없이도 바로 쓸 수 있도록, 꼭 알아야 할 내용만 모았습니다.",
    sections: [
      {
        title: "비용은 어떻게 되나요?",
        body: (
          <>
            <p>
              <strong>OpenAI 사용료는 본인 부담</strong>입니다. 작업 하나에 기획 1회와 고른 장
              수만큼의 이미지 생성이 들고, 실패한 장을 자동 재시도하거나 직접 다시 만들 때도
              사용료가 추가됩니다.
            </p>
            <p>
              서버는 운영자의 PC에서 직접 실행되므로 별도 서버 비용이 없습니다. 아래 OpenAI 문서에서
              모델 요금과 사용 한도를 확인하세요.
            </p>
            <ul>
              <li>
                {ext(
                  "https://developers.openai.com/api/docs/models/gpt-image-2",
                  "OpenAI GPT Image 2 모델·사용 한도",
                )}
              </li>
            </ul>
          </>
        ),
      },
      {
        title: "API 키 준비하기",
        body: (
          <ol>
            <li>
              OpenAI 대시보드에서 API 키를 만듭니다. 이미지 생성 권한이 있는 프로젝트 키여야 합니다.
            </li>
            <li>
              <Link to="/settings">설정</Link>에서 키를 저장합니다. 저장 후에는 마지막 4자리만
              표시되고, 다시 보여 주지 않습니다.
            </li>
            <li>
              키는 암호화 저장소에 보관되고 이미지·기획 요청에만 사용됩니다. 채팅·이메일·문의 글에
              키를 붙여 보내지 마세요.
            </li>
          </ol>
        ),
      },
      {
        title: "한도",
        body: (
          <ul>
            <li>
              동시에 진행할 수 있는 작업은 <strong>{JOB_ACTIVE_LIMIT}개</strong>, 하루에 만들 수
              있는 작업은 <strong>{JOB_DAILY_LIMIT}개</strong>입니다.
            </li>
            <li>
              상품 사진은 1~{INPUT_IMAGE_MAX}장, 장당 10MB 이하, 합계 25MB 이하입니다.
              JPG·PNG·WebP를 받습니다.
            </li>
            <li>
              저장 공간은 사용자별 250MB, 서비스 전체 8GB입니다. 생성을 시작할 때 결과 이미지 공간을
              미리 예약하므로 한도에 가까우면 시작이 거절될 수 있습니다.
            </li>
            <li>
              실패한 장은 자동으로 최대 {IMAGE_AUTO_ATTEMPT_MAX}회 다시 시도하고, 그 뒤에는 직접{" "}
              {SECTION_MANUAL_RETRY_MAX}회까지 다시 만들 수 있습니다.
            </li>
          </ul>
        ),
      },
      {
        title: "느리거나 실패할 때",
        body: (
          <>
            <p>
              신규 OpenAI 계정은 동시에 처리할 수 있는 이미지 수가 작을 수 있습니다. 설정의 생성
              속도를 <strong>가성비(동시 5개)</strong>로 두고 기다려 보세요. 요청이 몰려 OpenAI가
              속도를 제한하면 잠시 자동으로 감속했다가 이어서 진행합니다.
            </p>
            <p>
              화면에 "이 장만 다시 만들기"가 보이면 해당 장만 다시 만들 수 있습니다. "API 키 설정을
              확인" 안내가 나오면 키가 만료됐거나 이미지 권한이 없는 경우이니 새 키를 저장하세요.
            </p>
          </>
        ),
      },
      {
        title: "결과물 활용",
        body: (
          <p>
            개별 JPG는 장마다 내려받고, ZIP은 만든 장을 한 번에, 세로 합본은 폭 {IMAGE_WIDTH}에 장
            수만큼(최대 {IMAGE_HEIGHT * SECTION_COUNT}) 이어 붙인 한 장입니다. 플랫폼별 세로 길이
            제한이 있으면 개별 JPG나 ZIP을 쓰세요.
          </p>
        ),
      },
      {
        title: "운영 문의",
        body: (
          <p>
            문의 채널은 운영자가 배포 후 이 자리에 넣어야 합니다. 이 저장소에는 개인 연락처를 넣지
            않았습니다.
          </p>
        ),
      },
    ],
  },

  privacy: {
    eyebrow: "개인정보 안내",
    title: "필요한 정보만, 정해진 기간만 다룹니다",
    lead: "상세페이지 제작에 필요한 계정·상품 정보와 이미지를 어떻게 처리하는지 쉽게 설명합니다.",
    sections: [
      {
        title: "어떤 정보가 오가나요?",
        body: (
          <p>
            이메일과 비밀번호 해시, 입력한 상품 설명, 업로드한 제품 사진, 생성 결과와 작업 상태를
            처리합니다. OpenAI API 키는{" "}
            <strong>서버에서 암호화해 저장하고 생성 요청에만 사용</strong>합니다. 브라우저나 공개
            주소에 키를 넣지 않습니다.
          </p>
        ),
      },
      {
        title: "누가 처리하나요?",
        body: (
          <p>
            이 서비스는 운영자의 서버에서 직접 실행되며 데이터베이스와 이미지 파일도 그 서버에
            저장됩니다. 기획과 이미지 생성 요청만 <strong>OpenAI</strong>로 전달되며, OpenAI의
            약관과 개인정보 정책이 함께 적용됩니다.
          </p>
        ),
      },
      {
        title: "AI에게 어떤 데이터가 전달되나요?",
        body: (
          <p>
            기획 단계에는 입력한 상품 정보와 제품 사진이, 이미지 생성 단계에는 기획된 장면 설명과
            제품 사진이 OpenAI로 전달됩니다. 이메일 주소나 계정 정보는 전달하지 않습니다.
          </p>
        ),
      },
      {
        title: "보관과 삭제",
        body: (
          <p>
            보관 기간은 운영자가 정합니다. 기본값은 <strong>무제한 보관</strong>이며, 운영자가
            기간을 설정하면 그 기간이 지난 작업·사진·결과가 자동 삭제됩니다. 시작하지 않은 초안은 새
            작업을 만들 때 정리됩니다.
          </p>
        ),
      },
      {
        title: "내가 할 수 있는 일",
        body: (
          <p>
            <Link to="/settings">설정</Link>에서 언제든 API 키를 삭제할 수 있습니다. 작업 정보의
            확인·정정·삭제 요청과 그 밖의 문의는 <Link to="/help">도움말</Link>의 운영 문의 채널을
            이용하세요.
          </p>
        ),
      },
    ],
  },

  terms: {
    eyebrow: "이용 조건",
    title: "상품 정보를 책임 있게 사용해 주세요",
    lead: "이 도구는 제작을 돕지만, 사실 확인과 최종 게시 결정은 사용자의 몫입니다.",
    sections: [
      {
        title: "자료와 결과에 대한 권리",
        body: (
          <p>
            사용자는 본인이 권리를 가졌거나 사용 허락을 받은 자료만 업로드해야 합니다. 업로드한
            자료의 권리는 사용자에게 남습니다. 생성 결과에 어떤 권리가 성립하는지는 지역·사실관계·AI
            제공자 약관에 따라 달라질 수 있으며, 이 서비스는 권리 취득을 보장하지 않습니다.
          </p>
        ),
      },
      {
        title: "금지되는 주장",
        body: (
          <p>
            근거 없는 <strong>의료·건강 효능</strong>, 받지 않은 <strong>인증·수상</strong>,
            조작하거나 존재하지 않는 <strong>후기</strong>, 확인되지 않은 수치·비교 우위는
            입력하거나 게시하지 마세요. 기획 단계에서 이런 표현을 억제하지만 최종 검수 책임을
            대신하지 않습니다. 후기 장에 "편집용 후기 초안" 표시가 있으면 실제 후기로 바꾸거나
            삭제한 뒤 게시하세요.
          </p>
        ),
      },
      {
        title: "품질과 가용성",
        body: (
          <p>
            AI 결과의 정확성·완성도·매출 효과를 보장하지 않습니다. 제공자 정책, API 사용 한도, 무료
            서버 한도에 따라 생성이 느려지거나 일시 중단될 수 있습니다. 보관 기간이 지난 작업은
            복구할 수 없습니다.
          </p>
        ),
      },
      {
        title: "비용",
        body: (
          <p>
            사용자의 OpenAI API 키로 발생한 요금은 해당 사용자 계정에 청구됩니다. 자동 재시도와 수동
            다시 만들기도 사용량에 포함됩니다. 서비스는 이 요금을 환불하거나 보전하지 않습니다.
          </p>
        ),
      },
      {
        title: "계정과 이용 제한",
        body: (
          <p>
            타인의 자료를 무단으로 사용하거나, 한도를 우회하거나, 서비스를 자동화 도구로 남용하는
            경우 사전 통지 없이 이용을 제한할 수 있습니다.
          </p>
        ),
      },
    ],
  },
};

export function InfoPage({ kind }: { kind: InfoKind }) {
  const info = CONTENT[kind];
  return (
    <main className="info-page">
      <div className="info-hero">
        <p>{info.eyebrow}</p>
        <h1>{info.title}</h1>
        <div>{info.lead}</div>
      </div>
      <div className="info-sections">
        {info.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.body}
          </section>
        ))}
      </div>
    </main>
  );
}
