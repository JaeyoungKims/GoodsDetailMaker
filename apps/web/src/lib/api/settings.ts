import { imageSpeedSchema, openaiKeyStoredSchema } from "@gdm/shared";
import { ApiRequestError, apiFetch } from "./http";

export const settingsApi = {
  async storeOpenAiKey(token: string, key: string) {
    const body = await apiFetch(token, "/api/settings/openai-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const parsed = openaiKeyStoredSchema.safeParse(body);
    if (!parsed.success) throw new ApiRequestError("JOB_RESPONSE_INVALID");
    return parsed.data;
  },
  async removeOpenAiKey(token: string) {
    await apiFetch(token, "/api/settings/openai-key", { method: "DELETE" });
  },
  async getImageParallelism(token: string) {
    const body = await apiFetch(token, "/api/settings/image-speed");
    const parsed = imageSpeedSchema.safeParse(body);
    if (!parsed.success) throw new ApiRequestError("JOB_RESPONSE_INVALID");
    return parsed.data.imageParallelism;
  },
  async setImageParallelism(token: string, value: 5 | 10) {
    const body = await apiFetch(token, "/api/settings/image-speed", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageParallelism: value }),
    });
    const parsed = imageSpeedSchema.safeParse(body);
    if (!parsed.success || parsed.data.imageParallelism !== value) {
      throw new ApiRequestError("JOB_RESPONSE_INVALID");
    }
    return parsed.data.imageParallelism;
  },
};
