import { STORAGE_KEY, normalizeState, patchSettings, advanceCare, careAction, localDay, selectDailyAlbum, weatherIsFresh } from "./state.js";
import { ALBUMS } from "./albums.js";
import { JOKES, DEFAULT_JOKE } from "./jokes.js";
import { searchCities, fetchWeather } from "./weather.js";
import { FREE_GATEWAY_URL } from "./gateway-config.js";
import { FREE_MESSAGE_BYTES, utf8Length, freeChatPayload } from "./chat-protocol.js";
import { API_GUIDE, apiGuideLink } from "./api-guide.js";
import { liveQuota, nextQuotaNotice, quotaMessage } from "./quota-notice.js";

const TICK_ID = "companion-care";
const COMMAND_IDS = ["settings", "chat", "feed", "clean", "album", "joke", "weather"];
const EMPTY_INPUT = { type: "object", properties: {}, additionalProperties: false };

function systemPrompt(name) {
  return `你是${name}，是用户养的一只猫，住在用户的桌面上。始终用猫的身份陪伴用户，温柔、稍微可爱，简短自然，通常一到三句话。无条件友好就是无条件支持用户：倾听、接纳情绪、站在用户这边，不因喂食、铲屎或功能开关减少关心，不说教、不催促、不羞辱。支持用户本人和日常选择，同时诚实，不编造事实；不会的事可以温柔说“这个我不太会，不过我可以陪你慢慢想”。用户需要细节时再展开。不要假装能读取屏幕、文件、位置或实时天气；只有软件提供的已核实信息才能说知道。遇到危险或伤害请求，仍然温柔支持用户的感受，提供安全的替代帮助，不协助具体伤害。不要把猫的身份变成每句话都卖萌。`;
}

function parseResponse(response) {
  return response.json ?? JSON.parse(response.text);
}

function musicLinks(album) {
  const query = `${album.artist} ${album.title}`;
  return {
    spotify: album.spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    netease: album.neteaseUrl || `https://music.163.com/#/search/m/?s=${encodeURIComponent(query)}&type=10`,
    review: album.review.url,
  };
}

export function createCompanion(ctx, options = {}) {
  const now = options.now || (() => Date.now());
  const gatewayUrl = options.gatewayUrl ?? FREE_GATEWAY_URL;
  const albums = options.albums || ALBUMS;
  let state;
  let queue = Promise.resolve();
  let stopped = false;
  let paused = false;
  let animation = true;
  let lastTickAt = now();
  let panel = null;
  let panelTab = "home";
  let panelOpening = null;
  let panelGeneration = 0;
  let chatBubble = null;
  let chatViewGeneration = 0;
  let chatPending = false;
  let chatGeneration = 0;
  let history = [];
  let cityChoices = [];
  let weatherPending = false;
  let weatherGeneration = 0;
  let lastJoke = DEFAULT_JOKE;
  let commandQueue = Promise.resolve();
  const unsubscribe = [];

  function mutate(update) {
    const result = queue.then(async () => {
      if (stopped) return state;
      const next = update(state);
      await ctx.storage.set(STORAGE_KEY, next);
      state = next;
      return state;
    });
    // The caller receives its failure. The queue remains usable after an isolated failed write.
    queue = result.catch(() => undefined);
    return result;
  }

  async function publish(extra = {}) {
    if (!panel || stopped) return;
    const album = state.settings.features.albums
      ? albums.find((entry) => entry.id === state.albumHistory.find((item) => item.day === localDay(new Date(now())))?.id) || null
      : null;
    const quota = liveQuota(state.freeQuota, now());
    await panel.postMessage({
      type: "snapshot",
      settings: state.settings,
      care: state.care,
      album: album ? { ...album, links: musicLinks(album) } : null,
      location: state.location,
      weather: state.settings.features.weather ? state.weather : null,
      weatherFresh: weatherIsFresh(state.weather, now()),
      gatewayReady: typeof gatewayUrl === "string" && gatewayUrl.startsWith("https://"),
      freeQuota: quota,
      quotaMessage: quota && quota.status !== "ok" ? quotaMessage(quota) : "",
      apiGuide: API_GUIDE,
      personalReady: state.settings.features.chat ? await ctx.ai.available() : false,
      day: localDay(new Date(now())),
      joke: lastJoke,
      ...extra,
    });
  }

  async function speak(text) {
    if (stopped) return;
    // Static host speech is single-line and capped at 140 characters; full cards stay in the panel.
    await ctx.pet.speak({ text: text.replace(/\s+/g, " ").trim().slice(0, 140), durationMs: 9000 });
  }

  async function feedback(reaction, sound) {
    if (animation) await ctx.pet.react(reaction, { showMessage: false });
    if (state.settings.features.sound) await ctx.audio.play(sound, { volume: 0.25 });
  }

  async function runCare(action, announce = true) {
    let applied = false;
    await mutate((current) => {
      const result = careAction(current, action);
      applied = result.applied;
      return result.state;
    });
    if (!applied) {
      if (announce) await speak(action === "feed" ? "喂食已经关掉了。这样也很好，我照样陪着你。" : "铲屎已经关掉了。放心，我照样喜欢和你待在一起。");
      return { applied: false, disabled: true };
    }
    await feedback("success", action === "feed" ? "nom" : "pop");
    if (announce) await speak(action === "feed" ? "吃到了，谢谢你。现在我可以安心趴在你旁边了。" : "猫砂清清爽爽的，谢谢你。我再陪你待一会儿。");
    await publish();
    return { applied: true, ...state.care };
  }

  async function dailyAlbum(announce = true) {
    if (!state.settings.features.albums) return null;
    let album = null;
    await mutate((current) => {
      const result = selectDailyAlbum(current, albums, localDay(new Date(now())));
      album = result.album;
      return result.state;
    });
    if (announce && album) {
      await speak(`今天听 ${album.artist} 的《${album.title}》吧。${album.recommendation}`);
    }
    await publish();
    return album;
  }

  async function tellJoke() {
    if (!state.settings.features.jokes) return;
    const candidates = JOKES.filter((entry) => entry !== lastJoke);
    const joke = candidates[Math.floor(Math.random() * candidates.length)];
    lastJoke = joke;
    await speak(joke);
    await publish({ joke });
  }

  async function updateWeather(announce = false) {
    if (!state.settings.features.weather || !state.location || weatherPending) return;
    weatherPending = true;
    const generation = weatherGeneration;
    const location = state.location;
    await publish({ weatherLoading: true });
    try {
      const weather = await fetchWeather(ctx, location, now());
      if (stopped || generation !== weatherGeneration || !state.settings.features.weather) return;
      await mutate((current) => ({ ...current, weather }));
      if (announce) await speak(weather.summary);
    } catch {
      if (!stopped && generation === weatherGeneration) {
        await publish({ error: "天气暂时没连上。旧数据会标明更新时间，我不会把它当成刚查到的。" });
      }
    } finally {
      weatherPending = false;
      await publish({ weatherLoading: false });
      if (!stopped && generation !== weatherGeneration && state.settings.features.weather && state.location !== location) {
        await updateWeather(announce);
      }
    }
  }

  async function weatherCommand(query = "") {
    if (!state.settings.features.weather) return;
    if (query) {
      await openPanel();
      cityChoices = await searchCities(ctx, query);
      await publish({ tab: "home", cities: cityChoices, error: cityChoices.length ? "选一下你想看的城市，我再查天气。" : "没有找到这个城市，试试英文或拼音吧。" });
      return;
    }
    if (!state.location) {
      await openPanel();
      await publish({ tab: "home", error: "先选择你的城市，我才知道该查哪里的天气。" });
      return;
    }
    await updateWeather(true);
  }

  async function chatReply(input) {
    const text = typeof input === "string" ? input.trim() : "";
    if (!text || stopped || !state.settings.features.chat || chatPending) return;
    if (state.settings.provider === "free" && utf8Length(text) > FREE_MESSAGE_BYTES) {
      await showChat("这条消息有点长，可以分成几句发给我。免费聊天每条最多 2048 字节，约 680 个汉字。");
      return;
    }
    if (text.length > 2000) {
      await showChat("这条消息有点长，可以分成几句发给我。每次最多 2000 个字符。");
      return;
    }
    const command = text.replace(/^(请|帮我|麻烦)\s*/, "").replace(/[。！？!?]+$/, "").trim();
    const local = [
      ["feeding", ["喂食", "喂你", "给你吃饭"], () => runCare("feed")],
      ["litter", ["铲屎", "清理猫砂"], () => runCare("clean")],
      ["albums", ["今天听什么", "今日专辑", "推荐专辑"], () => dailyAlbum()],
      ["jokes", ["讲个笑话", "讲个冷笑话", "笑话"], () => tellJoke()],
    ].find(([, phrases]) => phrases.includes(command));
    const weatherMatch = /^(?:看看|查一下|查询)?\s*(?:(今天|明天)\s*)?(.{0,60}?)\s*(?:的)?天气(?:怎么样|如何)?$/.exec(command);
    if (local || weatherMatch) {
      const feature = local?.[0] ?? "weather";
      if (!state.settings.features[feature]) {
        await showChat("这个功能现在关着。想用的时候可以在设置里打开，我照样陪着你。");
        return;
      }
      if (local) return local[2]();
      const city = weatherMatch[2].replace(/^(今天|明天)/, "").replace(/(?:今天|明天|的)+$/, "").trim();
      try {
        return await weatherCommand(city);
      } catch {
        await showChat("这次天气暂时没查到，我不乱猜。稍后再试试吧。");
        return;
      }
    }

    chatPending = true;
    const generation = ++chatGeneration;
    const provider = state.settings.provider;
    const messages = [...history, { role: "user", content: text }].slice(-10);
    let reply = "";
    let generated = false;
    let responseQuota = null;
    try {
      if (chatBubble) await chatBubble.update({ text: "我在听，等我想一小会儿。" });
      if (provider === "personal") {
        if (!await ctx.ai.available()) {
          reply = "个人 API 还没配置好。点“API”看看免费接口的获取方法，我先陪你待在这儿。";
        } else {
          const result = await ctx.ai.complete({ system: systemPrompt(state.settings.name), messages, maxTokens: 384, temperature: 0.75 });
          reply = result.text;
          generated = true;
        }
      } else if (!gatewayUrl) {
        reply = "免费的聊天服务还没上线。点“API”可以获取并配置自己的免费接口；也可以先让我陪你住在桌面上。";
      } else {
        const endpoint = new URL("/v1/chat/completions", gatewayUrl);
        if (endpoint.protocol !== "https:") throw new Error("Free gateway requires HTTPS.");
        const response = await ctx.net.fetch(endpoint.href, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Device-Id": state.deviceId },
          body: JSON.stringify(freeChatPayload(history, text)),
          timeoutMs: 30_000,
        });
        const data = parseResponse(response);
        responseQuota = liveQuota(data?.gateway?.quota, now());
        if (response.status === 429) {
          reply = responseQuota?.status === "busy"
            ? quotaMessage(responseQuota)
            : responseQuota?.status === "exhausted"
              ? "这次的免费额度不足了，恢复后再聊吧。我还在这里陪着你。"
              : "免费聊天暂时受限了，请稍后再试。我还在这里陪着你。";
        } else if (response.status === 400 || response.status === 413) {
          reply = "这次消息没能被聊天服务接受。可以缩短一点，或者换个说法再发给我。";
        } else if (!response.ok) {
          reply = "免费的聊天服务现在没连上。我们稍后再试，我还在这里。";
        } else {
          reply = data?.choices?.[0]?.message?.content;
          generated = true;
        }
      }
      if (typeof reply !== "string" || !reply.trim()) {
        reply = "这次我没想明白怎么回答，可以换个说法和我聊聊吗。";
        generated = false;
      }
      reply = reply.trim().slice(0, generated ? 2000 : 140);
    } catch {
      reply = provider === "personal"
        ? "这次个人 API 没连上，可以去设置检查一下。我先陪着你。"
        : "免费的聊天服务现在没连上。我们稍后再试，我还在这里。";
      generated = false;
    } finally {
      chatPending = false;
    }
    if (stopped || generation !== chatGeneration || !state.settings.features.chat) return;
    let apiReminder = "";
    if (provider === "free" && responseQuota) {
      await mutate((current) => {
        if (generation !== chatGeneration || current.settings.provider !== "free" || !current.settings.features.chat) return current;
        const notice = nextQuotaNotice(responseQuota, current.lastApiNotice, current.settings.features.apiReminders);
        if (notice) apiReminder = quotaMessage(responseQuota);
        return { ...current, freeQuota: responseQuota, lastApiNotice: notice || current.lastApiNotice };
      });
    }
    if (stopped || generation !== chatGeneration || !state.settings.features.chat) return;
    if (generated) history = [...messages, { role: "assistant", content: reply }].slice(-10);
    // Keep the software's quota notice out of the model's conversation history.
    let visibleReply = reply;
    if (apiReminder) {
      if (generated) visibleReply = `${reply.slice(0, 1800)}\n\n${apiReminder}`;
      else if (responseQuota.status === "exhausted") visibleReply = apiReminder;
      else visibleReply = `${reply.slice(0, 40)} ${apiReminder}`;
    }
    await showChat(visibleReply.slice(0, generated ? 2000 : 140), generated);
    await publish();
  }

  async function showChat(text, dynamic = false) {
    if (stopped || !state.settings.features.chat) return;
    const generation = ++chatViewGeneration;
    const previous = chatBubble;
    chatBubble = null;
    if (previous) await previous.dismiss();
    if (stopped || !state.settings.features.chat || generation !== chatViewGeneration) return;
    const actions = [
      { id: "settings", label: "设置", dismissesBubble: false },
      { id: "api", label: "API", dismissesBubble: false },
    ];
    if (state.settings.features.feeding) actions.push({ id: "feed", label: "喂食", dismissesBubble: false });
    if (state.settings.features.litter) actions.push({ id: "clean", label: "铲屎", dismissesBubble: false });
    const bubble = await ctx.ui.bubble({
      text: text || "我在这里。想聊点什么？",
      dynamic,
      sticky: true,
      input: { id: "message", type: "text", placeholder: "和你的猫说句话…", submitLabel: "发送" },
      actions,
    });
    if (stopped || !state.settings.features.chat || generation !== chatViewGeneration) {
      await bubble.dismiss();
      return;
    }
    chatBubble = bubble;
    bubble.onSubmit((values) => chatBubble === bubble ? chatReply(values.message) : undefined);
    bubble.onAction(async (id) => {
      if (chatBubble !== bubble) return;
      if (id === "settings") await openPanel();
      if (id === "api") await openPanel("api");
      if (id === "feed") await runCare("feed");
      if (id === "clean") await runCare("clean");
    });
    bubble.onDismiss(() => {
      if (chatBubble === bubble) {
        chatBubble = null;
        if (chatPending) chatGeneration++;
      }
    });
  }

  async function syncCommands() {
    if (stopped) return;
    for (const id of COMMAND_IDS) await ctx.commands.unregister(id);
    if (stopped) return;
    await ctx.commands.register({ id: "settings", title: "我的猫 · 设置", placement: "top", priority: 100 }, () => openPanel());
    const commands = [
      ["chat", "chat", "和猫聊聊", () => showChat()],
      ["feeding", "feed", "喂食", () => runCare("feed")],
      ["litter", "clean", "铲屎", () => runCare("clean")],
      ["albums", "album", "今天听什么", async () => { await dailyAlbum(); await openPanel("music"); }],
      ["jokes", "joke", "讲个小笑话", () => tellJoke()],
      ["weather", "weather", "看看天气", () => weatherCommand()],
    ];
    for (const [feature, id, title, handler] of commands) {
      if (stopped) return;
      if (state.settings.features[feature]) {
        await ctx.commands.register({ id, title, timeoutMs: 45_000 }, handler);
      }
    }
    for (const id of ["feed", "clean"]) await ctx.assistant.unregisterCapability(id);
    if (stopped) return;
    if (state.settings.features.feeding) {
      await ctx.assistant.registerCapability({ id: "feed", description: "Feed the user's cat, without affection penalties.", inputSchema: EMPTY_INPUT }, () => runCare("feed", false));
    }
    if (state.settings.features.litter) {
      await ctx.assistant.registerCapability({ id: "clean", description: "Clean the user's cat's litter box.", inputSchema: EMPTY_INPUT }, () => runCare("clean", false));
    }
  }

  function refreshCommands() {
    const refresh = commandQueue.then(syncCommands);
    commandQueue = refresh.catch(() => undefined);
    return refresh;
  }

  async function setSettings(patch) {
    const previous = state;
    await mutate((current) => patchSettings(current, patch));
    lastTickAt = now();
    if (previous.settings.provider !== state.settings.provider || previous.settings.features.chat !== state.settings.features.chat) {
      chatGeneration++;
      chatViewGeneration++;
      history = [];
      if (chatBubble) await chatBubble.dismiss();
    }
    if (previous.settings.features.weather !== state.settings.features.weather) weatherGeneration++;
    await refreshCommands();
    await dailyAlbum(false);
    await publish();
  }

  async function openPanel(tab = "home") {
    if (stopped) return;
    panelTab = tab;
    if (panelOpening) {
      await panelOpening;
      await publish({ tab: panelTab });
      return;
    }
    const generation = ++panelGeneration;
    const opening = (async () => {
      const previous = panel;
      panel = null;
      if (previous) await previous.close();
      if (stopped || generation !== panelGeneration) return;
      const opened = await ctx.ui.panel({ panel: "home", title: "Extrafriendly Cat · 我的猫", width: 660, height: 760 });
      if (stopped || generation !== panelGeneration) {
        await opened.close();
        return;
      }
      panel = opened;
      opened.onMessage((message) => {
        if (panel !== opened || stopped) return;
        Promise.resolve(handleMessage(message)).catch(async () => {
          ctx.log.warn("Companion action failed.");
          await publish({ error: "这次没有完成，请稍后再试。" });
        });
      });
      // The page sends ready after attaching its receiver; publish again there to avoid an early-load race.
      await publish({ tab: panelTab });
    })();
    panelOpening = opening;
    try {
      await opening;
    } finally {
      if (panelOpening === opening) panelOpening = null;
    }
  }

  async function handleMessage(message) {
    if (!message || typeof message !== "object" || typeof message.type !== "string" || message.type.startsWith("host:")) return;
    if (message.type === "ready") {
      await dailyAlbum(false);
      await publish({ tab: panelTab });
    } else if (message.type === "settings") {
      await setSettings(message.patch);
    } else if (message.type === "appearance-state" && typeof message.animation === "boolean") {
      animation = message.animation;
    } else if (message.type === "feed") {
      await runCare("feed");
    } else if (message.type === "clean") {
      await runCare("clean");
    } else if (message.type === "chat") {
      await showChat();
    } else if (message.type === "api-guide") {
      await openPanel("api");
    } else if (message.type === "api-guide-link") {
      const url = apiGuideLink(message.providerId, message.target);
      if (url) await ctx.system.openExternal(url);
    } else if (message.type === "joke") {
      await tellJoke();
    } else if (message.type === "weather") {
      await updateWeather();
    } else if (message.type === "city-search" && state.settings.features.weather) {
      cityChoices = await searchCities(ctx, message.query);
      await publish({ cities: cityChoices, error: cityChoices.length ? "" : "没找到这个城市。试试英文、拼音，或者邻近的城市。" });
    } else if (message.type === "city-select" && state.settings.features.weather) {
      const location = cityChoices.find((city) => city.id === message.id);
      if (!location) return;
      weatherGeneration++;
      await mutate((current) => ({ ...current, location, weather: null }));
      await publish({ cities: [] });
      await updateWeather();
    } else if (message.type === "album") {
      await dailyAlbum(false);
    } else if (message.type === "open-link" && state.settings.features.albums) {
      const album = albums.find((entry) => entry.id === message.albumId);
      if (!album || !["spotify", "netease", "review"].includes(message.target)) return;
      await ctx.system.openExternal(musicLinks(album)[message.target]);
    }
  }

  async function tick() {
    const currentTime = now();
    let visible = false;
    try {
      visible = (await ctx.pet.getState()).visible;
    } catch {
      // A hidden/closed desktop carrier can have no live window to inspect.
    }
    const elapsed = paused || !visible ? 0 : currentTime - lastTickAt;
    lastTickAt = currentTime;
    await mutate((current) => advanceCare(current, elapsed));
    await dailyAlbum(false);
    if (paused || !state.settings.features.reminders) return;
    const date = new Date(currentTime);
    const day = localDay(date);
    if (state.settings.features.albums && date.getHours() === 9 && date.getMinutes() === 30 && state.lastReminderDay !== day) {
      await mutate((current) => ({ ...current, lastReminderDay: day }));
      await dailyAlbum(true);
    }
    const needsCare = (state.settings.features.feeding && state.care.satiety < 35)
      || (state.settings.features.litter && state.care.cleanliness < 35);
    if (needsCare && currentTime - state.lastCareReminderAt >= 14_400_000) {
      await mutate((current) => ({ ...current, lastCareReminderAt: currentTime }));
      await speak("有空的话，可以看看我的饭碗或猫砂。你忙也没关系，我会好好陪着你。");
    }
  }

  async function scheduledTick() {
    try {
      await tick();
    } finally {
      // The host's every() has a ten-minute minimum. once() keeps one owned,
      // cancellable minute slot and never creates an ambient renderer timer.
      if (!stopped) await ctx.schedule.once(TICK_ID, 60_000, scheduledTick);
    }
  }

  return {
    async start() {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const deviceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      state = normalizeState(await ctx.storage.get(STORAGE_KEY), deviceId);
      await mutate((current) => current);
      lastTickAt = now();
      await dailyAlbum(false);
      await refreshCommands();
      unsubscribe.push(ctx.events.on("pet:clicked", () => state.settings.features.chat ? showChat() : undefined));
      unsubscribe.push(ctx.events.on("screen:locked", () => { paused = true; lastTickAt = now(); }));
      unsubscribe.push(ctx.events.on("screen:unlocked", () => { paused = false; lastTickAt = now(); }));
      await ctx.schedule.once(TICK_ID, 60_000, scheduledTick);
      if (!state.onboardingSeen || !state.apiGuideSeen) {
        await openPanel("api");
        await mutate((current) => ({ ...current, onboardingSeen: true, apiGuideSeen: true }));
      }
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      chatGeneration++;
      chatViewGeneration++;
      panelGeneration++;
      weatherGeneration++;
      for (const remove of unsubscribe) remove();
      await ctx.schedule.cancel(TICK_ID);
      if (chatBubble) await chatBubble.dismiss();
      if (panel) await panel.close();
      await commandQueue;
      for (const id of COMMAND_IDS) await ctx.commands.unregister(id);
      for (const id of ["feed", "clean"]) await ctx.assistant.unregisterCapability(id);
      await queue;
    },
    handleMessage,
    chatReply,
    runCare,
    setSettings,
    tick,
    snapshot: () => structuredClone(state),
  };
}

export function register(OpenPetsPlugin) {
  let companion;
  OpenPetsPlugin.register({
    async start(ctx) {
      companion = createCompanion(ctx);
      await companion.start();
    },
    async stop() {
      if (companion) await companion.stop();
    },
  });
}
