import { MODEL, PUBLIC_MODEL } from "./config.js";
import { GatewayError, hashQuotaKey, jsonResponse, readChatRequest, readDeviceId } from "./protocol.js";

async function withTimeout(operation, timeoutMs) {
  let timer;
  const controller = new AbortController();
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new GatewayError(503, "ai_unavailable", "猫猫的聊天服务暂时没回应，晚一点再试吧。"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function replyText(result) {
  const text = result?.response ?? result?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim() || new TextEncoder().encode(text).byteLength > 8_192) {
    throw new GatewayError(503, "ai_unavailable", "猫猫暂时没能整理好回复，晚一点再试吧。");
  }
  return text.trim();
}

export async function handleGateway(request, {
  mode = "ai",
  limits,
  reserve,
  infer,
  available = true,
  ip = "local",
  now = Date.now,
  timeoutMs = 25_000,
  model = MODEL,
  reserveNeurons = (chat) => chat.reservedNeurons,
}) {
  let reservedQuota = null;
  try {
    const path = new URL(request.url).pathname;
    if (path === "/health" && request.method === "GET") {
      return jsonResponse({
        service: "extrafriendly-cat-free-gateway",
        available,
        mode,
        model: mode === "mock" ? "mock-no-ai" : model,
        quotas: limits,
        resets: "00:00 UTC",
      });
    }
    if (path !== "/v1/chat/completions") {
      throw new GatewayError(404, "not_found", "这个地址没有猫猫的服务。");
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: { code: "method_not_allowed", message: "聊天接口需要 POST 请求。" } }, 405, { allow: "POST" });
    }
    if (!available) {
      throw new GatewayError(503, "ai_unavailable", "免费聊天尚未上线；本地陪伴功能仍可以使用。");
    }
    const deviceId = readDeviceId(request);
    const chat = await readChatRequest(request);
    if (request.signal.aborted) {
      throw new GatewayError(499, "request_cancelled", "这次聊天已取消。");
    }
    const timestamp = now();
    const day = new Date(timestamp).toISOString().slice(0, 10);
    const [deviceKey, ipKey] = await Promise.all([
      hashQuotaKey(`device:${deviceId}`, day),
      hashQuotaKey(`ip:${ip}`, day),
    ]);
    const quota = await reserve({ now: timestamp, deviceKey, ipKey, neurons: reserveNeurons(chat), limits });
    reservedQuota = quota;
    if (!quota.allowed) {
      const message = quota.scope === "burst"
        ? "猫猫需要缓一小会儿，请稍后再聊。"
        : quota.scope === "global" || quota.scope === "budget"
          ? "今天大家共享的免费聊天额度用完啦，明天再聊；也可以主动选择自己的 API。"
          : "今天的免费聊天额度用完啦，明天再聊；也可以主动选择自己的 API。";
      return jsonResponse({
        error: { code: "quota_exceeded", message },
        gateway: { mode, quota },
      }, 429, { "retry-after": String(quota.retryAfter) });
    }

    // Do not refund after contacting AI: errors/timeouts may still use compute.
    let result;
    try {
      result = await withTimeout((signal) => infer({
        model,
        messages: chat.messages,
        max_tokens: chat.maxTokens,
        stream: false,
        temperature: 0.7,
        signal: AbortSignal.any([signal, request.signal]),
      }), timeoutMs);
    } catch (error) {
      if (error instanceof GatewayError) {
        throw error;
      }
      throw new GatewayError(503, "ai_unavailable", "免费聊天暂时不可用，猫猫会等你；请稍后重试。");
    }
    return jsonResponse({
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(timestamp / 1_000),
      model: PUBLIC_MODEL,
      choices: [{ index: 0, message: { role: "assistant", content: replyText(result) }, finish_reason: "stop" }],
      gateway: { mode, quota },
    }, 200, { "x-gateway-mode": mode });
  } catch (error) {
    if (error instanceof GatewayError) {
      return jsonResponse({
        error: { code: error.code, message: error.message },
        ...(reservedQuota ? { gateway: { mode, quota: reservedQuota } } : {}),
      }, error.status,
        error.retryAfter ? { "retry-after": String(error.retryAfter) } : {});
    }
    // Do not expose platform errors, device keys, IPs, or conversation contents.
    return jsonResponse({
      error: { code: "gateway_unavailable", message: "免费聊天服务暂时不可用，请稍后再试。" },
      ...(reservedQuota ? { gateway: { mode, quota: reservedQuota } } : {}),
    }, 503);
  }
}
