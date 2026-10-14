// The production Durable Object and the local SQLite mock use this same owner.
// Every reservation commits global, device, IP, and burst counters atomically.
export class QuotaStore {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS quota_counters (
        bucket TEXT PRIMARY KEY,
        used INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
  }

  reserve({ now, deviceKey, ipKey, neurons, limits }) {
    const day = new Date(now).toISOString().slice(0, 10);
    const dailyReset = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
    const minute = Math.floor(now / 60_000);
    const minuteReset = (minute + 1) * 60_000;
    const counters = [
      { key: `day:${day}:global`, amount: 1, limit: limits.globalDaily, reset: dailyReset, scope: "global" },
      { key: `day:${day}:neurons`, amount: neurons, limit: limits.globalNeuronsDaily, reset: dailyReset, scope: "budget" },
      { key: `day:${day}:device:${deviceKey}`, amount: 1, limit: limits.deviceDaily, reset: dailyReset, scope: "device" },
      { key: `day:${day}:ip:${ipKey}`, amount: 1, limit: limits.ipDaily, reset: dailyReset, scope: "ip" },
      { key: `minute:${minute}:device:${deviceKey}`, amount: 1, limit: limits.deviceMinute, reset: minuteReset, scope: "burst" },
    ];

    return this.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM quota_counters WHERE expires_at <= ?", now);
      for (const counter of counters) {
        const row = this.sql.exec("SELECT used FROM quota_counters WHERE bucket = ?", counter.key).toArray()[0];
        counter.used = row?.used ?? 0;
      }
      const details = (scope, status, consumed = false) => {
        const remaining = (name) => {
          const counter = counters.find((item) => item.scope === name);
          return Math.max(0, counter.limit - counter.used - (consumed ? counter.amount : 0));
        };
        return {
          status,
          scope,
          deviceRemaining: remaining("device"),
          ipRemaining: remaining("ip"),
          globalRemaining: remaining("global"),
          neuronBudgetRemaining: remaining("budget"),
          resetsAt: new Date(scope === "burst" ? minuteReset : dailyReset).toISOString(),
        };
      };
      for (const counter of counters) {
        if (counter.used + counter.amount > counter.limit) {
          return {
            allowed: false,
            ...details(counter.scope, counter.scope === "burst" ? "busy" : "exhausted"),
            retryAfter: Math.max(1, Math.ceil((counter.reset - now) / 1_000)),
          };
        }
      }
      for (const counter of counters) {
        this.sql.exec(
          "INSERT INTO quota_counters (bucket, used, expires_at) VALUES (?, ?, ?) ON CONFLICT(bucket) DO UPDATE SET used = excluded.used",
          counter.key,
          counter.used + counter.amount,
          counter.reset,
        );
      }
      const tightest = counters.filter((counter) => counter.scope !== "burst")
        .sort((a, b) => (a.limit - a.used - a.amount) / a.limit - (b.limit - b.used - b.amount) / b.limit)[0];
      const remainingRatio = (tightest.limit - tightest.used - tightest.amount) / tightest.limit;
      return {
        allowed: true,
        ...details(tightest.scope, remainingRatio === 0 ? "exhausted" : remainingRatio <= 0.2 ? "low" : "ok", true),
      };
    });
  }
}
