import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Publication hygiene: inspect the Git file set without printing file contents or keys.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entries = execFileSync("git", ["ls-files", "--stage", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0").filter(Boolean).map((entry) => ({ mode: entry.slice(0, 6), path: entry.slice(entry.indexOf("\t") + 1) }));
const privatePath = /(^|\/)(apikeys|artifacts|node_modules|plugin-secrets\.json|openpets-plugin-platform\.json|\.env[^/]*)(\/|$)|\.sqlite(?:-|$)/i;
const embeddedCredentialPatterns = [
  /GOCSPX-[A-Za-z0-9_-]{10,}/,
  /\d{8,}[A-Za-z0-9_-]*\.apps\.googleusercontent\.com/,
  /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{30,}/,
];
let key;
if (process.argv.includes("--check-local-key")) {
  const directory = join(root, "apikeys");
  const names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".txt"));
  if (names.length !== 1) throw new Error("Expected one API key text file in apikeys.");
  key = Buffer.from((await readFile(join(directory, names[0]), "utf8")).trim().replace(/^\uFEFF/, ""));
  if (key.length < 20) throw new Error("API key text file must contain just the key.");
}
for (const entry of entries) {
  if (privatePath.test(entry.path)) throw new Error(`A private file is tracked: ${entry.path}`);
  // A gitlink publishes only a commit ID, not the submodule's local files.
  if (entry.mode !== "160000") {
    const path = join(root, entry.path);
    const content = (await lstat(path)).isSymbolicLink() ? Buffer.from(await readlink(path)) : await readFile(path);
    if (key && content.includes(key)) throw new Error(`The local API key is present in a tracked file: ${entry.path}`);
    const text = content.toString("utf8");
    if (embeddedCredentialPatterns.some((pattern) => pattern.test(text))) {
      throw new Error(`An embedded credential pattern is present in a tracked file: ${entry.path}`);
    }
  }
}
console.log(JSON.stringify({ ok: true, trackedEntriesChecked: entries.length, localKeyChecked: Boolean(key) }));
