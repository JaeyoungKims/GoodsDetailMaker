import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORY_ORDER,
  STAGE_TO_ROLE,
  deriveJobStatus,
  jobSchema,
  productBriefSchema,
  sectionPlanListSchema,
  storyOrderSchema,
  type StoryStage,
} from "../index.js";

/** storyOrder 에 맞는 정상 기획 결과를 만든다 */
function plansFor(storyOrder: readonly StoryStage[]) {
  return storyOrder.map((stage, i) => ({
    index: i + 1,
    role: STAGE_TO_ROLE[stage],
    headline: `헤드라인 ${i + 1}`,
    subheadline: "",
    bullets: [],
    visualDirection: "공통 디자인 시스템",
    imagePrompt: "A clean product photo on a warm ivory background, soft daylight.",
    copyPlacement: "bottom" as const,
  }));
}

describe("productBriefSchema", () => {
  it("이미지 외 모든 필드는 비워도 통과하고 기본값이 채워진다", () => {
    const parsed = productBriefSchema.parse({ tone: "warm_lifestyle" });
    expect(parsed.storyOrder).toEqual([...DEFAULT_STORY_ORDER]);
    expect(parsed.coreBenefits).toEqual([]);
  });

  it("중복된 스토리 순서는 거부한다", () => {
    const dup = [...DEFAULT_STORY_ORDER];
    dup[1] = dup[0]!;
    expect(storyOrderSchema.safeParse(dup).success).toBe(false);
  });

  it("일부 단계만 고른 순서도 통과한다", () => {
    const picked: StoryStage[] = ["PRODUCT_INFO", "HERO", "SUCCESS"];
    expect(storyOrderSchema.safeParse(picked).success).toBe(true);
    expect(storyOrderSchema.safeParse(["HERO"]).success).toBe(true);
  });

  it("하나도 고르지 않으면 거부한다", () => {
    expect(storyOrderSchema.safeParse([]).success).toBe(false);
  });
});

describe("sectionPlanListSchema", () => {
  it("storyOrder 길이만큼 단계 매핑대로 오면 통과한다", () => {
    const order = [...DEFAULT_STORY_ORDER];
    expect(sectionPlanListSchema(order).safeParse({ sections: plansFor(order) }).success).toBe(
      true,
    );
  });

  it("고른 단계가 3개면 3개만 받는다", () => {
    const order: StoryStage[] = ["HERO", "SUCCESS", "PRODUCT_INFO"];
    expect(sectionPlanListSchema(order).safeParse({ sections: plansFor(order) }).success).toBe(
      true,
    );
    const order13 = [...DEFAULT_STORY_ORDER];
    expect(sectionPlanListSchema(order).safeParse({ sections: plansFor(order13) }).success).toBe(
      false,
    );
  });

  it("role 이 그 자리 단계의 매핑과 다르면 실패한다", () => {
    const order: StoryStage[] = ["HERO", "SUCCESS", "PRODUCT_INFO"];
    const wrong = plansFor(order).map((s, i) => (i === 0 ? { ...s, role: "CTA" as const } : s));
    expect(sectionPlanListSchema(order).safeParse({ sections: wrong }).success).toBe(false);
  });
});

describe("jobSchema", () => {
  const base = {
    jobId: "6f1f4b6c-6a5e-4a2b-9a9e-6f2c0b9d1a11",
    productName: "무선 미니 가습기",
    status: "completed" as const,
    imageGenerationEnabled: true,
  };
  const asSection = (plan: ReturnType<typeof plansFor>[number]) => ({
    ...plan,
    renderMode: "browser_overlay" as const,
    status: "completed" as const,
    errorCode: null,
    copyVersion: 1,
  });

  it("3장짜리 작업을 읽는다", () => {
    const order: StoryStage[] = ["HERO", "SUCCESS", "PRODUCT_INFO"];
    const parsed = jobSchema.safeParse({
      ...base,
      storyOrder: order,
      sections: plansFor(order).map(asSection),
    });
    expect(parsed.success).toBe(true);
  });

  it("단계 선택 이전 작업(role 이 옛 슬롯 순서)도 그대로 열린다", () => {
    const order = [...DEFAULT_STORY_ORDER];
    const legacyRoles = ["HERO", "PROBLEM", "SOLUTION"] as const;
    const sections = legacyRoles.map((role, i) => ({
      ...asSection(plansFor(order)[i]!),
      role,
    }));
    expect(jobSchema.safeParse({ ...base, storyOrder: order, sections }).success).toBe(true);
  });

  it("index 가 어긋나면 거부한다", () => {
    const order: StoryStage[] = ["HERO", "SUCCESS"];
    const sections = plansFor(order).map(asSection);
    sections[1]!.index = 3;
    expect(jobSchema.safeParse({ ...base, storyOrder: order, sections }).success).toBe(false);
  });
});

describe("deriveJobStatus", () => {
  it("완료·실패 조합에 따라 상태를 계산한다", () => {
    expect(deriveJobStatus([])).toBe("planning");
    expect(deriveJobStatus([{ status: "completed" }, { status: "completed" }])).toBe("completed");
    expect(deriveJobStatus([{ status: "failed" }, { status: "completed" }])).toBe("partial");
    expect(deriveJobStatus([{ status: "queued" }, { status: "completed" }])).toBe("generating");
  });
});
