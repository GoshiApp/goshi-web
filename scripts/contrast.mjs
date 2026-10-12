// WCAG contrast check for the colour tokens in src/styles/global.css (AA: 4.5 text, 3 large/UI).
// Run: node scripts/contrast.mjs
const L = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const mix = (a, b, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const dark = { bg: "#070b1f", card: mix("#070b1f", "#ffffff", 0.07), solid: "#0f1738", ink: "#eef1ff", muted: "#aeb7dc", faint: "#8a94c4", goldText: "#f2c94c", sky: "#8ab4ff", mint: "#7be3c3", coral: "#ffa391", goldInk: "#1b1405", gold: "#f2c94c" };
const light = { bg: "#fbf8f0", card: "#ffffff", solid: "#ffffff", ink: "#161a3b", muted: "#484f75", faint: "#5c6490", goldText: "#7a4f00", sky: "#2b5fc7", mint: "#0b7a5b", coral: "#b3392a", goldInk: "#1b1405", gold: "#f2c94c" };
const hero = { bg: "#121a52", ink: "#ffffff", lead: "#c4cdf0", chip: "#d6dcf6", gold: "#f2c94c" };
const rows = [];
for (const [n, t] of [["dark", dark], ["light", light]]) {
  for (const bgk of ["bg", "card", "solid"]) {
    for (const fk of ["ink", "muted", "faint", "goldText", "sky", "mint", "coral"]) rows.push([`${n}: ${fk} on ${bgk}`, ratio(t[fk], t[bgk]), 4.5]);
  }
  rows.push([`${n}: gold button text`, ratio(t.goldInk, t.gold), 4.5]);
}
rows.push(["hero: white on night", ratio(hero.ink, hero.bg), 4.5], ["hero: lead on night", ratio(hero.lead, hero.bg), 4.5], ["hero: chips on night", ratio(hero.chip, hero.bg), 4.5], ["hero: gold on night", ratio(hero.gold, hero.bg), 4.5]);
let bad = 0;
for (const [name, r, min] of rows) {
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}  ${name}`);
}
process.exit(bad ? 1 : 0);
