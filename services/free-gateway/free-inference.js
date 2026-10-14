import { MODEL } from "./config.js";
import { GatewayError } from "./protocol.js";

export const BIGMODEL_FREE_MODEL = "glm-4-flash-250414";
const BIGMODEL_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

async function readProviderJson(response) {
  if (!response.ok || !response.body) throw new GatewayError(503, "ai_unavailable", "免费模型暂时不可用，请稍后再试。");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) {
        await reader.cancel();
        throw new GatewayError(503, "ai_unavailable", "免费模型回复暂时没能处理，请稍后再试。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

// Only these explicit model/provider pairs are supported. There is no paid fallback.
export function freeInferenceFromEnv(env, fetchImpl = fetch) {
  const provider = env.INFERENCE_PROVIDER || "bigmodel";
  if (provider === "cloudflare") {
    return {
      model: MODEL,
      available: Boolean(env.AI),
      reserveNeurons: (chat) => chat.reservedNeurons,
      infer: ({ signal, ...input }) => env.AI.run(input.model, {
        messages: input.messages, max_tokens: input.max_tokens, stream: false, temperature: input.temperature,
      }),
    };
  }
  const configured = provider === "bigmodel" && typeof env.BIGMODEL_API_KEY === "string" && Boolean(env.BIGMODEL_API_KEY.trim())
    && env.FREE_MODEL_CONFIRMED === BIGMODEL_FREE_MODEL;
  return {
    model: BIGMODEL_FREE_MODEL,
    available: configured,
    // BigModel's allowlisted model is free, not billed in Cloudflare neurons.
    // Device/IP/global/burst limits still apply; billing status must be checked by the operator.
    reserveNeurons: () => 0,
    async infer(input) {
      if (!configured) throw new GatewayError(503, "ai_unavailable", "免费模型配置未完成。");
      const response = await fetchImpl(BIGMODEL_ENDPOINT, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.BIGMODEL_API_KEY.trim()}` },
        body: JSON.stringify({
          model: BIGMODEL_FREE_MODEL,
          messages: input.messages,
          max_tokens: input.max_tokens,
          stream: false,
          temperature: input.temperature,
        }),
        signal: input.signal,
      });
      return readProviderJson(response);
    },
  };
}
