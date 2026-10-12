// Small behaviors for every page: mobile menu, the "More" menu and the theme toggle.
const root = document.documentElement;

const menuBtn = document.getElementById("menu-btn");
const nav = document.getElementById("site-nav");
menuBtn?.addEventListener("click", () => {
  const open = nav?.classList.toggle("open") ?? false;
  menuBtn.setAttribute("aria-expanded", String(open));
});

const more = document.querySelector<HTMLElement>("[data-more]");
const moreBtn = more?.querySelector<HTMLButtonElement>(".more-btn");
function setMore(open: boolean) {
  more?.classList.toggle("open", open);
  moreBtn?.setAttribute("aria-expanded", String(open));
}
moreBtn?.addEventListener("click", () => setMore(!more?.classList.contains("open")));
document.addEventListener("click", (e) => {
  if (more && !more.contains(e.target as Node)) setMore(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  setMore(false);
  if (nav?.classList.contains("open")) {
    nav.classList.remove("open");
    menuBtn?.setAttribute("aria-expanded", "false");
    menuBtn?.focus();
  }
});

document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const dark = root.getAttribute("data-theme") !== "light";
  const next = dark ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("goshi-theme", next);
  } catch {
    // Private mode or blocked storage: the choice just lasts for this visit.
  }
});
