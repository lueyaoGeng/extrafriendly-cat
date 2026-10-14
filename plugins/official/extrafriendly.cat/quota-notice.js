const SCOPES = ["device", "ip", "global", "budget", "burst"];
const STATUSES = ["ok", "low", "exhausted", "busy"];
const LEVELS = { low: 1, exhausted: 2 };

export function normalizeQuota(value) {
  if (!value || typeof value !== "object" || !STATUSES.includes(value.status) || !SCOPES.includes(value.scope)) return null;
  const resetsAt = Date.parse(value.resetsAt);
  if (!Number.isFinite(resetsAt)) return null;
  const quota = { status: value.status, scope: value.scope, resetsAt: new Date(resetsAt).toISOString() };
  for (const key of ["deviceRemaining", "ipRemaining", "globalRemaining", "neuronBudgetRemaining"]) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 1_000_000) quota[key] = value[key];
  }
  return quota;
}

export function liveQuota(value, now) {
  const quota = normalizeQuota(value);
  const reset = quota && Date.parse(quota.resetsAt);
  return quota && reset > now && reset - now <= 86_400_000 ? quota : null;
}

export function quotaMessage(quota) {
  if (quota.status === "busy") return "刚才聊得有点快，等一小会儿再发就好。今天的额度还没有因此用完。";
  const reset = new Date(quota.resetsAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (quota.status === "exhausted") return `这次免费额度不足了，恢复时间 ${reset}。想继续聊，可以接入自己的免费 API；也可以等额度恢复。`;
  const remaining = quota.scope === "device" && Number.isSafeInteger(quota.deviceRemaining)
    ? `你今天的免费聊天还剩 ${quota.deviceRemaining} 次。`
    : "今天可用的共享免费额度快用完了。";
  return `${remaining}可以提前接入自己的免费 API。点“API”看看获取方法，也可以继续使用剩余额度。`;
}

export function nextQuotaNotice(quota, previous, enabled) {
  if (!enabled || !LEVELS[quota?.status]) return null;
  const previousLevel = previous?.resetsAt === quota.resetsAt ? LEVELS[previous.level] || 0 : 0;
  if (LEVELS[quota.status] <= previousLevel) return null;
  return { resetsAt: quota.resetsAt, level: quota.status };
}
