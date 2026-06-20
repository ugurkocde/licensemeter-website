/**
 * Generates src/app/favicon.ico (16+32 PNG-in-ICO) and src/app/apple-icon.png
 * (180x180) from src/app/icon.svg. Run after changing the brand mark:
 *
 *   node scripts/make-icons.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = await readFile(path.join(root, "src/app/icon.svg"));

/* ICO container with PNG-encoded entries (supported by all current browsers). */
const icoFromPngs = (pngs) => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0); // width
    e.writeUInt8(size === 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette colors
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
};

const pngAt = (size) => sharp(svg).resize(size, size).png().toBuffer();

const [png16, png32] = await Promise.all([pngAt(16), pngAt(32)]);
await writeFile(
  path.join(root, "src/app/favicon.ico"),
  icoFromPngs([
    { size: 16, data: png16 },
    { size: 32, data: png32 },
  ]),
);

/* Apple touch icon: opaque canvas tile, mark at ~78% so iOS corner rounding
 * does not clip the strike. */
const appleMark = await sharp(svg).resize(140, 140).png().toBuffer();
await sharp({
  create: { width: 180, height: 180, channels: 4, background: "#fbfcfc" },
})
  .composite([{ input: appleMark, left: 20, top: 20 }])
  .png()
  .toFile(path.join(root, "src/app/apple-icon.png"));

/* Email-header mark: transparent background (emails render on white and on
 * the paper card), 96px for crisp display at 28-32 CSS px. Served from
 * public/, safe alongside the app-dir icon routes; only a public
 * favicon.ico would conflict. */
const transparentMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="#0c1a17"><rect x="6" y="6.5" width="4.5" height="19"/><rect x="13.75" y="6.5" width="4.5" height="19"/><rect x="21.5" y="6.5" width="4.5" height="19"/></g><line x1="3.5" y1="22.5" x2="28.5" y2="9.5" stroke="#f59e0b" stroke-width="4.5"/></svg>`;
await sharp(Buffer.from(transparentMark))
  .resize(96, 96)
  .png()
  .toFile(path.join(root, "public/brand-mark.png"));

console.log(
  "wrote src/app/favicon.ico, src/app/apple-icon.png and public/brand-mark.png",
);
