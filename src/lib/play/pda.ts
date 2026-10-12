// Program derived addresses of goshi_escrow v2. Seeds, from lib.rs:
//   config = ["config"]            vault = ["vault"] (SOL held for the swap)       pool = ["pool"] (the $GOSHI pool token account)
//   room   = ["room", room_id as u64 little endian]
//   batch  = ["batch", batch_id as u64 little endian]
//   credit = ["credit", room account address, wallet]   (a saboteur's payout)
import { PublicKey } from "@solana/web3.js";

const enc = new TextEncoder();
const U64_MAX = 18_446_744_073_709_551_615n;

/** u64 little endian, 8 bytes. */
export function u64le(n: bigint): Uint8Array {
  if (n < 0n || n > U64_MAX) throw new RangeError("id must fit in a u64");
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
}

const find = (programId: PublicKey, seeds: Uint8Array[]): PublicKey => PublicKey.findProgramAddressSync(seeds, programId)[0];

export const findConfigPda = (programId: PublicKey): PublicKey => find(programId, [enc.encode("config")]);
export const findVaultPda = (programId: PublicKey): PublicKey => find(programId, [enc.encode("vault")]);
export const findPoolPda = (programId: PublicKey): PublicKey => find(programId, [enc.encode("pool")]);
export const findRoomPda = (programId: PublicKey, roomId: bigint): PublicKey => find(programId, [enc.encode("room"), u64le(roomId)]);
export const findBatchPda = (programId: PublicKey, batchId: bigint): PublicKey => find(programId, [enc.encode("batch"), u64le(batchId)]);
export const findCreditPda = (programId: PublicKey, room: PublicKey, wallet: PublicKey): PublicKey =>
  find(programId, [enc.encode("credit"), room.toBytes(), wallet.toBytes()]);
