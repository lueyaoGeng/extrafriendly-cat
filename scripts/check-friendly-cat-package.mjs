import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Verify the produced package rather than source patterns. Local-key scanning is optional.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = join(root, "apps", "desktop");
const { listPackage, extractFile } = createRequire(join(appDirectory, "package.json"))("@electron/asar");
const resources = join(appDirectory, "dist-electron", "win-unpacked", "resources");
const archive = join(resources, "app.asar");
const sourcePackage = JSON.parse(await readFile(join(appDirectory, "package.json"), "utf8"));
const shippedPackage = JSON.parse(extractFile(archive, "package.json").toString("utf8"));
assert.equal(shippedPackage.version, sourcePackage.version);
const manifest = JSON.parse(await readFile(join(resources, "plugins", "official", "extrafriendly.cat", "openpets.plugin.json"), "utf8"));
assert.equal(manifest.version, sourcePackage.version);
const privatePath = /(^|[\\/])(apikeys|plugin-secrets\.json|openpets-plugin-platform\.json|\.env[^\\/]*)($|[\\/])/i;
assert.equal(listPackage(archive).some((path) => privatePath.test(path)), false, "The app archive must not contain private files.");
let localKey;
if (process.argv.includes("--check-local-key")) {
  const directory = join(root, "apikeys");
  const names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".txt"));
  if (names.length !== 1) throw new Error("Expected one API key text file in apikeys.");
  localKey = Buffer.from((await readFile(join(directory, names[0]), "utf8")).trim().replace(/^\uFEFF/, ""));
  if (localKey.length < 20) throw new Error("API key text file must contain just the key.");
}
let filesChecked = 0;
const directories = [resources];
while (directories.length) {
  const directory = directories.pop();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.equal(privatePath.test(path), false, "Published resources must not contain private files.");
    if (entry.isDirectory()) directories.push(path);
    else if (entry.isFile()) {
      filesChecked++;
      if (localKey) assert.equal((await readFile(path)).includes(localKey), false, "Published resources must not contain the local API key.");
    }
  }
}
const installerName = `ExtrafriendlyCat-${sourcePackage.version}-win-x64-setup.exe`;
const installer = join(appDirectory, "dist-electron", installerName);
const result = {
  checkedAt: new Date().toISOString(), version: shippedPackage.version, filesChecked,
  privatePathsExcluded: true, localKeyChecked: Boolean(localKey),
  installer: installerName, installerBytes: (await stat(installer)).size,
  sha256: createHash("sha256").update(await readFile(installer)).digest("hex"),
};
await mkdir(join(root, "artifacts"), { recursive: true });
await writeFile(join(root, "artifacts", "package-verification.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
