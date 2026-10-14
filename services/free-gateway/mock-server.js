import { pathToFileURL } from "node:url";
import { limitsFromEnv } from "./config.js";
import { createGatewayServer } from "./http-server.js";

export function createMockServer({ databasePath = ":memory:", limits = limitsFromEnv(process.env), now } = {}) {
  return createGatewayServer({
    databasePath, limits, now, mode: "mock",
    infer: async () => ({ response: "【本地接口演示，非 AI 回复】我是一只陪着你的猫。真实免费聊天还没有上线，先摸摸我吧。" }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8788);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be between 1 and 65535");
  }
  const server = createMockServer({ databasePath: process.env.MOCK_QUOTA_DB ?? ":memory:" });
  server.listen(port, "127.0.0.1", () => {
    console.log(`MOCK ONLY — no AI: http://127.0.0.1:${port}/health`);
  });
  const shutdown = () => server.close();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
