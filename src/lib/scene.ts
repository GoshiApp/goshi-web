// The same picture the game draws, as SVG for the site: dark board with a grid, crypto bubbles with tickers, goshis with their
// glowing body and the same face, the red safe zone, the minimap and the top ten. Deterministic (no randomness at build).
import { COINS } from "./play/coins.ts";

const BG = "#070b22";
export interface Snake { hue: number; pts: [number, number][]; r: number; name?: string; mine?: boolean; saboteur?: boolean; angle: number }

const f = (n: number) => +n.toFixed(1);

function snake(s: Snake): string {
  const body = s.saboteur ? "#7a3a22" : `hsl(${s.hue} 92% 58%)`;
  const head = s.saboteur ? "#ffcfb8" : `hsl(${s.hue} 100% 90%)`;
  const glow = s.saboteur ? "rgba(255,122,74,0.24)" : `hsla(${s.hue} 100% 62% / 0.24)`;
  const glow2 = s.saboteur ? "rgba(255,122,74,0.10)" : `hsla(${s.hue} 100% 62% / 0.10)`;
  const d = "M" + s.pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L");
  const [hx, hy] = s.pts[0];
  const hr = s.r * 1.12;
  const fx = Math.cos(s.angle), fy = Math.sin(s.angle), sx = -fy, sy = fx;
  const eye = (side: number) => {
    const ex = hx + fx * hr * 0.25 + sx * hr * 0.42 * side, ey = hy + fy * hr * 0.25 + sy * hr * 0.42 * side;
    return `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(hr * 0.32)}" fill="#fff"/><circle cx="${f(ex + fx * hr * 0.12)}" cy="${f(ey + fy * hr * 0.12)}" r="${f(hr * 0.17)}" fill="#0b1130"/><circle cx="${f(ex + fx * hr * 0.17 - sx * hr * 0.05)}" cy="${f(ey + fy * hr * 0.17 - sy * hr * 0.05)}" r="${f(hr * 0.06)}" fill="#fff"/>`;
  };
  const blush = (side: number) => `<circle cx="${f(hx - fx * hr * 0.05 + sx * hr * 0.72 * side)}" cy="${f(hy - fy * hr * 0.05 + sy * hr * 0.72 * side)}" r="${f(hr * 0.16)}" fill="rgba(255,120,150,0.55)"/>`;
  const mx = hx + fx * hr * 0.66 + fx * hr * 0.1, my = hy + fy * hr * 0.66 + fy * hr * 0.1;
  const a0 = s.angle + Math.PI * 0.55, a1 = s.angle + Math.PI * 1.45, mr = hr * 0.17;
  const mouth = `<path d="M${f(mx + Math.cos(a0) * mr)} ${f(my + Math.sin(a0) * mr)} A${f(mr)} ${f(mr)} 0 0 1 ${f(mx + Math.cos(a1) * mr)} ${f(my + Math.sin(a1) * mr)}" fill="none" stroke="#0b1130" stroke-width="${f(hr * 0.07)}" stroke-linecap="round"/>`;
  const label = s.name
    ? `<text x="${f(hx)}" y="${f(hy - hr - 8)}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" stroke="rgba(5,8,25,0.9)" stroke-width="3" paint-order="stroke" font-family="system-ui,sans-serif">${s.name}</text>`
    : "";
  const dash = s.saboteur ? `<path d="${d}" fill="none" stroke="#ff7a4a" stroke-width="${f(2 * s.r + 7)}" stroke-linecap="butt" stroke-dasharray="12 9" stroke-linejoin="round"/>` : "";
  return `<g>
<path d="${d}" fill="none" stroke="${glow2}" stroke-width="${f(2 * s.r + 22)}" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="${glow}" stroke-width="${f(2 * s.r + 11)}" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="rgba(3,5,18,0.7)" stroke-width="${f(2 * s.r + 5)}" stroke-linecap="round" stroke-linejoin="round"/>
${dash}<path d="${d}" fill="none" stroke="${body}" stroke-width="${f(2 * s.r)}" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="${f(s.r * 0.7)}" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${f(hx)}" cy="${f(hy)}" r="${f(hr)}" fill="${head}" stroke="${s.mine ? "#ffffff" : "rgba(3,5,18,0.7)"}" stroke-width="${s.mine ? 3 : 1.8}"/>
${blush(-1)}${blush(1)}${eye(-1)}${eye(1)}${mouth}${label}</g>`;
}

function coin(i: number, x: number, y: number, r: number): string {
  const [t, c] = COINS[i % COINS.length];
  const fs = Math.max(5, Math.min(r * 0.95, (r * 2 * 0.86) / Math.max(2.2, t.length * 0.62)));
  return `<g><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.6)}" fill="${c}" opacity="0.18"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" stroke="rgba(255,255,255,0.9)" stroke-width="1.4"/><text x="${f(x)}" y="${f(y + fs * 0.35)}" text-anchor="middle" font-size="${f(fs)}" font-weight="800" fill="#fff" stroke="rgba(0,0,0,0.5)" stroke-width="1.6" paint-order="stroke" font-family="system-ui,sans-serif">${t}</text></g>`;
}

/** A path that bends like a goshi trail: from the head backwards. */
export function trail(x: number, y: number, angle: number, len: number, bend: number, n = 14): [number, number][] {
  const out: [number, number][] = [];
  let a = angle + Math.PI;
  let px = x, py = y;
  out.push([px, py]);
  for (let i = 1; i <= n; i++) {
    a += bend * Math.sin(i * 0.55);
    px += Math.cos(a) * (len / n);
    py += Math.sin(a) * (len / n);
    out.push([px, py]);
  }
  return out;
}

export interface SceneOpts { w?: number; h?: number; board?: boolean; hud?: boolean; lang?: "es" | "en" }

/** The whole arena picture. 640 x 480 unless told otherwise. */
export function arenaScene(o: SceneOpts = {}): string {
  const W = o.w ?? 640, H = o.h ?? 480;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grid: string[] = [];
  for (let x = 0; x <= W; x += 40) grid.push(`M${x} 0V${H}`);
  for (let y = 0; y <= H; y += 40) grid.push(`M0 ${y}H${W}`);
  const coins: string[] = [];
  const places: [number, number, number, number][] = [];
  for (let k = 0; k < 46; k++) {
    const tier = k % 9 === 0 ? 2 : k % 3 === 0 ? 1 : 0;
    const x = 24 + rnd() * (W - 48), y = 24 + rnd() * (H - 48);
    // keep the middle of the picture readable
    const dx = x - W * 0.42, dy = y - H * 0.55;
    if (Math.hypot(dx, dy) < 58) continue;
    const idx = tier === 2 ? 31 + (k % 2) : tier === 1 ? 16 + (k % 15) : k % 16;
    places.push([idx, x, y, tier === 2 ? 11 : tier === 1 ? 8 : 6]);
  }
  for (const [i, x, y, r] of places) coins.push(coin(i, x, y, r));
  const me = trail(W * 0.46, H * 0.5, -0.5, 250, 0.16);
  const blue = trail(W * 0.22, H * 0.24, 0.35, 190, -0.13);
  const sab = trail(W * 0.66, H * 0.8, -2.6, 160, 0.12);
  const rows = [["♛", "9xQe...Tp4k", 412], [2, "BZr3...mK7d", 366], [3, "H2vF...aQ9c", 301], [4, "4dWn...Lg2a", 244], [5, "Cs8P...xR5u", 207], [6, "Ft6Y...nD3e", 168], [7, "Ke9M...hV8z", 121]];
  const hud = o.hud === false ? "" : `
<g transform="translate(${W - 150} 12)">
  <rect width="138" height="138" fill="rgba(5,8,25,0.72)" stroke="rgba(255,255,255,0.35)"/>
  <circle cx="69" cy="69" r="52" fill="none" stroke="#ff3b4a" stroke-width="1.5"/>
  <circle cx="58" cy="60" r="30" fill="none" stroke="#fff" stroke-dasharray="3 3"/>
  <rect x="44" y="50" width="34" height="26" fill="none" stroke="rgba(255,255,255,0.45)"/>
  <circle cx="56" cy="62" r="3.2" fill="#fff"/><circle cx="34" cy="38" r="2" fill="hsl(200 100% 75%)"/><circle cx="92" cy="96" r="2" fill="#ff7a4a"/>
</g>
<g transform="translate(${W - 150} 156)">
  <rect width="138" height="${rows.length * 15 + 8}" rx="8" fill="rgba(5,8,25,0.6)"/>
  ${rows.map((r, i) => `<text x="8" y="${18 + i * 15}" font-size="10.5" font-weight="800" font-family="system-ui,sans-serif" fill="${i === 0 ? "#ffe08a" : "#fff"}">${r[0]}  ${r[1]}</text><text x="130" y="${18 + i * 15}" text-anchor="end" font-size="10.5" font-weight="800" font-family="system-ui,sans-serif" fill="${i === 0 ? "#ffe08a" : "#fff"}">${r[2]}</text>`).join("")}
</g>
<text x="16" y="${H - 38}" font-size="12" font-weight="700" font-family="system-ui,sans-serif" fill="#c4cdf0">${o.lang === "en" ? "Mass" : "Masa"}</text>
<text x="16" y="${H - 14}" font-size="28" font-weight="800" font-family="system-ui,sans-serif" fill="#fff">412</text>
<rect x="${W / 2 - 110}" y="${H - 22}" width="220" height="8" rx="4" fill="rgba(255,255,255,0.14)"/><rect x="${W / 2 - 110}" y="${H - 22}" width="150" height="8" rx="4" fill="#3ec7ff"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="false">
<defs><radialGradient id="zone-out" cx="50%" cy="50%" r="70%"><stop offset="0.55" stop-color="rgba(255,30,50,0)"/><stop offset="1" stop-color="rgba(255,30,50,0.55)"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="${BG}"/>
<path d="${grid.join("")}" stroke="rgba(120,150,255,0.09)" stroke-width="1" fill="none"/>
<rect width="${W}" height="${H}" fill="url(#zone-out)"/>
<circle cx="${W * 0.46}" cy="${H * 0.5}" r="${H * 0.46}" fill="none" stroke="#ff3b4a" stroke-width="2.5" opacity="0.9"/>
<circle cx="${W * 0.4}" cy="${H * 0.46}" r="${H * 0.3}" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="6 7" opacity="0.7"/>
${coins.join("\n")}
${snake({ hue: 205, pts: blue, r: 11, angle: 0.35, name: "BZr3...mK7d" })}
${snake({ hue: 20, pts: sab, r: 10, angle: -2.6, saboteur: true, name: "4dWn...Lg2a" })}
${snake({ hue: 48, pts: me, r: 13, angle: -0.5, mine: true, name: `9xQe...Tp4k (${o.lang === "en" ? "you" : "tú"})` })}
${hud}
</svg>`;
}

/** One goshi head, big, in the game's style: for the "meet the goshi" block. */
export function goshiHeadSvg(hue = 48): string {
  const pts: [number, number][] = [[96, 96], ...trail(96, 96, -0.35, 150, 0.2, 10).slice(1)];
  return `<svg viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="false">${snake({ hue, pts, r: 26, angle: -0.35, mine: true })}${coin(2, 190, 30, 10)}${coin(31, 28, 40, 12)}${coin(0, 200, 150, 8)}</svg>`;
}
