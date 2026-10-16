// The wire protocol of the Goshi play server (~/goshi-escrow/server/PROTOCOL.md, v2).
// Pure helpers: types, encode, decode with validation, the auth message, base58, input limits and reconnect backoff.
// Money values are strings of base units (6 decimals). Wallets are base58 public keys.

export interface WorldSize { w: number; h: number }
export type Role = "paid" | "saboteur";
export type Mode = "royale" | "vs" | "duel";

export interface Orb { id: number; x: number; y: number; v: number }
export interface ZoneStart { cx: number; cy: number; r0: number; rMin: number; /** The radius of each phase (start circle, then five). */ radii?: number[] }
export interface ZoneCircle { cx: number; cy: number; r: number }
export type ZoneState = "calm" | "warn" | "shrink" | "hold";
/**
 * The safe zone now. `phase` is 0 before the first circle is announced and 1 to 5 after; `state` says what it is doing
 * and `inMs` how long until the state changes (0 at the very end). `target` is the next circle while it is announced
 * (`warn`) or being moved to (`shrink`). Older servers send only the circle.
 */
export interface ZoneNow extends ZoneCircle { target?: ZoneCircle; phase?: number; state?: ZoneState; inMs?: number }
export interface PlayerSnap {
  w: string;
  n: string;
  role: Role;
  bot: boolean;
  alive: boolean;
  /** Spawn protection: cannot die and does not hurt anyone. */
  prot: boolean;
  /** The head is outside the safe zone (it is losing mass). */
  zout: boolean;
  /** Heading in radians. */
  h: number;
  /** Mass. */
  m: number;
  /** Body radius. */
  r: number;
  head: [number, number];
  /** The body path from the neck backwards, as points. */
  body: [number, number][];
}
export interface DeathEvent { k: "death"; w: string; by: string; rank: number }
export interface RankEntry { w: string; rank: number; score: number; role: Role }
export interface PodiumPayout { w: string; rank: number; kind: "sol" | "goshi"; lamports: string }
export interface EndPayout {
  /** The nominal pot and what the room really held (less when a pass seat was used). */
  pot: string;
  cash?: string;
  /** What the house kept. */
  rake: string;
  /** The Top 3 PAID players (saboteurs never compete). */
  podium: PodiumPayout[];
  /** What each seated saboteur received, in SOL (contract v3). */
  saboteurs?: { w: string; lamports: string }[];
  unclaimed?: string;
  jackpot: { triggered: boolean; amount: string; winner: string | null };
}
export interface Rules { matchMs: number; shrinkStartMs: number; tickRate: number; paidSlots: number; freeSlots: number }

/** The minute of frenzy, sent inside `start` (server/PROTOCOL.md). Gems are [id, x, y, symbol index, mass, btc 0|1]. */
export interface FrenzyInfo {
  startsAt: number;
  ms: number;
  tickRate: number;
  start: { x: number; y: number; m: number };
  carryCap: number;
  map: {
    w: number; h: number;
    gems: [number, number, number, number, number, number][];
    walls: [number, number, number, number][];
    lasers: [number, number, number, number, number][];
    laserPeriod: number; laserOn: number; btcRespawnMs: number;
  };
  snapshot: { hash: string; source: string; at: number; usd: Record<string, number>; mass: Record<string, number> };
  commit: string;
  signature: string;
}
export interface FrenzySnap {
  t: "fsnap"; roomId: string; tick: number; timeLeftMs: number;
  you: { x: number; y: number; m: number; stun: number; h: number };
  taken: number[]; back: number[]; hit: boolean; top: [string, number][]; rank: number;
}
export interface FrenzyEnd { t: "fend"; roomId: string; mass: number; carried: number; eaten: number; replay: string }
export interface StatsMsg {
  t: "stats"; online: number; playing: number; visits?: number; wallets?: number; counted?: boolean; maintenance?: { state: string; startsAt: number; blockFrom: number; endsAt: number; message: string } | null; matches: number; volume: string;
  prices: { source: string; at: number; usd: Record<string, number>; mass: Record<string, number> } | null;
  solUsd: number;
}
export interface EndProof {
  commit: string; seedReveal: string; blockhash: string; signature: string;
  /** The slot of the block `blockhash` belongs to: the one in which the room became active (newer matches only). */
  slot?: string;
  /** The super pot draw the server stated, which anybody can recompute from the secret and the blockhash. */
  jackpot?: { oneIn: number; drawn: boolean };
  snapshot: { hash: string; source: string; at: number; mass?: Record<string, number> };
  replays: { w: string; hash: string; bytes: number }[];
}

export type ClientMsg =
  | { t: "auth"; wallet: string; signature: string; /** The Sign In With Solana text that was signed, when the server asked for it. */ message?: string; vid?: string }
  /** A token from an earlier login: no signature, no wallet popup. */
  | { t: "auth"; token: string; vid?: string }
  | { t: "ping" }
  | { t: "createRoom"; entryFee: string }
  /** Find or open a room for this entry (lamports) and take a seat in it with join_room. */
  | { t: "quick"; entryFee: string }
  /** Take the tenth seat of the room named in a `passOffer` (no payment). */
  | { t: "acceptPass"; roomId: string }
  | { t: "fillWithBots"; roomId: string; paid: number; free: number }
  | { t: "faucet" }
  /** The live arena: watch it, take a place (or wait for one), leave. */
  | { t: "live_watch" }
  | { t: "live_join"; name?: string; wallet?: string; skin?: string }
  | { t: "live_leave" }
  /** The computer plays this body as an elite bot while the person is away (on), or hands it back (off). */
  | { t: "afk"; on: boolean }
  | { t: "practice"; name: string; wallet?: string; difficulty?: "easy" | "medium" | "hard" | "insane"; mode?: "survival" | "show" }
  /** The cosmetic skin to wear in paid rooms (a holder skin is checked against the balance). */
  | { t: "skin"; id: string }
  /** A private duel for 2 to 5 players: the winner takes the pot minus a small fee. */
  | { t: "createDuel"; entryFee: string; guests: string[] }
  | { t: "startDuel"; roomId: string }
  /** The wallet whose invite link brought this one (first touch, checked by the server). */
  | { t: "ref"; ref: string }
  | { t: "watch"; roomId: string }
  | { t: "enter"; roomId: string }
  | { t: "vs"; roomId: string; accept: boolean }
  | { t: "input"; dx: number; dy: number; boost: boolean }
  /** Subscribe to (or leave) the live numbers of the landing page. No wallet needed. */
  | { t: "stats"; on: boolean; /** Counts this page load as one visit (a number only; nothing about the person is stored). */ visit?: boolean }
  | { t: "leave"; roomId: string };

export type ServerMsg =
  | {
      t: "hello"; nonce: string; cluster: string; programId: string; mint: string; devBots?: boolean; authMessage?: string; siws?: boolean; feePresets: string[];
      minHolder: string; rules: Rules;
      /** Entry options in dollars at the live SOL price, and that price. */
      feeOptions?: { lamports: string; usd: number }[]; solUsd?: number;
    }
  | { t: "authed"; wallet: string; session?: string; expiresAt?: number; viaToken?: boolean }
  | { t: "pong" }
  /** The skins people wear in the live arena: wallet (or temporary id) -> skin id. */
  | { t: "skins"; map: Record<string, string> }
  | { t: "live"; state: "watching" | "queued" | "playing" | "dead"; places: number; humans: number; waiting: number; watching: number; you?: string; pos?: number }
  | { t: "roomCreated"; roomId: string; tx: string }
  | { t: "duelTx"; roomId: string; tx: string; players: number; guests: string[] }
  | { t: "invite"; roomId: string; entryFee: string; host: string; players: number }
  /** Another player of the match you are watching lost the connection or left the page. */
  | { t: "peerLeft"; roomId: string; wallet: string; graceSeconds?: number }
  | { t: "peerBack"; roomId: string; wallet: string }
  /** The match has just ended: the ranking is known, the prizes are being sent on the network. */
  | { t: "matchOver"; roomId: string; ranking: RankEntry[] }
  /** The top 3 paid players of a finished room may take the last seat of a higher room that has 9 paid players. */
  | { t: "passOffer"; roomId: string; tierUsd: number; entryFee: string; rank: number; paid: number; expiresInMs: number }
  | { t: "passTaken"; roomId: string; tx: string }
  | { t: "quickRoom"; roomId: string; created: boolean; paid: number; tx?: string }
  | { t: "botsJoining"; roomId: string; paid: number; free: number }
  | { t: "faucet"; sol: string; goshi: string; tx: string }
  | { t: "entered"; roomId: string; role: Role; practice?: boolean }
  | { t: "lobby"; roomId: string; state: "waiting" | "active"; mode: Mode; entryFee: string; paid: string[]; free: string[]; waitedMs: number }
  | { t: "vsOffer"; roomId: string; paid: number; expiresInMs: number }
  | { t: "vsStarted"; roomId: string }
  | { t: "vsDeclined"; roomId: string }
  | {
      t: "start"; roomId: string; mode: Mode; startsAt: number; matchMs: number; shrinkStartMs: number; world: WorldSize;
      zone: ZoneStart; orbs: Orb[]; you: string; roles: Record<string, Role>; skins?: Record<string, string>; practice?: boolean; frenzy?: FrenzyInfo;
    }
  | FrenzySnap
  | FrenzyEnd
  | StatsMsg
  | {
      t: "snap"; roomId: string; tick: number; timeLeftMs: number; zone: ZoneNow; players: PlayerSnap[];
      eatenOrbs: number[]; newOrbs: Orb[]; events: DeathEvent[];
      /** Survival: seconds to the next airdrop, and the spot where one has just landed. */
      dropIn?: number; drop?: { x: number; y: number };
    }
  | { t: "end"; roomId: string; mode: Mode; ranking: RankEntry[]; payout: EndPayout; tx: string | null; error: string | null; practice?: boolean; prize?: { lamports: string; tx: string }; proof?: EndProof; record?: { hash: string; bytes: number; entries: number } }
  | { t: "error"; code: string; message: string };

export type ServerMsgType = ServerMsg["t"];

// ------------------------------------------------------------------ auth

/** The exact text the wallet signs (older servers). */
export const authMessage = (nonce: string): string => `goshi-play:${nonce}`;

export const SIWS_STATEMENT = "Sign in to Goshi. This is free and sends no transaction.";

/** The Sign In With Solana text: wallets show it as a clean sign-in request. Must match server/src/auth.ts exactly. */
export function siwsMessage(o: { domain: string; address: string; uri: string; chain: string; nonce: string; issuedAt: string }): string {
  return `${o.domain} wants you to sign in with your Solana account:\n${o.address}\n\n${SIWS_STATEMENT}\n\nURI: ${o.uri}\nVersion: 1\nChain ID: ${o.chain}\nNonce: ${o.nonce}\nIssued At: ${o.issuedAt}`;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (Bitcoin alphabet), the encoding Solana uses for signatures and keys. */
export function bytesToBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

// ------------------------------------------------------------------ encode

export const encodeClient = (msg: ClientMsg): string => JSON.stringify(msg);

/** The server only opens rooms with one of its fee presets (lamports, above zero). */
export function createRoomMessage(entryFeeLamports: bigint): ClientMsg {
  if (entryFeeLamports <= 0n) throw new RangeError("entry fee must be above zero");
  return { t: "createRoom", entryFee: entryFeeLamports.toString() };
}

/** Input values are clamped to -1..1 and rounded to 2 decimals; anything that is not a number becomes 0. */
export function inputMessage(dx: number, dy: number, boost: boolean): ClientMsg {
  const c = (v: number) => (Number.isFinite(v) ? Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100 : 0);
  return { t: "input", dx: c(dx), dy: c(dy), boost: !!boost };
}

// ------------------------------------------------------------------ decode

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isUint = (v: unknown): v is string => isStr(v) && /^\d+$/.test(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isRole = (v: unknown): v is Role => v === "paid" || v === "saboteur";
const isMode = (v: unknown): v is Mode => v === "royale" || v === "vs" || v === "duel";
const isPoint = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const isOrb = (v: unknown): v is Orb => isObj(v) && isNum(v.id) && isNum(v.x) && isNum(v.y) && isNum(v.v);
const isPlayer = (v: unknown): v is PlayerSnap =>
  isObj(v) && isStr(v.w) && isStr(v.n) && isRole(v.role) && typeof v.bot === "boolean" && typeof v.alive === "boolean" &&
  isNum(v.m) && isNum(v.r) && isPoint(v.head) && Array.isArray(v.body) && v.body.every(isPoint) &&
  (v.prot === undefined || typeof v.prot === "boolean") && (v.zout === undefined || typeof v.zout === "boolean") && (v.h === undefined || isNum(v.h));

function parseFeeOptionsRaw(v: unknown): { lamports: string; usd: number }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { lamports: string; usd: number }[] = [];
  for (const o of v) {
    if (!isObj(o) || !isUint(o.lamports) || !isNum(o.usd) || o.usd <= 0) return null;
    out.push({ lamports: o.lamports, usd: o.usd });
  }
  return out;
}

/** Older servers send neither `prot` nor `h`: fill them in (heading from the neck to the head). */
function withDefaults(p: PlayerSnap): PlayerSnap {
  const raw = p as PlayerSnap & { prot?: boolean; h?: number; zout?: boolean };
  const neck = p.body[0];
  const h = typeof raw.h === "number" ? raw.h : neck ? Math.atan2(p.head[1] - neck[1], p.head[0] - neck[0]) : 0;
  return { ...p, prot: raw.prot === true, zout: raw.zout === true, h };
}
const isNumArr = (v: unknown, n?: number): v is number[] => Array.isArray(v) && v.every(isNum) && (n === undefined || v.length === n);
function parseFrenzy(v: unknown): FrenzyInfo | null {
  if (!isObj(v) || !isNum(v.startsAt) || !isNum(v.ms) || !isNum(v.tickRate) || !isNum(v.carryCap)) return null;
  const st = v.start, m = v.map, sn = v.snapshot;
  if (!isObj(st) || !isNum(st.x) || !isNum(st.y) || !isNum(st.m)) return null;
  if (!isObj(m) || !isNum(m.w) || !isNum(m.h) || !isNum(m.laserPeriod) || !isNum(m.laserOn) || !isNum(m.btcRespawnMs)) return null;
  if (!Array.isArray(m.gems) || !m.gems.every((a) => isNumArr(a, 6))) return null;
  if (!Array.isArray(m.walls) || !m.walls.every((a) => isNumArr(a, 4))) return null;
  if (!Array.isArray(m.lasers) || !m.lasers.every((a) => isNumArr(a, 5))) return null;
  if (!isObj(sn) || !isStr(sn.hash) || !isStr(sn.source) || !isNum(sn.at) || !isObj(sn.usd) || !isObj(sn.mass)) return null;
  if (!isStr(v.commit) || !isStr(v.signature)) return null;
  return {
    startsAt: v.startsAt, ms: v.ms, tickRate: v.tickRate, carryCap: v.carryCap,
    start: { x: st.x, y: st.y, m: st.m },
    map: {
      w: m.w, h: m.h, gems: m.gems as FrenzyInfo["map"]["gems"], walls: m.walls as FrenzyInfo["map"]["walls"],
      lasers: m.lasers as FrenzyInfo["map"]["lasers"], laserPeriod: m.laserPeriod, laserOn: m.laserOn, btcRespawnMs: m.btcRespawnMs,
    },
    snapshot: { hash: sn.hash, source: sn.source, at: sn.at, usd: sn.usd as Record<string, number>, mass: sn.mass as Record<string, number> },
    commit: v.commit, signature: v.signature,
  };
}
function parseProof(v: unknown): EndProof | undefined {
  if (!isObj(v) || !isStr(v.commit) || !isStr(v.seedReveal) || !isStr(v.blockhash) || !isStr(v.signature)) return undefined;
  const sn = v.snapshot;
  if (!isObj(sn) || !isStr(sn.hash) || !isStr(sn.source) || !isNum(sn.at)) return undefined;
  if (!Array.isArray(v.replays) || !v.replays.every((r) => isObj(r) && isStr(r.w) && isStr(r.hash) && isNum(r.bytes))) return undefined;
  return {
    commit: v.commit, seedReveal: v.seedReveal, blockhash: v.blockhash, signature: v.signature,
    ...(isStr(v.slot) && /^\d{1,20}$/.test(v.slot) ? { slot: v.slot } : {}),
    ...(isObj(v.jackpot) && isNum(v.jackpot.oneIn) && typeof v.jackpot.drawn === "boolean" ? { jackpot: { oneIn: v.jackpot.oneIn, drawn: v.jackpot.drawn } } : {}),
    snapshot: { hash: sn.hash, source: sn.source, at: sn.at, ...(isObj(sn.mass) ? { mass: sn.mass as Record<string, number> } : {}) },
    replays: v.replays as EndProof["replays"],
  };
}
const isDeath = (v: unknown): v is DeathEvent => isObj(v) && v.k === "death" && isStr(v.w) && isStr(v.by) && isNum(v.rank);
const isRules = (v: unknown): v is Rules =>
  isObj(v) && isNum(v.matchMs) && isNum(v.shrinkStartMs) && isNum(v.tickRate) && isNum(v.paidSlots) && isNum(v.freeSlots);
const isEndPayout = (v: unknown): v is EndPayout =>
  isObj(v) && isUint(v.pot) && isUint(v.rake) && (v.unclaimed === undefined || isUint(v.unclaimed)) && (v.cash === undefined || isUint(v.cash)) &&
  (v.saboteurs === undefined || (Array.isArray(v.saboteurs) && v.saboteurs.every((s) => isObj(s) && isStr(s.w) && isUint(s.lamports)))) &&
  Array.isArray(v.podium) &&
  v.podium.every((p) => isObj(p) && isStr(p.w) && isNum(p.rank) && (p.kind === "sol" || p.kind === "goshi") && isUint(p.lamports)) &&
  isObj(v.jackpot) && typeof v.jackpot.triggered === "boolean" && isUint(v.jackpot.amount) && (v.jackpot.winner === null || isStr(v.jackpot.winner));

/** Parses one text frame. Returns null for anything that is not a well formed message of the protocol. */
export function decodeServer(raw: unknown): ServerMsg | null {
  if (typeof raw !== "string") return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || !isStr(v.t)) return null;
  switch (v.t) {
    case "hello":
      return isStr(v.nonce) && isStr(v.cluster) && isStr(v.programId) && isStr(v.mint) && isStrArr(v.feePresets) && v.feePresets.every((f) => isUint(f)) &&
        isUint(v.minHolder) && isRules(v.rules)
        ? {
            t: "hello", nonce: v.nonce, cluster: v.cluster, programId: v.programId, mint: v.mint,
            devBots: v.devBots === true ? true : undefined, authMessage: isStr(v.authMessage) ? v.authMessage : undefined,
            ...(v.siws === true ? { siws: true } : {}),
            feePresets: v.feePresets, minHolder: v.minHolder, rules: v.rules,
            ...(parseFeeOptionsRaw(v.feeOptions) ? { feeOptions: parseFeeOptionsRaw(v.feeOptions)! } : {}),
            ...(isNum(v.solUsd) && v.solUsd > 0 ? { solUsd: v.solUsd } : {}),
          }
        : null;
    case "authed":
      return isStr(v.wallet)
        ? {
            t: "authed", wallet: v.wallet,
            ...(isStr(v.session) ? { session: v.session } : {}),
            ...(isNum(v.expiresAt) ? { expiresAt: v.expiresAt } : {}),
            ...(v.viaToken === true ? { viaToken: true } : {}),
          }
        : null;
    case "pong":
      return { t: "pong" };
    case "skins": {
      if (!isObj(v.map)) return null;
      const map: Record<string, string> = {};
      for (const [k, id] of Object.entries(v.map)) if (typeof id === "string" && k.length <= 64 && id.length <= 24) map[k] = id;
      return { t: "skins", map };
    }
    case "live":
      return (v.state === "watching" || v.state === "queued" || v.state === "playing" || v.state === "dead") && isNum(v.places) && isNum(v.humans) && isNum(v.waiting)
        ? { t: "live", state: v.state, places: v.places, humans: v.humans, waiting: v.waiting, watching: isNum(v.watching) ? v.watching : 0, ...(isStr(v.you) ? { you: v.you } : {}), ...(isNum(v.pos) ? { pos: v.pos } : {}) }
        : null;
    case "passOffer":
      return isStr(v.roomId) && isNum(v.tierUsd) && isUint(v.entryFee) && isNum(v.rank) && isNum(v.paid) && isNum(v.expiresInMs)
        ? { t: "passOffer", roomId: v.roomId, tierUsd: v.tierUsd, entryFee: v.entryFee, rank: v.rank, paid: v.paid, expiresInMs: v.expiresInMs }
        : null;
    case "passTaken":
      return isStr(v.roomId) && isStr(v.tx) ? { t: "passTaken", roomId: v.roomId, tx: v.tx } : null;
    case "quickRoom":
      return isStr(v.roomId) && typeof v.created === "boolean" && isNum(v.paid)
        ? { t: "quickRoom", roomId: v.roomId, created: v.created, paid: v.paid, ...(isStr(v.tx) ? { tx: v.tx } : {}) }
        : null;
    case "duelTx":
      return isStr(v.roomId) && isStr(v.tx) && isNum(v.players) && isStrArr(v.guests) ? { t: "duelTx", roomId: v.roomId, tx: v.tx, players: v.players, guests: v.guests } : null;
    case "peerBack":
      return isStr(v.roomId) && isStr(v.wallet) ? { t: "peerBack", roomId: v.roomId, wallet: v.wallet } : null;
    case "matchOver":
      return isStr(v.roomId) && Array.isArray(v.ranking) && v.ranking.every((r) => isObj(r) && isStr(r.w) && isNum(r.rank) && isNum(r.score) && isRole(r.role))
        ? { t: "matchOver", roomId: v.roomId, ranking: v.ranking as RankEntry[] }
        : null;
    case "peerLeft":
      return isStr(v.roomId) && isStr(v.wallet) ? { t: "peerLeft", roomId: v.roomId, wallet: v.wallet, ...(isNum(v.graceSeconds) ? { graceSeconds: v.graceSeconds } : {}) } : null;
    case "invite":
      return isStr(v.roomId) && isStr(v.entryFee) && isStr(v.host) && isNum(v.players) ? { t: "invite", roomId: v.roomId, entryFee: v.entryFee, host: v.host, players: v.players } : null;
    case "roomCreated":
      return isStr(v.roomId) && isStr(v.tx) ? { t: "roomCreated", roomId: v.roomId, tx: v.tx } : null;
    case "botsJoining":
      return isStr(v.roomId) && isNum(v.paid) && isNum(v.free) ? { t: "botsJoining", roomId: v.roomId, paid: v.paid, free: v.free } : null;
    case "faucet":
      return isUint(v.sol) && isUint(v.goshi) && isStr(v.tx) ? { t: "faucet", sol: v.sol, goshi: v.goshi, tx: v.tx } : null;
    case "entered":
      return isStr(v.roomId) && isRole(v.role) ? { t: "entered", roomId: v.roomId, role: v.role, practice: v.practice === true ? true : undefined } : null;
    case "lobby":
      return isStr(v.roomId) && (v.state === "waiting" || v.state === "active") && isMode(v.mode) && isUint(v.entryFee) && isStrArr(v.paid) && isStrArr(v.free) && isNum(v.waitedMs)
        ? { t: "lobby", roomId: v.roomId, state: v.state, mode: v.mode, entryFee: v.entryFee, paid: v.paid, free: v.free, waitedMs: v.waitedMs }
        : null;
    case "vsOffer":
      return isStr(v.roomId) && isNum(v.paid) && isNum(v.expiresInMs) ? { t: "vsOffer", roomId: v.roomId, paid: v.paid, expiresInMs: v.expiresInMs } : null;
    case "vsStarted":
      return isStr(v.roomId) ? { t: "vsStarted", roomId: v.roomId } : null;
    case "vsDeclined":
      return isStr(v.roomId) ? { t: "vsDeclined", roomId: v.roomId } : null;
    case "start": {
      if (!isStr(v.roomId) || !isMode(v.mode) || !isNum(v.startsAt) || !isNum(v.matchMs) || !isNum(v.shrinkStartMs) || !isStr(v.you)) return null;
      const w = v.world, z = v.zone, roles = v.roles;
      if (!isObj(w) || !isNum(w.w) || !isNum(w.h)) return null;
      if (!isObj(z) || !isNum(z.cx) || !isNum(z.cy) || !isNum(z.r0) || !isNum(z.rMin)) return null;
      if (z.radii !== undefined && !(Array.isArray(z.radii) && z.radii.every(isNum))) return null;
      if (!Array.isArray(v.orbs) || !v.orbs.every(isOrb)) return null;
      if (!isObj(roles) || !Object.values(roles).every(isRole)) return null;
      return {
        t: "start", roomId: v.roomId, mode: v.mode, startsAt: v.startsAt, matchMs: v.matchMs, shrinkStartMs: v.shrinkStartMs,
        world: { w: w.w, h: w.h }, zone: { cx: z.cx, cy: z.cy, r0: z.r0, rMin: z.rMin, ...(Array.isArray(z.radii) ? { radii: z.radii as number[] } : {}) }, orbs: v.orbs, you: v.you, roles: roles as Record<string, Role>,
        ...(isObj(v.skins) ? { skins: Object.fromEntries(Object.entries(v.skins).filter(([, x]) => isStr(x)).slice(0, 32)) as Record<string, string> } : {}),
        practice: v.practice === true ? true : undefined,
        ...(v.frenzy !== undefined && parseFrenzy(v.frenzy) ? { frenzy: parseFrenzy(v.frenzy)! } : {}),
      };
    }
    case "fsnap": {
      const y = v.you;
      if (!isStr(v.roomId) || !isNum(v.tick) || !isNum(v.timeLeftMs) || !isObj(y) || !isNum(y.x) || !isNum(y.y) || !isNum(y.m) || !isNum(y.stun) || !isNum(y.h)) return null;
      if (!isNumArr(v.taken) || !isNumArr(v.back) || !Array.isArray(v.top) || !isNum(v.rank)) return null;
      const top: [string, number][] = [];
      for (const t of v.top) {
        if (!Array.isArray(t) || !isStr(t[0]) || !isNum(t[1])) return null;
        top.push([t[0], t[1]]);
      }
      return {
        t: "fsnap", roomId: v.roomId, tick: v.tick, timeLeftMs: v.timeLeftMs, you: { x: y.x, y: y.y, m: y.m, stun: y.stun, h: y.h },
        taken: v.taken, back: v.back, hit: v.hit === true, top, rank: v.rank,
      };
    }
    case "fend":
      return isStr(v.roomId) && isNum(v.mass) && isNum(v.carried) && isNum(v.eaten) && isStr(v.replay)
        ? { t: "fend", roomId: v.roomId, mass: v.mass, carried: v.carried, eaten: v.eaten, replay: v.replay }
        : null;
    case "stats": {
      if (!isNum(v.online) || !isNum(v.playing) || !isNum(v.matches) || !isUint(v.volume)) return null;
      let prices: StatsMsg["prices"] = null;
      const p = v.prices;
      if (isObj(p) && isStr(p.source) && isNum(p.at) && isObj(p.usd) && isObj(p.mass)) {
        prices = { source: p.source, at: p.at, usd: p.usd as Record<string, number>, mass: p.mass as Record<string, number> };
      }
      return { t: "stats", online: v.online, playing: v.playing, ...(isNum(v.visits) ? { visits: v.visits } : {}), ...(isNum(v.wallets) ? { wallets: v.wallets } : {}), ...(v.counted === true ? { counted: true } : {}), ...(isObj(v.maintenance) && isStr(v.maintenance.state) && isNum(v.maintenance.startsAt) && isNum(v.maintenance.blockFrom) && isNum(v.maintenance.endsAt) ? { maintenance: { state: v.maintenance.state, startsAt: v.maintenance.startsAt, blockFrom: v.maintenance.blockFrom, endsAt: v.maintenance.endsAt, message: isStr(v.maintenance.message) ? v.maintenance.message : "" } } : { maintenance: null }), matches: v.matches, volume: v.volume, prices, solUsd: isNum(v.solUsd) ? v.solUsd : 0 };
    }
    case "snap": {
      if (!isStr(v.roomId) || !isNum(v.tick) || !isNum(v.timeLeftMs) || !Array.isArray(v.players) || !v.players.every(isPlayer)) return null;
      const z = v.zone;
      if (!isObj(z) || !isNum(z.cx) || !isNum(z.cy) || !isNum(z.r)) return null;
      const tz = z.target;
      if (tz !== undefined && tz !== null && !(isObj(tz) && isNum(tz.cx) && isNum(tz.cy) && isNum(tz.r))) return null;
      if (z.phase !== undefined && !isNum(z.phase)) return null;
      if (z.state !== undefined && !(z.state === "calm" || z.state === "warn" || z.state === "shrink" || z.state === "hold")) return null;
      if (z.inMs !== undefined && !isNum(z.inMs)) return null;
      const zone: ZoneNow = { cx: z.cx, cy: z.cy, r: z.r };
      if (isObj(tz)) zone.target = { cx: Number(tz.cx), cy: Number(tz.cy), r: Number(tz.r) };
      if (isNum(z.phase)) zone.phase = z.phase;
      if (z.state === "calm" || z.state === "warn" || z.state === "shrink" || z.state === "hold") zone.state = z.state;
      if (isNum(z.inMs)) zone.inMs = z.inMs;
      if (!Array.isArray(v.eatenOrbs) || !v.eatenOrbs.every(isNum) || !Array.isArray(v.newOrbs) || !v.newOrbs.every(isOrb)) return null;
      if (!Array.isArray(v.events) || !v.events.every(isDeath)) return null;
      return {
        t: "snap", roomId: v.roomId, tick: v.tick, timeLeftMs: v.timeLeftMs, zone,
        players: (v.players as PlayerSnap[]).map(withDefaults), eatenOrbs: v.eatenOrbs, newOrbs: v.newOrbs, events: v.events,
        ...(isNum(v.dropIn) ? { dropIn: v.dropIn } : {}),
        ...(isObj(v.drop) && isNum(v.drop.x) && isNum(v.drop.y) ? { drop: { x: v.drop.x, y: v.drop.y } } : {}),
      };
    }
    case "end": {
      if (!isStr(v.roomId) || !isMode(v.mode) || !isEndPayout(v.payout)) return null;
      if (!Array.isArray(v.ranking) || !v.ranking.every((r) => isObj(r) && isStr(r.w) && isNum(r.rank) && isNum(r.score) && isRole(r.role))) return null;
      if (!(v.tx === null || isStr(v.tx)) || !(v.error === null || isStr(v.error))) return null;
      return {
        t: "end", roomId: v.roomId, mode: v.mode, ranking: v.ranking as RankEntry[], payout: v.payout, tx: v.tx, error: v.error,
        practice: v.practice === true ? true : undefined,
        ...(isObj(v.prize) && isStr(v.prize.lamports) && isStr(v.prize.tx) ? { prize: { lamports: v.prize.lamports, tx: v.prize.tx } } : {}),
        ...(isObj(v.record) && isStr(v.record.hash) && isNum(v.record.bytes) && isNum(v.record.entries) ? { record: { hash: v.record.hash, bytes: v.record.bytes, entries: v.record.entries } } : {}),
        ...(parseProof(v.proof) ? { proof: parseProof(v.proof)! } : {}),
      };
    }
    case "error":
      return isStr(v.code) ? { t: "error", code: v.code, message: isStr(v.message) ? v.message : "" } : null;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ rates and retries

/** The server accepts at most 20 inputs per second. */
export const INPUT_MIN_INTERVAL_MS = 50;

/** Lets an event through at most once every `minMs`. */
export class RateLimiter {
  private last = -Infinity;
  private readonly minMs: number;
  constructor(minMs: number = INPUT_MIN_INTERVAL_MS) {
    this.minMs = minMs;
  }
  take(now: number): boolean {
    if (now - this.last < this.minMs) return false;
    this.last = now;
    return true;
  }
}

/** Reconnect delay: 0.5 s doubling up to 30 s, with up to 20% jitter taken from `rand` (0..1). */
export function backoffMs(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(30_000, 500 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + 0.4 * rand()));
}
