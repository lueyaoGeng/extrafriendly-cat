import { DurableObject } from "cloudflare:workers";
import { limitsFromEnv } from "./config.js";
import { handleGateway } from "./gateway.js";
import { jsonResponse } from "./protocol.js";
import { QuotaStore } from "./quota-store.js";
import { freeInferenceFromEnv } from "./free-inference.js";

export class SharedQuota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.quota = new QuotaStore(ctx.storage);
  }

  reserve(reservation) {
    return this.quota.reserve(reservation);
  }
}

export default {
  async fetch(request, env) {
    let limits;
    try {
      limits = limitsFromEnv(env);
    } catch {
      return jsonResponse({ error: { code: "gateway_unavailable", message: "免费聊天服务配置未完成。" } }, 503);
    }
    const inference = freeInferenceFromEnv(env);
    return handleGateway(request, {
      ...inference,
      limits,
      available: Boolean(inference.available && env.SHARED_QUOTA),
      ip: request.headers.get("cf-connecting-ip") ?? "unknown",
      reserve: (reservation) => env.SHARED_QUOTA.getByName("extrafriendly-cat-global-v1").reserve(reservation),
    });
  },
};
