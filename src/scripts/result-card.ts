// The top of the result card after a match: your place, mass and eliminations, the prize line, the actions.
// Shared by the free practice (arena-shell.ts) and the on-chain rooms (play-live.ts). Text always goes in as text.
import { fill, node } from "../lib/play/dom.ts";
import { COLOR_KEY, GOSHI_HUES, parseColorChoice } from "../lib/play/goshi-face.ts";
import { dayKey, readDaily, recordMatch, saveDaily, shareText, xIntentUrl } from "../lib/play/quick.ts";
import { renderResultBlob } from "./result-image.ts";
import type { PlayCopy } from "../content/types.ts";

export type ResultCopy = PlayCopy["live"]["result"];

export interface Actions {
  /** Play again with the same entry (rooms) or another practice match. */
  again?: () => void;
  /** Go back to the entry options. */
  change?: () => void;
  practice?: () => void;
  leave?: () => void;
  close?: () => void;
}

export interface SummaryInput {
  t: ResultCopy;
  /** Your place and the number of players. */
  rank: number;
  of: number;
  mass: number;
  kills: number;
  /** "sent" with a link (on the podium), "none" (not this time) or null (practice: no prize line). */
  prize: { kind: "sent"; href: string | null } | { kind: "none" } | null;
  actions: Actions;
  /** Extra nodes (share, best of the day) placed between the numbers and the buttons. */
  extra?: Node[];
  /** A saboteur does not compete: no place, a line of its own instead. */
  headline?: string;
  note?: string;
  hideStats?: boolean;
}

const stat = (label: string, value: string) => node("div", { class: "result-stat" }, [node("dt", { text: label }), node("dd", { text: value })]);

export function buildSummary(i: SummaryInput): HTMLElement {
  const t = i.t;
  const box = node("div", { class: "result-summary" });
  // The slot for a pass offer sits first: it is the most important thing on the card when it exists.
  box.append(node("div", { class: "result-pass-slot" }));
  if (i.hideStats) {
    box.append(node("p", { class: "result-place", text: i.headline ?? "" }));
    if (i.note) box.append(node("p", { class: "result-prize", text: i.note }));
  } else {
    box.append(
      node("p", { class: "result-place", text: fill(t.placeOf, { rank: i.rank, n: i.of }) }),
      node("dl", { class: "result-stats" }, [
        stat(t.yourPlace, fill(t.placeOf, { rank: i.rank, n: i.of })),
        stat(t.yourMass, String(Math.round(i.mass))),
        stat(t.eliminations, String(i.kills)),
      ]),
    );
  }
  if (i.prize) {
    const line = node("p", { class: i.prize.kind === "sent" ? "result-prize sent" : "result-prize" });
    line.append(node("strong", { text: i.prize.kind === "sent" ? t.prizeSent : t.prizeNone }));
    if (i.prize.kind === "sent" && i.prize.href) {
      line.append(" ", node("a", { text: t.viewPrize, attrs: { href: i.prize.href, rel: "noopener noreferrer" } }));
    }
    box.append(line);
  }
  for (const n of i.extra ?? []) box.append(n);
  const row = node("div", { class: "btn-row result-actions" });
  const btn = (text: string, cls: string, fn?: () => void) => {
    if (!fn) return;
    const b = node("button", { class: `btn ${cls}`, text, attrs: { type: "button" } });
    b.addEventListener("click", fn);
    row.append(b);
  };
  btn(t.again, "btn-gold btn-lg", i.actions.again);
  btn(t.change, "btn-glass", i.actions.change);
  btn(t.practice, "btn-glass", i.actions.practice);
  btn(t.leave, "btn-glass", i.actions.leave);
  btn(t.close, "btn-glass", i.actions.close);
  box.append(row);
  return box;
}

// ------------------------------------------------------------------ daily numbers and sharing

/** The color hue of the player's own goshi (from the play card) for the picture. */
export function ownHue(): number {
  try {
    const i = parseColorChoice(localStorage.getItem(COLOR_KEY));
    return GOSHI_HUES[i ?? 0];
  } catch {
    return GOSHI_HUES[0];
  }
}

export interface ShareInput {
  t: ResultCopy;
  rank: number;
  of: number;
  mass: number;
  /** The page people are invited to (the site address). */
  url: string;
  /** "Mass" label for the picture. */
  massLabel: string;
  placeLabel: string;
  /** Called when the result was recorded, so the page can show a new best. */
  rematch?: () => void;
}

/**
 * Records this match in the day's numbers (localStorage only, nothing is sent anywhere) and returns the lines for the
 * card: the best of today, the streak and a prompt to beat it, plus the Share and Download buttons.
 */
export function dailyAndShare(i: ShareInput): Node[] {
  const t = i.t;
  let store: Storage | null = null;
  try { store = window.localStorage; } catch { /* blocked */ }
  const upd = recordMatch(readDaily(store), dayKey(new Date()), i.rank, i.mass);
  saveDaily(store, upd.daily);
  const out: Node[] = [];
  const d = upd.daily;
  if (upd.beatBest) out.push(node("p", { class: "result-best new", text: t.newBest }));
  if (d.bestPlace !== null) {
    out.push(node("p", { class: "result-best", text: fill(t.bestToday, { place: d.bestPlace, mass: Math.round(d.bestMass) }) }));
  }
  if (!upd.beatBest && d.bestPlace !== null && d.bestPlace > 1) out.push(node("p", { class: "result-best nudge", text: t.beatBest }));
  out.push(node("p", { class: "result-streak", text: d.streak > 1 ? fill(t.streak, { n: d.streak }) : t.streakFirst }));

  const text = shareText(t.shareText, i.rank, i.of, i.mass, i.url);
  const row = node("div", { class: "btn-row result-share" });
  const note = node("p", { class: "demo-note", attrs: { role: "status", "aria-live": "polite" } });
  let blobPromise: Promise<Blob | null> | null = null;
  const blob = () => (blobPromise ??= renderResultBlob({
    rank: i.rank, of: i.of, mass: i.mass, hue: ownHue(), placeLabel: i.placeLabel, massLabel: i.massLabel, url: i.url.replace(/^https?:\/\//, ""),
  }));
  const share = node("button", { class: "btn btn-gold", text: t.share, attrs: { type: "button" } });
  share.addEventListener("click", async () => {
    const png = await blob();
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    try {
      if (typeof nav.share === "function") {
        const data: { title: string; text: string; files?: File[] } = { title: t.shareTitle, text };
        if (png) {
          const f = new File([png], t.downloadName, { type: "image/png" });
          if (nav.canShare?.({ files: [f] })) data.files = [f];
        }
        await nav.share(data);
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // the person closed the share sheet
    }
    // No share sheet here: copy the text and open the X link.
    try { await navigator.clipboard.writeText(text); note.textContent = t.copied; } catch { note.textContent = text; }
    window.open(xIntentUrl(text), "_blank", "noopener,noreferrer");
  });
  const dl = node("button", { class: "btn btn-glass", text: t.download, attrs: { type: "button" } });
  dl.addEventListener("click", async () => {
    const png = await blob();
    if (!png) return;
    const href = URL.createObjectURL(png);
    const a = node("a", { attrs: { href, download: t.downloadName } });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  });
  row.append(share, dl);
  out.push(row, note);
  return out;
}
