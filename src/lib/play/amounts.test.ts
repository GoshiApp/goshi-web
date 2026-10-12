import { test } from "node:test";
import assert from "node:assert/strict";
import { U64_MAX, UNIT, formatAmount, formatLamports, parseAmount, parseSol } from "./amounts.ts";

test("formatAmount: whole tokens, fractions and 6 decimals", () => {
  assert.equal(formatAmount(0n), "0");
  assert.equal(formatAmount(1n), "0.000001");
  assert.equal(formatAmount(UNIT), "1");
  assert.equal(formatAmount(1_500_000n), "1.5");
  assert.equal(formatAmount(1_234_567n), "1.234567");
  assert.equal(formatAmount(100_000n * UNIT), "100,000");
  assert.equal(formatAmount(54_000n * UNIT + 250_000n), "54,000.25");
});

test("formatAmount follows the locale for the decimal separator and the grouping", () => {
  assert.equal(formatAmount(1_500_000n, { locale: "es-ES" }), "1,5");
  const big = formatAmount(1_234_567n * UNIT + 500_000n, { locale: "es-ES" });
  assert.ok(big.endsWith(",5"), big);
  assert.equal(big.replace(/\D/g, ""), "12345675");
  // The site's Spanish locale (es-419) uses a dot for decimals, like the rest of the site's numbers.
  assert.equal(formatAmount(1_500_000n, { locale: "es-419" }), "1.5");
});

test("formatAmount: min and max fraction digits, cut and never rounded up", () => {
  assert.equal(formatAmount(UNIT, { minFraction: 2 }), "1.00");
  assert.equal(formatAmount(1_999_999n, { maxFraction: 2 }), "1.99");
  assert.equal(formatAmount(1_999_999n, { maxFraction: 0 }), "1");
  assert.equal(formatAmount(1_500_000n, { minFraction: 2, maxFraction: 2 }), "1.50");
});

test("formatAmount handles the largest u64 without losing a digit", () => {
  assert.equal(formatAmount(U64_MAX).replace(/,/g, ""), "18446744073709.551615");
});

test("formatAmount rejects negatives and impossible options", () => {
  assert.throws(() => formatAmount(-1n), RangeError);
  assert.throws(() => formatAmount(1n, { maxFraction: 7 }), RangeError);
  assert.throws(() => formatAmount(1n, { minFraction: 3, maxFraction: 2 }), RangeError);
});

test("parseAmount reads what people type", () => {
  assert.equal(parseAmount("10"), 10n * UNIT);
  assert.equal(parseAmount(" 2.5 "), 2_500_000n);
  assert.equal(parseAmount("2,5"), 2_500_000n);
  assert.equal(parseAmount("0.000001"), 1n);
  assert.equal(parseAmount("0"), 0n);
  assert.equal(parseAmount("18446744073709.551615"), U64_MAX);
});

test("parseAmount refuses anything else", () => {
  for (const bad of ["", "-1", "1.1234567", "abc", "1e3", "1..2", ".5", "1.", "18446744073709.551616", "1 000"]) {
    assert.equal(parseAmount(bad), null, JSON.stringify(bad));
  }
});

test("format and parse round trip", () => {
  for (const u of [0n, 1n, 999_999n, UNIT, 123_456_789n, 5_000_000_000_000n]) {
    assert.equal(parseAmount(formatAmount(u, { locale: "en-US" }).replace(/,/g, "")), u);
  }
});

test("formatLamports shows SOL with up to 9 decimals", () => {
  assert.equal(formatLamports(1_000_000_000n), "1");
  assert.equal(formatLamports(2_500_000_000n), "2.5");
  assert.equal(formatLamports(1n), "0.000000001");
  assert.equal(formatLamports(123_456_789n), "0.123456789");
  assert.equal(formatLamports(123_456_789n, { maxFraction: 4 }), "0.1234");
  assert.equal(formatLamports(1_500_000_000n, { locale: "es-ES" }), "1,5");
  assert.equal(formatLamports(0n), "0");
  assert.equal(formatLamports(1_000_000_000n, { minFraction: 2 }), "1.00");
  assert.throws(() => formatLamports(-1n), RangeError);
});

test("parseSol reads what people type", () => {
  assert.equal(parseSol("1"), 1_000_000_000n);
  assert.equal(parseSol("0.05"), 50_000_000n);
  assert.equal(parseSol("0,5"), 500_000_000n);
  assert.equal(parseSol("0.000000001"), 1n);
  for (const bad of ["", "-1", "0.0000000001", "abc", "1e3", ".5"]) assert.equal(parseSol(bad), null, bad);
});
