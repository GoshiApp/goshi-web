// The safe zone as the person sees it: what it is doing in words, what staying outside costs, and when each phase is
// announced. Pure functions (the page passes the strings in), unit tested.

import type { ZoneNow, ZoneState } from "./protocol.ts";

/** Phases of the zone on the server (five circles after the first). */
export const FINAL_PHASE = 5;

/** Mass lost per second outside the zone. The server uses exactly this: (mass * 0.10 + 3) * (1 + 0.3 * (phase - 1)). */
export function zoneDamagePerSecond(mass: number, phase: number): number {
  return (Math.max(0, mass) * 0.1 + 3) * (1 + 0.3 * Math.max(0, phase - 1));
}

export type ZoneLine = "calm" | "warn" | "shrink" | "hold" | "final";

export interface ZoneStatus {
  line: ZoneLine;
  /** Whole seconds until the state changes (rounded up), 0 when it does not count down. */
  seconds: number;
  phase: number;
}

/**
 * What the zone is doing now. `elapsedMs` is how long ago the snapshot with this zone arrived (the countdown runs
 * between snapshots). "final" is only the hold of the last phase. A server that sends no state is "calm".
 */
export function zoneStatus(zone: Pick<ZoneNow, "phase" | "state" | "inMs">, elapsedMs: number = 0): ZoneStatus {
  const phase = zone.phase ?? 0;
  const state: ZoneState = zone.state ?? "calm";
  const left = Math.max(0, (zone.inMs ?? 0) - Math.max(0, elapsedMs));
  const seconds = Math.ceil(left / 1000);
  if (state === "hold" && phase >= FINAL_PHASE) return { line: "final", seconds: 0, phase };
  if (state === "shrink") return { line: "shrink", seconds: 0, phase };
  return { line: state, seconds, phase };
}

export interface ZoneStrings {
  /** "Zone phase 1 starts in {s} s" */
  calm: string;
  /** "Next zone marked, it moves in {s} s" */
  warn: string;
  /** "The zone is closing, get inside" */
  shrink: string;
  /** "Zone holds, next in {s} s" */
  hold: string;
  /** "Final zone" */
  final: string;
}

const fill = (t: string, s: number) => t.replace("{s}", String(s));

/** The one line for the HUD. */
export function zoneText(st: ZoneStatus, s: ZoneStrings): string {
  switch (st.line) {
    case "calm": return fill(s.calm, st.seconds);
    case "warn": return fill(s.warn, st.seconds);
    case "shrink": return s.shrink;
    case "hold": return fill(s.hold, st.seconds);
    case "final": return s.final;
  }
}

/** A key that changes exactly when a new phase or a new state begins, so each is announced once (null: nothing to say). */
export function phaseKey(zone: Pick<ZoneNow, "phase" | "state">): string | null {
  if (zone.phase === undefined || zone.state === undefined) return null;
  if (zone.state === "calm") return null;
  return `${zone.phase}:${zone.state}`;
}
