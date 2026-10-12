// Token amounts. $GOSHI has 6 decimals, so 1 token = 1_000_000 base units.
// Everything is BigInt: no floating point ever touches an amount.

export const DECIMALS = 6;
export const UNIT = 1_000_000n;
/** The program stores amounts as u64. */
export const U64_MAX = 18_446_744_073_709_551_615n;

export interface FormatOptions {
  /** BCP 47 tag used for the digit grouping and the decimal separator. */
  locale?: string;
  /** Fraction digits always shown (default 0). */
  minFraction?: number;
  /** Most fraction digits shown (default 6). Extra digits are cut, never rounded up. */
  maxFraction?: number;
}

function decimalSeparator(locale: string): string {
  const part = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === "decimal");
  return part?.value ?? ".";
}

/** 1_500_000n -> "1.5" (en) or "1,5" (es). Trailing zeros are trimmed down to minFraction. */
export function formatAmount(units: bigint, opts: FormatOptions = {}): string {
  if (units < 0n) throw new RangeError("formatAmount: negative amount");
  const { locale = "en-US", minFraction = 0, maxFraction = DECIMALS } = opts;
  if (minFraction < 0 || maxFraction > DECIMALS || minFraction > maxFraction) {
    throw new RangeError("formatAmount: bad fraction digits");
  }
  const whole = units / UNIT;
  let frac = (units % UNIT).toString().padStart(DECIMALS, "0").slice(0, maxFraction);
  while (frac.length > minFraction && frac.endsWith("0")) frac = frac.slice(0, -1);
  const head = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(whole);
  return frac ? head + decimalSeparator(locale) + frac : head;
}

/**
 * Reads what a person types ("10", "2.5", "0,000001") into base units.
 * Returns null when the text is not a valid non negative amount with at most 6 decimals,
 * or when it does not fit in a u64.
 */
export function parseAmount(text: string): bigint | null {
  const t = text.trim().replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(t);
  if (!m) return null;
  const units = BigInt(m[1]) * UNIT + BigInt((m[2] ?? "").padEnd(DECIMALS, "0") || "0");
  return units > U64_MAX ? null : units;
}

// ------------------------------------------------------------------ SOL (lamports, 9 decimals)

export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const SOL_DECIMALS = 9;

/** 1_500_000_000n -> "1.5" (en) or "1,5" (es). Up to 9 decimals, trailing zeros trimmed down to minFraction. Cut, never rounded up. */
export function formatLamports(lamports: bigint, opts: { locale?: string; minFraction?: number; maxFraction?: number } = {}): string {
  if (lamports < 0n) throw new RangeError("formatLamports: negative amount");
  const { locale = "en-US", minFraction = 0, maxFraction = SOL_DECIMALS } = opts;
  if (minFraction < 0 || maxFraction > SOL_DECIMALS || minFraction > maxFraction) throw new RangeError("formatLamports: bad fraction digits");
  const whole = lamports / LAMPORTS_PER_SOL;
  let frac = (lamports % LAMPORTS_PER_SOL).toString().padStart(SOL_DECIMALS, "0").slice(0, maxFraction);
  while (frac.length > minFraction && frac.endsWith("0")) frac = frac.slice(0, -1);
  const head = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(whole);
  return frac ? head + decimalSeparator(locale) + frac : head;
}

/** Reads what a person types ("0.5", "1,25") into lamports. Null if invalid or above u64. */
export function parseSol(text: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,9}))?$/.exec(text.trim().replace(",", "."));
  if (!m) return null;
  const v = BigInt(m[1]) * LAMPORTS_PER_SOL + BigInt((m[2] ?? "").padEnd(SOL_DECIMALS, "0") || "0");
  return v > U64_MAX ? null : v;
}
