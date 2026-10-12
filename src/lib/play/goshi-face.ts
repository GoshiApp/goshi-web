// The goshi face: pure helpers that decide how the face looks (blink, mood) and the 8 colors a player can pick.
// The canvas drawing lives in arena-paint.ts; this file has no DOM and is unit tested.

/** The 8 free colors (hues). Index 0 is the brand gold. */
export const GOSHI_HUES: readonly number[] = [45, 8, 330, 270, 215, 175, 130, 80];
export const COLOR_KEY = "goshi-color";

/** A saved choice to an index 0..7, or null for "use the default assignment". */
export function parseColorChoice(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < GOSHI_HUES.length ? n : null;
}

export type Mood = "normal" | "happy" | "dizzy";

/** How long the happy mouth stays after eating, and how long a dizzy flash lasts (ms). */
export const HAPPY_MS = 450;
export const DIZZY_MS = 700;

/** A small stable number from a string (so every goshi blinks on its own rhythm). */
export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const BLINK_MS = 140;

/**
 * 0 (eyes open) to 1 (closed). A blink every 3 to 5.5 seconds, each goshi on its own beat, a triangle over 140 ms.
 */
export function blinkAmount(seed: number, nowMs: number): number {
  // Mix the seed so that similar wallets still blink on different beats.
  const m = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
  const period = 3000 + (m % 2500);
  const t = (nowMs + ((m >>> 8) % 5500)) % period;
  if (t >= BLINK_MS) return 0;
  const x = t / BLINK_MS;
  return x < 0.5 ? x * 2 : (1 - x) * 2;
}

/** Happy right after eating, otherwise normal. */
export function moodOf(ateAtMs: number | undefined, nowMs: number): Mood {
  return ateAtMs !== undefined && nowMs - ateAtMs >= 0 && nowMs - ateAtMs < HAPPY_MS ? "happy" : "normal";
}

/** Opacity of a dizzy flash `age` ms after the death (1 to 0), 0 when over. */
export function dizzyAlpha(ageMs: number): number {
  if (ageMs < 0 || ageMs >= DIZZY_MS) return 0;
  return 1 - ageMs / DIZZY_MS;
}
