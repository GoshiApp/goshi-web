// Why a player died, in one plain line. Pure (no DOM).
//
// The server sends only `by`: the wallet that owns what was touched, or "zone" / "wall". It does not say whether the
// victim ran into a body or lost a head to head. The rules make it unambiguous enough to tell from the positions:
// a head that touches another player's BODY dies (so the victim is always the one who ran into it), and in a head to
// head the lighter one dies (equal masses both die). So a death is "head to head" only when the two heads were touching
// and the other one was at least as heavy; otherwise it is "ran into <by>'s body". Nobody is ever told that someone
// crashed into them: a body is solid and only the head that touches it dies.

import type { DeathEvent } from "./protocol.ts";

export type DeathCause =
  | { kind: "body"; by: string }
  | { kind: "head"; by: string }
  | { kind: "zone" }
  | { kind: "wall" };

export interface Body {
  m: number;
  r: number;
  head: readonly [number, number];
}

/** Slack on the head to head distance: the server rounds positions and a tick moves a head by a few units. */
export const HEAD_TOUCH_SLACK = 4;

export function classifyDeath(ev: DeathEvent, victim: Body | undefined, killer: Body | undefined): DeathCause {
  if (ev.by === "zone") return { kind: "zone" };
  if (ev.by === "wall") return { kind: "wall" };
  if (victim && killer) {
    const d = Math.hypot(victim.head[0] - killer.head[0], victim.head[1] - killer.head[1]);
    if (d <= victim.r + killer.r + HEAD_TOUCH_SLACK && killer.m >= victim.m) return { kind: "head", by: ev.by };
  }
  return { kind: "body", by: ev.by };
}

export interface DeathStrings {
  /** "You ran into {name}'s body" */
  youBody: string;
  /** "Head to head with {name} (lighter dies)" */
  youHead: string;
  /** "Outside the safe zone" */
  youZone: string;
  /** "World edge" */
  youWall: string;
  /** "{name} touched your body" */
  onYourBody: string;
  /** "{name} ran into {by}'s body" */
  feedBody: string;
  /** "{name} lost a head to head against {by}" */
  feedHead: string;
  /** "{name} was outside the safe zone" */
  feedZone: string;
  /** "{name} hit the world edge" */
  feedWall: string;
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

/** The line for a death. `nameOf` turns a wallet into what to show. */
export function deathLine(cause: DeathCause, victim: string, you: string, nameOf: (w: string) => string, s: DeathStrings): string {
  const name = nameOf(victim);
  if (victim === you) {
    switch (cause.kind) {
      case "body": return fill(s.youBody, { name: nameOf(cause.by) });
      case "head": return fill(s.youHead, { name: nameOf(cause.by) });
      case "zone": return s.youZone;
      case "wall": return s.youWall;
    }
  }
  switch (cause.kind) {
    case "body": return cause.by === you ? fill(s.onYourBody, { name }) : fill(s.feedBody, { name, by: nameOf(cause.by) });
    case "head": return fill(s.feedHead, { name, by: nameOf(cause.by) });
    case "zone": return fill(s.feedZone, { name });
    case "wall": return fill(s.feedWall, { name });
  }
}
