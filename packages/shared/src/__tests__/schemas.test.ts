import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORY_ORDER,
  SECTION_ROLES,
  deriveJobStatus,
  productBriefSchema,
  sectionPlanListSchema,
  storyOrderSchema,
} from "../index.js";

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
});

describe("sectionPlanListSchema", () => {
  const base = SECTION_ROLES.map((role, i) => ({
    index: i + 1,
    role,
    headline: `헤드라인 ${i + 1}`,
    subheadline: "",
    bullets: [],
    visualDirection: "공통 디자인 시스템",
    imagePrompt: "A clean product photo on a warm ivory background, soft daylight.",
    copyPlacement: "bottom" as const,
  }));

  it("13개가 role 슬롯 순서대로면 통과한다", () => {
    expect(sectionPlanListSchema.safeParse({ sections: base }).success).toBe(true);
  });

  it("role 슬롯이 어긋나면 실패한다", () => {
    const wrong = base.map((s, i) => (i === 0 ? { ...s, role: "CTA" as const } : s));
    expect(sectionPlanListSchema.safeParse({ sections: wrong }).success).toBe(false);
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
