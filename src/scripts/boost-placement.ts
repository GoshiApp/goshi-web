// Where the Boost button sits is the player's choice: left or right, small, normal or big. It can be changed from the lobby,
// from and the practice card, and it is remembered in this browser.
const KEY = "goshi-boost-layout";
type Layout = { side: "left" | "right"; size: number };
const SIZES = [64, 84, 108];

function load(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Layout> | null;
    if (v && (v.side === "left" || v.side === "right") && typeof v.size === "number" && SIZES.includes(v.size)) return { side: v.side, size: v.size };
  } catch { /* storage not available */ }
  return { side: "right", size: 84 };
}

let layout = load();
const apply = () => {
  const r = document.documentElement;
  r.classList.toggle("boost-left", layout.side === "left");
  r.style.setProperty("--boost-size", `${layout.size}px`);
  document.querySelectorAll<HTMLElement>("[data-boost-setup]").forEach(paint);
};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* private mode */ } apply(); };

function paint(box: HTMLElement) {
  const l = box.querySelector<HTMLElement>("[data-bs-left]"), r = box.querySelector<HTMLElement>("[data-bs-right]");
  l?.setAttribute("aria-pressed", String(layout.side === "left"));
  r?.setAttribute("aria-pressed", String(layout.side === "right"));
}

function build(label: { boost: string; left: string; right: string; bigger: string; smaller: string }): HTMLElement {
  const box = document.createElement("div");
  box.className = "boost-setup";
  box.setAttribute("data-boost-setup", "");
  const mk = (txt: string, attr: string, fn: () => void, aria?: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-glass btn-sm";
    b.textContent = txt;
    if (attr) b.setAttribute(attr, "");
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", fn);
    return b;
  };
  const span = document.createElement("span");
  span.textContent = label.boost;
  box.append(
    span,
    mk(label.left, "data-bs-left", () => { layout.side = "left"; save(); }),
    mk(label.right, "data-bs-right", () => { layout.side = "right"; save(); }),
    mk("−", "", () => { const i = SIZES.indexOf(layout.size); layout.size = SIZES[Math.max(0, i - 1)]; save(); }, label.smaller),
    mk("+", "", () => { const i = SIZES.indexOf(layout.size); layout.size = SIZES[Math.min(SIZES.length - 1, i + 1)]; save(); }, label.bigger),
  );
  paint(box);
  return box;
}

/** Puts the chooser into the lobby and the practice card. `label` comes from the page language. */
export function mountBoostSetup(label: { boost: string; left: string; right: string; bigger: string; smaller: string }): void {
  apply();
  const spots = [
    document.querySelector<HTMLElement>("#play-lobby-view .btn-row"),
    document.querySelector<HTMLElement>("#play-now .play-now-row"),
  ];
  for (const s of spots) if (s && !s.querySelector("[data-boost-setup]")) s.after(build(label));
}
