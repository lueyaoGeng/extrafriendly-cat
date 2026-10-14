import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCustomSkinsEnabled,
  getFriendlyAppearance,
  initializeFriendlyAppearance,
  isFriendlyBundledSkin,
  saveFriendlyAppearance,
} from "../src/friendly-appearance.js";

// Appearance choices must survive restart, including the import gate.
const profile = mkdtempSync(join(tmpdir(), "friendly-appearance-"));
try {
  initializeFriendlyAppearance(profile);
  saveFriendlyAppearance({ animation: false, customSkins: false });
  initializeFriendlyAppearance(profile);
  assert.deepEqual(getFriendlyAppearance(), { animation: false, customSkins: false });
  assert.throws(() => assertCustomSkinsEnabled());
  assert.equal(isFriendlyBundledSkin("friendly-ink"), true);
  assert.equal(isFriendlyBundledSkin("my-own-cat"), false);
  saveFriendlyAppearance({ animation: true, customSkins: true });
  assert.doesNotThrow(() => assertCustomSkinsEnabled());
  writeFileSync(join(profile, "friendly-appearance.json"), "{damaged");
  let recovered = false;
  initializeFriendlyAppearance(profile, () => { recovered = true; });
  assert.equal(recovered, true);
  assert.deepEqual(getFriendlyAppearance(), { animation: true, customSkins: true });
  assert.ok(readdirSync(profile).some((name) => name.startsWith("friendly-appearance.json.invalid-")));
} finally {
  rmSync(profile, { recursive: true, force: true });
}
console.log("Friendly appearance behavior passed.");
