// Quality gates for dist/. Fails (exit 1) when:
//  - the old brand name, or any word of the previous product (see `oldProduct`), appears in the output
//  - a page lacks a title, description, canonical or hreflang (404 is exempt from the last two)
//  - an internal link, asset or #anchor is broken
//  - an http:// (not https) asset URL is present
// On-chain games (site.play): while they are off, dist/ must hold no wallet code and no play stylesheet; while
// they are on, the play page must carry the test banner (non-mainnet), be noindex (non-mainnet), not be in the
// "broken" state, and the RPC origin must be allowed in the page's CSP in public/.htaccess and firebase.json.
// Also checks: one h1 per page, lang attribute, img alt, noindex consistency with src/site.ts,
// no inline scripts (the CSP forbids them), the sitemap, the manifest icons, no em dashes.
// Run: npm run gates (after a build). `npm run build` runs it automatically.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const ORIGIN = process.env.PUBLIC_TARGET === "test" ? "https://test.goshi.app" : "https://goshi.app";
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

if (!existsSync(dist)) {
  console.error("dist/ does not exist: run `npm run build:only` first.");
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dist);
const rel = (p) => relative(dist, p);
const TEXT = new Set([".html", ".css", ".js", ".json", ".xml", ".txt", ".webmanifest", ".svg", ".htaccess", ""]);
const textFiles = files.filter((f) => TEXT.has(extname(f)) || f.endsWith(".htaccess"));
const htmlFiles = files.filter((f) => f.endsWith(".html"));

// 1. Banned strings, in every text file.
const banned = [/fasting\s*nation/i, /fastingnation/i, /fastnat/i];
const emDash = /\u2014/;
// Goshi is a Web3 games site. Words that belong to the previous product must not appear in any page, feed or asset text.
const oldProduct = [
  /goshi\s*health/i, /app\s*store/i, /testflight/i, /\biphone\b/i, /\bios\b/i, /\bhealth/i, /fasting|nutrition|calorie|\bdiet\b/i, /care\s*team/i, /\bavatar/i,
  /\bapp\b/i, /aplicaci[o\u00f3]n/i, /\bsalud\b/i, /ayuno/i, /nutrici[o\u00f3]n/i, /calor[i\u00ed]as/i, /\bavatares?\b/i,
];
for (const f of textFiles) {
  const text = readFileSync(f, "utf8");
  for (const re of banned) if (re.test(text)) fail(rel(f), `contains banned text ${re}`);
  // The domain goshi.app and the Cloud Run host names (*.run.app) are the only places the word "app" appears.
  if (extname(f) !== ".js") for (const re of oldProduct) if (re.test(text.replace(/(goshi|phantom)\\?\.app/gi, "").replace(/[a-z0-9-]+\.run\.app/gi, ""))) fail(rel(f), `mentions the previous product: ${re}`);
  if (emDash.test(text)) fail(rel(f), "contains an em dash");
}

// Where does a URL path point inside dist?
function resolveLocal(urlPath) {
  const clean = decodeURIComponent(urlPath.split("#")[0].split("?")[0]);
  const p = join(dist, clean);
  if (clean.endsWith("/")) return join(p, "index.html");
  if (extname(clean)) return p;
  return join(p, "index.html");
}
const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const html = readFileSync(file, "utf8");
    idCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(file);
}

const siteSrc = readFileSync(join(root, "src/site.ts"), "utf8");
const indexable = /indexable:\s*true/.test(siteSrc);
// The play settings block, read as text (this script does not import TypeScript).
const isTestTarget = process.env.PUBLIC_TARGET === "test";
const playSrc = isTestTarget
  ? siteSrc.slice(siteSrc.indexOf("const playTest: PlayConfig"), siteSrc.indexOf("const isTest"))
  : siteSrc.slice(siteSrc.indexOf("const playMain: PlayConfig"), siteSrc.indexOf("const playTest: PlayConfig"));
const playLocal = process.env.PUBLIC_PLAY_LOCAL === "1"; // local test build: values come from the generated file
const playOn = playLocal || /\benabled:\s*true\b/.test(playSrc);
const playCluster = playSrc.match(/\bcluster:\s*"([a-z-]+)"/)?.[1] ?? "devnet";
const playAudited = /\baudited:\s*true\b/.test(playSrc);
const playSymbol = playSrc.match(/\bsymbol:\s*"([A-Z0-9]+)"/)?.[1] ?? "GOSHI";
const playMainnet = playCluster === "mainnet-beta";
const playRpc = playSrc.match(/\brpcUrl:\s*"([^"]*)"/)?.[1] ?? "";
const playServer = playSrc.match(/\bserverUrl:\s*"([^"]*)"/)?.[1] ?? "";
const isPlayPage = (name) => /^(es\/jugar|en\/play)\/index\.html$/.test(name);
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

let pages = 0;
for (const f of htmlFiles) {
  const name = rel(f);
  const html = readFileSync(f, "utf8");
  const is404 = name === "404.html";
  pages++;

  if (!/<html[^>]*\slang="[a-z-]+"/.test(html)) fail(name, "missing lang on <html>");
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
  if (!title) fail(name, "missing <title>");
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1]?.trim();
  if (!desc) fail(name, "missing meta description");
  else if (desc.length < 50 || desc.length > 330) fail(name, `description length ${desc.length} is odd`);
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const hreflangs = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
  if (!is404) {
    if (!canonical) fail(name, "missing canonical");
    else {
      if (!canonical.startsWith(ORIGIN + "/")) fail(name, `canonical ${canonical} is not on ${ORIGIN}`);
      const target = resolveLocal(new URL(canonical).pathname);
      if (target !== f) fail(name, `canonical points to another page (${canonical})`);
    }
    const langs = hreflangs.map((m) => m[1]);
    for (const need of ["es", "en", "x-default"]) if (!langs.includes(need)) fail(name, `missing hreflang ${need}`);
    for (const [, l, href] of hreflangs) {
      if (!href.startsWith(ORIGIN + "/")) fail(name, `hreflang ${l} is not absolute https`);
      else if (!existsSync(resolveLocal(new URL(href).pathname))) fail(name, `hreflang ${l} target does not exist: ${href}`);
    }
  }

  // Indexing consistency with src/site.ts.
  const robots = html.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? "";
  if (!robots) fail(name, "missing robots meta");
  else if (!indexable && !/noindex/.test(robots)) fail(name, "site is not indexable but the page has no noindex");
  else if (indexable && !is404 && /noindex/.test(robots) && !(isPlayPage(name) && playCluster !== "mainnet-beta")) fail(name, "site is indexable but the page has noindex");
  if (isPlayPage(name) && playCluster !== "mainnet-beta" && !/noindex/.test(robots)) fail(name, "play page on a test network must be noindex");

  // Structure.
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) fail(name, `has ${h1s} <h1> (expected 1)`);
  if (!/<main[\s>]/.test(html)) fail(name, "missing <main>");
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt(?:=|\s|>|\/)/.test(m[0])) fail(name, `image without alt: ${m[0].slice(0, 80)}`);

  // CSP-friendliness: no inline script (JSON data blocks are fine) and no inline handlers.
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
    const a = m[1];
    if (!/\ssrc="/.test(a) && !/type="application\/(ld\+)?json"/.test(a)) fail(name, `inline <script> found: <script${a}>`);
  }
  if (/\son[a-z]+="/.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) fail(name, "inline event handler attribute found");

  // http:// asset URLs.
  for (const m of html.matchAll(/\s(?:src|href|srcset|poster|action|data-src)="(http:\/\/[^"]*)"/g)) fail(name, `http:// URL: ${m[1]}`);
  for (const m of html.matchAll(/url\(["']?(http:\/\/[^)"']+)/g)) fail(name, `http:// URL in CSS: ${m[1]}`);

  // Links and assets.
  const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  const srcsets = [...html.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+/)[0]));
  for (const ref of [...refs, ...srcsets]) {
    if (/^(mailto:|tel:|data:|javascript:)/.test(ref)) {
      if (ref.startsWith("javascript:")) fail(name, "javascript: link");
      continue;
    }
    if (/^https:\/\//.test(ref) && !ref.startsWith(ORIGIN)) continue; // external, https only
    let local;
    if (ref.startsWith(ORIGIN)) local = new URL(ref).pathname + new URL(ref).hash;
    else if (ref.startsWith("#")) local = rel(f).replace(/index\.html$/, "").replace(/^/, "/") + ref;
    else if (ref.startsWith("/")) local = ref;
    else {
      fail(name, `relative or unsupported link: ${ref}`);
      continue;
    }
    const target = resolveLocal(local);
    if (!existsSync(target) || !statSync(target).isFile()) {
      fail(name, `broken link: ${ref}`);
      continue;
    }
    const hash = local.split("#")[1];
    if (hash && target.endsWith(".html") && !idsOf(target).has(hash)) fail(name, `broken anchor: ${ref}`);
  }
}

// 1a. Going to mainnet-beta: the pages must not talk like a test.
if (playMainnet) {
  const testWording = [
    /\btest (networks?|tokens?|environment|bots?|values|faucet|game)\b/i, new RegExp(`\\btest ${playSymbol}\\b`), /\bin testing\b/i, /technical preview/i,
    /redes? de pruebas/i, /entorno de pruebas/i, /\ben pruebas\b/i, /\bes una prueba\b/i, /vista t[e\u00e9]cnica previa/i,
    /(?<!vectores )(?<!casos )\bde prueba\b/i, /\bjuego de prueba\b/i,
  ];
  for (const f of htmlFiles) {
    const html = readFileSync(f, "utf8");
    for (const re of testWording) if (re.test(html)) fail(rel(f), `mainnet-beta build but the page still has test wording: ${re}`);
  }
}

// 1b. On-chain games.
const playPages = htmlFiles.filter((f) => isPlayPage(rel(f)));
if (playPages.length !== 2) fail("play", `expected the play page in es and en, found ${playPages.length}`);
if (!playOn) {
  for (const f of files.filter((f) => /\.(js|css)$/.test(f))) {
    if (/solflare|phantom|@solana|PublicKey|anchor/i.test(readFileSync(f, "utf8")) && !/theme-init/.test(f)) fail(rel(f), "wallet code present while site.play.enabled is false (run through `npm run build`, which prunes it)");
  }
  if (existsSync(join(dist, "css/play.css"))) fail("css/play.css", "play stylesheet present while the games are off");
  for (const f of playPages) if (!/data-play-state="soon"/.test(readFileSync(f, "utf8"))) fail(rel(f), "games are off but the page is not the coming soon state");
} else {
  for (const f of playPages) {
    const html = readFileSync(f, "utf8");
    if (/data-play-state="broken"/.test(html)) fail(rel(f), "games are enabled but a setting in src/site.ts is missing (see the build log)");
    if (playCluster !== "mainnet-beta" && !/data-play-banner="test"/.test(html)) fail(rel(f), "test network banner missing");
    if (playMainnet) {
      const lang = rel(f).startsWith("es/") ? "es" : "en";
      const risks = lang === "es" ? "/es/riesgos/" : "/en/risks/";
      const token = lang === "es" ? "/es/token/" : "/en/token/";
      if (!/data-play-banner="mainnet"/.test(html)) fail(rel(f), "mainnet-beta build but the real funds banner is missing");
      if (/data-play-banner="test"/.test(html)) fail(rel(f), "mainnet-beta build but the test banner is present");
      if (!/id="play-gate"/.test(html) || !/id="play-gate-check"/.test(html)) fail(rel(f), "mainnet-beta build but the eligibility gate is missing");
      // The links must be inside the notice of the play section itself, not only in the site navigation.
      const notice = html.match(/<aside class="notice info"[^>]*aria-labelledby="play-notice-t"[\s\S]*?<\/aside>/)?.[0] ?? "";
      if (!notice.includes(`href="${risks}"`)) fail(rel(f), `mainnet-beta build but the play notice does not link to ${risks}`);
      if (!notice.includes(`href="${token}"`)) fail(rel(f), `mainnet-beta build but the play notice does not link to ${token}`);
      if (!playAudited && !/data-play-unaudited/.test(html)) fail(rel(f), "audited is false but the page does not say the contract is not audited");
      if (/id="play-faucet-box"|id="play-faucet"|data-bots=|data-test-/.test(html)) fail(rel(f), "mainnet-beta build but the test faucet or bots UI is present");
      if (!/"mainnet":true/.test(html)) fail(rel(f), "mainnet-beta build but the page data does not say mainnet");
      if (/devnet|testnet|airdrop/i.test(html)) fail(rel(f), "mainnet-beta build but the play page mentions devnet or testnet");
    }
  }
  for (const f of htmlFiles.filter((f) => !isPlayPage(rel(f)))) {
    if (/css\/play\.css|id="play-data"/.test(readFileSync(f, "utf8"))) fail(rel(f), "play code leaked into a page that is not the play page");
  }
  const originOf = (u) => { try { return new URL(u).origin; } catch { return ""; } };
  if (playLocal) console.log("check-dist: PUBLIC_PLAY_LOCAL=1, skipping the CSP origin checks (local test build).");
  else {
    for (const [label, origin] of [["site.play.rpcUrl", originOf(playRpc)], ["site.play.serverUrl", originOf(playServer)]]) {
      if (!origin || origin === "null") { fail("site.ts", `${label} is not a valid URL`); continue; }
      for (const cfg of isTestTarget ? ["firebase.test.json"] : ["public/.htaccess", "firebase.json"]) {
        const text = readFileSync(join(root, cfg), "utf8");
        // The play page rule is the line that carries a connect-src with extra origins.
        if (!text.split(/\r?\n/).some((l) => l.includes("connect-src 'self'") && l.includes(origin))) {
          fail(cfg, `the play page CSP must allow ${origin} in connect-src (${label})`);
        }
      }
    }
  }
}

// 2. Sitemap, robots, manifest.
const sm = join(dist, "sitemap.xml");
if (!existsSync(sm)) fail("sitemap.xml", "missing");
else {
  const locs = [...readFileSync(sm, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const l of locs) if (!existsSync(resolveLocal(new URL(l).pathname))) fail("sitemap.xml", `lists a missing page: ${l}`);
  const expected = htmlFiles.filter((f) => !["404.html", "index.html"].includes(rel(f))).length;
  if (locs.length !== expected) fail("sitemap.xml", `lists ${locs.length} pages but dist has ${expected}`);
}
const rb = join(dist, "robots.txt");
if (!existsSync(rb)) fail("robots.txt", "missing");
else {
  const t = readFileSync(rb, "utf8");
  if (!indexable && !/Disallow:\s*\/\s*$/m.test(t)) fail("robots.txt", "site is not indexable but robots.txt does not disallow");
  if (indexable && !/Sitemap:/.test(t)) fail("robots.txt", "indexable site without a Sitemap line");
}
const mf = join(dist, "manifest.webmanifest");
if (existsSync(mf)) {
  for (const i of JSON.parse(readFileSync(mf, "utf8")).icons ?? []) if (!existsSync(resolveLocal(i.src))) fail("manifest.webmanifest", `missing icon ${i.src}`);
} else fail("manifest.webmanifest", "missing");
for (const need of ["404.html", ".htaccess", "_astro/.htaccess", "favicon.ico", "og/og-es.png", "og/og-en.png", "index.html"]) {
  if (!existsSync(join(dist, need))) fail(need, "missing from dist/");
}

// 3. Size report.
const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
const mb = (n) => (n / 1048576).toFixed(2) + " MB";
const byExt = {};
for (const f of files) byExt[extname(f) || "(none)"] = (byExt[extname(f) || "(none)"] ?? 0) + statSync(f).size;

console.log(`Checked ${pages} HTML pages, ${files.length} files, dist/ = ${mb(bytes)}`);
console.log("By type: " + Object.entries(byExt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join(", "));
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors.slice(0, 80)) console.error(" - " + e);
  if (errors.length > 80) console.error(` ... and ${errors.length - 80} more`);
  process.exit(1);
}
console.log("All gates passed.");
