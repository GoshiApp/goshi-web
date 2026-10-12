// The quick match buttons of the home page: "$1 about 0.007 SOL". The entry options come from the game server's hello
// (read with a short anonymous socket, cached for a minute). Until they are known the buttons show a placeholder.
import { fetchFeeOptions } from "../lib/play/fee-options.ts";
import { feeLabel } from "../lib/play/quick.ts";

const box = document.querySelector<HTMLElement>("[data-quick-hero]");
if (box?.dataset.server) {
  const about = box.dataset.about ?? "about {sol} {unit}";
  const unit = box.dataset.unit ?? "SOL";
  const play = box.dataset.play ?? "/";
  const aria = box.dataset.aria ?? "{usd}";
  const locale = document.documentElement.lang === "es" ? "es" : "en-US";
  void fetchFeeOptions(box.dataset.server).then((info) => {
    const links = [...box.querySelectorAll<HTMLAnchorElement>(".quick-btn")];
    if (!info) {
      // The server could not be reached: the buttons still lead to the play page, without an amount.
      links.forEach((a) => { const s = a.querySelector("[data-sol]"); if (s) s.textContent = ""; });
      return;
    }
    links.forEach((a, i) => {
      const opt = info.options[i];
      if (!opt) { a.hidden = true; return; }
      const l = feeLabel(opt, locale);
      const strong = a.querySelector("strong");
      const small = a.querySelector("[data-sol]");
      if (strong) strong.textContent = l.usd;
      if (small) small.textContent = about.replace("{sol}", l.sol).replace("{unit}", unit);
      a.href = `${play}?quick=${opt.usd}`;
      a.setAttribute("aria-label", aria.replace("{usd}", l.usd));
    });
  });
}
