// Focus mode of the play page: only the game (and the one tick box that must be accepted) is on screen.
// It is on while a match is on (the arena shell sets html.match-lock) and when the page was opened from an invitation link
// (?room= or ?duel=). Everything else is one tap away ("Show everything"). Nothing is removed: elements are only hidden.

const HIDDEN = "focus-hidden";
const KEEP_LIVE = "script, style, noscript, .invite-sheet, .match-toast, .match-return, .focus-exit, [data-rotate], [data-tuto], dialog";
// With the invitation only the header stays (wallet chip). During a match nothing leads out of the page: no menu, no language switch.
const KEEP_HEADER = "header";

export function startPlayFocus(label: string): void {
  const arena = document.getElementById("realtime-arena");
  if (!arena) return;
  const gate = document.getElementById("play-gate");
  const params = new URLSearchParams(location.search);
  let invited = params.has("room") || params.has("duel");
  const root = document.documentElement;

  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "btn btn-glass btn-sm focus-exit";
  exit.textContent = label;
  exit.hidden = true;
  exit.addEventListener("click", () => {
    invited = false;
    params.delete("room");
    params.delete("duel");
    const rest = params.toString();
    history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
    sync();
  });
  document.body.append(exit);

  const apply = (on: boolean) => {
    document.querySelectorAll("." + HIDDEN).forEach((n) => n.classList.remove(HIDDEN));
    root.classList.toggle("play-focus", on);
    if (!on) return;
    const keepers: Element[] = [arena, ...(gate && !root.classList.contains("match-lock") ? [gate] : [])];
    const kept = new Set<Element>();
    for (const k of keepers) for (let n: Element | null = k; n && n !== document.documentElement; n = n.parentElement) kept.add(n);
    for (const a of kept) {
      if (keepers.includes(a)) continue;
      for (const ch of Array.from(a.children)) {
        if (kept.has(ch) || ch.matches(KEEP_LIVE) || (!root.classList.contains("match-lock") && ch.matches(KEEP_HEADER))) continue;
        ch.classList.add(HIDDEN);
      }
    }
  };

  let last: boolean | null = null;
  let lastMatch: boolean | null = null;
  let applied: string | null = null;
  function sync() {
    const matching = root.classList.contains("match-lock");
    // A match that ended ends the invitation mode too: the person has played, the page is theirs again.
    if (lastMatch && !matching) invited = false;
    lastMatch = matching;
    const on = matching || invited;
    const key = `${on}:${matching}`;
    if (key !== applied) { applied = key; last = on; apply(on); }
    exit.hidden = !(on && !matching);
  }
  setInterval(sync, 400);
  sync();
}
