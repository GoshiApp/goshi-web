// A picture of the result for sharing: the goshi in the player's color, the place and the mass, drawn on a canvas.
// 1200 x 630 (the size social sites show). No prize amounts and no promises on it.

export interface ResultImage {
  rank: number;
  of: number;
  mass: number;
  hue: number;
  /** The skin the player wears: overrides the plain hue (stripes, head color, glow). */
  skin?: { body: string; alt?: string; head: string; rim: string } | null;
  /** One line under the mass, like the streak. */
  footer?: string;
  placeLabel: string;
  massLabel: string;
  url: string;
}

export function drawResultImage(g: CanvasRenderingContext2D, o: ResultImage): void {
  const W = 1200, H = 630;
  // The game's own board: dark, a grid, a red edge, crypto bubbles and the goshi with its glowing body and the same face.
  g.fillStyle = "#070b22";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(120,150,255,0.10)";
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += 60) { g.moveTo(x, 0); g.lineTo(x, H); }
  for (let y = 0; y <= H; y += 60) { g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();
  const edge = g.createRadialGradient(W * 0.72, H * 0.5, H * 0.35, W * 0.72, H * 0.5, W * 0.62);
  edge.addColorStop(0, "rgba(255,30,50,0)");
  edge.addColorStop(1, "rgba(255,30,50,0.45)");
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  const bubbles: [number, number, number, string, string][] = [
    [1090, 90, 24, "#9945ff", "SOL"], [980, 540, 16, "#f3ba2f", "BNB"], [610, 70, 14, "#c2a633", "DOGE"], [640, 560, 18, "#f7931a", "BTC"],
    [1120, 330, 14, "#4c9a2a", "PEPE"], [760, 120, 12, "#e5811f", "SHIB"], [1000, 200, 12, "#627eea", "ETH"], [720, 520, 12, "#f5a623", "BONK"],
  ];
  for (const [x, y, r, c, t] of bubbles) {
    g.globalAlpha = 0.2;
    g.fillStyle = c;
    g.beginPath(); g.arc(x, y, r * 2.4, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = c;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = "#fff";
    g.font = `800 ${Math.round(Math.min(r * 0.9, (r * 1.7) / Math.max(2, t.length * 0.6)))}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(t, x, y + 1);
  }
  g.textAlign = "left";
  const hue = o.hue;
  const bodyCol = o.skin?.body ?? `hsl(${hue} 92% 58%)`;
  const headCol = o.skin?.head ?? `hsl(${hue} 100% 90%)`;
  const R = 78;
  const hx = 860, hy = 300;
  const path = () => { g.beginPath(); g.moveTo(hx, hy); g.bezierCurveTo(hx - 160, hy + 190, hx - 380, hy + 130, hx - 470, hy + 20); };
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = `hsla(${hue} 100% 62% / 0.12)`; g.lineWidth = 2 * R * 0.62 + 40; path(); g.stroke();
  g.strokeStyle = `hsla(${hue} 100% 62% / 0.26)`; g.lineWidth = 2 * R * 0.62 + 20; path(); g.stroke();
  g.strokeStyle = "rgba(3,5,18,0.7)"; g.lineWidth = 2 * R * 0.62 + 10; path(); g.stroke();
  g.strokeStyle = bodyCol; g.lineWidth = 2 * R * 0.62; path(); g.stroke();
  if (o.skin?.alt) {
    g.lineCap = "butt"; g.setLineDash([R * 0.34, R * 0.6]); g.strokeStyle = o.skin.alt; g.lineWidth = 2 * R * 0.55; path(); g.stroke();
    g.setLineDash([]); g.lineCap = "round";
  }
  g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = R * 0.44; path(); g.stroke();
  // Head, facing right and a little up: the same proportions as the game's face.
  const ang = -0.3, fx = Math.cos(ang), fy = Math.sin(ang), sx = -fy, sy = fx;
  g.fillStyle = headCol;
  g.beginPath(); g.arc(hx, hy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#ffffff"; g.lineWidth = 6; g.stroke();
  g.fillStyle = "rgba(255,120,150,0.55)";
  for (const side of [-1, 1]) { g.beginPath(); g.arc(hx - fx * R * 0.05 + sx * R * 0.72 * side, hy - fy * R * 0.05 + sy * R * 0.72 * side, R * 0.16, 0, Math.PI * 2); g.fill(); }
  for (const side of [-1, 1]) {
    const ex = hx + fx * R * 0.25 + sx * R * 0.42 * side, ey = hy + fy * R * 0.25 + sy * R * 0.42 * side;
    g.fillStyle = "#fff"; g.beginPath(); g.arc(ex, ey, R * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0b1130"; g.beginPath(); g.arc(ex + fx * R * 0.12, ey + fy * R * 0.12, R * 0.17, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(ex + fx * R * 0.17 - sx * R * 0.05, ey + fy * R * 0.17 - sy * R * 0.05, R * 0.06, 0, Math.PI * 2); g.fill();
  }
  const mx = hx + fx * R * 0.76, my = hy + fy * R * 0.76;
  g.strokeStyle = "#0b1130"; g.lineWidth = R * 0.07; g.lineCap = "round";
  g.beginPath(); g.arc(mx, my, R * 0.17, ang + Math.PI * 0.55, ang + Math.PI * 1.45); g.stroke();
  // Text.
  g.textBaseline = "alphabetic";
  g.fillStyle = "#ffffff";
  g.font = "800 64px Helvetica, Arial, sans-serif";
  g.fillText("Goshi", 70, 120);
  g.fillStyle = "#c4cdf0";
  g.font = "600 34px Helvetica, Arial, sans-serif";
  g.fillText(o.placeLabel, 70, 250);
  g.fillStyle = "#f2c94c";
  g.font = "900 150px Helvetica, Arial, sans-serif";
  g.fillText(`#${o.rank}`, 70, 400);
  const rankWidth = g.measureText(`#${o.rank}`).width;
  g.fillStyle = "#ffffff";
  g.font = "700 44px Helvetica, Arial, sans-serif";
  g.fillText(`/ ${o.of}`, 70 + rankWidth + 16, 400);
  g.fillStyle = "#c4cdf0";
  g.font = "600 34px Helvetica, Arial, sans-serif";
  g.fillText(`${o.massLabel}: ${Math.round(o.mass)}`, 70, 470);
  if (o.footer) {
    g.fillStyle = "#f2c94c";
    g.font = "700 30px Helvetica, Arial, sans-serif";
    g.fillText(o.footer, 70, 520);
  }
  g.fillStyle = "#7be3c3";
  g.font = "800 34px Helvetica, Arial, sans-serif";
  g.fillText(o.url, 70, 570);
}

export function renderResultBlob(o: ResultImage): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 630;
      const g = c.getContext("2d");
      if (!g) { resolve(null); return; }
      drawResultImage(g, o);
      c.toBlob((b) => resolve(b), "image/png");
    } catch {
      resolve(null);
    }
  });
}
