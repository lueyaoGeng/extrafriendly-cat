const bridge = window.openPetsPanel;
const byId = (id) => document.getElementById(id);
const post = (type, details = {}) => bridge.postMessage({ type, ...details });
let snapshot = null;
let appearance = null;
let currentTab = "home";
let weatherLoading = false;
let dismissedQuota = "";
const FEATURE_LABELS = {
  chat: ["聊天陪伴", "点猫猫，打字和它聊聊。"],
  albums: ["每日专辑", "每天一张唱片，附原始评分与试听入口。"],
  jokes: ["小笑话", "需要时来一点轻松的话。"],
  weather: ["天气", "查看所选城市的当前天气和明日预报。"],
  feeding: ["喂食", "关掉后暂停饱腹度，不积累亏欠。"],
  litter: ["铲屎", "关掉后暂停清洁度，不积累亏欠。"],
  sound: ["互动声音", "喂食和铲屎时的轻声音，默认关闭。"],
  reminders: ["轻提醒", "09:30 推荐当天专辑；照料提示至少间隔四小时。"],
  apiReminders: ["额度提醒", "共享免费额度剩余 20% 时提示一次，用完后再提示；可以随时关闭。"],
};

function setTab(tab) {
  if (!["home", "music", "api", "settings"].includes(tab)) return;
  currentTab = tab;
  for (const button of document.querySelectorAll("[data-tab]")) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const section of document.querySelectorAll("[data-page]")) section.hidden = section.dataset.page !== tab;
}

function notice(text) {
  byId("notice").textContent = text;
  byId("notice").hidden = !text;
}

function featureSwitches() {
  const container = byId("feature-toggles");
  for (const [key, [title, description]] of Object.entries(FEATURE_LABELS)) {
    const row = document.createElement("div");
    row.className = "toggle-row";
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = description;
    copy.append(strong, paragraph);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `feature-${key}`;
    input.setAttribute("aria-label", title);
    input.addEventListener("change", () => {
      notice("");
      post("settings", { patch: { features: { [key]: input.checked } } });
    });
    row.append(copy, input);
    container.append(row);
  }
}

function renderAlbum(album, enabled, day) {
  byId("album-day").textContent = `${day} · TODAY'S RECORD`;
  byId("album-card").hidden = !enabled || !album;
  byId("album-disabled").hidden = enabled && Boolean(album);
  if (!album) return;
  byId("album-title").textContent = album.title;
  byId("album-artist").textContent = album.artist;
  byId("album-year").textContent = album.year;
  byId("album-recommendation").textContent = album.recommendation;
  byId("album-track").textContent = `先听这首：${album.entryTrack}`;
  byId("album-score").textContent = `${album.review.score} / ${album.review.scale}`;
  byId("album-source").textContent = `${album.review.source} · 乐评发表于 ${album.review.date} · 核对 ${album.review.checkedAt || "2026-10-13"}`;
  const genres = byId("album-genres");
  genres.replaceChildren();
  for (const genre of album.genres) {
    const tag = document.createElement("span");
    tag.textContent = genre;
    genres.append(tag);
  }
}

function renderApiGuide(guide) {
  if (!guide || byId("api-providers").childElementCount) return;
  for (const provider of guide.providers) {
    const article = document.createElement("article");
    article.className = "api-provider";
    const heading = document.createElement("h3");
    heading.textContent = provider.name;
    const description = document.createElement("p");
    description.textContent = provider.description;
    const steps = document.createElement("ol");
    steps.className = "api-steps";
    for (const step of provider.steps) {
      const item = document.createElement("li");
      item.textContent = step;
      steps.append(item);
    }
    article.append(heading, description, steps);
    for (const [label, value] of [["API 地址 / Base URL", provider.endpoint], ["模型名称", provider.model]]) {
      const field = document.createElement("label");
      field.textContent = label;
      const input = document.createElement("input");
      input.type = "text";
      input.readOnly = true;
      input.value = value;
      input.setAttribute("aria-label", `${provider.name} ${label}`);
      input.addEventListener("click", () => input.select());
      field.append(input);
      article.append(field);
    }
    const links = document.createElement("div");
    links.className = "api-links";
    for (const [target, label] of [["platform", "注册 / 控制台 ↗"], ["docs", "官方接入步骤 ↗"], ["source", "免费规则 ↗"]]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => post("api-guide-link", { providerId: provider.id, target }));
      links.append(button);
    }
    article.append(links);
    byId("api-providers").append(article);
  }
  byId("api-guide-date").textContent = `官方资料核对：${guide.checkedAt}。点击文本框可选中，再按 Ctrl+C / Cmd+C 复制。`;
}

function renderQuota(value) {
  const quota = value.freeQuota;
  const key = quota ? `${quota.resetsAt}:${quota.status}` : "";
  const warning = quota && ["low", "exhausted"].includes(quota.status);
  byId("quota-banner").hidden = !warning || value.settings.provider !== "free" || !value.settings.features.chat
    || !value.settings.features.apiReminders || dismissedQuota === key;
  byId("quota-message").textContent = value.quotaMessage || "";
  const summary = quota && Number.isSafeInteger(quota.deviceRemaining)
    ? `这台设备今天剩余 ${quota.deviceRemaining} 次。额度恢复：${new Date(quota.resetsAt).toLocaleString()}。`
    : value.gatewayReady ? "发送消息后会显示实际额度。" : "共享免费服务尚未上线。可以先接入自己的免费 API。";
  byId("quota-summary").textContent = summary;
}

function render(value) {
  snapshot = value;
  const { settings, care, album } = value;
  byId("cat-name").textContent = `${settings.name} · 我的猫`;
  if (document.activeElement !== byId("name")) byId("name").value = settings.name;
  for (const key of Object.keys(FEATURE_LABELS)) byId(`feature-${key}`).checked = settings.features[key];
  for (const radio of document.querySelectorAll('input[name="provider"]')) radio.checked = radio.value === settings.provider;
  byId("free-state").textContent = value.gatewayReady ? "已配置服务地址" : "待上线";
  byId("personal-state").textContent = value.personalReady ? "已配置" : "尚未配置";
  renderApiGuide(value.apiGuide);
  renderQuota(value);
  byId("chat").disabled = !settings.features.chat;
  byId("chat-status").textContent = !settings.features.chat ? "聊天已暂停。" : settings.provider === "personal"
    ? (value.personalReady ? "当前使用你的个人 API。" : "个人 API 尚未配置，可以在“聊天与 API”里接入。")
    : (value.gatewayReady ? "当前使用统一免费服务。" : "免费聊天待上线。可以在“聊天与 API”里获取自己的免费接口。");
  byId("satiety").value = care.satiety;
  byId("satiety-label").textContent = settings.features.feeding ? `${Math.round(care.satiety)} / 100` : "已暂停";
  byId("feeding-description").textContent = settings.features.feeding ? "吃饭是一点小仪式。" : "饭碗先收好，数值停在这里。";
  byId("feed").disabled = !settings.features.feeding;
  byId("cleanliness").value = care.cleanliness;
  byId("cleanliness-label").textContent = settings.features.litter ? `${Math.round(care.cleanliness)} / 100` : "已暂停";
  byId("litter-description").textContent = settings.features.litter ? "清清爽爽地陪着你。" : "猫砂先收好，数值停在这里。";
  byId("clean").disabled = !settings.features.litter;
  byId("weather-card").hidden = !settings.features.weather;
  byId("joke-card").hidden = !settings.features.jokes;
  byId("weather").disabled = weatherLoading || !value.location;
  byId("weather").textContent = weatherLoading ? "查询中…" : "刷新";
  byId("weather-text").textContent = value.weather?.summary || (value.location ? `${value.location.name}\n点击刷新查看天气。` : "先选一个城市，我再帮你看看。");
  byId("weather-time").textContent = value.weather
    ? `${value.weatherFresh ? "已更新" : "旧数据，请刷新"} · ${new Date(value.weather.fetchedAt).toLocaleString()} · 预报日期 ${value.weather.tomorrowDate || "待确认"}`
    : "";
  if (typeof value.joke === "string") byId("joke-text").textContent = value.joke;
  renderAlbum(album, settings.features.albums, value.day);
  if (Array.isArray(value.cities)) {
    const cities = byId("cities");
    cities.replaceChildren();
    for (const city of value.cities) {
      const button = document.createElement("button");
      button.textContent = city.name;
      button.addEventListener("click", () => post("city-select", { id: city.id }));
      cities.append(button);
    }
  }
  if (value.error !== undefined) notice(value.error);
  if (value.tab) setTab(value.tab);
}

featureSwitches();
for (const button of document.querySelectorAll("[data-tab]")) button.addEventListener("click", () => setTab(button.dataset.tab));
for (const action of ["feed", "clean", "chat", "joke", "weather"]) byId(action).addEventListener("click", () => { notice(""); post(action); });
byId("city-form").addEventListener("submit", (event) => {
  event.preventDefault();
  notice("正在找城市…");
  post("city-search", { query: byId("city-query").value });
});
byId("save-name").addEventListener("click", () => post("settings", { patch: { name: byId("name").value } }));
for (const radio of document.querySelectorAll('input[name="provider"]')) radio.addEventListener("change", () => {
  if (radio.checked) post("settings", { patch: { provider: radio.value } });
});
byId("api-settings").addEventListener("click", () => post("host:open", { route: "assistant" }));
byId("api-later").addEventListener("click", () => setTab("home"));
byId("settings-api").addEventListener("click", () => setTab("api"));
byId("quota-api").addEventListener("click", () => setTab("api"));
byId("quota-later").addEventListener("click", () => {
  const quota = snapshot?.freeQuota;
  dismissedQuota = quota ? `${quota.resetsAt}:${quota.status}` : "";
  byId("quota-banner").hidden = true;
});
byId("skins-settings").addEventListener("click", () => post("host:open", { route: "pets" }));
for (const key of ["animation", "customSkins"]) byId(key).addEventListener("change", () => {
  if (!appearance) return;
  post("host:appearance", { animation: byId("animation").checked, customSkins: byId("customSkins").checked });
});
for (const [button, target] of [["spotify-link", "spotify"], ["netease-link", "netease"], ["review-link", "review"]]) {
  byId(button).addEventListener("click", () => {
    if (snapshot?.album) post("open-link", { albumId: snapshot.album.id, target });
  });
}
bridge.onMessage((message) => {
  if (message?.type === "snapshot") {
    if (typeof message.weatherLoading === "boolean") weatherLoading = message.weatherLoading;
    render(message);
  } else if (message?.type === "host:state") {
    appearance = message;
    for (const key of ["animation", "customSkins"]) {
      byId(key).checked = Boolean(message[key]);
      byId(key).disabled = false;
    }
    byId("skins-settings").textContent = message.customSkins ? "挑选 / 导入猫猫 ↗" : "挑选内置猫猫 ↗";
    post("appearance-state", { animation: Boolean(message.animation) });
  } else if (message?.type === "host:error") {
    notice(message.message || "设置暂时没有保存，请重试。");
    post("host:get");
  }
});
setTab(currentTab);
post("ready");
post("host:get");
