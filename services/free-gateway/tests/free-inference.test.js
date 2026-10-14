import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { BIGMODEL_FREE_MODEL, freeInferenceFromEnv } from "../free-inference.js";
import { createBigModelServer } from "../node-server.js";

const configuredEnv = { BIGMODEL_API_KEY: "fixture-only-key", FREE_MODEL_CONFIRMED: BIGMODEL_FREE_MODEL };

test("an unconfirmed free model or unknown provider cannot contact an upstream", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error("must not call"); };
  for (const env of [{}, { BIGMODEL_API_KEY: "fixture-only-key" }, { ...configuredEnv, INFERENCE_PROVIDER: "paid-provider" }]) {
    const inference = freeInferenceFromEnv(env, fetchImpl);
    assert.equal(inference.available, false);
    await assert.rejects(inference.infer({}), { status: 503 });
  }
  assert.equal(calls, 0);
});

test("the real Node HTTP gateway pins the free model, keeps keys server-side and reports quota", async (context) => {
  const calls = [];
  const server = createBigModelServer({
    env: { ...configuredEnv, DEVICE_DAILY_LIMIT: "5" }, databasePath: ":memory:",
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
      return new Response(JSON.stringify({ choices: [{ message: { content: "我陪你慢慢来。" } }] }));
    },
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${origin}/health`)).json();
  assert.equal(health.available, true);
  assert.equal(health.model, BIGMODEL_FREE_MODEL);
  const send = (model = "extrafriendly-free") => fetch(`${origin}/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", "x-device-id": "test-device-00000001" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "陪我一会儿" }], max_tokens: 384 }),
  });
  assert.equal((await send("another-paid-model")).status, 400);
  assert.equal(calls.length, 0);
  let result;
  for (let i = 0; i < 4; i++) result = await (await send()).json();
  assert.equal(result.choices[0].message.content, "我陪你慢慢来。");
  assert.equal(result.gateway.quota.status, "low");
  assert.equal(result.gateway.quota.deviceRemaining, 1);
  assert.equal(JSON.stringify(result).includes(configuredEnv.BIGMODEL_API_KEY), false);
  assert.equal(calls[0].url, "https://open.bigmodel.cn/api/paas/v4/chat/completions");
  assert.equal(calls[0].body.model, BIGMODEL_FREE_MODEL);
  assert.equal(calls[0].body.max_tokens, 384);
  assert.equal(calls[0].headers.authorization, `Bearer ${configuredEnv.BIGMODEL_API_KEY}`);
  assert.equal((await (await send()).json()).gateway.quota.status, "exhausted");
  const rejected = await send();
  assert.equal(rejected.status, 429);
  assert.equal((await rejected.json()).gateway.quota.status, "exhausted");
  assert.equal(calls.length, 5);
});

test("provider failure and oversized replies cannot leak secrets or trigger another model", async () => {
  let calls = 0;
  const inference = freeInferenceFromEnv(configuredEnv, async () => {
    calls++;
    return new Response(configuredEnv.BIGMODEL_API_KEY, { status: 429 });
  });
  await assert.rejects(inference.infer({ messages: [], max_tokens: 384 }), (error) => error.status === 503 && !error.message.includes(configuredEnv.BIGMODEL_API_KEY));
  assert.equal(calls, 1);
  const oversized = freeInferenceFromEnv(configuredEnv, async () => new Response(new Uint8Array(32_769)));
  await assert.rejects(oversized.infer({ messages: [], max_tokens: 384 }), { status: 503 });
});

test("untrusted forwarded IP headers cannot evade a Node gateway's IP limit", async (context) => {
  let calls = 0;
  const server = createBigModelServer({
    env: { ...configuredEnv, IP_DAILY_LIMIT: "1" }, databasePath: ":memory:",
    fetchImpl: async () => { calls++; return new Response(JSON.stringify({ response: "我在这里。" })); },
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const send = (index) => fetch(`http://127.0.0.1:${server.address().port}/v1/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", "x-device-id": `test-device-0000000${index}`, "x-real-ip": `192.0.2.${index}` },
    body: JSON.stringify({ messages: [{ role: "user", content: "你好" }] }),
  });
  assert.equal((await send(1)).status, 200);
  assert.equal((await send(2)).status, 429);
  assert.equal(calls, 1);
});
