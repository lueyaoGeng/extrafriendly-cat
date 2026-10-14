import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BIGMODEL_FREE_MODEL } from "../services/free-gateway/free-inference.js";
import { createBigModelServer } from "../services/free-gateway/node-server.js";

// The key stays in memory and never becomes a command-line argument or output.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keyDirectory = join(root, "apikeys");
const textFiles = (await readdir(keyDirectory)).filter((name) => name.toLowerCase().endsWith(".txt"));
if (textFiles.length !== 1) throw new Error("Expected one API key text file in apikeys.");
const key = (await readFile(join(keyDirectory, textFiles[0]), "utf8")).trim().replace(/^\uFEFF/, "");
if (!/^[A-Za-z0-9_.-]{20,512}$/.test(key)) throw new Error("API key text file must contain just the key.");
const server = createBigModelServer({
  env: { BIGMODEL_API_KEY: key, FREE_MODEL_CONFIRMED: BIGMODEL_FREE_MODEL }, databasePath: ":memory:",
});
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(`${origin}/health`)).json();
  assert.equal(health.available, true);
  assert.equal(health.model, BIGMODEL_FREE_MODEL);
  const response = await fetch(`${origin}/v1/chat/completions`, {
    method: "POST", signal: AbortSignal.timeout(30_000),
    headers: { "content-type": "application/json", "x-device-id": "live-gateway-test-0001" },
    body: JSON.stringify({ model: "extrafriendly-free", messages: [{ role: "user", content: "今天有点累，陪我一会儿。" }] }),
  });
  const body = await response.json();
  assert.equal(JSON.stringify(body).includes(key), false, "A gateway response must not contain the API key.");
  assert.equal(response.status, 200, "The live free model must succeed through the Node HTTP gateway.");
  assert.ok(body.choices?.[0]?.message?.content?.trim());
  assert.equal(body.gateway.quota.deviceRemaining, 19);
  const result = {
    checkedAt: new Date().toISOString(), mode: "loopback-http-live-bigmodel", model: health.model,
    status: response.status, replyReceived: true, secretInResponse: false, quota: body.gateway.quota,
    publicDeployment: false,
  };
  await mkdir(join(root, "artifacts"), { recursive: true });
  await writeFile(join(root, "artifacts", "live-gateway.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
