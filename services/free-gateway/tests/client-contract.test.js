import assert from "node:assert/strict";
import test from "node:test";
import { freeChatPayload } from "../../../plugins/official/extrafriendly.cat/chat-protocol.js";
import { MAX_BODY_BYTES } from "../config.js";
import { readChatRequest } from "../protocol.js";

async function validateClientPayload(body) {
  const encoded = JSON.stringify(body);
  assert.ok(Buffer.byteLength(encoded, "utf8") <= MAX_BODY_BYTES);
  return readChatRequest(new Request("https://cat.example/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-id": "contract-device-00000001" },
    body: encoded,
  }));
}

test("successive Chinese client conversations stay accepted by the actual gateway parser", async () => {
  const history = [];
  for (let turn = 0; turn < 16; turn += 1) {
    const latestUser = `第${turn}轮，` + "今天想和你慢慢聊一会儿。".repeat(45);
    const clientPayload = freeChatPayload(history, latestUser);
    const parsed = await validateClientPayload(clientPayload);
    assert.equal(parsed.messages.at(-1).role, "user");
    assert.equal(parsed.messages.at(-1).content, latestUser);
    history.push({ role: "user", content: latestUser });
    history.push({ role: "assistant", content: "我把爪子放在你旁边，陪着你慢慢说。".repeat(80) });
  }
});

test("JSON-escaped history is pruned without dropping or truncating the newest message", async () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: "\u0000".repeat(1_900),
  }));
  const latestUser = '我想聊聊这个字符串："\\\\"\n' + "\u0000".repeat(1_800);
  const clientPayload = freeChatPayload(history, latestUser);
  const parsed = await validateClientPayload(clientPayload);
  assert.equal(parsed.messages.at(-1).content, latestUser);
});
