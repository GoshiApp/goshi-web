// Builds the two files that a downloaded replay page carries inside: the viewer (one script, no imports at run time) and the
// styles it needs. They go to public/standalone/ and the site hands them to the browser when someone asks for the interactive file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "standalone");
fs.mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, "src/standalone/entry.ts")],
  outfile: path.join(out, "viewer.js"),
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  legalComments: "none",
  logLevel: "warning",
});

// The styles: the same rules the site uses for the viewer, taken from the site's own stylesheet so they never drift apart.
const css = fs.readFileSync(path.join(root, "src/styles/global.css"), "utf8");
const blocks = [];
{
  let i = 0;
  const n = css.length;
  while (i < n) {
    // skip whitespace and comments
    while (i < n && /\s/.test(css[i])) i++;
    if (css.startsWith("/*", i)) { const e = css.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
    if (i >= n) break;
    const start = i;
    let depth = 0;
    while (i < n) {
      const c = css[i];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
      else if (c === ";" && depth === 0) { i++; break; }
      i++;
    }
    blocks.push(css.slice(start, i).trim());
  }
}
const want = [/\.mv\b/, /\.mv-/, /\.btn\b/, /\.glass\b/, /\.muted\b/, /\.small\b/, /\.link-btn\b/];
const prelude = (b) => b.slice(0, Math.max(0, b.indexOf("{")));
const keep = blocks.filter((b) => {
  const p = prelude(b);
  if (/^:root\s*$/.test(p.trim()) || /^\*/.test(p.trim())) return true;
  if (p.trim().startsWith("@media")) return want.some((r) => r.test(b)) && !/prefers-color-scheme/.test(p);
  return want.some((r) => r.test(p));
});
const base = `
html, body { margin: 0; background: #070b1f; color: var(--ink); font-family: var(--font); line-height: 1.5; }
body { min-height: 100vh; background-image: radial-gradient(900px 520px at 85% -8%, var(--page-glow-1), transparent 70%); background-repeat: no-repeat; }
#replay { max-width: 1120px; margin: 0 auto; padding: 14px 12px 40px; }
.sa-head { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; margin: 0 0 10px; }
.sa-head strong { color: var(--gold); font-size: 1.3rem; letter-spacing: 0.08em; }
a { color: var(--gold-text); }
select, button, input { font-family: inherit; }
.mv-hint { margin: 0; }
.mv-board li.mk { border-color: var(--gold-text); }
`;
fs.writeFileSync(path.join(out, "viewer.css"), keep.join("\n") + "\n" + base);
const kb = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0);
console.log(`standalone viewer: viewer.js ${kb("viewer.js")} KB, viewer.css ${kb("viewer.css")} KB (${keep.length} rules kept)`);
