/** Original geometric artwork; no external character/image assets are used. */
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireDesktop = createRequire(resolve(root, "apps/desktop/package.json"));
const sharp = requireDesktop("sharp");
const assetRoot = resolve(root, "apps/desktop/assets");
const frameWidth = 192;
const frameHeight = 208;
const coats = [
  { id: "friendly-cream", name: "奶油猫", fur: "#edc28e", face: "#f4d9b5", belly: "#fff0d5", line: "#5a4639", eye: "#45392f", pink: "#e59d99" },
  { id: "friendly-ink", name: "墨墨猫", fur: "#565b67", face: "#626876", belly: "#dadbcf", line: "#303742", eye: "#f2efce", pink: "#d59ca6" },
  { id: "friendly-calico", name: "花花猫", fur: "#fff0d7", face: "#fff0d7", belly: "#fff9e9", line: "#55463d", eye: "#483e34", pink: "#e9a49b" },
];

function pose(row, column) {
  const cycle = Math.sin(column * Math.PI / 3);
  const result = { lift: 0, lean: 0, breath: 1, tail: cycle * 6, leftPaw: 0, rightPaw: 0, rightPawX: 126, lookX: 0, lookY: 0, blink: false };
  if (row === 0) {
    result.breath = column < 6 ? 1 + cycle * 0.012 : 1;
    result.blink = column === 3;
  } else if (row === 1 || row === 2) {
    result.lift = Math.abs(Math.sin(column * Math.PI / 4)) * 5;
    result.leftPaw = Math.sin(column * Math.PI / 4) * 9;
    result.rightPaw = -result.leftPaw;
    result.lean = row === 1 ? 3 : -3;
    result.lookX = row === 1 ? 2 : -2;
  } else if (row === 3) {
    result.rightPaw = -27 - Math.sin(column * Math.PI / 2) * 7;
    result.rightPawX = 154;
    result.lean = -3;
  } else if (row === 4) {
    result.lift = [0, 12, 24, 12, 0, 0, 0, 0][column];
    result.leftPaw = -result.lift / 3;
    result.rightPaw = -result.lift / 3;
  } else if (row === 5) {
    result.lean = Math.sin(column * Math.PI / 4) * 5;
    result.blink = column === 3 || column === 4;
  } else if (row === 6) {
    result.blink = column === 2;
    result.lookY = 1;
  } else if (row === 7) {
    result.leftPaw = cycle * 6;
    result.rightPaw = -cycle * 6;
  } else if (row === 8) {
    result.lean = cycle * 3;
    result.lookY = -2;
  } else {
    const angle = ((row - 9) * 8 + column) * Math.PI / 8;
    result.lookX = Math.sin(angle) * 2.5;
    result.lookY = -Math.cos(angle) * 2.5;
    result.tail = 0;
  }
  return result;
}

function catDrawing(coat, state, clipId) {
  const { fur, face, belly, line, eye, pink } = coat;
  const calico = coat.id === "friendly-calico";
  const eyes = state.blink
    ? '<path d="M71 110 Q77 115 83 110 M109 110 Q115 115 121 110" fill="none" stroke-width="3.5"/>'
    : `<ellipse cx="${77 + state.lookX}" cy="${110 + state.lookY}" rx="3.7" ry="5.4" fill="${eye}" stroke="none"/><ellipse cx="${115 + state.lookX}" cy="${110 + state.lookY}" rx="3.7" ry="5.4" fill="${eye}" stroke="none"/>`;
  const patches = calico
    ? `<g clip-path="url(#${clipId})" stroke="none"><path d="M43 42 L91 46 Q92 94 74 109 L43 117Z" fill="#d79861"/><path d="M116 42 L148 48 L149 108 Q112 97 116 42Z" fill="#667079"/></g>`
    : "";
  return `<g transform="translate(0 ${-state.lift})" stroke="${line}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M128 157 C172 ${153 + state.tail} 159 ${119 + state.tail} 148 ${131 + state.tail}" fill="none" stroke="${line}" stroke-width="18"/>
    <path d="M128 157 C172 ${153 + state.tail} 159 ${119 + state.tail} 148 ${131 + state.tail}" fill="none" stroke="${fur}" stroke-width="10"/>
    <g transform="translate(96 183) scale(1 ${state.breath}) translate(-96 -183)">
      <path d="M61 131 Q52 161 64 180 Q96 197 129 180 Q141 159 129 130Z" fill="${fur}"/>
      <ellipse cx="96" cy="163" rx="22" ry="21" fill="${belly}" stroke="none"/>
      <path d="M66 183 Q65 173 81 174 L89 183 Q78 192 66 183Z" fill="${fur}"/>
      <path d="M103 183 Q107 172 122 175 L128 183 Q118 192 103 183Z" fill="${fur}"/>
      <ellipse cx="67" cy="${152 + state.leftPaw}" rx="10" ry="16" fill="${fur}" transform="rotate(-12 67 ${152 + state.leftPaw})"/>
      <ellipse cx="${state.rightPawX}" cy="${152 + state.rightPaw}" rx="10" ry="16" fill="${fur}" transform="rotate(18 ${state.rightPawX} ${152 + state.rightPaw})"/>
    </g>
    <g transform="rotate(${state.lean} 96 115)">
      <defs><clipPath id="${clipId}"><path d="M47 91 L48 57 Q49 49 58 56 L79 73 Q96 68 113 73 L135 55 Q143 49 144 59 L145 92 Q155 133 125 141 Q95 153 64 141 Q36 132 47 91Z"/></clipPath></defs>
      <path d="M47 91 L48 57 Q49 49 58 56 L79 73 Q96 68 113 73 L135 55 Q143 49 144 59 L145 92 Q155 133 125 141 Q95 153 64 141 Q36 132 47 91Z" fill="${face}"/>
      ${patches}
      <path d="M54 63 L55 83 L69 75Z M137 63 L135 83 L122 75Z" fill="${pink}" stroke="none"/>
      <ellipse cx="62" cy="123" rx="8" ry="4" fill="${pink}" opacity="0.5" stroke="none"/>
      <ellipse cx="130" cy="123" rx="8" ry="4" fill="${pink}" opacity="0.5" stroke="none"/>
      ${eyes}
      <path d="M92 119 Q96 115 100 119 L96 123Z" fill="${pink}" stroke-width="2.2"/>
      <path d="M96 124 Q92 130 87 126 M96 124 Q100 130 105 126" fill="none" stroke-width="2.5"/>
      <path d="M49 113 L34 109 M48 121 L34 122 M143 113 L157 109 M144 121 L158 122" fill="none" stroke-width="2.4"/>
    </g>
  </g>`;
}

function svg(body, width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

async function generateCoat(coat) {
  const destination = resolve(assetRoot, "friendly-cats", coat.id);
  await mkdir(destination, { recursive: true });
  const cells = [];
  for (let row = 0; row < 11; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      cells.push(`<g transform="translate(${column * frameWidth} ${row * frameHeight})">${catDrawing(coat, pose(row, column), `face-${row}-${column}`)}</g>`);
    }
  }
  const atlas = await sharp(Buffer.from(svg(cells.join(""), frameWidth * 8, frameHeight * 11))).webp({ lossless: true }).toBuffer();
  const metadata = await sharp(atlas).metadata();
  if (metadata.width !== 1536 || metadata.height !== 2288 || !metadata.hasAlpha || metadata.format !== "webp") {
    throw new Error(`Invalid native V2 atlas for ${coat.id}`);
  }
  await writeFile(resolve(destination, "spritesheet.webp"), atlas);
  await writeFile(resolve(destination, "pet.json"), `${JSON.stringify({
    id: coat.id,
    displayName: coat.name,
    description: "一只愿意陪你过日子的猫。原创几何外观，支持呼吸、眨眼、挥爪和跟随视线。",
    spritesheetPath: "spritesheet.webp",
    spriteVersionNumber: 2,
    gazeAnchor: { x: 0.5, y: 0.52 },
  }, null, 2)}\n`);
  const thumbnail = await sharp(Buffer.from(svg(catDrawing(coat, pose(0, 6), "thumbnail-face"), frameWidth, frameHeight))).png().toBuffer();
  await writeFile(resolve(destination, "thumbnail.png"), thumbnail);
  console.log(`${coat.id}: ${metadata.width}x${metadata.height}, ${atlas.length} bytes, transparent WebP`);
}

function icnsChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32BE(data.length + header.length, 4);
  return Buffer.concat([header, data]);
}

async function generateIcons() {
  const iconDrawing = svg(`<rect x="8" y="8" width="496" height="496" rx="114" fill="#f3eadb"/><g transform="translate(0 -16) scale(2.6666667)">${catDrawing(coats[0], pose(0, 6), "icon-face")}</g>`, 512, 512);
  const image = sharp(Buffer.from(iconDrawing));
  const png512 = await image.clone().png().toBuffer();
  const png256 = await image.clone().resize(256, 256).png().toBuffer();
  const png1024 = await image.clone().resize(1024, 1024).png().toBuffer();
  await writeFile(resolve(assetRoot, "friendly-cat-icon.png"), png512);
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);
  icoHeader.writeUInt16LE(1, 10);
  icoHeader.writeUInt16LE(32, 12);
  icoHeader.writeUInt32LE(png256.length, 14);
  icoHeader.writeUInt32LE(22, 18);
  await writeFile(resolve(assetRoot, "friendly-cat-icon.ico"), Buffer.concat([icoHeader, png256]));
  const chunks = Buffer.concat([icnsChunk("ic09", png512), icnsChunk("ic10", png1024)]);
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write("icns", 0, 4, "ascii");
  icnsHeader.writeUInt32BE(chunks.length + 8, 4);
  await writeFile(resolve(assetRoot, "friendly-cat-icon.icns"), Buffer.concat([icnsHeader, chunks]));
}

for (const coat of coats) await generateCoat(coat);
await copyFile(resolve(assetRoot, "friendly-cats/friendly-cream/spritesheet.webp"), resolve(assetRoot, "default-pet-spritesheet.webp"));
await copyFile(resolve(assetRoot, "friendly-cats/friendly-cream/thumbnail.png"), resolve(assetRoot, "default-pet-thumbnail.png"));
await generateIcons();
