// Share buttons: the native share sheet when the device has one, copy, X, Telegram and WhatsApp. The shared address carries
// the connected wallet as `?ref=` so people who arrive through it are credited to the person who shared.
import { manager, subscribe } from "../lib/play/wallet-session.ts";

const root = document.querySelector<HTMLElement>("[data-share]");
const cfg = JSON.parse(root?.querySelector("[data-share-data]")?.textContent ?? "null") as { lang: string; text: string; copied: string; home: string } | null;
if (root && cfg) {
  const note = root.querySelector<HTMLElement>("[data-share-note]")!;
  const link = (): string => {
    const s = manager.current;
    const w = s.status === "connected" ? s.address : null;
    return w ? `${cfg.home}?ref=${w}` : cfg.home;
  };
  const paint = () => {
    const u = encodeURIComponent(link()), t = encodeURIComponent(cfg.text);
    root.querySelector<HTMLAnchorElement>("[data-share-x]")!.href = `https://twitter.com/intent/tweet?text=${t}&url=${u}`;
    root.querySelector<HTMLAnchorElement>("[data-share-tg]")!.href = `https://t.me/share/url?url=${u}&text=${t}`;
    root.querySelector<HTMLAnchorElement>("[data-share-wa]")!.href = `https://wa.me/?text=${t}%20${u}`;
  };
  paint();
  subscribe(paint);
  const native = root.querySelector<HTMLButtonElement>("[data-share-native]")!;
  if (typeof navigator.share === "function") {
    native.hidden = false;
    native.addEventListener("click", () => { void navigator.share({ title: "Goshi", text: cfg.text, url: link() }).catch(() => undefined); });
  }
  root.querySelector<HTMLButtonElement>("[data-share-copy]")!.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link()); note.textContent = cfg.copied; }
    catch { note.textContent = link(); }
  });
}
