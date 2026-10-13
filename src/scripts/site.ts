import { captureReferral } from "../lib/play/referral.ts";

captureReferral();
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

// The header and the numbers bar under it stay at the top while scrolling: the bar sticks right below the header, whatever
// height the header has on this screen.
{
  const header = document.querySelector<HTMLElement>(".site-header");
  const apply = () => {
    if (header) document.documentElement.style.setProperty("--header-h", `${header.getBoundingClientRect().height}px`);
  };
  apply();
  if (header && typeof ResizeObserver !== "undefined") new ResizeObserver(apply).observe(header);
  window.addEventListener("resize", apply);
}

// ?team=1 marks this browser as one of the team's: its visits are never counted. ?team=0 undoes it.
try {
  const t = new URLSearchParams(location.search).get("team");
  if (t === "1") localStorage.setItem("goshi-team", "1");
  else if (t === "0") localStorage.removeItem("goshi-team");
} catch { /* private mode */ }
