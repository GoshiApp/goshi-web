// Turns whatever a wallet, the RPC node or the program throws into one of a few plain kinds.
// The page maps each kind to a sentence in the visitor's language. Raw messages are never shown.

export type ErrorKind =
  | "noWallet"
  | "rejected"
  | "insufficientSol"
  | "noTokenAccount"
  | "roomGone"
  | "notWaiting"
  | "roomFull"
  | "alreadyJoined"
  | "notEnoughGoshi"
  | "wrongConfig"
  | "expired"
  | "network"
  | "rateLimited"
  | "walletBlocked"
  | "wrongNetwork"
  | "unknown";

/** An error we raise ourselves, with the kind already decided. */
export class PlayError extends Error {
  readonly kind: ErrorKind;
  /** Set when the transaction was already sent, so the page can link to it even though it failed or is unconfirmed. */
  readonly signature?: string;
  /** Exact numbers for the message (lamports or token base units), as text, when the error is about an amount. */
  readonly data?: Record<string, string>;
  constructor(kind: ErrorKind, detail?: string, signature?: string, data?: Record<string, string>) {
    super(detail ?? kind);
    this.name = "PlayError";
    this.kind = kind;
    this.signature = signature;
    this.data = data;
  }
}

/** A wallet that answers "rejected" faster than a person can read a pop-up did not show one. */
export const QUICK_REJECT_MS = 1500;

const isRejection = (e: unknown): boolean => {
  const o = e as { code?: unknown; message?: unknown } | null;
  const text = typeof o?.message === "string" ? o.message : typeof e === "string" ? e : "";
  return o?.code === 4001 || /user rejected|rejected the request|request was rejected|user denied|declined|user cancel/i.test(text);
};

/**
 * What a failed connect means. A rejection that comes back in under a second and a half, with no pop-up approved, is almost
 * always the wallet's own warning screen ("this site may be malicious") blocking a new domain.
 */
export function classifyConnectError(err: unknown, elapsedMs: number): ErrorKind {
  if (err instanceof PlayError) return err.kind;
  if (isRejection(err)) return elapsedMs < QUICK_REJECT_MS ? "walletBlocked" : "rejected";
  return classifyError(err);
}

/**
 * What a failed signTransaction means. The wallet simulates the transaction itself: when it says the simulation failed
 * after our own simulation on the right network passed, the wallet is on another network.
 */
export function classifySignError(err: unknown): ErrorKind {
  if (err instanceof PlayError) return err.kind;
  if (isRejection(err)) return "rejected";
  const text = ((err as { message?: unknown } | null)?.message ?? (typeof err === "string" ? err : "")) as string;
  if (/simulat|error al simular|unexpected error|transaction would fail|could not be simulated/i.test(String(text))) return "wrongNetwork";
  return classifyError(err);
}

/**
 * Text form of the `err` field of a confirmed transaction, e.g. { InstructionError: [0, { Custom: 6006 }] },
 * so classifyError can read it like a simulation message.
 */
export function txErrorText(err: unknown): string {
  const ie = (err as { InstructionError?: [number, unknown] } | null)?.InstructionError;
  if (Array.isArray(ie)) {
    const custom = (ie[1] as { Custom?: unknown } | null)?.Custom;
    if (typeof custom === "number") return `custom program error: 0x${custom.toString(16)}`;
  }
  try {
    return JSON.stringify(err, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Custom error names of the native goshi-escrow program: code 6000 + index. errors.test.ts checks this list against the client. */
export const ESCROW_ERROR_NAMES = [
  "Unauthorized",
  "InvalidEntryFee",
  "RoomMismatch",
  "RoomNotWaiting",
  "RoomNotActive",
  "RoomFull",
  "AlreadyJoined",
  "NotEnoughGoshi",
  "BadPlayerCount",
  "DuplicateWinners",
  "WinnerNotInRoom",
  "WrongAccount",
  "BadAccounts",
  "MathOverflow",
  "NothingPending",
  "BadAccountData",
  "AlreadyInitialized",
  "BadInstruction",
  "TooEarly",
  "BackpackOpen",
  "BadBackpack",
] as const;
export const ESCROW_ERROR_BASE = 6000;

const BY_PROGRAM_NAME: Record<string, ErrorKind> = {
  RoomNotWaiting: "notWaiting",
  RoomFull: "roomFull",
  AlreadyJoined: "alreadyJoined",
  NotEnoughGoshi: "notEnoughGoshi",
  WrongAccount: "wrongConfig",
  BadAccounts: "wrongConfig",
  RoomMismatch: "wrongConfig",
  // Kept for old transaction logs.
  WrongMint: "wrongConfig",
  WrongWallet: "wrongConfig",
};

type Loose = Record<string, unknown> & {
  message?: unknown; code?: unknown; logs?: unknown; error?: { errorCode?: { code?: unknown } };
};

function textOf(err: Loose): string {
  const logs = Array.isArray(err.logs) ? err.logs.join("\n") : "";
  const msg = typeof err.message === "string" ? err.message : "";
  return `${msg}\n${logs}`;
}

export function classifyError(input: unknown): ErrorKind {
  if (input instanceof PlayError) return input.kind;
  if (input === null || input === undefined) return "unknown";
  const err: Loose = typeof input === "string" ? { message: input } : (input as Loose);
  const text = textOf(err);

  // Wallet pop-up closed or declined. 4001 is the EIP-1193 style code that Phantom and Solflare use.
  if (err.code === 4001 || /user rejected|rejected the request|request was rejected|user denied|declined|user cancel/i.test(text)) {
    return "rejected";
  }

  // Anchor error with a named code.
  const named = err.error?.errorCode?.code ?? /Error Code:\s*(\w+)/.exec(text)?.[1];
  if (typeof named === "string" && named in BY_PROGRAM_NAME) return BY_PROGRAM_NAME[named];
  // Anchor: the saboteur's $GOSHI token account does not exist.
  if (named === "AccountNotInitialized" || /AccountNotInitialized/.test(text)) return "noTokenAccount";

  // Raw program error number.
  const hex = /custom program error:\s*0x([0-9a-fA-F]+)/.exec(text)?.[1];
  const funds = /insufficient lamports|insufficient funds for (?:fee|rent)|attempt to debit an account but found no record of a prior credit/i;
  if (funds.test(text)) return "insufficientSol";
  if (/Error: insufficient funds/i.test(text)) return "notEnoughGoshi";
  if (hex !== undefined) {
    const n = parseInt(hex, 16);
    // The system program's "insufficient lamports": the entry fee plus the network fee is more than the balance.
    if (n === 1) return "insufficientSol";
    const name = ESCROW_ERROR_NAMES[n - ESCROW_ERROR_BASE];
    if (name && name in BY_PROGRAM_NAME) return BY_PROGRAM_NAME[name];
  }

  if (/blockhash not found|block height exceeded|has expired|expired/i.test(text)) return "expired";
  if (/\b429\b|too many requests|rate limit/i.test(text)) return "rateLimited";
  if (/failed to fetch|networkerror|network request failed|timed? ?out|econn|enotfound|\b50[23]\b|socket/i.test(text)) {
    return "network";
  }
  return "unknown";
}
