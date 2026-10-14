// Shipping contracts: every recommendation can be cited/opened, and every
// bundled skin is a decodable native V2 package with all animation cells.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALBUMS } from "../plugins/official/extrafriendly.cat/albums.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireDesktop = createRequire(resolve(root, "apps/desktop/package.json"));
const sharp = requireDesktop("sharp");

assert.equal(ALBUMS.length, 20, "The approved MVP ships twenty seed albums");
assert.equal(new Set(ALBUMS.map((item) => item.id)).size, ALBUMS.length, "Album IDs must be unique for persistent selection");
for (const item of ALBUMS) {
  assert.ok(item.title.trim() && item.artist.trim() && item.entryTrack.trim());
  assert.ok(item.genres.length > 0 && item.recommendation.trim());
  assert.ok(Number.isInteger(item.year) && item.year >= 1900 && item.year <= 2026);
  assert.ok(Number.isFinite(item.review.score) && item.review.score > 0 && item.review.score <= item.review.scale);
  assert.equal(item.review.kind, "critic");
  assert.ok(Number.isFinite(Date.parse(item.review.date)) && Number.isFinite(Date.parse(item.review.checkedAt)));
  assert.ok(Date.parse(item.review.date) <= Date.parse(item.review.checkedAt));
  assert.equal(new URL(item.review.url).hostname, "pitchfork.com");
  for (const url of [item.review.url, item.spotifyUrl, item.neteaseUrl]) {
    assert.equal(new URL(url).protocol, "https:");
  }
  assert.equal(item.platformLinkKind, "search");
}

for (const id of ["friendly-cream", "friendly-ink", "friendly-calico"]) {
  const directory = resolve(root, "apps/desktop/assets/friendly-cats", id);
  const manifest = JSON.parse(await readFile(resolve(directory, "pet.json"), "utf8"));
  assert.equal(manifest.id, id);
  assert.equal(manifest.spriteVersionNumber, 2);
  assert.equal(manifest.spritesheetPath, "spritesheet.webp");
  const atlas = await readFile(resolve(directory, manifest.spritesheetPath));
  const metadata = await sharp(atlas).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1536);
  assert.equal(metadata.height, 2288);
  assert.equal(metadata.pages ?? 1, 1);
  assert.ok(metadata.hasAlpha);
  const { data, info } = await sharp(atlas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  for (let row = 0; row < 11; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      let opaquePixels = 0;
      for (let y = 0; y < 208; y += 1) {
        for (let x = 0; x < 192; x += 1) {
          const offset = (((row * 208 + y) * info.width) + column * 192 + x) * 4 + 3;
          if (data[offset] > 0) opaquePixels += 1;
        }
      }
      assert.ok(opaquePixels > 0, `${id} must render in animation cell ${row},${column}`);
      const corner = ((row * 208 * info.width) + column * 192) * 4 + 3;
      assert.equal(data[corner], 0, "Transparent frame corners support desktop click-through");
    }
  }
}

console.log("Friendly Cat content verified: 20 cited albums; three complete, transparent native V2 skins.");
