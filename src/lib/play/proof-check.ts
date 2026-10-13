// "Proof of playback": everything a person needs to check a match without trusting the server, done in the browser.
//  1. commit    sha256(secret) is what the server wrote when the room was created.
//  2. seed      the map seed is sha256(secret, blockhash, room id) and equals the one in the replay file.
//  3. replay    the replay file matches the hash the server published.
//  4. mass      re-running the inputs on the same map gives the same mass the game reported.
//  5. chain     the closing transaction logged the same secret, blockhash, price photo and replay root.
import type { EndProof } from "./protocol.ts";
import { buildMap, decodeReplay, simulate, type Sym } from "./frenzy-sim.ts";

export type StepId = "commit" | "seed" | "block" | "replay" | "mass" | "arena" | "jackpot" | "chain";
export interface Step { id: StepId; ok: boolean | null; detail?: string }

export interface CheckInput {
  /** http(s) origin of the game server (for the replay file). */
  serverHttp: string;
  rpcUrl: string;
  roomId: string;
  wallet: string;
  proof: EndProof;
  /** The mass the minute reported for this wallet, when known. */
  claimedMass: number | null;
  /** The closing transaction, when there is one. */
  tx: string | null;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b as ArrayBuffer), (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => Uint8Array.from(s.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const all = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", all));
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** A base58 string (a blockhash) as lowercase hex. */
export function b58hex(text: string): string {
  let n = 0n;
  for (const c of text) {
    const v = B58.indexOf(c);
    if (v < 0) return "";
    n = n * 58n + BigInt(v);
  }
  let h = n === 0n ? "" : n.toString(16);
  if (h.length % 2) h = "0" + h;
  const zeros = text.length - text.replace(/^1+/, "").length;
  return "00".repeat(zeros) + h;
}

/** The super pot draw, as the server computes it (server/src/game/settlement.ts, jackpotDraw): 1 in `oneIn`, from the secret and the block. */
export async function jackpotDrawn(secret: Uint8Array, blockhash: Uint8Array, roomId: string, oneIn: number): Promise<boolean> {
  if (!Number.isInteger(oneIn) || oneIn < 1) return false;
  if (oneIn === 1) return true;
  const id = new Uint8Array(8);
  if (/^\d+$/.test(roomId)) new DataView(id.buffer).setBigUint64(0, BigInt(roomId), true);
  const h = await sha256(enc.encode("goshi-jackpot-v1"), secret, blockhash, id);
  return new DataView(h.buffer, h.byteOffset).getUint32(0, true) % oneIn === 0;
}

/** Room id bytes the way the server derives them: u64 little endian for numeric ids, else the first 8 bytes of sha256. */
async function idBytes(roomId: string): Promise<Uint8Array> {
  if (/^\d+$/.test(roomId)) {
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, BigInt(roomId), true);
    return out;
  }
  return (await sha256(enc.encode(roomId))).slice(0, 8);
}

export async function verifyMatch(i: CheckInput, fetchFn: typeof fetch = fetch): Promise<Step[]> {
  const steps: Step[] = [];
  const p = i.proof;
  const secret = unhex(p.seedReveal);
  const blockhash = unhex(p.blockhash);

  // 1. commit
  const commit = hex(await sha256(secret));
  steps.push({ id: "commit", ok: commit === p.commit, detail: commit.slice(0, 16) });

  // 2. seed and 3. replay
  const seedHash = await sha256(secret, blockhash, await idBytes(i.roomId));
  const seed = (new DataView(seedHash.buffer, seedHash.byteOffset).getUint32(0, true) & 0x7fffffff) || 1;
  let bytes: Uint8Array | null = null;
  try {
    const r = await fetchFn(`${i.serverHttp}/replay/${encodeURIComponent(i.roomId)}/${encodeURIComponent(i.wallet)}`, { cache: "no-store" });
    if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
  } catch {
    bytes = null;
  }
  if (!bytes) {
    steps.push({ id: "seed", ok: null }, { id: "replay", ok: null }, { id: "mass", ok: null });
  } else {
    let rep: ReturnType<typeof decodeReplay> | null = null;
    try {
      rep = decodeReplay(bytes);
    } catch {
      rep = null;
    }
    steps.push({ id: "seed", ok: rep ? rep.seed === seed : false, detail: rep ? `${seed} / ${rep.seed}` : `no file (${bytes.length} B)` });
    const mine = p.replays.find((r) => r.w === i.wallet);
    const got = hex(await sha256(bytes));
    steps.push({ id: "replay", ok: mine ? got === mine.hash : false, detail: mine ? `${bytes.length} B, ${got.slice(0, 8)} / ${mine.hash.slice(0, 8)}` : "wallet not in the record" });
    const mass = p.snapshot.mass;
    if (rep && mass && i.claimedMass !== null) {
      const map = buildMap(rep.seed, { mass: mass as Record<Sym, number> });
      const out = simulate(map, rep.entries);
      steps.push({ id: "mass", ok: Math.abs(out.m - i.claimedMass) < 0.06, detail: out.m.toFixed(1) });
    } else {
      steps.push({ id: "mass", ok: null });
    }
  }

  // 3b. the block of the seed: the one where the room filled (read from the node; older matches have no slot)
  if (p.slot !== undefined) {
    try {
      const r = await fetchFn(i.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBlock", params: [Number(p.slot), { commitment: "confirmed", transactionDetails: "none", rewards: false, maxSupportedTransactionVersion: 0 }] }),
      });
      const j: any = await r.json();
      const bh: string | undefined = j?.result?.blockhash;
      if (typeof bh !== "string") steps.push({ id: "block", ok: null, detail: `slot ${p.slot}` });
      else steps.push({ id: "block", ok: b58hex(bh) === p.blockhash, detail: `slot ${p.slot}` });
    } catch {
      steps.push({ id: "block", ok: null, detail: `slot ${p.slot}` });
    }
  }
  // 3c. the super pot draw is the same function of the same material
  if (p.jackpot) {
    steps.push({ id: "jackpot", ok: (await jackpotDrawn(secret, blockhash, i.roomId, p.jackpot.oneIn)) === p.jackpot.drawn });
  }

  // 4. the record of the whole arena phase: every steering and boost change of every player, one file, one hash.
  const arenaEntry = p.replays.find((r) => r.w === "arena");
  if (arenaEntry) {
    try {
      const r = await fetchFn(`${i.serverHttp}/replay/${encodeURIComponent(i.roomId)}/arena`, { cache: "no-store" });
      if (r.ok) {
        const ab = new Uint8Array(await r.arrayBuffer());
        const g2 = hex(await sha256(ab));
        steps.push({ id: "arena", ok: g2 === arenaEntry.hash, detail: `${ab.length} B, ${g2.slice(0, 8)} / ${arenaEntry.hash.slice(0, 8)}` });
      } else steps.push({ id: "arena", ok: null });
    } catch {
      steps.push({ id: "arena", ok: null });
    }
  }

  // 5. chain
  if (!i.tx) {
    steps.push({ id: "chain", ok: null });
  } else {
    try {
      const r = await fetchFn(i.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [i.tx, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }] }),
      });
      const j: any = await r.json();
      const logs: string[] = j?.result?.meta?.logMessages ?? [];
      const line = logs.find((l) => l.startsWith("Program data: ") && l.includes(b64(enc.encode("goshi:proof"))));
      if (!line) {
        steps.push({ id: "chain", ok: false, detail: "no proof log" });
      } else {
        const f = line.slice("Program data: ".length).split(" ");
        // fields: kind, room id, secret, blockhash, snapshot hash, replay root
        const root = await sha256(...[...p.replays].sort((a, b) => (a.w < b.w ? -1 : 1)).flatMap((r) => [enc.encode(r.w), unhex(r.hash)]));
        let ok = f[2] === b64(secret) && f[3] === b64(blockhash) && f[4] === b64(unhex(p.snapshot.hash)) && f[5] === b64(root);
        // Programs from the 12 October upgrade also log the slot where the room became active as a seventh field.
        if (ok && p.slot !== undefined && f[6] !== undefined) {
          const raw = Uint8Array.from(atob(f[6]), (c) => c.charCodeAt(0));
          ok = raw.length === 8 && new DataView(raw.buffer).getBigUint64(0, true) === BigInt(p.slot);
        }
        steps.push({ id: "chain", ok });
      }
    } catch {
      steps.push({ id: "chain", ok: null });
    }
  }
  return steps;
}
