import { describe, expect, it } from "vitest";
import { DEFAULT_STORY_ORDER, SECTION_ROLES, productBriefSchema } from "@gdm/shared";
import { buildSystemPrompt, buildUserPrompt, normalizeTone } from "../services/planPrompt.js";
import { parsePlanText, planSections } from "../services/openai.js";

const brief = productBriefSchema.parse({
  productName: "무선 미니 가습기",
  coreBenefits: ["풍부한 분사량", "저소음 설계"],
  evidence: ["자사 테스트 기준 28dB"],
  prohibitedClaims: ["완치"],
  tone: "warm_lifestyle",
});

const validSections = SECTION_ROLES.map((role, i) => ({
  index: i + 1,
  role,
  headline: `헤드라인 ${i + 1}`,
  subheadline: "",
  bullets: ["분사량 300ml/h", ""],
  visualDirection: "warm ivory system",
  imagePrompt:
    "A cordless mini humidifier on a wooden bedside table, soft morning window light, warm ivory tones, portrait 2:3, lower third left empty, no text, no letters, no logos, no watermark.",
  copyPlacement: "bottom",
  renderMode: "browser_overlay",
}));

describe("prompt builders", () => {
  it("시스템 프롬프트에 role 슬롯 13개와 절대 규칙이 들어간다", () => {
    const p = buildSystemPrompt();
    for (const role of SECTION_ROLES) expect(p).toContain(role);
    expect(p).toContain("절대 규칙");
    expect(p).toContain("no text, no letters, no logos, no watermark");
  });

  it("사용자 프롬프트는 storyOrder 를 index→role 로 매핑해 나열한다", () => {
    const p = buildUserPrompt({ brief, imageCount: 2 });
    expect(p).toContain(`1. ${DEFAULT_STORY_ORDER[0]}`);
    expect(p).toContain(`→ role 슬롯 ${SECTION_ROLES[12]}`);
    expect(p).toContain("제품 사진: 2장 첨부");
    expect(p).toContain("자사 테스트 기준 28dB");
    expect(p).toContain("완치");
  });

  it("근거가 비어 있으면 수치 금지·후기 초안 규칙을 명시한다", () => {
    const empty = productBriefSchema.parse({ tone: "friendly" });
    const p = buildUserPrompt({ brief: empty, imageCount: 1 });
    expect(p).toContain("어떤 수치·인증·후기도 쓰지 말 것");
    expect(p).toContain("warm_lifestyle"); // 레거시 friendly → warm_lifestyle
  });

  it("레거시 tone 을 새 tone 으로 매핑한다", () => {
    expect(normalizeTone("premium")).toBe("premium_luxury");
    expect(normalizeTone("bold_pop")).toBe("bold_pop");
  });
});

describe("parsePlanText", () => {
  it("코드펜스·공백·빈 불릿을 정리하고 통과시킨다", () => {
    const text = "```json\n" + JSON.stringify({ sections: validSections }) + "\n```";
    const r = parsePlanText(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sections[0]!.bullets).toEqual(["분사량 300ml/h"]);
  });

  it("검증 실패는 경로가 붙은 오류 목록으로 돌려준다", () => {
    const bad = validSections.map((s, i) => (i === 2 ? { ...s, headline: "가".repeat(40) } : s));
    const r = parsePlanText(JSON.stringify({ sections: bad }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toMatch(/^sections\.2\.headline/);
  });
});

describe("planSections repair loop", () => {
  it("첫 응답이 틀리면 오류 목록을 붙여 한 번 더 요청하고 두 번째 결과를 쓴다", async () => {
    const calls: Array<{ input: Array<{ role: string; content: unknown }> }> = [];
    const bad = validSections.map((s, i) => (i === 0 ? { ...s, role: "CTA" } : s));
    const answers = [
      JSON.stringify({ sections: bad }),
      JSON.stringify({ sections: validSections }),
    ];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ output_text: answers[calls.length - 1] }), {
        status: 200,
      });
    }) as typeof fetch;

    const sections = await planSections(
      "sk-test",
      { brief, images: [] },
      { fetchImpl, model: "test-model" },
    );
    expect(sections).toHaveLength(13);
    expect(calls).toHaveLength(2);
    const repair = calls[1]!.input.at(-1)!;
    expect(repair.role).toBe("user");
    expect(String(repair.content)).toContain("sections.0.role");
  });

  it("수정 후에도 틀리면 IMAGE_RESPONSE_INVALID", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ output_text: "not json" }), { status: 200 })) as typeof fetch;
    await expect(
      planSections("sk-test", { brief, images: [] }, { fetchImpl }),
    ).rejects.toMatchObject({
      kind: "IMAGE_RESPONSE_INVALID",
    });
  });

  it("401 은 OPENAI_API_KEY_INVALID 로 분류한다", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    await expect(planSections("bad", { brief, images: [] }, { fetchImpl })).rejects.toMatchObject({
      kind: "OPENAI_API_KEY_INVALID",
    });
  });
});
