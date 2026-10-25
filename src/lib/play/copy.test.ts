import { test } from "node:test";
import assert from "node:assert/strict";
import { play as en, playPage as enPage } from "../../content/en/play.ts";
import { play as es, playPage as esPage } from "../../content/es/play.ts";
import { PRIZE_FIRST_PCT, PRIZE_POOL_PCT, PRIZE_SECOND_PCT, RAKE_BURN_PCT, RAKE_INFRA_PCT, RAKE_LIQ_PCT, RAKE_PCT, SABOTEUR_POOL_PCT, VS_LOSER_KEEPS_PCT } from "./split.ts";

// Same keys, same array lengths, strings everywhere: both languages have identical structure.
function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]));
  return typeof v;
}

test("English and Spanish play copy have identical structure", () => {
  assert.deepEqual(shape(en), shape(es));
  assert.deepEqual(shape(enPage), shape(esPage));
});

test("placeholders match between languages", () => {
  const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  const walk = (a: unknown, b: unknown, path: string) => {
    if (typeof a === "string" && typeof b === "string") assert.equal(holes(a), holes(b), path);
    else if (a && typeof a === "object" && b && typeof b === "object") for (const k of Object.keys(a)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
  };
  walk(en, es, "play");
});

test("the percentages written in the copy are the ones in the contract math", () => {
  const num = (n: bigint | number) => new RegExp(`(^|[^\\d.,])${String(n).replace(".", "[.,]")}%`);
  const pool = PRIZE_POOL_PCT;
  const ofPot = (pct: bigint, of: bigint) => Number((pool * pct * 10n) / 100n) / 10 * 1; // percent of the pot, one decimal
  // The money rules differ by network: the mainnet text ([[m:]]) follows the place prizes, the test text ([[t:]]) pays by bag.
  const mainnet = (x: string) => x.replace(/\[\[t:[\s\S]*?\]\]/g, "").replace(/\[\[m:([\s\S]*?)\]\]/g, "$1");
  const testnet = (x: string) => x.replace(/\[\[m:[\s\S]*?\]\]/g, "").replace(/\[\[t:([\s\S]*?)\]\]/g, "$1");
  for (const raw of [en, es]) {
    assert.match(testnet(raw.pot.totals.prizePool.share), /97%/);
    const l = JSON.parse(JSON.stringify(raw), (_k, v) => (typeof v === "string" ? mainnet(v) : v)) as typeof raw;
    const r = l.pot.rows;
    const t = JSON.parse(JSON.stringify(raw), (_k, v) => (typeof v === "string" ? testnet(v) : v)) as typeof raw;
    assert.match(r.first.share, num(PRIZE_FIRST_PCT));
    assert.match(r.second.share, num(PRIZE_SECOND_PCT));
    assert.match(r.third.share, num(100n - PRIZE_FIRST_PCT - PRIZE_SECOND_PCT));
    assert.match(t.pot.rows.burn.share, num(RAKE_BURN_PCT));
    assert.match(t.pot.rows.infra.share, num(RAKE_INFRA_PCT));
    assert.match(t.pot.rows.liquidity.share, num(RAKE_LIQ_PCT));
    assert.match(t.pot.rows.jackpot.share, num(100n - RAKE_BURN_PCT - RAKE_INFRA_PCT - RAKE_LIQ_PCT));
    assert.match(r.saboteurs.share, num(SABOTEUR_POOL_PCT));
    assert.match(t.pot.totals.rake.share, num(RAKE_PCT));
    assert.match(t.pot.vsNote, num(VS_LOSER_KEEPS_PCT));
    assert.match(l.pot.saboteurNote, num(SABOTEUR_POOL_PCT));
    assert.ok(!/0[.,]2%/.test(l.pot.saboteurNote), "the old 0.2% cap is gone");
    assert.ok(l.pot.passNote.length > 80);
    assert.equal(PRIZE_POOL_PCT + SABOTEUR_POOL_PCT + RAKE_PCT, 100n);
  }
  void ofPot;
  // The mandatory notice, word for word.
  assert.equal(
    en.entry.saboteurNotice.replace(/\[\[t:[\s\S]*?\]\]/g, "").replace(/\[\[m:([\s\S]*?)\]\]/g, "$1"),
    "The arena includes up to 3 obstacle players (saboteurs). Saboteurs do not compete and cannot win: they are not on the podium, and they share 2% of the pot equally. A room starts only when it has 10 paid players and its saboteurs.",
  );
  assert.equal(
    es.entry.saboteurNotice.replace(/\[\[t:[\s\S]*?\]\]/g, "").replace(/\[\[m:([\s\S]*?)\]\]/g, "$1"),
    "La arena incluye hasta 3 jugadores de obstáculo (saboteadores). Los saboteadores no compiten y no pueden ganar: no están en el podio y se reparten el 2% del pozo por igual. Una sala empieza solo cuando tiene 10 jugadores de pago y sus saboteadores.",
  );
});

test("the pre-entry modal explains the super pot, the rake, VS mode and that entries are final, in both languages", () => {
  for (const l of [en, es]) {
    for (const k of ["superPotText", "superPotTrust", "rakeText", "vsText", "finalText"] as const) assert.ok(l.entry[k].length > 40, k);
    assert.match(l.entry.superPotText, /1%/);
    assert.match(l.entry.vsText, /5/);
    assert.match(l.entry.vsText, /80%/);
    assert.match(l.entry.finalText, /SOL/);
  }
});

test("the boosts are gone from the play copy", () => {
  // The only "boost" left is the speed boost of the arena (a button that costs a little mass), never a paid item.
  for (const l of [en, es]) assert.ok(!/(buy|buyBoost|comprar)/i.test(JSON.stringify(l.live.game)));
  assert.equal(Object.keys(en).includes("boosts"), false);
  assert.equal(Object.keys(es).includes("boosts"), false);
});

test("every contract error that a person can hit has a sentence", () => {
  for (const l of [en, es]) {
    for (const k of ["noWallet", "rejected", "notEnoughGoshi", "insufficientSol", "noTokenAccount", "roomGone", "notWaiting", "roomFull", "alreadyJoined", "wrongConfig", "expired", "network", "unknown"]) {
      assert.ok(l.errors[k as keyof typeof l.errors].length > 10, k);
    }
  }
});

test("no em dashes in the play copy", () => {
  assert.ok(!JSON.stringify([en, es, enPage, esPage]).includes(String.fromCharCode(0x2014)));
});
