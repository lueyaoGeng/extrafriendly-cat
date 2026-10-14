import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createCompanion } from "./index.js";
import { STORAGE_KEY, FEATURE_KEYS, normalizeState, patchSettings, advanceCare, careAction, localDay, selectDailyAlbum, weatherIsFresh } from "./state.js";
import { fetchWeather } from "./weather.js";
import { ALBUMS } from "./albums.js";
import { freeChatPayload, utf8Length } from "./chat-protocol.js";
import { liveQuota } from "./quota-notice.js";

let createMockContext;
try {
  ({ createMockContext } = await import("@open-pets/plugin-sdk/testing"));
} catch {
  ({ createMockContext } = await import(new URL("../../../packages/sdk/dist/testing.js", import.meta.url)));
}

const manifest = JSON.parse(await readFile(new URL("./openpets.plugin.json", import.meta.url), "utf8"));
const DEVICE_ID = "9d8041cc-4d95-4894-a0d4-4f3ecdc61dc4";
const START_TIME = new Date(2026, 9, 13, 10, 0).getTime();

async function runtime(options = {}) {
  const mock = createMockContext({ permissions: manifest.permissions, nowMs: START_TIME });
  let currentTime = START_TIME;
  const initial = normalizeState(options.state, DEVICE_ID);
  initial.onboardingSeen = options.onboarding === true ? false : true;
  initial.apiGuideSeen = options.onboarding === true || options.apiGuide === false ? false : true;
  mock.calls.storage.set(STORAGE_KEY, initial);
  const companion = createCompanion(mock.ctx, {
    now: () => currentTime,
    gatewayUrl: options.gatewayUrl || "",
    albums: ALBUMS,
  });
  await companion.start();
  return { ...mock, companion, advance: (milliseconds) => { currentTime += milliseconds; } };
}

test("disabled care pauses independently and sleep never accrues catch-up care loss", () => {
  let state = normalizeState(null, DEVICE_ID);
  state = patchSettings(state, { features: { feeding: false } });
  const advanced = advanceCare(state, 60_000);
  assert.equal(advanced.care.satiety, state.care.satiety);
  assert.ok(advanced.care.cleanliness < state.care.cleanliness);
  assert.deepEqual(advanceCare(advanced, 2 * 86_400_000).care, advanced.care);
  assert.deepEqual(advanceCare(advanced, -10_000).care, advanced.care);
  assert.equal(careAction(advanced, "feed").applied, false);
  assert.deepEqual(careAction(advanced, "feed").state.care, advanced.care);
  assert.equal(Object.hasOwn(advanced.care, "affection"), false);
});

test("simultaneous feeding and cleaning never overwrite each other's persisted changes", async () => {
  const h = await runtime({ state: { care: { satiety: 20, cleanliness: 30 } } });
  try {
    await Promise.all([h.companion.runCare("feed", false), h.companion.runCare("clean", false), h.companion.runCare("feed", false)]);
    assert.equal(h.companion.snapshot().care.satiety, 70);
    assert.equal(h.companion.snapshot().care.cleanliness, 100);
    assert.deepEqual(h.calls.storage.get(STORAGE_KEY).care, h.companion.snapshot().care);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("hidden desktop pet pauses care instead of consuming food out of sight", async () => {
  const h = await runtime();
  const originalState = h.ctx.pet.getState;
  let visible = false;
  h.ctx.pet.getState = async () => ({ ...await originalState(), visible });
  try {
    const before = h.companion.snapshot().care;
    h.advance(60_000);
    await h.companion.tick();
    assert.deepEqual(h.companion.snapshot().care, before);
    visible = true;
    h.advance(60_000);
    await h.companion.tick();
    assert.ok(h.companion.snapshot().care.satiety < before.satiety);
  } finally {
    h.ctx.pet.getState = originalState;
    await h.companion.stop();
    await h.cleanup();
  }
});

test("chat weather requests search the supplied city locally without calling AI", async () => {
  const h = await runtime();
  try {
    const url = "https://geocoding-api.open-meteo.com/v1/search?name=Shanghai&count=6&language=zh&format=json";
    h.harness.net.mock(url, { status: 200, json: { results: [{ id: 1, name: "Shanghai", latitude: 31.2, longitude: 121.4 }] } });
    await h.companion.chatReply("明天 Shanghai 天气怎么样？");
    assert.equal(h.calls.aiCalls.length, 0);
    assert.equal(new URL(h.calls.netCalls.at(-1).url).searchParams.get("name"), "Shanghai");
    await h.companion.setSettings({ features: { weather: false } });
    const calls = h.calls.netCalls.length;
    await h.companion.chatReply("明天天气");
    assert.equal(h.calls.netCalls.length, calls);
    assert.equal(h.calls.aiCalls.length, 0);
    assert.ok(h.calls.bubbles.at(-1).spec.text.length > 0);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("consecutive local joke requests avoid repeating the last joke", async () => {
  const h = await runtime();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    await h.companion.chatReply("讲个笑话");
    const first = h.calls.bubbles.at(-1).spec.text;
    await h.companion.chatReply("讲个笑话");
    assert.notEqual(h.calls.bubbles.at(-1).spec.text, first);
  } finally {
    Math.random = originalRandom;
    await h.companion.stop();
    await h.cleanup();
  }
});

test("disabling a feature removes its menu/tool and a stale action cannot mutate care", async () => {
  const h = await runtime();
  try {
    const staleHandler = h.calls.commands.get("feed").handler;
    await h.companion.setSettings({ features: { feeding: false } });
    const before = h.companion.snapshot().care;
    assert.equal(h.calls.commands.has("feed"), false);
    assert.equal(h.calls.assistantCapabilities.has("feed"), false);
    assert.equal(h.calls.commands.has("clean"), true);
    await staleHandler();
    assert.deepEqual(h.companion.snapshot().care, before);
    assert.deepEqual(h.calls.storage.get(STORAGE_KEY).care, before);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("all optional functions off leaves pet clicks quiet and frozen care", async () => {
  const h = await runtime();
  try {
    await h.companion.setSettings({ features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, false])) });
    const before = h.companion.snapshot().care;
    const bubblesBefore = h.calls.bubbles.length;
    await h.harness.emit("pet:clicked", { petId: "default" });
    h.advance(60_000);
    await h.companion.tick();
    assert.deepEqual(h.companion.snapshot().care, before);
    assert.equal(h.calls.bubbles.length, bubblesBefore);
    assert.equal(h.calls.netCalls.length, 0);
    assert.equal(h.calls.sounds.length, 0);
    assert.deepEqual([...h.calls.commands.keys()], ["settings"]);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("daily album survives restart and advances without an immediate repeat", () => {
  const state = normalizeState(null, DEVICE_ID);
  const today = selectDailyAlbum(state, ALBUMS, "2026-10-13");
  const restored = normalizeState(JSON.parse(JSON.stringify(today.state)), DEVICE_ID);
  const again = selectDailyAlbum(restored, ALBUMS, "2026-10-13");
  const tomorrow = selectDailyAlbum(again.state, ALBUMS, "2026-10-14");
  assert.equal(again.album.id, today.album.id);
  assert.notEqual(tomorrow.album.id, today.album.id);
  assert.equal(localDay(new Date(2026, 9, 13, 0, 1)), "2026-10-13");
});

test("native pet bubble input reaches the explicitly selected personal AI", async () => {
  const h = await runtime({ state: { settings: { provider: "personal" } } });
  try {
    h.harness.ai.mock(() => "我在这儿陪着你。");
    await h.harness.runCommand("chat");
    const input = h.calls.bubbles.at(-1);
    assert.equal(input.spec.input.type, "text");
    await h.harness.fireBubbleSubmit(input.handle.id, { message: "今天有点累" });
    assert.equal(h.calls.aiCalls.length, 1);
    assert.equal(h.calls.aiCalls[0].messages.at(-1).content, "今天有点累");
    assert.equal(h.calls.bubbles.at(-1).spec.dynamic, true);
    assert.equal(h.calls.netCalls.length, 0);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("free quota failure never silently calls the configured personal AI", async () => {
  const h = await runtime({ gatewayUrl: "https://cat.example.org" });
  try {
    h.harness.ai.mock(() => "This paid provider must not be used.");
    h.harness.net.mock("https://cat.example.org/v1/chat/completions", { status: 429, json: { error: { code: "quota_exceeded" } } });
    await h.companion.chatReply("今天有点累");
    assert.equal(h.calls.aiCalls.length, 0);
    assert.equal(h.calls.netCalls.length, 1);
    assert.equal(h.calls.netCalls[0].headers["X-Device-Id"], DEVICE_ID);
    assert.equal(h.calls.bubbles.at(-1).spec.dynamic, false);
    assert.ok(h.calls.bubbles.at(-1).spec.text.length > 0);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("disabling chat while a response is pending prevents the late bubble", async () => {
  const h = await runtime({ state: { settings: { provider: "personal" } } });
  const originalComplete = h.ctx.ai.complete;
  let release;
  h.ctx.ai.complete = () => new Promise((resolve) => { release = resolve; });
  h.harness.ai.mock(() => "unused");
  try {
    const pending = h.companion.chatReply("陪我坐一会儿");
    await new Promise((resolve) => setImmediate(resolve));
    await h.companion.setSettings({ features: { chat: false } });
    const before = h.calls.bubbles.length;
    release({ text: "A late answer." });
    await pending;
    assert.equal(h.calls.bubbles.length, before);
  } finally {
    h.ctx.ai.complete = originalComplete;
    await h.companion.stop();
    await h.cleanup();
  }
});

test("weather uses actual returned values, is stale after an hour, and incomplete data fails", async () => {
  const mock = createMockContext({ permissions: manifest.permissions });
  const location = { name: "测试城市", latitude: 31.2, longitude: 121.5 };
  try {
    mock.harness.net.mock("https://api.open-meteo.com/", { json: {
      current: { temperature_2m: 21, weather_code: 1, time: "2026-10-13T10:00" },
      daily: { time: ["2026-10-13", "2026-10-14"], temperature_2m_min: [15, 14], temperature_2m_max: [24, 25], precipitation_probability_max: [10, 20], weather_code: [1, 61] },
    } });
    const weather = await fetchWeather(mock.ctx, location, START_TIME);
    assert.ok(weather.summary.includes("21°C"));
    assert.ok(weather.summary.includes("14–25°C"));
    assert.equal(weatherIsFresh(weather, START_TIME + 60_000), true);
    assert.equal(weatherIsFresh(weather, START_TIME + 3_600_001), false);
    mock.harness.net.mock("https://api.open-meteo.com/", { json: { current: {}, daily: {} } });
    await assert.rejects(() => fetchWeather(mock.ctx, location, START_TIME));
  } finally {
    await mock.cleanup();
  }
});

test("packaged ratings and music links carry usable source provenance", () => {
  const ids = new Set();
  for (const album of ALBUMS) {
    assert.equal(ids.has(album.id), false);
    ids.add(album.id);
    assert.ok(album.entryTrack.trim());
    assert.ok(Number.isFinite(album.review.score));
    assert.ok(album.review.score >= 0 && album.review.score <= album.review.scale);
    for (const url of [album.review.url, album.spotifyUrl, album.neteaseUrl]) assert.equal(new URL(url).protocol, "https:");
    assert.ok(Number.isFinite(Date.parse(album.review.date)));
    assert.equal(album.platformLinkKind, "search");
  }
});

test("minute care timer re-arms its single host slot and teardown stops it", async () => {
  const h = await runtime();
  try {
    const before = h.companion.snapshot().care.satiety;
    h.advance(60_000);
    await h.harness.clock.advance(60_000);
    assert.ok(h.companion.snapshot().care.satiety < before);
    assert.equal(h.calls.schedules.size, 1);
    const afterFirstMinute = h.companion.snapshot().care.satiety;
    h.advance(60_000);
    await h.harness.clock.advance(60_000);
    assert.ok(h.companion.snapshot().care.satiety < afterFirstMinute);
    await h.companion.stop();
    assert.equal(h.calls.schedules.size, 0);
  } finally {
    await h.cleanup();
  }
});

test("free-lane Chinese input exceeding the byte cap is explained before any API call", async () => {
  const h = await runtime({ gatewayUrl: "https://cat.example.org" });
  try {
    h.harness.ai.mock(() => "This provider must not be called.");
    await h.companion.chatReply("猫".repeat(1000));
    assert.equal(h.calls.netCalls.length, 0);
    assert.equal(h.calls.aiCalls.length, 0);
    assert.equal(h.calls.bubbles.at(-1).spec.dynamic, false);
    assert.ok(h.calls.bubbles.at(-1).spec.text.length > 0);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("free-lane multi-byte history stays in budget without truncating the latest user", () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: "猫".repeat(1000),
  }));
  const latest = "今天我想慢慢来。".repeat(50);
  const payload = freeChatPayload(history, latest);
  assert.equal(payload.messages.at(-1).content, latest);
  assert.ok(payload.messages.every((message) => utf8Length(message.content) <= 2048));
  assert.ok(payload.messages.reduce((sum, message) => sum + utf8Length(message.content), 0) <= 8192);
  assert.ok(utf8Length(JSON.stringify(payload)) <= 16384);
  assert.equal(payload.messages.some((message) => message.role === "system"), false);
});

test("static album speech conforms to the native host's short single-line bubble", async () => {
  const h = await runtime();
  try {
    await h.harness.runCommand("album");
    const speech = h.calls.speak.at(-1);
    assert.ok(speech.length <= 140);
    assert.equal(/[\r\n]/.test(speech), false);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("a bubble created after chat is disabled is immediately dismissed", async () => {
  const h = await runtime();
  const originalBubble = h.ctx.ui.bubble;
  let release;
  h.ctx.ui.bubble = async (spec) => {
    const bubble = await originalBubble(spec);
    return new Promise((resolve) => { release = () => resolve(bubble); });
  };
  try {
    const opening = h.harness.runCommand("chat");
    await new Promise((resolve) => setImmediate(resolve));
    await h.companion.setSettings({ features: { chat: false } });
    release();
    await opening;
    assert.equal(h.calls.bubbles.filter((bubble) => !bubble.dismissed).length, 0);
  } finally {
    h.ctx.ui.bubble = originalBubble;
    await h.companion.stop();
    await h.cleanup();
  }
});

test("overlapping chat openings retain only the newest bubble", async () => {
  const h = await runtime();
  const originalBubble = h.ctx.ui.bubble;
  const releases = [];
  h.ctx.ui.bubble = async (spec) => {
    const bubble = await originalBubble(spec);
    return new Promise((resolve) => { releases.push(() => resolve(bubble)); });
  };
  try {
    const first = h.harness.runCommand("chat");
    await new Promise((resolve) => setImmediate(resolve));
    const second = h.harness.runCommand("chat");
    await new Promise((resolve) => setImmediate(resolve));
    releases[0]();
    await first;
    releases[1]();
    await second;
    assert.equal(h.calls.bubbles.filter((bubble) => !bubble.dismissed).length, 1);
    assert.equal(h.calls.bubbles[0].dismissed, true);
    assert.equal(h.calls.bubbles[1].dismissed, false);
  } finally {
    h.ctx.ui.bubble = originalBubble;
    await h.companion.stop();
    await h.cleanup();
  }
});

test("concurrent panel requests coalesce and shutdown closes a late panel", async () => {
  const h = await runtime();
  const originalPanel = h.ctx.ui.panel;
  let release;
  let created = 0;
  let closed = 0;
  h.ctx.ui.panel = async (spec) => {
    created++;
    const panel = await originalPanel(spec);
    const originalClose = panel.close;
    panel.close = async () => { closed++; await originalClose(); };
    return new Promise((resolve) => { release = () => resolve(panel); });
  };
  try {
    const first = h.harness.runCommand("settings");
    const second = h.harness.runCommand("settings");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(created, 1);
    await h.companion.stop();
    release();
    await Promise.all([first, second]);
    assert.equal(closed, 1);
  } finally {
    h.ctx.ui.panel = originalPanel;
    await h.companion.stop();
    await h.cleanup();
  }
});

test("rapid feature toggles leave only the final enabled commands and capabilities", async () => {
  const h = await runtime();
  try {
    await Promise.all([
      h.companion.setSettings({ features: { feeding: false, litter: true } }),
      h.companion.setSettings({ features: { feeding: true, litter: false } }),
      h.companion.setSettings({ features: { feeding: false, litter: false } }),
    ]);
    assert.equal(h.calls.commands.has("feed"), false);
    assert.equal(h.calls.commands.has("clean"), false);
    assert.equal(h.calls.assistantCapabilities.has("feed"), false);
    assert.equal(h.calls.assistantCapabilities.has("clean"), false);
  } finally {
    await h.companion.stop();
    await h.cleanup();
  }
});

test("new installs and existing users see API guidance once, with a manual route afterwards", async () => {
  const h = await runtime({ apiGuide: false });
  let restarted;
  try {
    const first = h.calls.panelMessages.find((message) => message.type === "snapshot");
    assert.equal(first.tab, "api");
    assert.ok(first.apiGuide.providers.some((provider) => provider.model === "glm-4-flash-250414"));
    assert.equal(h.companion.snapshot().apiGuideSeen, true);
    await h.companion.stop();
    const before = h.calls.panelMessages.length;
    restarted = createCompanion(h.ctx, { now: () => START_TIME, gatewayUrl: "" });
    await restarted.start();
    assert.equal(h.calls.panelMessages.length, before);
    await restarted.handleMessage({ type: "api-guide" });
    assert.equal(h.calls.panelMessages.at(-1).tab, "api");
  } finally {
    await restarted?.stop();
    await h.companion.stop();
    await h.cleanup();
  }
});

test("low-quota reminders survive restart, escalate at exhaustion, and stay out of AI history", async () => {
  const h = await runtime({ gatewayUrl: "https://cat.example.org" });
  const resetsAt = new Date(START_TIME + 7_200_000).toISOString();
  const respond = (status, remaining) => h.harness.net.mock("https://cat.example.org/v1/chat/completions", {
    json: { choices: [{ message: { content: "我在这里陪你。" } }], gateway: { quota: { status, scope: "device", deviceRemaining: remaining, resetsAt } } },
  });
  try {
    respond("low", 4);
    await h.companion.chatReply("聊一会儿");
    assert.ok(h.calls.bubbles.at(-1).spec.text.includes("4 次"));
    assert.ok(h.calls.bubbles.at(-1).spec.actions.some((action) => action.id === "api"));
    respond("low", 3);
    await h.companion.chatReply("再陪我一会儿");
    assert.equal(h.calls.bubbles.at(-1).spec.text, "我在这里陪你。");
    const body = JSON.parse(h.calls.netCalls.at(-1).body);
    assert.equal(body.messages.some((message) => message.content.includes("免费 API")), false);
    const restored = await runtime({ gatewayUrl: "https://cat.example.org", state: h.companion.snapshot() });
    try {
      restored.harness.net.mock("https://cat.example.org/v1/chat/completions", { json: {
        choices: [{ message: { content: "我在这里陪你。" } }], gateway: { quota: { status: "low", scope: "device", deviceRemaining: 2, resetsAt } },
      } });
      await restored.companion.chatReply("回来啦");
      assert.equal(restored.calls.bubbles.at(-1).spec.text, "我在这里陪你。");
    } finally {
      await restored.companion.stop(); await restored.cleanup();
    }
    respond("exhausted", 0);
    await h.companion.chatReply("最后一句");
    assert.ok(h.calls.bubbles.at(-1).spec.text.includes("免费 API"));
    assert.equal(h.companion.snapshot().lastApiNotice.level, "exhausted");
    h.advance(86_400_000);
    const nextReset = new Date(START_TIME + 86_400_000 + 7_200_000).toISOString();
    h.harness.net.mock("https://cat.example.org/v1/chat/completions", { json: {
      choices: [{ message: { content: "又见面啦。" } }], gateway: { quota: { status: "low", scope: "device", deviceRemaining: 4, resetsAt: nextReset } },
    } });
    await h.companion.chatReply("新的一天");
    assert.ok(h.calls.bubbles.at(-1).spec.text.includes("4 次"));
    assert.equal(h.calls.aiCalls.length, 0);
  } finally {
    await h.companion.stop(); await h.cleanup();
  }
});

test("quota notices on rejected requests obey the native static bubble's single-line contract", async () => {
  for (const [status, quotaStatus, remaining] of [[429, "exhausted", 0], [503, "low", 4]]) {
    const h = await runtime({ gatewayUrl: "https://cat.example.org" });
    try {
      h.harness.net.mock("https://cat.example.org/v1/chat/completions", { status, json: {
        error: { message: "服务暂时不可用。" },
        gateway: { quota: { status: quotaStatus, scope: "device", deviceRemaining: remaining, resetsAt: new Date(START_TIME + 7_200_000).toISOString() } },
      } });
      await h.companion.chatReply("你好呀");
      const bubble = h.calls.bubbles.at(-1).spec;
      assert.equal(bubble.dynamic, false);
      assert.ok(bubble.text.includes("免费 API"));
      assert.equal(/[\r\n]/.test(bubble.text), false);
      assert.ok(bubble.text.length <= 140);
    } finally {
      await h.companion.stop();
      await h.cleanup();
    }
  }
});

test("users can turn API reminders off without changing the provider or hiding their quota information", async () => {
  const h = await runtime({ gatewayUrl: "https://cat.example.org", state: { settings: { features: { apiReminders: false } } } });
  try {
    h.harness.net.mock("https://cat.example.org/v1/chat/completions", { json: {
      choices: [{ message: { content: "我陪着你。" } }], gateway: { quota: { status: "low", scope: "global", deviceRemaining: 10, resetsAt: new Date(START_TIME + 7_200_000).toISOString() } },
    } });
    await h.companion.chatReply("你好呀");
    assert.equal(h.calls.bubbles.at(-1).spec.text, "我陪着你。");
    assert.equal(h.companion.snapshot().freeQuota.status, "low");
    assert.equal(h.companion.snapshot().settings.provider, "free");
    assert.equal(h.calls.aiCalls.length, 0);
  } finally {
    await h.companion.stop(); await h.cleanup();
  }
});

test("temporary rate limits and expired quota cannot become daily-exhaustion API warnings", async () => {
  const h = await runtime({ gatewayUrl: "https://cat.example.org" });
  try {
    h.harness.net.mock("https://cat.example.org/v1/chat/completions", { status: 429, json: {
      gateway: { quota: { status: "busy", scope: "burst", deviceRemaining: 19, resetsAt: new Date(START_TIME + 60_000).toISOString() } },
    } });
    await h.companion.chatReply("你好");
    assert.ok(h.calls.bubbles.at(-1).spec.text.includes("等一小会儿"));
    assert.equal(h.companion.snapshot().lastApiNotice, null);
    assert.equal(liveQuota(h.companion.snapshot().freeQuota, START_TIME + 60_000), null);
    assert.equal(liveQuota({ status: "low", scope: "device", resetsAt: "bad-date" }, START_TIME), null);
  } finally {
    await h.companion.stop(); await h.cleanup();
  }
});

test("API guide buttons open only curated platform/docs/rule URLs", async () => {
  const h = await runtime();
  try {
    await h.companion.handleMessage({ type: "api-guide-link", providerId: "bigmodel", target: "platform" });
    assert.equal(h.calls.openedExternal.at(-1), "https://bigmodel.cn/");
    const before = h.calls.openedExternal.length;
    for (const target of ["https://untrusted.example", "constructor", "__proto__"]) {
      await h.companion.handleMessage({ type: "api-guide-link", providerId: "bigmodel", target });
    }
    await h.companion.handleMessage({ type: "api-guide-link", providerId: "https://untrusted.example", target: "platform" });
    assert.equal(h.calls.openedExternal.length, before);
  } finally {
    await h.companion.stop(); await h.cleanup();
  }
});
