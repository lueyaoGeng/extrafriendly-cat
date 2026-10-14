import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(root, "apikeys");
const names = (await readdir(directory)).filter((name) => name.endsWith(".txt"));
if (names.length !== 1) throw new Error("Expected one API key text file.");
const key = (await readFile(join(directory, names[0]), "utf8")).trim().replace(/^\uFEFF/, "");
if (!/^[A-Za-z0-9_.-]{20,512}$/.test(key)) throw new Error("The text file must contain just the key.");
const checks = [];
for (const model of ["glm-4.7-flash", "glm-4-flash-250414"]) {
  try {
    const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: "你是用户养的小猫，语气温柔，简短地陪伴用户。" }, { role: "user", content: "今天有点累，陪我一会儿。" }], max_tokens: 128,
        ...(model === "glm-4.7-flash" ? { thinking: { type: "disabled" } } : {}),
      }),
    });
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    const errorMessage = typeof data.error?.message === "string" ? data.error.message.replaceAll(key, "[redacted]").slice(0,180) : "";
    checks.push({ model, status: response.status, replyReceived: typeof text === "string" && Boolean(text.trim()), errorCode: data.error?.code || "", errorMessage });
  } catch {
    checks.push({ model, status: 0, replyReceived: false, errorMessage: "Transport failed or timed out." });
  }
}
await mkdir(join(root, "artifacts"), { recursive: true });
await writeFile(join(root, "artifacts", "free-model-live.json"), JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
console.log(JSON.stringify(checks, null, 2));
