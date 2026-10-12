// Launch window: ticks the countdown and copies the contract address. Does nothing when the banner is absent.
export {};
const root = document.querySelector<HTMLElement>("[data-launch]");
if (root) {
  const endsAt = Date.parse(root.dataset.endsAt ?? "");
  const pad = (n: number) => String(n).padStart(2, "0");
  const set = (u: string, v: string) => {
    const el = root.querySelector<HTMLElement>(`[data-u="${u}"]`);
    if (el) el.textContent = v;
  };
  const tick = () => {
    if (Number.isNaN(endsAt)) return true;
    const left = Math.max(0, endsAt - Date.now());
    if (left === 0) {
      root.querySelector("[data-launch-clock]")?.remove();
      const title = root.querySelector<HTMLElement>("[data-launch-title]");
      if (title) title.textContent = root.dataset.ended ?? "";
      return true;
    }
    const s = Math.floor(left / 1000);
    set("d", String(Math.floor(s / 86400)));
    set("h", pad(Math.floor((s % 86400) / 3600)));
    set("m", pad(Math.floor((s % 3600) / 60)));
    set("s", pad(s % 60));
    return false;
  };
  if (!tick()) {
    const id = window.setInterval(() => {
      if (tick()) window.clearInterval(id);
    }, 1000);
  }
  const btn = root.querySelector<HTMLButtonElement>("[data-launch-copy]");
  btn?.addEventListener("click", async () => {
    const text = root.querySelector("[data-launch-ca]")?.textContent ?? "";
    const label = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = btn.dataset.copied ?? label;
      window.setTimeout(() => (btn.textContent = label), 1800);
    } catch {
      // Clipboard blocked: the address is selectable on the page.
    }
  });
}
