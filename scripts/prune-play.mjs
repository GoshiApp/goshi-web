// Runs after `astro build`. While the on-chain games are switched off (site.play.enabled is false),
// the bundler still writes the wallet and Anchor chunks of the play page into dist/_astro, even though no page
// loads them. This removes every file in dist/_astro that nothing references, and the play stylesheet, so the
// deployed site carries no wallet code at all until the feature is turned on. It never touches referenced files.
import { readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const site = readFileSync(join(root, "src/site.ts"), "utf8");
const playBlock = site.slice(site.indexOf("const play: PlayConfig"), site.indexOf("export const site"));
const enabled = process.env.PUBLIC_PLAY_LOCAL === "1" || /\benabled:\s*true\b/.test(playBlock);

if (enabled) {
  console.log("prune-play: the games are enabled, nothing to prune.");
  process.exit(0);
}
if (!existsSync(dist)) {
  console.error("prune-play: dist/ does not exist, run astro build first.");
  process.exit(1);
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const all = walk(dist);
const html = all.filter((f) => f.endsWith(".html"));
const assets = all.filter((f) => f.startsWith(join(dist, "_astro")) && /\.(js|css)$/.test(f));
const base = (f) => f.split("/").pop();

// Reachability: a chunk is kept when an HTML page names it, or a kept chunk names it (imports, css, dynamic imports).
const keep = new Set();
const queue = [];
const pagesText = html.map((f) => readFileSync(f, "utf8")).join("\n");
for (const a of assets) if (pagesText.includes(base(a))) { keep.add(a); queue.push(a); }
while (queue.length) {
  const text = readFileSync(queue.pop(), "utf8");
  for (const a of assets) if (!keep.has(a) && text.includes(base(a))) { keep.add(a); queue.push(a); }
}

let removed = 0;
for (const a of assets) if (!keep.has(a)) { rmSync(a); removed++; console.log(`prune-play: removed ${a.slice(dist.length + 1)}`); }
const css = join(dist, "css/play.css");
if (existsSync(css)) { rmSync(css); removed++; console.log("prune-play: removed css/play.css"); }
try { if (existsSync(join(dist, "css")) && readdirSync(join(dist, "css")).length === 0) rmSync(join(dist, "css"), { recursive: true }); } catch {}
console.log(`prune-play: games are off, ${removed} unused file(s) removed.`);
