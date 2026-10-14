function responseJson(response) {
  if (!response.ok) throw new Error("天气服务暂时没有回应，请稍后再试。");
  return response.json ?? JSON.parse(response.text);
}

export async function searchCities(ctx, query) {
  const name = typeof query === "string" ? query.trim().slice(0, 80) : "";
  if (name.length < 2) throw new Error("请输入至少两个字的城市名，也可以用英文或拼音。");
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=zh&format=json`;
  const result = responseJson(await ctx.net.fetch(url, { timeoutMs: 12_000 }));
  const cities = Array.isArray(result?.results) ? result.results : [];
  return cities.filter((city) => Number.isFinite(city.latitude) && Number.isFinite(city.longitude)).slice(0, 6).map((city) => ({
    id: String(city.id),
    name: [city.name, city.admin1, city.country].filter(Boolean).join(" · "),
    latitude: city.latitude,
    longitude: city.longitude,
  }));
}

export function weatherDescription(code) {
  if (code === 0) return "晴";
  if (code >= 1 && code <= 3) return "多云";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "有雨";
  if (code >= 71 && code <= 77) return "有雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code === 85 || code === 86) return "阵雪";
  if (code >= 95) return "雷雨";
  return "天气状况待确认";
}

export async function fetchWeather(ctx, location, now = Date.now()) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=2`;
  const data = responseJson(await ctx.net.fetch(url, { timeoutMs: 12_000 }));
  if (!Number.isFinite(data?.current?.temperature_2m) || !Array.isArray(data?.daily?.time) || data.daily.time.length < 2) {
    throw new Error("天气数据不完整，我暂时不乱猜。");
  }
  const { daily, current } = data;
  const tomorrowLow = daily.temperature_2m_min?.[1];
  const tomorrowHigh = daily.temperature_2m_max?.[1];
  const tomorrowRain = daily.precipitation_probability_max?.[1];
  if (![tomorrowLow, tomorrowHigh, tomorrowRain, daily.weather_code?.[1]].every(Number.isFinite)) {
    throw new Error("明天的预报还不完整，请稍后再看。");
  }
  const summary = `${location.name}\n现在 ${weatherDescription(current.weather_code)}，${Math.round(current.temperature_2m)}°C。\n明天 ${weatherDescription(daily.weather_code[1])}，${Math.round(tomorrowLow)}–${Math.round(tomorrowHigh)}°C，降水概率 ${tomorrowRain}%。`;
  return { fetchedAt: now, observedAt: current.time, tomorrowDate: daily.time[1], summary, source: "Open-Meteo" };
}
