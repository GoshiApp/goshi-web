// Shows the skin the player has chosen next to the practice button (the choice itself is made on the profile page).
import { selectedSkin } from "../lib/play/skins.ts";

const box = document.querySelector<HTMLElement>("[data-names]");
const out = box?.querySelector<HTMLElement>("[data-skin-current]");
if (box && out) {
  const names = JSON.parse(box.dataset.names ?? "{}") as Record<string, string>;
  const paint = () => { out.textContent = names[selectedSkin() ?? "classic"] ?? names.classic ?? "-"; };
  paint();
  window.addEventListener("goshi-skin-change", paint);
  window.addEventListener("storage", paint);
}
