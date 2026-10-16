// Which game server this page talks to, when there is one per region. Rooms are split between regions by their id (the id
// divided by the number of regions leaves the region's place in the list), so a link to a room always opens on its server.
// The person can pick a region; "auto" takes the one with the lowest ping, measured on this device and remembered.

export interface Region { id: string; url: string }
const PICK_KEY = "goshi-region";
const BEST_KEY = "goshi-region-best";

const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* optional */ } };
const toHttp = (u: string) => u.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

/** The region that runs a room, from its id alone. */
export function regionOfRoom(roomId: string | bigint, regions: readonly Region[]): number {
  if (regions.length < 2) return 0;
  try { return Number(BigInt(roomId) % BigInt(regions.length)); } catch { return 0; }
}

/** Ping of every region, in ms (second request: the connection is already open, as in a game). */
export async function measureRegions(regions: readonly Region[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(regions.map(async (r) => {
    try {
      await fetch(`${toHttp(r.url)}/health`, { cache: "no-store" });
      const t = performance.now();
      await fetch(`${toHttp(r.url)}/health`, { cache: "no-store" });
      out.set(r.id, Math.round(performance.now() - t));
    } catch { /* unreachable: left out */ }
  }));
  let best: string | null = null, ms = Infinity;
  for (const [id, v] of out) if (v < ms) { ms = v; best = id; }
  if (best) set(BEST_KEY, best);
  return out;
}

export const pickedRegion = (): string => get(PICK_KEY) ?? "auto";
export const pickRegion = (id: string): void => set(PICK_KEY, id);

/**
 * The region index for this page: the one of the room in the link (a duel or a room id), else the one picked, else the fastest
 * measured (waiting up to a moment for the first measurement), else the first.
 */
export async function chooseRegion(regions: readonly Region[], linkRoom: string | null): Promise<number> {
  if (regions.length < 2) return 0;
  if (linkRoom && /^\d{10,20}$/.test(linkRoom)) return regionOfRoom(linkRoom, regions);
  const picked = pickedRegion();
  const i = regions.findIndex((r) => r.id === picked);
  if (i >= 0) return i;
  let best = get(BEST_KEY);
  if (!best) {
    await Promise.race([measureRegions(regions), new Promise((r) => setTimeout(r, 1500))]);
    best = get(BEST_KEY);
  } else {
    void measureRegions(regions); // keeps the choice fresh for the next visit
  }
  const j = regions.findIndex((r) => r.id === best);
  return j >= 0 ? j : 0;
}
