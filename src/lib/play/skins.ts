import { bestStreak } from "./missions.ts";

// Cosmetic skins. They change how a body is painted and nothing else. Skins earned by playing are kept in this browser;
// skins for holders are checked by the game server against the wallet's balance before other players see them.

export type Rarity = "common" | "rare" | "epic" | "meme" | "holder" | "founder";
export type Unlock =
  | { kind: "free" }
  | { kind: "games"; n: number }
  | { kind: "best"; n: number }
  | { kind: "hold"; n: number }
  | { kind: "streak"; n: number }
  | { kind: "founder" };

export interface SkinStyle {
  body: string;
  /** A second color painted as stripes over the body. */
  alt?: string;
  head: string;
  rim: string;
  glowA: string;
  glowB: string;
  /** A meme head drawn instead of the goshi face. */
  art?: "pepe" | "shiba" | "doge" | "bonk" | "popcat" | "wif" | "fox" | "laser" | "btc" | "eth" | "sol" | "whale" | "degen" | "rugged" | "moonboy" | "panda";
}

export interface Skin { id: string; rarity: Rarity; unlock: Unlock; style: SkinStyle }

const hsl = (h: number, s = 92, l = 58): SkinStyle => ({
  body: `hsl(${h} ${s}% ${l}%)`, head: `hsl(${h} 100% 90%)`, rim: `hsl(${h} 100% 75%)`,
  glowA: `hsla(${h} 100% 62% / 0.10)`, glowB: `hsla(${h} 100% 62% / 0.24)`,
});
const two = (a: number, b: number, extra: Partial<SkinStyle> = {}): SkinStyle => ({ ...hsl(a), alt: `hsl(${b} 95% 62%)`, ...extra });

/** Holder tiers are USD worth of $GOSHI held (the server reads the price). Same numbers as server/src/game/skins.ts. */
export const SKINS: readonly Skin[] = [
  { id: "classic", rarity: "common", unlock: { kind: "free" }, style: hsl(140) },
  { id: "mint", rarity: "common", unlock: { kind: "free" }, style: hsl(165) },
  { id: "coral", rarity: "common", unlock: { kind: "free" }, style: hsl(8, 90, 64) },
  { id: "sky", rarity: "common", unlock: { kind: "free" }, style: hsl(205) },
  { id: "stripes", rarity: "rare", unlock: { kind: "games", n: 5 }, style: two(50, 275) },
  { id: "candy", rarity: "rare", unlock: { kind: "games", n: 15 }, style: two(330, 190) },
  { id: "neon", rarity: "rare", unlock: { kind: "best", n: 100 }, style: { ...hsl(150, 100, 52), head: "#eafff4", rim: "#7dffb8", glowA: "hsla(150 100% 55% / 0.22)", glowB: "hsla(150 100% 55% / 0.5)" } },
  { id: "sunset", rarity: "epic", unlock: { kind: "best", n: 250 }, style: two(22, 335) },
  { id: "galaxy", rarity: "epic", unlock: { kind: "games", n: 50 }, style: two(262, 305, { glowB: "hsla(262 100% 65% / 0.45)" }) },
  { id: "gold", rarity: "epic", unlock: { kind: "best", n: 500 }, style: two(46, 40, { head: "#fff6c9", rim: "#ffe27a", glowB: "hsla(46 100% 60% / 0.5)" }) },
  { id: "ember", rarity: "epic", unlock: { kind: "streak", n: 3 }, style: two(14, 36, { glowB: "hsla(14 100% 58% / 0.5)" }) },
  { id: "aurora", rarity: "epic", unlock: { kind: "streak", n: 7 }, style: two(170, 285, { head: "#f0ffff", rim: "#9ffff0", glowB: "hsla(170 100% 60% / 0.5)" }) },
  { id: "ceo", rarity: "founder", unlock: { kind: "founder" }, style: { body: "hsl(0 0% 12%)", alt: "hsl(46 100% 58%)", head: "#fff3b0", rim: "#ffd54a", glowA: "hsla(46 100% 60% / 0.25)", glowB: "hsla(46 100% 60% / 0.7)" } },
  { id: "pepe", rarity: "meme", unlock: { kind: "games", n: 8 }, style: { ...hsl(100, 55, 46), head: "#86c24a", rim: "#b6e57c", art: "pepe" } },
  { id: "shiba", rarity: "meme", unlock: { kind: "games", n: 12 }, style: { ...hsl(32, 85, 56), head: "#f2b05a", rim: "#ffd29a", art: "shiba" } },
  { id: "doge", rarity: "meme", unlock: { kind: "best", n: 150 }, style: { ...hsl(40, 62, 66), head: "#f3e1b0", rim: "#fff0c8", art: "doge" } },
  { id: "bonk", rarity: "meme", unlock: { kind: "games", n: 25 }, style: { ...hsl(38, 95, 55), head: "#ffc34a", rim: "#ffe08a", art: "bonk" } },
  { id: "fox", rarity: "meme", unlock: { kind: "games", n: 35 }, style: { ...hsl(20, 85, 52), head: "#e8b088", rim: "#ffc898", art: "fox" } },
  { id: "popcat", rarity: "meme", unlock: { kind: "best", n: 300 }, style: { ...hsl(340, 70, 78), head: "#fff1f1", rim: "#ffd0dc", art: "popcat" } },
  { id: "wif", rarity: "meme", unlock: { kind: "games", n: 40 }, style: { ...hsl(30, 45, 60), head: "#e9c9a0", rim: "#ffe2c0", art: "wif" } },
  { id: "bitcoin", rarity: "rare", unlock: { kind: "games", n: 30 }, style: { ...hsl(28, 95, 55), head: "#f7931a", rim: "#ffc25e", alt: "hsl(40 100% 72%)", art: "btc" } },
  { id: "ethereum", rarity: "rare", unlock: { kind: "best", n: 350 }, style: { ...hsl(265, 80, 62), head: "#8a7fd4", rim: "#c0b6f5", alt: "hsl(245 70% 82%)", art: "eth" } },
  { id: "solana", rarity: "epic", unlock: { kind: "games", n: 45 }, style: two(150, 275, { head: "#0b0b14", rim: "#14f195", art: "sol" }) },
  { id: "laser-eyes", rarity: "epic", unlock: { kind: "best", n: 600 }, style: { ...hsl(46, 100, 55), head: "#ffd76a", rim: "#ffe9a1", glowB: "hsla(46 100% 60% / 0.5)", alt: "hsl(0 90% 56%)", art: "laser" } },
  { id: "whale", rarity: "epic", unlock: { kind: "games", n: 60 }, style: { ...hsl(215, 80, 45), head: "#4a86e8", rim: "#8ab5f5", art: "whale" } },
  { id: "degen", rarity: "meme", unlock: { kind: "streak", n: 5 }, style: two(300, 60, { head: "#ffb3e2", rim: "#ffd76a", art: "degen" }) },
  { id: "rugged", rarity: "common", unlock: { kind: "free" }, style: { ...hsl(220, 10, 55), head: "#a8adb8", rim: "#d0d4dc", alt: "hsl(355 55% 50%)", art: "rugged" } },
  { id: "panda", rarity: "common", unlock: { kind: "free" }, style: { body: "hsl(0 0% 95%)", alt: "hsl(0 0% 12%)", head: "#fbfbfb", rim: "#ffffff", glowA: "hsla(0 0% 100% / 0.18)", glowB: "hsla(0 0% 100% / 0.4)", art: "panda" } },
  { id: "moonboy", rarity: "epic", unlock: { kind: "streak", n: 10 }, style: { ...hsl(230, 70, 40), head: "#3353c9", rim: "#6f8bf0", alt: "hsl(48 100% 66%)", art: "moonboy" } },
  { id: "holder-bronze", rarity: "holder", unlock: { kind: "hold", n: 20 }, style: two(28, 18, { head: "#ffe3c8", rim: "#ffb27a" }) },
  { id: "holder-silver", rarity: "holder", unlock: { kind: "hold", n: 200 }, style: { ...two(215, 195, { head: "#f2f6ff", rim: "#cfe0ff" }), body: "hsl(215 20% 78%)" } },
  { id: "holder-gold", rarity: "holder", unlock: { kind: "hold", n: 1000 }, style: two(48, 36, { head: "#fffbe0", rim: "#fff1a1", glowA: "hsla(48 100% 60% / 0.3)", glowB: "hsla(48 100% 60% / 0.65)" }) },
];

const BY_ID = new Map(SKINS.map((s) => [s.id, s]));
export const skinById = (id: string | null | undefined): Skin | null => (id ? BY_ID.get(id) ?? null : null);

// ───────── what the person has done (this browser only) ─────────
const STATS_KEY = "goshi-stats";
const SEL_KEY = "goshi-skin";
export interface Stats { games: number; best: number; streak: number }

export function readStats(): Stats {
  try {
    const v = JSON.parse(localStorage.getItem(STATS_KEY) ?? "null");
    if (v && typeof v.games === "number" && typeof v.best === "number") return { games: v.games, best: v.best, streak: bestStreak() };
  } catch { /* none yet */ }
  return { games: 0, best: 0, streak: bestStreak() };
}
/** Counts one finished match and its peak mass. Returns the skins that this match unlocked. */
export function recordGame(peak: number): Skin[] {
  const before = readStats();
  const after: Stats = { games: before.games + 1, best: Math.max(before.best, Math.round(peak)), streak: before.streak };
  try { localStorage.setItem(STATS_KEY, JSON.stringify({ games: after.games, best: after.best })); } catch { /* private mode */ }
  return SKINS.filter((s) => s.unlock.kind !== "hold" && s.unlock.kind !== "streak" && s.unlock.kind !== "founder" && !isUnlocked(s, before, 0) && isUnlocked(s, after, 0));
}

export function isUnlocked(s: Skin, st: Stats, held: number, founder = false): boolean {
  const u = s.unlock;
  return u.kind === "free" || (u.kind === "games" && st.games >= u.n) || (u.kind === "best" && st.best >= u.n) || (u.kind === "hold" && held >= u.n) || (u.kind === "streak" && st.streak >= u.n) || (u.kind === "founder" && founder);
}

export function selectedSkin(): string | null {
  try { return localStorage.getItem(SEL_KEY); } catch { return null; }
}
export function selectSkin(id: string | null): void {
  try { id ? localStorage.setItem(SEL_KEY, id) : localStorage.removeItem(SEL_KEY); } catch { /* private mode */ }
}
