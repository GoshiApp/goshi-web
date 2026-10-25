// The skins in the quick start: right under the color, every skin the person may wear, drawn as itself by the game's painter.
// A tap wears it (the same choice as the profile page); a second tap goes back to the plain color.
import { ArenaPainter } from "../lib/play/arena-paint.ts";
import { SKINS, isUnlocked, readStats, selectSkin, selectedSkin } from "../lib/play/skins.ts";

const env = (import.meta as { env?: Record<string, string | undefined> }).env;
// The test sites open every skin to try (the founder skin stays the team's); goshi.app keeps them to be earned.
const ALL_OPEN = env?.PUBLIC_TARGET === "test";
const lists = [...document.querySelectorAll<HTMLElement>("[data-guest-skins]")];
for (const list of lists) {
  const painter = new ArenaPainter();
  const draw = () => {
    const st = readStats();
    const sel = selectedSkin();
    list.textContent = "";
    for (const s of SKINS) {
      if (!((ALL_OPEN && s.unlock.kind !== "founder") || isUnlocked(s, st, 0))) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = `guest-skin${sel === s.id ? " is-on" : ""}`;
      b.title = s.id;
      b.setAttribute("aria-label", s.id);
      b.setAttribute("aria-pressed", String(sel === s.id));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cv = document.createElement("canvas");
      cv.width = 56 * dpr; cv.height = 56 * dpr;
      const g = cv.getContext("2d");
      if (g) { g.fillStyle = "#0b0f1e"; g.fillRect(0, 0, cv.width, cv.height); painter.preview(g, s.style, 28 * dpr, 28 * dpr, 19 * dpr, 400); }
      b.append(cv);
      b.addEventListener("click", () => {
        selectSkin(sel === s.id ? null : s.id);
        window.dispatchEvent(new CustomEvent("goshi-skin-change"));
      });
      list.append(b);
    }
  };
  draw();
  // Every list on the page follows the same choice.
  window.addEventListener("goshi-skin-change", draw);
  // Bitcoin, Ethereum and Solana wear real logos that load a moment later: drawn again then.
  setTimeout(draw, 1500);
}
