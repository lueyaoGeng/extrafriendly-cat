const encoder = new TextEncoder();
export const FREE_MESSAGE_BYTES = 2048;

export function utf8Length(text) {
  return encoder.encode(text).byteLength;
}

function truncateUtf8(text, maximum) {
  let result = "";
  let size = 0;
  for (const character of text) {
    const bytes = utf8Length(character);
    if (size + bytes > maximum) break;
    size += bytes;
    result += character;
  }
  return result;
}

/** Keep the latest user intact; prune older context to the gateway's UTF-8/body budget. */
export function freeChatPayload(history, userText) {
  if (utf8Length(userText) > FREE_MESSAGE_BYTES) throw new Error("Message exceeds the free gateway limit.");
  const messages = history.slice(-9).map((message) => ({
    role: message.role,
    content: truncateUtf8(message.content, FREE_MESSAGE_BYTES),
  })).filter((message) => message.content.trim());
  messages.push({ role: "user", content: userText });
  const payload = { model: "extrafriendly-free", messages, max_tokens: 384, stream: false };
  while (messages.length > 1 && (
    messages.reduce((total, message) => total + utf8Length(message.content), 0) > 8192
    || utf8Length(JSON.stringify(payload)) > 16384
  )) messages.shift();
  // Context may start on an assistant turn after pruning; drop it for a natural conversation start.
  while (messages.length > 1 && messages[0].role === "assistant") messages.shift();
  return payload;
}
