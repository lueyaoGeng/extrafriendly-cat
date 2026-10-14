import {
  CAT_PERSONALITY,
  INPUT_NEURONS_PER_MILLION,
  MAX_BODY_BYTES,
  MAX_HISTORY_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_MESSAGES,
  MAX_OUTPUT_TOKENS,
  OUTPUT_NEURONS_PER_MILLION,
  PUBLIC_MODEL,
} from "./config.js";

const encoder = new TextEncoder();

export class GatewayError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function jsonResponse(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export async function readChatRequest(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new GatewayError(415, "unsupported_media_type", "请使用 application/json 发送聊天内容。");
  }
  const advertisedLength = Number(request.headers.get("content-length"));
  if (advertisedLength > MAX_BODY_BYTES) {
    throw new GatewayError(413, "request_too_large", "这次消息有点长，缩短一些再发给猫猫吧。");
  }
  if (!request.body) {
    throw new GatewayError(400, "invalid_request", "聊天内容不能为空。");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new GatewayError(413, "request_too_large", "这次消息有点长，缩短一些再发给猫猫吧。");
      }
      chunks.push(chunk.value);
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
  let payload;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new GatewayError(400, "invalid_json", "猫猫没读懂这次消息格式，请重试。");
  }
  return validateChatPayload(payload);
}

export function validateChatPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new GatewayError(400, "invalid_request", "聊天请求需要是一个 JSON 对象。");
  }
  if (payload.model !== undefined && payload.model !== PUBLIC_MODEL) {
    throw new GatewayError(400, "unsupported_model", "免费接口只提供 extrafriendly-free 模型。");
  }
  if (payload.stream !== undefined && payload.stream !== false) {
    throw new GatewayError(400, "unsupported_stream", "首版免费接口只支持完整文字回复。");
  }
  if (payload.tools !== undefined || payload.functions !== undefined || payload.n !== undefined && payload.n !== 1) {
    throw new GatewayError(400, "unsupported_request", "免费接口只支持一条文字回复，不支持工具调用。");
  }
  const maxTokens = payload.max_tokens ?? MAX_OUTPUT_TOKENS;
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_OUTPUT_TOKENS) {
    throw new GatewayError(400, "invalid_token_limit", `回复长度应为 1–${MAX_OUTPUT_TOKENS} tokens。`);
  }
  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > MAX_MESSAGES) {
    throw new GatewayError(400, "invalid_messages", `每次发送 1–${MAX_MESSAGES} 条文字消息。`);
  }

  let historyBytes = 0;
  const messages = [{ role: "system", content: CAT_PERSONALITY }];
  for (const message of payload.messages) {
    if (!message || typeof message !== "object" || !["user", "assistant", "system"].includes(message.role)) {
      throw new GatewayError(400, "invalid_messages", "聊天只接受 user、assistant 或 system 文字消息。");
    }
    if (typeof message.content !== "string" || !message.content.trim()) {
      throw new GatewayError(400, "invalid_messages", "消息需要是非空文字。");
    }
    const length = encoder.encode(message.content).byteLength;
    if (length > MAX_MESSAGE_BYTES) {
      throw new GatewayError(400, "message_too_long", "单条消息太长了，请拆成短一点的文字。");
    }
    historyBytes += length;
    if (historyBytes > MAX_HISTORY_BYTES) {
      throw new GatewayError(400, "history_too_long", "聊天记录太长了，请只发送最近几轮对话。");
    }
    // The trusted server prompt is the only system instruction for the free lane.
    if (message.role !== "system") {
      messages.push({ role: message.role, content: message.content });
    }
  }
  if (messages.at(-1)?.role !== "user") {
    throw new GatewayError(400, "invalid_messages", "最后一条消息需要来自你。");
  }

  // Byte-level BPE cannot produce more text tokens than UTF-8 bytes. Reserve
  // extra chat-template tokens per message and output up to the requested cap.
  const promptTokenUpperBound = messages.reduce(
    (total, message) => total + encoder.encode(message.content).byteLength + 64,
    64,
  );
  const reservedNeurons = Math.ceil(
    promptTokenUpperBound * INPUT_NEURONS_PER_MILLION / 1_000_000
      + maxTokens * OUTPUT_NEURONS_PER_MILLION / 1_000_000,
  );
  return { messages, maxTokens, reservedNeurons };
}

export function readDeviceId(request) {
  const value = request.headers.get("x-device-id");
  // This is a rotating-abuse deterrent, not proof of an authenticated identity.
  if (!value || !/^[a-zA-Z0-9_-]{16,80}$/.test(value)) {
    throw new GatewayError(400, "missing_device_id", "请提供客户端保存的 X-Device-Id（16–80 位字母、数字、_ 或 -）。");
  }
  return value;
}

export async function hashQuotaKey(value, day) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${day}:${value}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
