// A picture of the result for sharing: the goshi in the player's color, the place and the mass, drawn on a canvas.
// 1200 x 630 (the size social sites show). No prize amounts and no promises on it.

export interface ResultImage {
  rank: number;
  of: number;
  mass: number;
  hue: number;
  placeLabel: string;
  massLabel: string;
  url: string;
}

export function drawResultImage(g: CanvasRenderingContext2D, o: ResultImage): void {
  const W = 1200, H = 630;
  const bg = g.createRadialGradient(W * 0.75, H * 0.3, 40, W * 0.5, H * 0.5, W * 0.8);
  bg.addColorStop(0, "#24307a");
  bg.addColorStop(0.5, "#121a52");
  bg.addColorStop(1, "#070b1f");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // Soft pellets.
  const dots: [number, number, number, string][] = [[1090, 90, 22, "#7be3c3"], [980, 540, 14, "#8ab4ff"], [140, 120, 12, "#8ab4ff"], [60, 520, 18, "#f7d46a"]];
  for (const [x, y, r, c] of dots) {
    g.fillStyle = c;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // The goshi, with a body trail that has grown.
  const cx = 860, cy = 320, R = 170;
  const body = `hsl(${o.hue} 92% 58%)`;
  const head = `hsl(${o.hue} 100% 90%)`;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = `hsla(${o.hue} 100% 62% / 0.25)`;
  g.lineWidth = R * 1.1;
  g.beginPath();
  g.moveTo(cx, cy);
  g.bezierCurveTo(cx + 150, cy + 190, cx + 330, cy + 120, cx + 330, cy - 40);
  g.stroke();
  g.strokeStyle = body;
  g.lineWidth = R * 0.8;
  g.beginPath();
  g.moveTo(cx, cy);
  g.bezierCurveTo(cx + 150, cy + 190, cx + 330, cy + 120, cx + 330, cy - 40);
  g.stroke();
  g.fillStyle = head;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  for (const side of [-1, 1]) {
    const ex = cx + side * R * 0.38, ey = cy - R * 0.1;
    g.fillStyle = "#ffffff";
    g.beginPath(); g.arc(ex, ey, R * 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0c1334";
    g.beginPath(); g.arc(ex + R * 0.06, ey + R * 0.04, R * 0.16, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath(); g.arc(ex + R * 0.1, ey - R * 0.02, R * 0.055, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,110,150,0.6)";
    g.beginPath(); g.arc(cx + side * R * 0.68, cy + R * 0.3, R * 0.15, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = "#0c1334";
  g.lineWidth = R * 0.07;
  g.beginPath();
  g.arc(cx, cy + R * 0.28, R * 0.2, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
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
