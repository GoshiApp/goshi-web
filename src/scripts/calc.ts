// The royale and VS calculators. Uses the same integer math as the contract (src/lib/play/split.ts).
import { formatLamports, parseSol } from "../lib/play/amounts.ts";
import { royalePot, settleRoyale, settleVs } from "../lib/play/split.ts";

const feeEl = document.getElementById("calc-fee") as HTMLInputElement | null;
const paidEl = document.getElementById("calc-paid") as HTMLInputElement | null;
const vsFeeEl = document.getElementById("calc-vs-fee") as HTMLInputElement | null;
const vsPlayersEl = document.getElementById("calc-vs-players") as HTMLInputElement | null;
const i18nEl = document.getElementById("calc-i18n");

if (feeEl && paidEl && vsFeeEl && vsPlayersEl && i18nEl && document.getElementById("calc-sab")) {
  const t = JSON.parse(i18nEl.textContent ?? "{}") as { locale: string; invalid: { royale: string; vs: string }; kinds: { sol: string; goshi: string; none: string } };
  const fmt = (u: bigint) => formatLamports(u, { locale: t.locale });
  const set = (sel: string, text: string) => document.querySelectorAll<HTMLElement>(sel).forEach((e) => { e.textContent = text; });
  const royaleErr = document.getElementById("calc-royale-error")!;
  const vsErr = document.getElementById("calc-vs-error")!;
  const sabEl = document.getElementById("calc-sab") as HTMLInputElement;
  const passEl = document.getElementById("calc-pass") as HTMLInputElement;

  const royaleUpdate = () => {
    const fee = parseSol(feeEl.value);
    const n = Number(paidEl.value);
    const sab = Number(sabEl.value);
    const ok = fee !== null && fee > 0n && Number.isInteger(n) && n >= 3 && n <= 10 && Number.isInteger(sab) && sab >= 0 && sab <= 3;
    const pot = ok ? royalePot(fee, n) : null;
    // A pass seat is one paid seat nobody paid for: the room holds one entry less than its nominal pot.
    const cash = pot === null ? null : passEl.checked && fee !== null ? pot - fee : pot;
    const s = pot === null || cash === null ? null : settleRoyale(pot, cash, sab);
    royaleErr.hidden = s !== null;
    royaleErr.textContent = s ? "" : t.invalid.royale;
    if (!s || pot === null) return;
    const v: Record<string, bigint> = {
      first: s.prizes[0], second: s.prizes[1], third: s.prizes[2], saboteurEach: s.saboteurEach, saboteurPool: s.saboteurPool,
      burn: s.buybackBurn, infra: s.infra, liquidity: s.liquidity, jackpot: s.rakeJackpot,
      prizePool: s.prizePool, rake: s.rake, pot, cash: s.cash,
    };
    for (const [k, x] of Object.entries(v)) set(`[data-royale="${k}"]`, fmt(x));
    document.querySelectorAll<HTMLElement>('[data-row="cash"]').forEach((tr) => { tr.hidden = !passEl.checked; });
  };
  const vsUpdate = () => {
    const fee = parseSol(vsFeeEl.value);
    const n = Number(vsPlayersEl.value);
    const s = fee !== null && fee > 0n && Number.isInteger(n) ? settleVs(fee, n) : null;
    vsErr.hidden = s !== null;
    vsErr.textContent = s ? "" : t.invalid.vs;
    if (!s) return;
    const v: Record<string, bigint> = {
      winner: s.winner, loser: s.loser, burn: s.buybackBurn, infra: s.infra, liquidity: s.liquidity, jackpot: s.rakeJackpot, rake: s.rake, pot: s.pot,
    };
    for (const [k, x] of Object.entries(v)) set(`[data-vs="${k}"]`, fmt(x));
  };
  for (const el of [feeEl, paidEl, sabEl, passEl]) { el.addEventListener("input", royaleUpdate); el.addEventListener("change", royaleUpdate); }
  vsFeeEl.addEventListener("input", vsUpdate);
  vsPlayersEl.addEventListener("input", vsUpdate);
  royaleUpdate();
}
