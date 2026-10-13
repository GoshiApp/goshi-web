// Today's missions: three goals with a progress bar and the streak. Everything comes from this browser (lib/play/missions.ts).
import { today } from "../lib/play/missions.ts";

interface Strings { streak: string; best: string; done: string; allDone: string; none: string; text: Record<string, string> }
const root = document.querySelector<HTMLElement>("[data-missions]");
const t = JSON.parse(root?.querySelector("[data-missions-i18n]")?.textContent ?? "null") as Strings | null;
if (root && t) {
  const list = root.querySelector<HTMLUListElement>("[data-mission-list]")!;
  const streak = root.querySelector<HTMLElement>("[data-mission-streak]")!;
  const draw = () => {
    const d = today();
    list.textContent = "";
    for (const m of d.missions) {
      const li = document.createElement("li");
      li.className = `mission${m.done ? " is-done" : ""}`;
      const text = document.createElement("span");
      text.textContent = (t.text[m.mission.kind] ?? "").replace("{n}", String(m.mission.n));
      const bar = document.createElement("span");
      bar.className = "mission-bar";
      const fill = document.createElement("i");
      fill.style.width = `${Math.round((m.value / m.mission.n) * 100)}%`;
      bar.append(fill);
      const val = document.createElement("b");
      val.textContent = m.done ? t.done : `${m.value}/${m.mission.n}`;
      li.append(text, bar, val);
      list.append(li);
    }
    streak.textContent = `${t.streak.replace("{n}", String(d.streak))} · ${t.best.replace("{n}", String(d.best))}${d.allDone ? ` · ${t.allDone}` : ""}`;
  };
  draw();
  window.addEventListener("goshi-stats-change", draw);
}
