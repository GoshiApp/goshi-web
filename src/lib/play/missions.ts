// Daily missions: three small goals a day, the same for everyone on a given UTC day, tracked in this browser. They give
// cosmetic progress only (a streak of days unlocks skins). No money, no ranking, nothing sent to the server.

export type MissionKind = "games" | "peak" | "kills" | "top3" | "win";
export interface Mission { id: string; kind: MissionKind; n: number }
export interface Result { peak: number; kills: number; rank: number; total: number }

interface Progress { games: number; peak: number; kills: number; top3: number; win: number }
interface Store { day: string; p: Progress; doneAll: boolean; streak: number; best: number; lastFull: string }

const KEY = "goshi-missions";

/** The pool. Each entry is one mission with a fixed target. */
const POOL: readonly Mission[] = [
  { id: "games1", kind: "games", n: 1 },
  { id: "games3", kind: "games", n: 3 },
  { id: "peak60", kind: "peak", n: 60 },
  { id: "peak120", kind: "peak", n: 120 },
  { id: "peak200", kind: "peak", n: 200 },
  { id: "kills1", kind: "kills", n: 1 },
  { id: "kills2", kind: "kills", n: 2 },
  { id: "top3", kind: "top3", n: 1 },
  { id: "win", kind: "win", n: 1 },
];

export const dayKey = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Three missions of different kinds for a day: the same list for everyone, the same list all day. */
export function missionsFor(day: string): Mission[] {
  const out: Mission[] = [];
  const kinds = new Set<MissionKind>();
  let h = hash(`goshi-missions:${day}`);
  for (let guard = 0; out.length < 3 && guard < 60; guard++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const m = POOL[h % POOL.length];
    if (kinds.has(m.kind)) continue;
    kinds.add(m.kind);
    out.push(m);
  }
  return out;
}

const empty = (day: string, prev?: Store): Store => ({
  day, p: { games: 0, peak: 0, kills: 0, top3: 0, win: 0 }, doneAll: false,
  streak: prev?.streak ?? 0, best: prev?.best ?? 0, lastFull: prev?.lastFull ?? "",
});

function load(day: string): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Store | null;
    if (v && typeof v.day === "string" && v.p) return v.day === day ? v : empty(day, v);
  } catch { /* none yet */ }
  return empty(day);
}
const save = (s: Store) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };

export const valueOf = (m: Mission, p: Progress): number =>
  m.kind === "games" ? p.games : m.kind === "peak" ? p.peak : m.kind === "kills" ? p.kills : m.kind === "top3" ? p.top3 : p.win;

export interface Today { day: string; missions: { mission: Mission; value: number; done: boolean }[]; streak: number; best: number; allDone: boolean }

export function today(now: Date = new Date()): Today {
  const day = dayKey(now);
  const s = load(day);
  const missions = missionsFor(day).map((mission) => {
    const value = Math.min(valueOf(mission, s.p), mission.n);
    return { mission, value, done: value >= mission.n };
  });
  // A streak that missed yesterday is shown as broken (it restarts at the next full day).
  const y = dayKey(new Date(now.getTime() - 86_400_000));
  const alive = s.lastFull === day || s.lastFull === y;
  return { day, missions, streak: alive ? s.streak : 0, best: s.best, allDone: s.doneAll };
}

/** Adds one finished match. Returns the state after it (and whether this match completed the day). */
export function record(r: Result, now: Date = new Date()): { today: Today; completedNow: boolean } {
  const day = dayKey(now);
  const s = load(day);
  s.p.games += 1;
  s.p.peak = Math.max(s.p.peak, Math.round(r.peak));
  s.p.kills += Math.max(0, r.kills);
  if (r.rank >= 1 && r.rank <= 3 && r.total >= 4) s.p.top3 = 1;
  if (r.rank === 1 && r.total >= 4) s.p.win = 1;
  let completedNow = false;
  const all = missionsFor(day).every((m) => valueOf(m, s.p) >= m.n);
  if (all && !s.doneAll) {
    s.doneAll = true;
    completedNow = true;
    const y = dayKey(new Date(now.getTime() - 86_400_000));
    s.streak = s.lastFull === y ? s.streak + 1 : 1;
    s.lastFull = day;
    s.best = Math.max(s.best, s.streak);
  }
  save(s);
  return { today: today(now), completedNow };
}

export const bestStreak = (): number => load(dayKey()).best;
