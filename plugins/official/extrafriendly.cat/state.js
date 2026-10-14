import { normalizeQuota } from "./quota-notice.js";

export const STORAGE_KEY = "companion.v1";
export const FEATURE_KEYS = ["chat", "albums", "jokes", "weather", "feeding", "litter", "sound", "reminders", "apiReminders"];

const DEFAULT_FEATURES = {
  chat: true,
  albums: true,
  jokes: true,
  weather: true,
  feeding: true,
  litter: true,
  sound: false,
  reminders: false,
  apiReminders: true,
};

function percent(value, fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : fallback;
}

export function normalizeState(value, deviceId) {
  const raw = value && typeof value === "object" ? value : {};
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const features = settings.features && typeof settings.features === "object" ? settings.features : {};
  const normalizedFeatures = {};
  for (const key of FEATURE_KEYS) {
    normalizedFeatures[key] = typeof features[key] === "boolean" ? features[key] : DEFAULT_FEATURES[key];
  }
  const albumHistory = Array.isArray(raw.albumHistory)
    ? raw.albumHistory.filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.day) && typeof item.id === "string").slice(-30)
    : [];
  return {
    version: 1,
    deviceId: typeof raw.deviceId === "string" && /^[0-9a-f-]{36}$/i.test(raw.deviceId) ? raw.deviceId : deviceId,
    settings: {
      name: typeof settings.name === "string" ? settings.name.trim().slice(0, 24) || "小猫" : "小猫",
      provider: settings.provider === "personal" ? "personal" : "free",
      features: normalizedFeatures,
    },
    care: {
      satiety: percent(raw.care?.satiety, 80),
      cleanliness: percent(raw.care?.cleanliness, 90),
    },
    location: isLocation(raw.location) ? raw.location : null,
    weather: isWeather(raw.weather) ? raw.weather : null,
    albumHistory,
    lastReminderDay: typeof raw.lastReminderDay === "string" ? raw.lastReminderDay : "",
    lastCareReminderAt: typeof raw.lastCareReminderAt === "number" ? raw.lastCareReminderAt : 0,
    onboardingSeen: raw.onboardingSeen === true,
    apiGuideSeen: raw.apiGuideSeen === true,
    freeQuota: normalizeQuota(raw.freeQuota),
    lastApiNotice: ["low", "exhausted"].includes(raw.lastApiNotice?.level) && Number.isFinite(Date.parse(raw.lastApiNotice?.resetsAt))
      ? { level: raw.lastApiNotice.level, resetsAt: raw.lastApiNotice.resetsAt }
      : null,
  };
}

export function isLocation(value) {
  return value && typeof value === "object"
    && typeof value.name === "string" && value.name.length <= 160
    && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}

export function isWeather(value) {
  return value && typeof value === "object"
    && Number.isFinite(value.fetchedAt)
    && typeof value.summary === "string" && value.summary.length <= 1500;
}

export function patchSettings(state, patch) {
  if (!patch || typeof patch !== "object") return state;
  const settings = { ...state.settings, features: { ...state.settings.features } };
  if (typeof patch.name === "string") settings.name = patch.name.trim().slice(0, 24) || "小猫";
  if (patch.provider === "free" || patch.provider === "personal") settings.provider = patch.provider;
  if (patch.features && typeof patch.features === "object") {
    for (const key of FEATURE_KEYS) {
      if (typeof patch.features[key] === "boolean") settings.features[key] = patch.features[key];
    }
  }
  return { ...state, settings };
}

/** Only a continuously observed foreground timer interval counts. Sleep/restart never catches up. */
export function advanceCare(state, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > 90_000) return state;
  const hours = elapsedMs / 3_600_000;
  return {
    ...state,
    care: {
      satiety: state.settings.features.feeding ? Math.max(0, state.care.satiety - hours * 4) : state.care.satiety,
      cleanliness: state.settings.features.litter ? Math.max(0, state.care.cleanliness - hours * 3) : state.care.cleanliness,
    },
  };
}

export function careAction(state, action) {
  const key = action === "feed" ? "feeding" : action === "clean" ? "litter" : null;
  if (!key || !state.settings.features[key]) return { state, applied: false };
  const care = action === "feed"
    ? { ...state.care, satiety: Math.min(100, state.care.satiety + 25) }
    : { ...state.care, cleanliness: 100 };
  return { state: { ...state, care }, applied: true };
}

export function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hash(text) {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Pick once per local day and retain the selection; don't repeat the previous selection. */
export function selectDailyAlbum(state, albums, day) {
  if (!state.settings.features.albums || albums.length === 0) return { state, album: null };
  const saved = state.albumHistory.find((entry) => entry.day === day);
  const existing = saved && albums.find((album) => album.id === saved.id);
  if (existing) return { state, album: existing };
  const previous = state.albumHistory.at(-1)?.id;
  const candidates = albums.length > 1 ? albums.filter((album) => album.id !== previous) : albums;
  const album = candidates[hash(`${state.deviceId}:${day}`) % candidates.length];
  return {
    state: { ...state, albumHistory: [...state.albumHistory.filter((entry) => entry.day !== day), { day, id: album.id }].slice(-30) },
    album,
  };
}

export function weatherIsFresh(weather, now = Date.now()) {
  return isWeather(weather) && now >= weather.fetchedAt && now - weather.fetchedAt <= 3_600_000;
}
