import { queueMessageSchema } from "@gdm/shared";
import type { AppEnv } from "../env.js";
import { handleImage } from "./image.js";
import { handlePlan } from "./plan.js";

/**
 * Queues 컨슈머. 메시지마다 개별 ack/retry 한다.
 * 재시도는 새 메시지(attempt+1)를 넣고 원본은 ack 하여 attempt 를 우리가 통제한다.
 */
export async function handleQueueBatch(batch: MessageBatch<unknown>, env: AppEnv): Promise<void> {
  for (const message of batch.messages) {
    const parsed = queueMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      console.warn("drop invalid queue message", message.id);
      message.ack();
      continue;
    }
    const msg = parsed.data;
    try {
      if (msg.kind === "plan") {
        await handlePlan(env, msg);
      } else {
        const outcome = await handleImage(env, msg);
        if (outcome.kind === "retry") {
          await env.JOB_QUEUE.send(
            { ...msg, attempt: outcome.nextAttempt },
            { delaySeconds: outcome.delaySeconds },
          );
        }
      }
      message.ack();
    } catch (err) {
      console.error("queue handler crashed", msg.kind, err);
      // 핸들러 자체가 던진 예외(DB 장애 등)만 플랫폼 재시도에 맡긴다.
      message.retry({ delaySeconds: 15 });
    }
  }
}
