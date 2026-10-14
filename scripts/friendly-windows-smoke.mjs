import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Playwright is already part of the docs toolchain; do not download a browser.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = await readdir(join(root, "node_modules", ".pnpm"));
const playwrightPackage = packages.find((name) => name.startsWith("playwright-core@"));
if (!playwrightPackage) throw new Error("Install workspace dependencies before the smoke test.");
const { _electron } = await import(pathToFileURL(join(root, "node_modules", ".pnpm", playwrightPackage, "node_modules", "playwright-core", "index.mjs")));
const appDirectory = join(root, "apps", "desktop");
const require = createRequire(join(appDirectory, "package.json"));
const packaged = process.argv.includes("--packaged");
const liveBigModel = process.argv.includes("--live-bigmodel");
const executableArgument = process.argv.indexOf("--executable");
const executablePath = executableArgument === -1
  ? packaged ? join(appDirectory, "dist-electron", "win-unpacked", "extrafriendly-cat.exe") : require("electron")
  : resolve(process.argv[executableArgument + 1] || "");
if (executableArgument !== -1 && (!packaged || !process.argv[executableArgument + 1])) {
  throw new Error("--executable requires --packaged and an executable path.");
}
const output = join(root, "artifacts", packaged ? "windows-packaged-smoke" : "windows-smoke");
await mkdir(output, { recursive: true });
const electron = await _electron.launch({
  executablePath,
  args: packaged ? [] : [appDirectory],
  cwd: packaged ? dirname(executablePath) : appDirectory,
  env: { ...process.env, EXTRAFRIENDLY_TEST_PROFILE: join(output, `profile-${Date.now()}`) },
  timeout: 90_000,
});
const checks = [];
let providerServer;
try {
  if (!electron.windows().some((page) => page.url().includes("/panel/index.html"))) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const opened = await electron.evaluate(async ({ app }) => {
        try {
          const appRequire = process.getBuiltinModule("module").createRequire(`${app.getAppPath()}/package.json`);
          const { getPluginService } = appRequire(`${app.getAppPath()}/dist/plugin-service.js`);
          return (await getPluginService().executeCommand("extrafriendly.cat", "settings")).ok;
        } catch {
          return false;
        }
      });
      if (opened) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const panel = electron.windows().find((page) => page.url().includes("/panel/index.html")) ?? await electron.waitForEvent("window", {
    predicate: (page) => page.url().includes("/panel/index.html"),
    timeout: 60_000,
  });
  await panel.waitForFunction(() => document.querySelector("#feature-chat"));
  await panel.waitForFunction(() => !document.querySelector("#animation").disabled);
  await panel.locator('[data-tab="api"]').click();
  await panel.waitForFunction(() => document.querySelectorAll("#api-providers .api-provider").length === 2);
  assert.equal(await panel.locator('#api-providers input[aria-label="智谱 BigModel 模型名称"]').inputValue(), "glm-4-flash-250414");
  await panel.screenshot({ path: join(output, "api-onboarding.png") });
  await panel.locator("#api-later").click();
  checks.push("Free API guide includes official entry points, copyable configuration and a skip option");
  await panel.screenshot({ path: join(output, "cat-home.png") });
  const pet = electron.windows().find((page) => page.url().includes("rendered-pets/default.html"));
  assert.ok(pet, "Native desktop pet window must exist.");
  const windowState = await electron.evaluate(({ BrowserWindow, app }) => ({
    platform: process.platform,
    appName: app.getName(),
    packaged: app.isPackaged,
    profile: app.getPath("userData"),
    pet: BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("rendered-pets/default.html"))?.isAlwaysOnTop(),
  }));
  assert.equal(windowState.platform, "win32");
  assert.equal(windowState.appName, "Extrafriendly Cat");
  assert.equal(windowState.packaged, packaged);
  assert.equal(windowState.pet, true);
  checks.push("Windows native transparent pet starts and stays above windows");
  await pet.screenshot({ path: join(output, "desktop-cat.png"), omitBackground: true });

  await panel.locator('[data-tab="settings"]').click();
  assert.equal(await panel.locator("#feature-apiReminders").isChecked(), true);
  await panel.locator("#feature-apiReminders").uncheck();
  await panel.locator("#feature-apiReminders").check();
  await panel.locator("#feature-feeding").uncheck();
  await panel.locator('[data-tab="home"]').click();
  await panel.waitForFunction(() => document.querySelector("#feed").disabled);
  await panel.locator('[data-tab="settings"]').click();
  await panel.locator("#feature-feeding").check();
  await panel.locator('[data-tab="home"]').click();
  await panel.waitForFunction(() => !document.querySelector("#feed").disabled);
  await panel.locator("#feed").click();
  await panel.waitForFunction(() => Number(document.querySelector("#satiety").value) === 100);
  await panel.locator("#clean").click();
  await panel.waitForFunction(() => Number(document.querySelector("#cleanliness").value) === 100);
  checks.push("Feed/clean work; feeding toggle disables and restores the visible action");

  await panel.locator('[data-tab="music"]').click();
  await panel.waitForFunction(() => document.querySelector("#album-title").textContent !== "唱片正在准备中");
  assert.ok(await panel.locator("#album-score").textContent());
  await panel.screenshot({ path: join(output, "daily-album.png") });
  checks.push("Daily album renders a source rating and explicitly labeled music search links");

  await panel.locator('[data-tab="settings"]').click();
  await panel.locator("#animation").uncheck();
  await pet.waitForFunction(() => getComputedStyle(document.querySelector(".sprite, .installed-sprite")).animationPlayState === "paused");
  await panel.locator("#animation").check();
  await pet.waitForFunction(() => getComputedStyle(document.querySelector(".sprite, .installed-sprite")).animationPlayState === "running");
  await panel.locator("#customSkins").uncheck();
  await panel.waitForFunction(() => document.querySelector("#skins-settings").textContent.includes("内置"));
  await panel.locator("#customSkins").check();
  checks.push("Independent native animation/custom-skin host switches are connected");
  await panel.screenshot({ path: join(output, "cat-settings.png") });

  await panel.locator('[data-tab="api"]').click();
  await panel.locator("#api-settings").click();
  const advanced = electron.windows().find((page) => page.url().includes("/renderer/index.html")) ?? await electron.waitForEvent("window", {
    predicate: (page) => page.url().includes("/renderer/index.html"),
    timeout: 15_000,
  });
  await advanced.waitForFunction(() => document.querySelector(".app-shell"));
  await advanced.screenshot({ path: join(output, "personal-api-settings.png") });
  checks.push("Personal API settings open through the existing protected host route");

  if (packaged && !liveBigModel) {
    await panel.locator('[data-tab="home"]').click();
    await panel.locator("#chat").click();
    await pet.locator('[data-input-id="message"]').fill("陪我待一会儿");
    await pet.locator("[data-bubble-submit]").click();
    await pet.waitForFunction(() => document.body.textContent.includes("还没上线"));
    checks.push("Standalone packaged exe loads its own resources and honestly reports free service pending");
  } else {
    const requests = [];
    if (liveBigModel) {
      const keyDirectory = join(root, "apikeys");
      const textFiles = (await readdir(keyDirectory)).filter((name) => name.toLowerCase().endsWith(".txt"));
      if (textFiles.length !== 1) throw new Error("Expected one API key text file in apikeys.");
      const key = (await readFile(join(keyDirectory, textFiles[0]), "utf8")).trim().replace(/^\uFEFF/, "");
      if (!/^[A-Za-z0-9_.-]{20,512}$/.test(key)) throw new Error("API key text file must contain just the key.");
      const userData = await electron.evaluate(({ app }) => app.getPath("userData"));
      const platformText = await readFile(join(userData, "openpets-plugin-platform.json"), "utf8").catch((error) => {
        if (error.code === "ENOENT") return "{}";
        throw error;
      });
      const isEditing = Boolean(JSON.parse(platformText).profiles?.["extrafriendly-bigmodel-free"]);
      await advanced.evaluate(async ({ key, isEditing }) => window.openPetsControlCenter.saveProviderConfiguration({
        isEditing,
        profileId: "extrafriendly-bigmodel-free",
        payload: { id: "extrafriendly-bigmodel-free", label: "智谱免费猫猫", adapter: "openai-compatible-text", model: "glm-4-flash-250414", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
        credentialValue: key,
        activatedRoles: ["text"], deactivatedRoles: [],
      }).then(() => undefined), { key, isEditing });
      assert.equal(await electron.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable()), true);
      for (const filename of ["plugin-secrets.json", "openpets-plugin-platform.json"]) {
        assert.equal((await readFile(join(userData, filename), "utf8")).includes(key), false, "Persisted settings must not contain a plaintext API key.");
      }
      await electron.evaluate(() => {
        const originalFetch = globalThis.fetch;
        globalThis.__catLiveProbe = { count: 0, status: 0, text: "", failed: false };
        globalThis.fetch = async (...args) => {
          if (!String(args[0]).startsWith("https://open.bigmodel.cn/")) return originalFetch(...args);
          globalThis.__catLiveProbe.count++;
          try {
            const response = await originalFetch(...args);
            globalThis.__catLiveProbe.status = response.status;
            const data = await response.clone().json();
            globalThis.__catLiveProbe.text = data.choices?.[0]?.message?.content || "";
            return response;
          } catch {
            globalThis.__catLiveProbe.failed = true;
            throw new Error("Live provider transport failed.");
          }
        };
      });
    } else {
      providerServer = createServer(async (request, response) => {
        let body = "";
        for await (const chunk of request) body += chunk;
        requests.push(JSON.parse(body));
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "[接口测试] 我在这里，慢慢来。" }, finish_reason: "stop" }] }));
      });
      await new Promise((resolve) => providerServer.listen(0, "127.0.0.1", resolve));
      const providerPort = providerServer.address().port;
      await advanced.evaluate(async (port) => {
        await window.openPetsControlCenter.saveProviderConfiguration({
          isEditing: false,
          profileId: "smoke-provider",
          payload: { id: "smoke-provider", label: "Local test fixture", adapter: "openai-compatible-text", model: "mock-no-ai", baseUrl: `http://127.0.0.1:${port}/v1` },
          activatedRoles: ["text"],
          deactivatedRoles: [],
        });
      }, providerPort);
    }
    await panel.locator('input[name="provider"][value="personal"]').check();
    await panel.waitForFunction(() => document.querySelector("#personal-state").textContent === "已配置");
    await panel.locator('[data-tab="home"]').click();
    await panel.locator("#chat").click();
    const composer = pet.locator('[data-input-id="message"]');
    await composer.fill("今天有点累，陪我待一会儿。");
    await pet.locator("[data-bubble-submit]").click();
    if (liveBigModel) {
      let probe;
      for (let attempt = 0; attempt < 60; attempt++) {
        probe = await electron.evaluate(() => globalThis.__catLiveProbe);
        if (probe.failed || probe.status && (probe.status !== 200 || probe.text)) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.equal(probe.status, 200, "Live BigModel request must succeed.");
      assert.ok(probe.text.trim(), "The real model must return a visible reply.");
      await pet.waitForFunction((text) => document.body.textContent.includes(text), probe.text);
      checks.push("User-provided BigModel key is encrypted by the host; a real glm-4-flash-250414 reply reaches the native bubble");
    } else {
      await pet.waitForFunction(() => document.body.textContent.includes("[接口测试] 我在这里"));
      assert.equal(requests.length, 1);
      assert.ok(requests[0].messages.some((message) => message.role === "system" && message.content.includes("用户养的一只猫")));
      checks.push("Native composer reaches an actual loopback OpenAI-compatible test service and renders its reply (not real AI)");
    }
    await pet.screenshot({ path: join(output, "chat-bubble.png"), omitBackground: true });

    await panel.locator("#joke").click();
    await panel.waitForFunction(() => document.querySelector("#joke-text").textContent !== "我的待办清单只有两条：陪你。陪你做别的。");
    await panel.locator("#city-query").fill("Shanghai");
    await panel.locator('#city-form button[type="submit"]').click();
    await panel.locator("#cities button").first().waitFor({ timeout: 20_000 });
    await panel.locator("#cities button").first().click();
    await panel.waitForFunction(() => document.querySelector("#weather-text").textContent.includes("明天") && document.querySelector("#weather-time").textContent.includes("预报日期"), { timeout: 30_000 });
    checks.push("Local joke and live Open-Meteo city/current/tomorrow forecast work through the sandbox");
    await panel.screenshot({ path: join(output, "weather.png") });

    await panel.locator('[data-tab="settings"]').click();
    await panel.locator("#skins-settings").click();
    await advanced.waitForFunction(() => document.querySelectorAll(".pet-card, .pet-row").length > 0 || document.body.textContent.includes("墨墨猫"));
    await advanced.evaluate(() => window.openPetsControlCenter.setDefaultPet("friendly-ink"));
    await pet.waitForFunction(() => document.documentElement.dataset.petAssetName === "墨墨猫");
    await pet.screenshot({ path: join(output, "ink-cat.png"), omitBackground: true });
    await advanced.evaluate(() => window.openPetsControlCenter.setDefaultPet("builtin"));
    await pet.waitForFunction(() => document.documentElement.dataset.petAssetName === "奶油猫");
    checks.push("Bundled alternative skin switches through the validated native pet installer");
  }
  await writeFile(join(output, "result.json"), JSON.stringify({ checkedAt: new Date().toISOString(), checks, windowState }, null, 2));
  console.log(JSON.stringify({ ok: true, checks, output }, null, 2));
} finally {
  await electron.close();
  if (providerServer) await new Promise((resolve) => providerServer.close(resolve));
}
