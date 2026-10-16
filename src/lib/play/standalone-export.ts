// A match replay as ONE file that works offline: the viewer (the same code as the site), the records of the match and the strings
// are inside it. It is built in the browser, from the files the viewer already has; nothing is uploaded anywhere.

export interface ReplayPayload {
  v: 1;
  lang: string;
  title: string;
  /** The archive entry of the match (ranking, proof, wallets) or null for a bare record file. */
  item: unknown | null;
  /** The arena record, base64. */
  arena: string | null;
  /** The minute of frenzy of each player, base64. */
  minute: { w: string; b: string }[];
  /** Every string of the viewer, in the language of the page. */
  t: Record<string, unknown>;
}

export function bytesToB64(b: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode(...b.subarray(i, i + CH));
  return btoa(s);
}

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** The page itself, from the viewer script and the styles (pure: also used by the tests). */
export function assembleStandaloneHtml(payload: ReplayPayload, js: string, css: string): string {
  // Inside a <script> block: nothing may close the tag or open a comment.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c").replace(new RegExp("\\u2028", "g"), "\\u2028").replace(new RegExp("\\u2029", "g"), "\\u2029");
  const code = js.replace(/<\/script/gi, "<\\/script");
  const title = escText(`Goshi \u00b7 ${payload.title || (payload.item as { roomId?: string } | null)?.roomId || "replay"}`);
  return `<!doctype html>
<html lang="${escText(payload.lang || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<main id="replay"></main>
<script type="application/json" id="goshi-data">${json}</script>
<script>${code}</script>
</body>
</html>
`;
}

/** Fetches the built viewer from the site (`base` is where it lives) and returns the page. */
export async function buildStandaloneHtml(payload: ReplayPayload, base = "/standalone/"): Promise<string> {
  const [js, css] = await Promise.all([
    fetch(`${base}viewer.js`).then((r) => { if (!r.ok) throw new Error("viewer.js"); return r.text(); }),
    fetch(`${base}viewer.css`).then((r) => { if (!r.ok) throw new Error("viewer.css"); return r.text(); }),
  ]);
  return assembleStandaloneHtml(payload, js, css);
}

export interface ExportInput {
  item: unknown | null;
  arena: Uint8Array | null;
  files: { w: string; bytes: Uint8Array }[];
  /** The strings of the viewer (as the page gave them to it). */
  t: Record<string, unknown>;
  title?: string;
  fileName: string;
}

/** Builds the interactive replay page and hands it to the browser as a download. Throws when the viewer cannot be fetched. */
export async function downloadInteractive(i: ExportInput): Promise<void> {
  // The links inside the file point back to the site, so they cannot be relative.
  const t = { ...i.t };
  const vh = t.verifyHref;
  if (typeof vh === "string") { try { t.verifyHref = new URL(vh, location.href).href; } catch { /* keep it */ } }
  const html = await buildStandaloneHtml({
    v: 1, lang: document.documentElement.lang || "en", title: i.title ?? "", item: i.item,
    arena: i.arena ? bytesToB64(i.arena) : null,
    minute: i.files.map((f) => ({ w: f.w, b: bytesToB64(f.bytes) })),
    t,
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  a.download = i.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
