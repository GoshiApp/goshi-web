// A transaction the game server built for the player to sign (a private duel) is checked here, instruction by instruction,
// BEFORE the wallet is asked to sign it. The server is trusted to play the game, not to move the player's money: whatever
// it sends must be exactly the one instruction the player asked for, against the program the site is configured for.
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

export interface DuelExpectation {
  programId: PublicKey;
  /** The authority recorded in the program's configuration on chain: the only other signer, and the fee payer. */
  authority: PublicKey;
  /** The connected wallet: the host, who signs and pays the first seat. */
  host: PublicKey;
  entryFee: bigint;
  guests: PublicKey[];
  configPda: PublicKey;
  roomPda: (id: bigint) => PublicKey;
}

export type DuelCheck = { ok: true; roomId: bigint } | { ok: false; reason: string };

const rdU64 = (d: Uint8Array, o: number): bigint => new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(o, true);

export function checkDuelTx(tx: Transaction, e: DuelExpectation): DuelCheck {
  const no = (reason: string): DuelCheck => ({ ok: false, reason });
  if (tx.instructions.length !== 1) return no("instructions");
  const ix = tx.instructions[0];
  if (!ix.programId.equals(e.programId)) return no("program");
  if (!tx.feePayer || !tx.feePayer.equals(e.authority)) return no("fee payer");
  if (!tx.recentBlockhash) return no("blockhash");
  const n = e.guests.length;
  // tag 1 | room id 8 | entry fee 8 | seed commitment 32 | guests count 1 | guests 32 each
  if (ix.data.length !== 50 + 32 * n) return no("data size");
  if (ix.data[0] !== 16) return no("instruction");
  const roomId = rdU64(ix.data, 1);
  if (rdU64(ix.data, 9) !== e.entryFee) return no("entry fee");
  if (ix.data[49] !== n) return no("guests");
  for (let i = 0; i < n; i++) {
    if (!new PublicKey(ix.data.subarray(50 + 32 * i, 82 + 32 * i)).equals(e.guests[i])) return no("guest");
  }
  const k = ix.keys;
  if (k.length !== 5) return no("accounts");
  const want: [PublicKey, boolean, boolean][] = [
    [e.authority, true, true],
    [e.host, true, true],
    [e.configPda, false, false],
    [e.roomPda(roomId), false, true],
    [SystemProgram.programId, false, false],
  ];
  for (let i = 0; i < 5; i++) {
    const [key, signer, writable] = want[i];
    if (!k[i].pubkey.equals(key) || k[i].isSigner !== signer || k[i].isWritable !== writable) return no(`account ${i}`);
  }
  // Nobody else may be asked to sign, and the host must be the one signature still missing.
  const signers = tx.compileMessage().accountKeys.slice(0, tx.compileMessage().header.numRequiredSignatures);
  if (signers.length !== 2 || !signers.some((s) => s.equals(e.authority)) || !signers.some((s) => s.equals(e.host))) return no("signers");
  return { ok: true, roomId };
}
