// Plays every player's minute of frenzy again from its replay file and keeps the whole run, so a viewer can show where each
// one went, what they ate and how their mass grew. Everybody plays the same map from the same place: the runs differ only
// by what the people did. Same simulation as frenzy-sim.ts (the one that verifies the replay).
import { FRENZY, buildMap, decodeReplay, newPlayer, stepPlayer, type FrenzyMap, type Sym } from "./frenzy-sim.ts";

export interface Take { t: number; id: number; back: number }
export interface Run {
  w: string;
  /** Position, mass, cumulative coins, laser hits and nitro ticks at every tick 0..1200. */
  xs: Float32Array; ys: Float32Array; ms: Float32Array;
  eaten: Uint16Array; hits: Uint8Array; nitro: Uint16Array; stun: Uint8Array;
  takes: Take[];
  btc: number;
  final: { m: number; eaten: number; hits: number; nitroS: number; btc: number };
}

export function runMinute(map: FrenzyMap, w: string, bytes: Uint8Array): Run {
  const rep = decodeReplay(bytes);
  const N = FRENZY.ticks;
  const p = newPlayer();
  const xs = new Float32Array(N + 1), ys = new Float32Array(N + 1), ms = new Float32Array(N + 1);
  const eaten = new Uint16Array(N + 1), hits = new Uint8Array(N + 1), nitro = new Uint16Array(N + 1), stun = new Uint8Array(N + 1);
  xs[0] = p.x; ys[0] = p.y; ms[0] = p.m;
  const takes: Take[] = [];
  const btcIds = new Set(map.gems.filter((g) => g.btc).map((g) => g.id));
  let k = 0, h = 0, nit = 0, btc = 0;
  for (let t = 1; t <= N; t++) {
    while (k < rep.entries.length && rep.entries[k].tick <= t) {
      p.angle = rep.entries[k].angle; p.nitro = rep.entries[k].nitro; p.hold = rep.entries[k].hold === true; k++;
    }
    const burning = p.nitro && !p.hold && p.stun === 0 && p.m > FRENZY.minMass;
    const out = stepPlayer(map, p);
    if (burning) nit++;
    if (out.hit) h++;
    for (const id of out.taken) {
      const back = p.taken.get(id) ?? Infinity;
      takes.push({ t, id, back: Number.isFinite(back) ? back : 1e9 });
      if (btcIds.has(id)) btc++;
    }
    xs[t] = p.x; ys[t] = p.y; ms[t] = p.m; eaten[t] = p.eaten; hits[t] = Math.min(255, h); nitro[t] = nit; stun[t] = p.stun;
  }
  return { w, xs, ys, ms, eaten, hits, nitro, stun, takes, btc, final: { m: p.m, eaten: p.eaten, hits: h, nitroS: nit / FRENZY.tickRate, btc } };
}

export const mapFor = (seed: number, mass: Record<Sym, number>): FrenzyMap => buildMap(seed, { mass });
export { decodeReplay };
