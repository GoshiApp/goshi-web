// "This one is you": for the first seconds of a body, big arrows and a ring point at it, so nobody has to look for their head.
// Drawn in screen space. Used by the arena painter and by the minute of frenzy.

let label = "YOU";
/** The word shown over the head (the page gives its own language). */
export function setYouLabel(text: string): void {
  label = (text || "YOU").toLocaleUpperCase();
}

/** How long the marker is on screen, in seconds. */
export const YOU_MARKER_SECONDS = 4.5;

export function drawYouMarker(g: CanvasRenderingContext2D, x: number, y: number, r: number, ageSeconds: number, dpr: number): void {
  if (ageSeconds < 0 || ageSeconds > YOU_MARKER_SECONDS) return;
  const fade = ageSeconds > YOU_MARKER_SECONDS - 1.2 ? (YOU_MARKER_SECONDS - ageSeconds) / 1.2 : 1;
  const pulse = 0.5 + 0.5 * Math.sin(ageSeconds * 9);
  const base = Math.max(r * 2.2, 30 * dpr);
  g.save();
  g.globalAlpha = fade;
  g.lineJoin = "round";
  // The ring.
  g.strokeStyle = "rgba(5, 8, 25, 0.9)";
  g.lineWidth = 8 * dpr;
  g.beginPath(); g.arc(x, y, base * (1 + 0.08 * pulse), 0, Math.PI * 2); g.stroke();
  g.strokeStyle = "#ffd447";
  g.lineWidth = 4.5 * dpr;
  g.beginPath(); g.arc(x, y, base * (1 + 0.08 * pulse), 0, Math.PI * 2); g.stroke();
  // Eight arrows from outside, pointing at the head, breathing in and out.
  const reach = base * (1.75 + 0.35 * pulse);
  const size = Math.max(11 * dpr, base * 0.28);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const ax = x + Math.cos(a) * reach;
    const ay = y + Math.sin(a) * reach;
    const dx = -Math.cos(a), dy = -Math.sin(a);
    const px = -dy, py = dx;
    g.beginPath();
    g.moveTo(ax + dx * size, ay + dy * size);
    g.lineTo(ax - dx * size * 0.2 + px * size * 0.75, ay - dy * size * 0.2 + py * size * 0.75);
    g.lineTo(ax - dx * size * 0.2 - px * size * 0.75, ay - dy * size * 0.2 - py * size * 0.75);
    g.closePath();
    g.fillStyle = "#ffd447";
    g.strokeStyle = "rgba(5, 8, 25, 0.95)";
    g.lineWidth = 3 * dpr;
    g.stroke();
    g.fill();
  }
  // The word, above.
  g.textAlign = "center";
  g.textBaseline = "bottom";
  const px = Math.round(Math.max(26 * dpr, base * 0.7));
  g.font = `900 ${px}px system-ui, sans-serif`;
  g.lineWidth = Math.max(5, px * 0.2);
  g.strokeStyle = "rgba(5, 8, 25, 0.95)";
  g.strokeText(label, x, y - reach - size * 1.2);
  g.fillStyle = "#ffd447";
  g.fillText(label, x, y - reach - size * 1.2);
  g.restore();
}
