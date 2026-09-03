import { PgBoss, type Job } from "pg-boss";
import { queueMessageSchema, type QueueMessage } from "@gdm/shared";
import type { AppContext } from "../context.js";
import { cleanupExpiredJobs } from "./cleanup.js";
import { handleImage } from "./image.js";
import { handlePlan } from "./plan.js";

export const QUEUE_PLAN = "gdm-plan";
export const QUEUE_IMAGE = "gdm-image";
export const QUEUE_CLEANUP = "gdm-cleanup";

export function createBoss(databaseUrl: string): PgBoss {
  const boss = new PgBoss({ connectionString: databaseUrl, useListenNotify: true });
  boss.on("error", (err: unknown) => console.error("[boss]", err));
  return boss;
}

/** 큐 생성 + 워커 등록. 재시도는 우리가 attempt 로 통제하므로 pg-boss 재시도는 최소로 둔다. */
export async function startQueues(ctx: AppContext) {
  const { boss } = ctx;
  await boss.start();
  await boss.createQueue(QUEUE_PLAN, {
    retryLimit: 1,
    retryDelay: 15,
    expireInSeconds: 600,
    notify: true,
  });
  await boss.createQueue(QUEUE_IMAGE, {
    retryLimit: 1,
    retryDelay: 15,
    expireInSeconds: 600,
    notify: true,
  });
  await boss.createQueue(QUEUE_CLEANUP, { retryLimit: 0, expireInSeconds: 300 });

  await boss.work<QueueMessage>(QUEUE_PLAN, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const msg = queueMessageSchema.safeParse(job.data);
      if (!msg.success || msg.data.kind !== "plan") continue;
      await handlePlan(ctx, msg.data);
    }
  });

  await boss.work<QueueMessage>(QUEUE_IMAGE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const msg = queueMessageSchema.safeParse(job.data);
      if (!msg.success || msg.data.kind !== "image") continue;
      const outcome = await handleImage(ctx, msg.data);
      console.log(
        `[queue] image job=${msg.data.jobId} section=${msg.data.sectionIndex} attempt=${msg.data.attempt} deferrals=${msg.data.deferrals} -> ${outcome.kind}`,
      );
      if (outcome.kind === "retry") {
        await enqueue(
          ctx,
          { ...msg.data, attempt: outcome.nextAttempt, deferrals: 0 },
          outcome.delaySeconds,
        );
      } else if (outcome.kind === "defer") {
        await enqueue(
          ctx,
          { ...msg.data, deferrals: msg.data.deferrals + 1 },
          outcome.delaySeconds,
        );
      }
    }
  });

  await boss.work(QUEUE_CLEANUP, async (_jobs: Job[]) => {
    await cleanupExpiredJobs(ctx);
  });
  await boss.schedule(QUEUE_CLEANUP, "*/15 * * * *");
}

export async function enqueue(ctx: AppContext, msg: QueueMessage, delaySeconds = 0) {
  const name = msg.kind === "plan" ? QUEUE_PLAN : QUEUE_IMAGE;
  await ctx.boss.send(name, msg, delaySeconds > 0 ? { startAfter: delaySeconds } : {});
}
