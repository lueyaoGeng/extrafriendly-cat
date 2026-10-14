import { createServer } from "node:http";
import { Readable } from "node:stream";
import { isIP } from "node:net";
import { handleGateway } from "./gateway.js";
import { QuotaStore } from "./quota-store.js";
import { openLocalQuotaStorage } from "./sqlite-local.js";

// One process owns one durable SQLite quota database; do not deploy ephemeral replicas.
export function createGatewayServer({ databasePath, limits, now, trustedProxyIps = [], ...inference }) {
  const storage = openLocalQuotaStorage(databasePath);
  const quota = new QuotaStore(storage);
  const server = createServer(async (incoming, outgoing) => {
    const controller = new AbortController();
    incoming.once("aborted", () => controller.abort());
    outgoing.once("close", () => {
      if (!outgoing.writableFinished) controller.abort();
    });
    try {
      const method = incoming.method ?? "GET";
      const request = new Request(`http://127.0.0.1${incoming.url ?? "/"}`, {
        method,
        headers: new Headers(Object.entries(incoming.headers).flatMap(([key, value]) =>
          (Array.isArray(value) ? value : value === undefined ? [] : [value]).map((item) => [key, item])),
        ),
        body: method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(incoming),
        duplex: "half",
        signal: controller.signal,
      });
      const remoteIp = (incoming.socket.remoteAddress || "local").replace(/^::ffff:/, "");
      const forwardedIp = incoming.headers["x-real-ip"];
      const ip = trustedProxyIps.includes(remoteIp) && typeof forwardedIp === "string" && isIP(forwardedIp)
        ? forwardedIp : remoteIp;
      const response = await handleGateway(request, {
        ...inference, limits, now,
        ip,
        reserve: (reservation) => quota.reserve(reservation),
      });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch {
      outgoing.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      outgoing.end(JSON.stringify({ error: { code: "gateway_unavailable", message: "聊天服务暂时不可用。" } }));
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.on("close", () => storage.close());
  return server;
}
