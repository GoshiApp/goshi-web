// Builds the Goshi mark, the favicon set and the Open Graph images from the SVG below (no external files).
// The mark: a goshi, a round glowing creature with big eyes, a blush and a tail. Colors are the design tokens.
// Run: npm run brand. Needs only `sharp` (devDependency). Text in the OG images uses the system sans font.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const imgDir = join(pub, "img");
const ogDir = join(pub, "og");
mkdirSync(imgDir, { recursive: true });
mkdirSync(ogDir, { recursive: true });

const INK = "#0c1334", NIGHT = "#070b1f", GOLD = "#f2c94c", MINT = "#7be3c3", SKY = "#8ab4ff";
const SRC = join(root, "brand/goshi-logo.jpg");

// The mark is the neon G logo (brand/goshi-logo.jpg). The tile is the central part of the picture, so the ring fills the icon.
// `round` masks rounded corners (favicons, the header); `full` is edge to edge (Apple touch icon); `maskable` keeps a safe margin.
const meta = await sharp(SRC).metadata();
const crop = Math.round(Math.min(meta.width, meta.height) * 0.93);
const left = Math.round((meta.width - crop) / 2);
const top = Math.round((meta.height - crop) / 2);
const square = () => sharp(SRC).extract({ left, top, width: crop, height: crop });
async function tile(size, kind = "round") {
  if (kind === "maskable") {
    const inner = Math.round(size * 0.78);
    const img = await square().resize(inner, inner, { kernel: "lanczos3" }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: INK } })
      .composite([{ input: img, gravity: "center" }]).png({ compressionLevel: 9, palette: true, quality: 85, effort: 10 }).toBuffer();
  }
  const img = await square().resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
  if (kind === "full") return sharp(img).png({ compressionLevel: 9, palette: true, quality: 85, effort: 10 }).toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}"/></svg>`);
  return sharp(img).composite([{ input: mask, blend: "dest-in" }]).png({ compressionLevel: 9, palette: true, quality: 85, effort: 10 }).toBuffer();
}

// favicon.svg wraps the picture (browsers that prefer SVG icons).
const svgPng = (await tile(96, "round")).toString("base64");
writeFileSync(join(pub, "favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><image width="96" height="96" href="data:image/png;base64,${svgPng}"/></svg>\n`);

// favicon.ico: an ICO container holding PNG images (valid for every current browser).
async function ico(sizes) {
  const images = await Promise.all(sizes.map((s) => tile(s, "round")));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dirs = images.map((buf, i) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0);
    d.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(buf.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += buf.length;
    return d;
  });
  return Buffer.concat([head, ...dirs, ...images]);
}

writeFileSync(join(pub, "favicon.ico"), await ico([16, 32, 48]));
for (const [name, size, kind] of [
  ["favicon-32.png", 32, "round"], ["favicon-192.png", 192, "round"], ["favicon-512.png", 512, "round"],
  ["logo-96.png", 96, "round"], ["logo-192.png", 192, "round"], ["logo-384.png", 384, "round"],
  ["apple-touch-icon.png", 180, "full"], ["maskable-512.png", 512, "maskable"],
]) {
  writeFileSync(join(imgDir, name), await tile(size, kind));
}

// Open Graph images, 1200 x 630, one per language.
const og = (title, sub, tag, bigLogo, smallLogo) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><radialGradient id="g" cx="75%" cy="30%" r="80%"><stop offset="0" stop-color="#24307a"/><stop offset="0.5" stop-color="#121a52"/><stop offset="1" stop-color="${NIGHT}"/></radialGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <image x="70" y="70" width="140" height="140" href="data:image/png;base64,${smallLogo}"/>
  <text x="230" y="150" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="800" fill="#ffffff">Goshi</text>
  <text x="70" y="330" font-family="Helvetica, Arial, sans-serif" font-size="54" font-weight="800" fill="#ffffff">${title[0]}</text>
  <text x="70" y="410" font-family="Helvetica, Arial, sans-serif" font-size="54" font-weight="800" fill="${GOLD}">${title[1]}</text>
  <text x="70" y="490" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="#c4cdf0">${sub}</text>
  <text x="70" y="570" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="${MINT}">${tag}</text>
  <image x="880" y="165" width="290" height="290" href="data:image/png;base64,${bigLogo}"/>
</svg>`;
const bigLogo = (await tile(290, "round")).toString("base64");
const smallLogo = (await tile(140, "round")).toString("base64");
const ogs = {
  en: og(["Enter. Play. Win. Leave.", "Skill games on Solana."], "Short matches, open source, test network today.", "Open source · Test network today", bigLogo, smallLogo),
  es: og(["Entra. Juega. Gana. Sal.", "Juegos de habilidad en Solana."], "Partidas cortas, código abierto, red de pruebas hoy.", "Código abierto · Red de pruebas hoy", bigLogo, smallLogo),
};
for (const [lang, svg] of Object.entries(ogs)) {
  writeFileSync(join(ogDir, `og-${lang}.png`), await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer());
}
console.log("Brand assets written to public/ (favicon.svg, favicon.ico, img/, og/).");
