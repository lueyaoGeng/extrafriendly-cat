import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export type FriendlyAppearance = {
  readonly animation: boolean;
  readonly customSkins: boolean;
};

const defaults: FriendlyAppearance = { animation: true, customSkins: true };
let current: FriendlyAppearance = defaults;
let statePath: string | null = null;

/** Only appearance lives here. Cat care and feature settings belong to the plugin. */
export function initializeFriendlyAppearance(userDataPath: string, onRecovery?: () => void): void {
  statePath = join(userDataPath, "friendly-appearance.json");
  current = defaults;
  if (!existsSync(statePath)) return;
  try {
    const value: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    current = normalizeFriendlyAppearance(value);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // Preserve the damaged file for recovery instead of losing it or blocking startup.
    renameSync(statePath, `${statePath}.invalid-${Date.now()}`);
    onRecovery?.();
  }
}

export function normalizeFriendlyAppearance(value: unknown): FriendlyAppearance {
  if (!value || typeof value !== "object") return { ...defaults };
  const record = value as Record<string, unknown>;
  return {
    animation: typeof record.animation === "boolean" ? record.animation : true,
    customSkins: typeof record.customSkins === "boolean" ? record.customSkins : true,
  };
}

export function getFriendlyAppearance(): FriendlyAppearance {
  return { ...current };
}

export function saveFriendlyAppearance(value: FriendlyAppearance): void {
  if (!statePath) throw new Error("Appearance settings are not initialized.");
  const next = normalizeFriendlyAppearance(value);
  mkdirSync(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, statePath);
  current = next;
}

export function assertCustomSkinsEnabled(): void {
  if (!current.customSkins) {
    throw new Error("自定义外观已关闭。请先在猫猫设置中开启，再导入皮肤。");
  }
}

export function isFriendlyBundledSkin(petId: string): boolean {
  return ["builtin", "friendly-cream", "friendly-ink", "friendly-calico"].includes(petId);
}
