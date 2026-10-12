// The quick match loop: entry options in dollars, the session spend guard and the player's daily numbers.
// Pure logic with injected storage and clock, unit tested. No money amounts are promised anywhere: these are entries.

export interface FeeOption { lamports: bigint; usd: number }

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Options from the server's hello (strings for the amounts), safe against a bad payload. */
export function parseFeeOptions(raw: unknown): FeeOption[] {
  if (!Array.isArray(raw)) return [];
  const out: FeeOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const r = o as { lamports?: unknown; usd?: unknown };
    try {
      const l = typeof r.lamports === "bigint" ? r.lamports : BigInt(String(r.lamports));
      if (l > 0n && typeof r.usd === "number" && r.usd > 0) out.push({ lamports: l, usd: r.usd });
    } catch { /* not a number */ }
  }
  return out.sort((a, b) => a.usd - b.usd);
}

/** SOL as text with up to `maxDecimals` decimals and no trailing zeros ("0.007", "1.5"). Rounds up tiny amounts to the last digit. */
export function solText(lamports: bigint, locale: string = "en-US", maxDecimals: number = 3): string {
  const n = Number(lamports) / 1e9;
  const min = 10 ** -maxDecimals;
  const shown = n > 0 && n < min ? min : n;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals }).format(shown);
}

/** "$1", "$2", "$5" (a number of dollars, no decimals when whole). */
export function usdText(usd: number, locale: string = "en-US"): string {
  const whole = Number.isInteger(usd);
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(usd);
}

export interface FeeLabel { usd: string; sol: string }

export function feeLabel(o: FeeOption, locale: string = "en-US"): FeeLabel {
  return { usd: usdText(o.usd, locale), sol: solText(o.lamports, locale) };
}

// ------------------------------------------------------------------ spend guard

export const SPENT_KEY = "goshi-spent";
export const LIMIT_KEY = "goshi-spend-limit";
/** The limits the person can pick (SOL), as lamports. */
export const LIMIT_OPTIONS: readonly bigint[] = [50_000_000n, 100_000_000n, 250_000_000n];

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const big = (v: string | null): bigint | null => {
  if (v === null || !/^\d+$/.test(v)) return null;
  try { return BigInt(v); } catch { return null; }
};

/** What was spent on entries in this browser session, and an optional limit that blocks the next entry. */
export class SpendGuard {
  private readonly store: KV | null;
  private mem = { spent: 0n, limit: null as bigint | null };

  constructor(store: KV | null) {
    this.store = store;
    try {
      this.mem.spent = big(store?.getItem(SPENT_KEY) ?? null) ?? 0n;
      this.mem.limit = big(store?.getItem(LIMIT_KEY) ?? null);
    } catch { /* blocked */ }
  }

  get spent(): bigint { return this.mem.spent; }
  get limit(): bigint | null { return this.mem.limit; }

  /** The amount still allowed (null when there is no limit). */
  get remaining(): bigint | null {
    return this.mem.limit === null ? null : this.mem.limit > this.mem.spent ? this.mem.limit - this.mem.spent : 0n;
  }

  /** Whether an entry of `fee` fits under the limit. With no limit it always fits. */
  allows(fee: bigint): boolean {
    return this.mem.limit === null || this.mem.spent + fee <= this.mem.limit;
  }

  add(fee: bigint): void {
    this.mem.spent += fee;
    try { this.store?.setItem(SPENT_KEY, this.mem.spent.toString()); } catch { /* private mode */ }
  }

  /** null removes the limit. */
  setLimit(limit: bigint | null): void {
    this.mem.limit = limit;
    try {
      if (limit === null) this.store?.removeItem(LIMIT_KEY);
      else this.store?.setItem(LIMIT_KEY, limit.toString());
    } catch { /* private mode */ }
  }
}

// ------------------------------------------------------------------ best of the day, streak, share text

export const DAILY_KEY = "goshi-daily";

export interface Daily {
  /** Local date (YYYY-MM-DD) of the last match played. */
  day: string;
  /** Best result of that day: lower place is better, then higher mass. */
  bestPlace: number | null;
  bestMass: number;
  /** Days in a row, including `day`. */
  streak: number;
  /** Matches played on `day`. */
  played: number;
}

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const daysBetween = (a: string, b: string): number => {
  const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86_400_000);
};

export function readDaily(store: KV | null): Daily | null {
  try {
    const raw = store?.getItem(DAILY_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Daily>;
    if (typeof v.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.day)) return null;
    return {
      day: v.day,
      bestPlace: typeof v.bestPlace === "number" ? v.bestPlace : null,
      bestMass: typeof v.bestMass === "number" ? v.bestMass : 0,
      streak: typeof v.streak === "number" && v.streak > 0 ? v.streak : 1,
      played: typeof v.played === "number" ? v.played : 0,
    };
  } catch {
    return null;
  }
}

export interface DailyUpdate { daily: Daily; beatBest: boolean; previousBest: { place: number | null; mass: number } | null; newDay: boolean }

/**
 * Records a finished match. A new day resets the best of the day; playing on the next day keeps the streak going, a
 * longer gap restarts it at 1. `beatBest` says whether this result is better than the day's best before it.
 */
export function recordMatch(prev: Daily | null, today: string, place: number, mass: number): DailyUpdate {
  const sameDay = prev !== null && prev.day === today;
  const gap = prev ? daysBetween(prev.day, today) : null;
  const streak = !prev ? 1 : sameDay ? prev.streak : gap === 1 ? prev.streak + 1 : 1;
  const prevBest = sameDay ? { place: prev!.bestPlace, mass: prev!.bestMass } : null;
  const better = !prevBest || prevBest.place === null || place < prevBest.place || (place === prevBest.place && mass > prevBest.mass);
  const daily: Daily = {
    day: today,
    bestPlace: better ? place : prevBest!.place,
    bestMass: better ? mass : Math.max(prevBest!.mass, 0),
    streak,
    played: (sameDay ? prev!.played : 0) + 1,
  };
  return { daily, beatBest: better && prevBest !== null, previousBest: prevBest, newDay: !sameDay };
}

export function saveDaily(store: KV | null, d: Daily): void {
  try { store?.setItem(DAILY_KEY, JSON.stringify(d)); } catch { /* private mode */ }
}

/** The text a person shares. No prize amounts and no promises: a place, a game and an invitation. */
export function shareText(template: string, place: number, of: number, mass: number, url: string): string {
  return template
    .replace("{place}", String(place))
    .replace("{n}", String(of))
    .replace("{mass}", String(Math.round(mass)))
    .replace("{url}", url);
}

/** The X (Twitter) intent link for a text and the page. */
export function xIntentUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
