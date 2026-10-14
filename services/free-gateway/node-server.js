import { pathToFileURL } from "node:url";
import { limitsFromEnv } from "./config.js";
import { freeInferenceFromEnv } from "./free-inference.js";
import { createGatewayServer } from "./http-server.js";

export function createBigModelServer({ env = process.env, databasePath = "gateway-quota.sqlite", fetchImpl, now } = {}) {
  return createGatewayServer({
    ...freeInferenceFromEnv({ ...env, INFERENCE_PROVIDER: "bigmodel" }, fetchImpl),
    databasePath, limits: limitsFromEnv(env), now,
    trustedProxyIps: (env.TRUSTED_PROXY_IPS || "").split(",").map((ip) => ip.trim()).filter(Boolean),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8788);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid PORT");
  const host = process.env.HOST || "127.0.0.1";
  const server = createBigModelServer({ databasePath: process.env.QUOTA_DB_PATH || "gateway-quota.sqlite" });
  server.listen(port, host, () => console.log(`Extrafriendly free gateway: http://${host}:${port}/health`));
  process.once("SIGINT", () => server.close());
  process.once("SIGTERM", () => server.close());
}
