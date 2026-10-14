import assert from "node:assert/strict";
import { cp, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Native UI verification with synthetic quota responses, not live AI or cloud usage.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = join(root, "apps", "desktop");
const output = join(root, "artifacts", "windows-quota-smoke");
const pluginSource = join(root, "plugins", "official", "extrafriendly.cat");
const pluginRoot = join(output, "plugins");
const fixture = join(pluginRoot, "extrafriendly.cat");
await mkdir(fixture, { recursive: true });
for (const folder of ["panel", "assets", "locales"]) {
  await cp(join(pluginSource, folder), join(fixture, folder), { recursive: true });
}
const manifest = JSON.parse(await readFile(join(pluginSource, "openpets.plugin.json"), "utf8"));
manifest.network.hosts.push("quota.fixture.invalid");
await writeFile(join(fixture, "openpets.plugin.json"), JSON.stringify(manifest, null, 2));
const viteRequire = createRequire(await realpath(join(appDirectory, "node_modules", "vite", "package.json")));
await viteRequire("esbuild").build({
  entryPoints: [join(pluginSource, "companion.js")],
  outfile: join(fixture, "index.js"),
  bundle: true, platform: "browser", format: "esm", target: "chrome146", charset: "utf8",
  plugins: [{
    name: "fixture-gateway-address",
    setup(build) {
      build.onLoad({ filter: /gateway-config\.js$/ }, () => ({
        contents: 'export const FREE_GATEWAY_URL = "https://quota.fixture.invalid";', loader: "js",
      }));
    },
  }],
});
const packages = await readdir(join(root, "node_modules", ".pnpm"));
const playwrightPackage = packages.find((name) => name.startsWith("playwright-core@"));
if (!playwrightPackage) throw new Error("Install workspace dependencies before the smoke test.");
const { _electron } = await import(pathToFileURL(join(root, "node_modules", ".pnpm", playwrightPackage, "node_modules", "playwright-core", "index.mjs")));
const electron = await _electron.launch({
  executablePath: createRequire(join(appDirectory, "package.json"))("electron"),
  args: [appDirectory], cwd: appDirectory, timeout: 90_000,
  env: {
    ...process.env,
    EXTRAFRIENDLY_TEST_PROFILE: join(output, `profile-${Date.now()}`),
    OPENPETS_DEV_PLUGIN_ROOTS: pluginRoot,
  },
});
const checks = [];
try {
  await electron.evaluate(({ app }) => {
    const appRequire = process.getBuiltinModule("module").createRequire(`${app.getAppPath()}/package.json`);
    const { setPluginSdkNetworkTestHooks } = appRequire(`${app.getAppPath()}/dist/plugin-sdk-network.js`);
    globalThis.__catQuotaFixture = { status: "low", remaining: 4, calls: 0 };
    globalThis.__restoreQuotaHooks = setPluginSdkNetworkTestHooks({
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      fetch: async (url) => {
        if (new URL(url).hostname !== "quota.fixture.invalid") throw new Error("Unexpected fixture request.");
        const fixture = globalThis.__catQuotaFixture;
        fixture.calls++;
        const busy = fixture.status === "busy";
        const exhausted = fixture.status === "exhausted";
        const resetsAt = new Date(busy ? Date.now() + 60_000 : Math.ceil(Date.now() / 86_400_000) * 86_400_000).toISOString();
        const quota = { status: fixture.status, scope: busy ? "burst" : "device", deviceRemaining: fixture.remaining, resetsAt };
        const body = busy || exhausted
          ? { error: { code: "quota_exceeded", message: busy ? "稍后再试。" : "免费额度不足。" }, gateway: { mode: "ai", quota } }
          : { choices: [{ message: { content: `fixture-reply-${fixture.calls}` } }], gateway: { mode: "ai", quota } };
        return new Response(JSON.stringify(body), { status: busy || exhausted ? 429 : 200, headers: { "content-type": "application/json" } });
      },
    });
  });
  let panel = electron.windows().find((page) => page.url().includes("/panel/index.html")) ?? await electron.waitForEvent("window", {
    predicate: (page) => page.url().includes("/panel/index.html"), timeout: 60_000,
  });
  await panel.waitForFunction(() => document.querySelector("#feature-apiReminders"));
  const pet = electron.windows().find((page) => page.url().includes("rendered-pets/default.html"));
  assert.ok(pet);
  const send = async (status, remaining, expected) => {
    await electron.evaluate((_electron, value) => Object.assign(globalThis.__catQuotaFixture, value), { status, remaining });
    await panel.locator('[data-tab="home"]').click();
    await panel.locator("#chat").click();
    await pet.locator('[data-input-id="message"]').fill("陪我一会儿");
    await pet.locator("[data-bubble-submit]").click();
    await pet.waitForFunction((text) => document.querySelector(".bubble-text")?.textContent.includes(text), expected);
  };
  await send("low", 4, "fixture-reply-1");
  await panel.locator("#quota-banner").waitFor({ state: "visible" });
  assert.ok((await pet.locator(".bubble-text").textContent()).includes("还剩 4 次"));
  const nextPanel = electron.waitForEvent("window", {
    predicate: (page) => page.url().includes("/panel/index.html"), timeout: 15_000,
  });
  await pet.locator('[data-bubble-action="api"]').click();
  panel = await nextPanel;
  await panel.locator('[data-page="api"]').waitFor({ state: "visible" });
  await panel.screenshot({ path: join(output, "low-quota-api-guide.png") });
  checks.push("Low quota is visible in the native bubble and panel; its action opens the real API guide");

  await send("low", 3, "fixture-reply-2");
  assert.equal((await pet.locator(".bubble-text").textContent()).includes("还剩"), false);
  checks.push("The same quota period does not append a second low-quota reminder");

  await panel.locator('[data-tab="settings"]').click();
  await panel.locator("#feature-apiReminders").uncheck();
  await panel.locator("#quota-banner").waitFor({ state: "hidden" });
  await send("low", 2, "fixture-reply-3");
  assert.equal(await panel.locator("#quota-banner").isVisible(), false);
  assert.equal((await pet.locator(".bubble-text").textContent()).includes("还剩"), false);
  checks.push("Turning reminders off suppresses banners and bubble warnings while chat still works");

  await panel.locator('[data-tab="settings"]').click();
  await panel.locator("#feature-apiReminders").check();
  await send("exhausted", 0, "这次免费额度不足了");
  await panel.locator("#quota-banner").waitFor({ state: "visible" });
  await pet.locator('[data-bubble-action="api"]').waitFor();
  await pet.screenshot({ path: join(output, "exhausted-quota.png"), omitBackground: true });
  checks.push("Exhaustion escalates to an API invitation without switching the selected provider");

  await send("busy", 2, "等一小会儿");
  await panel.locator("#quota-banner").waitFor({ state: "hidden" });
  assert.equal((await pet.locator(".bubble-text").textContent()).includes("自己的免费 API"), false);
  checks.push("Short-term throttling remains a wait message without a false daily-exhaustion banner");
  const result = { checkedAt: new Date().toISOString(), mode: "synthetic-quota-fixture", checks };
  await writeFile(join(output, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, ...result, output }, null, 2));
} finally {
  await electron.evaluate(() => globalThis.__restoreQuotaHooks?.()).catch(() => undefined);
  await electron.close();
}
