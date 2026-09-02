import { describe, expect, it } from "vitest";
import { IMAGE_DEFERRAL_MAX } from "@gdm/shared";
import { decideDispatch } from "../services/gate.js";
import { exceedsQuota } from "../services/limits.js";

const now = new Date("2026-09-02T00:00:00Z");

describe("decideDispatch", () => {
  it("슬롯을 잡으면 진행한다", async () => {
    const d = await decideDispatch({
      deferrals: 0,
      rateLimitedUntil: null,
      claimSlot: async () => true,
      now,
    });
    expect(d).toEqual({ kind: "proceed" });
  });

  it("감속 중이면 슬롯을 시도하지 않고 남은 시간만큼 미룬다", async () => {
    let claimed = false;
    const d = await decideDispatch({
      deferrals: 0,
      rateLimitedUntil: new Date(now.getTime() + 42_000),
      claimSlot: async () => ((claimed = true), true),
      now,
    });
    expect(d).toEqual({ kind: "defer", delaySeconds: 42, reason: "rate_limited" });
    expect(claimed).toBe(false);
  });

  it("감속이 끝났으면 슬롯을 시도한다", async () => {
    const d = await decideDispatch({
      deferrals: 0,
      rateLimitedUntil: new Date(now.getTime() - 1000),
      claimSlot: async () => true,
      now,
    });
    expect(d.kind).toBe("proceed");
  });

  it("슬롯이 꽉 차면 미룬 횟수에 따라 지연을 늘린다", async () => {
    const first = await decideDispatch({
      deferrals: 0,
      rateLimitedUntil: null,
      claimSlot: async () => false,
      now,
    });
    const later = await decideDispatch({
      deferrals: 20,
      rateLimitedUntil: null,
      claimSlot: async () => false,
      now,
    });
    expect(first).toEqual({ kind: "defer", delaySeconds: 5, reason: "slots_full" });
    expect(later).toEqual({ kind: "defer", delaySeconds: 30, reason: "slots_full" });
  });

  it("너무 오래 미뤄지면 소진 처리한다", async () => {
    const d = await decideDispatch({
      deferrals: IMAGE_DEFERRAL_MAX,
      rateLimitedUntil: null,
      claimSlot: async () => true,
      now,
    });
    expect(d).toEqual({ kind: "exhausted" });
  });
});

describe("exceedsQuota", () => {
  it("사용자 250MB 또는 서비스 8GB 를 넘으면 true", () => {
    const mb = 1024 * 1024;
    expect(exceedsQuota({ userBytes: 200 * mb, serviceBytes: 1024 * mb }, 40 * mb)).toBe(false);
    expect(exceedsQuota({ userBytes: 240 * mb, serviceBytes: 1024 * mb }, 20 * mb)).toBe(true);
    expect(
      exceedsQuota({ userBytes: 10 * mb, serviceBytes: 8 * 1024 * mb - 5 * mb }, 10 * mb),
    ).toBe(true);
  });
});
