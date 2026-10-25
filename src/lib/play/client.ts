// The client for the native goshi-escrow program (SOL entry fees, saboteur seats gated by a $GOSHI balance).
// Everything that needs @solana/web3.js lives here, and this file is only ever loaded (dynamic import)
// by the play page when the feature is enabled.
//
// What it does: list and read rooms, take a paid seat (join_room) or a saboteur seat (join_free), read balances.
// What it does NOT do: create rooms, finalize, cancel or run the swap. Those need the platform authority key and run on a server.

import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, TokenAccountNotFoundError, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { GoshiEscrow, LEGACY_ROOM_LEN, ROOM_LEN, decodeConfig, decodeRoom, type RoomAccount } from "./escrow-native.ts";
import { PlayError, classifyError, txErrorText } from "./errors.ts";
import { canJoinFree, canJoinPaid, sortRooms, type RoomView } from "./rooms.ts";
import type { Signer } from "./wallet.ts";
import { checkDuelTx } from "./prebuilt.ts";

export interface ClientSettings {
  rpcUrl: string;
  programId: string;
  goshiMint: string;
  infraWallet: string;
  liquidityWallet: string;
}

export interface SendCallbacks {
  /** Called as soon as the network has accepted the transaction, before it is confirmed. */
  onSubmitted?: (signature: string) => void;
}

/** What the contract has stored, as far as the page needs it. */
export interface ChainConfig {
  /** The key that signs the game's own instructions, as recorded in the program's configuration. */
  authority: PublicKey;
  /** $GOSHI base units (6 decimals) a wallet must hold to take a saboteur seat. */
  minHolder: bigint;
  dexEnabled: boolean;
  /** Saboteurs a room needs, with its 10 paid players, before it starts. */
  requiredSaboteurs: number;
}

/** Lamports kept aside for the network fee when checking that a balance can pay an entry. */
export const NETWORK_FEE_MARGIN = 10_000n;

const toView = (r: RoomAccount): RoomView => ({
  roomId: r.roomId,
  entryFee: r.entryFee,
  state: r.state,
  mode: r.mode,
  paid: r.paid.map((p) => p.toBase58()),
  free: r.free.map((p) => p.toBase58()),
  passes: r.passes,
  guests: r.guests.map((g) => g.toBase58()),
});

/**
 * The public devnet node answers 429 (too many requests) when a few people play at once. The default client gives up after
 * a few quick retries; this one waits a little longer, up to about 20 seconds, before the person sees an error.
 */
export function patientFetch(base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return async (input, init) => {
    let wait = 600;
    for (let i = 0; ; i++) {
      const res = await base(input, init);
      if (res.status !== 429 || i >= 5) return res;
      await new Promise((r) => setTimeout(r, wait + Math.random() * 300));
      wait = Math.min(wait * 2, 6000);
    }
  };
}

export class PlayClient {
  readonly connection: Connection;
  readonly programId: PublicKey;
  readonly mint: PublicKey;
  private readonly escrow: GoshiEscrow;
  private readonly infraWallet: PublicKey;
  private readonly liquidityWallet: PublicKey;
  private verified: Promise<ChainConfig> | null = null;

  constructor(settings: ClientSettings) {
    this.connection = new Connection(settings.rpcUrl, { commitment: "confirmed", disableRetryOnRateLimit: true, fetch: patientFetch() });
    this.programId = new PublicKey(settings.programId);
    this.mint = new PublicKey(settings.goshiMint);
    this.infraWallet = new PublicKey(settings.infraWallet);
    this.liquidityWallet = new PublicKey(settings.liquidityWallet);
    // The program address comes from the site settings (site.play.programId), so a redeploy needs no code change.
    this.escrow = new GoshiEscrow(this.programId);
  }

  // ------------------------------------------------------------------ reads

  /** Stops before any money moves if this page's settings do not match what the contract has stored. Cached. */
  verifyConfig(): Promise<ChainConfig> {
    this.verified ??= this.doVerify().catch((e) => {
      this.verified = null; // try again next time (a network blip must not lock the page)
      throw e;
    });
    return this.verified;
  }

  private async doVerify(): Promise<ChainConfig> {
    const info = await this.connection.getAccountInfo(this.programId);
    if (!info?.executable) throw new PlayError("wrongConfig", "The program is not deployed at this address on this network");
    const acc = await this.connection.getAccountInfo(this.escrow.pda.config, "confirmed");
    const cfg = acc ? decodeConfig(acc.data) : null;
    if (!cfg) throw new PlayError("wrongConfig", "The program has not been initialized");
    const same = cfg.mint.equals(this.mint) && cfg.infraWallet.equals(this.infraWallet) && cfg.liquidityWallet.equals(this.liquidityWallet);
    if (!same) throw new PlayError("wrongConfig", "The site settings do not match the on-chain configuration");
    return { authority: cfg.authority, minHolder: cfg.minHolder, dexEnabled: false, requiredSaboteurs: cfg.requiredSaboteurs };
  }

  /** Every MatchRoom account of the program: waiting rooms first, then by number. */
  async listRooms(): Promise<RoomView[]> {
    // Rooms of the v6 program and the ones made before it (no backpacks) have different sizes: both are read.
    const all = (await Promise.all([ROOM_LEN, LEGACY_ROOM_LEN].map((dataSize) =>
      this.connection.getProgramAccounts(this.programId, { commitment: "confirmed", filters: [{ dataSize }] })))).flat();
    const rooms: RoomView[] = [];
    for (const { account } of all) {
      const r = decodeRoom(account.data);
      if (r) rooms.push(toView(r));
    }
    return sortRooms(rooms);
  }

  async fetchRoom(roomId: bigint): Promise<RoomView | null> {
    const info = await this.connection.getAccountInfo(this.escrow.pda.room(roomId), "confirmed");
    const r = info ? decodeRoom(info.data) : null;
    return r ? toView(r) : null;
  }

  private tokenProgramId: PublicKey | null = null;
  /** The token program that owns the $GOSHI mint: the classic one or Token-2022 (what pump.fun creates). Read once. */
  private async tokenProgram(): Promise<PublicKey> {
    if (this.tokenProgramId) return this.tokenProgramId;
    const info = await this.connection.getAccountInfo(this.mint, "confirmed");
    if (!info) return TOKEN_PROGRAM_ID;
    this.tokenProgramId = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    return this.tokenProgramId;
  }

  /** The wallet's $GOSHI balance in base units (its associated token account). 0n when it has none. */
  async getGoshiBalance(owner: PublicKey): Promise<bigint> {
    try {
      const program = await this.tokenProgram();
      return (await getAccount(this.connection, getAssociatedTokenAddressSync(this.mint, owner, false, program), "confirmed", program)).amount;
    } catch (e) {
      if (e instanceof TokenAccountNotFoundError) return 0n;
      throw e;
    }
  }

  /** SOL balance in lamports. */
  async getSolBalance(owner: PublicKey): Promise<bigint> {
    return BigInt(await this.connection.getBalance(owner, "confirmed"));
  }

  // ------------------------------------------------------------------ writes

  /** Takes a paid seat: the entry fee (SOL) moves from the wallet into the room account. */
  async joinRoom(roomId: bigint, wallet: Signer, cb: SendCallbacks = {}, backpack: bigint = 0n): Promise<string> {
    await this.verifyConfig();
    const room = await this.fetchRoom(roomId);
    if (!room) throw new PlayError("roomGone");
    const check = canJoinPaid(room, wallet.publicKey.toBase58());
    if (!check.ok) throw new PlayError(check.reason);
    // The fee plus a margin for the network fee.
    const have = await this.getSolBalance(wallet.publicKey);
    // v6: the backpack for traps travels with the entry (at most the fee) and comes back in full when it is not spent.
    if (backpack < 0n || backpack > room.entryFee) backpack = 0n;
    const need = room.entryFee + backpack + NETWORK_FEE_MARGIN;
    if (have < need) {
      throw new PlayError("insufficientSol", "not enough SOL", undefined, {
        need: need.toString(), fee: room.entryFee.toString(), network: NETWORK_FEE_MARGIN.toString(), have: have.toString(),
      });
    }

    const tx = new Transaction().add(this.escrow.joinRoom(wallet.publicKey, roomId, backpack));
    return this.send(tx, wallet, cb);
  }

  /** Takes a saboteur seat: free, the wallet must hold at least the minimum $GOSHI (nothing is taken from it). */
  async joinFree(roomId: bigint, wallet: Signer, cb: SendCallbacks = {}): Promise<string> {
    const chain = await this.verifyConfig();
    const room = await this.fetchRoom(roomId);
    if (!room) throw new PlayError("roomGone");
    const program = await this.tokenProgram();
    const playerToken = getAssociatedTokenAddressSync(this.mint, wallet.publicKey, false, program);
    let balance: bigint;
    try {
      balance = (await getAccount(this.connection, playerToken, "confirmed", program)).amount;
    } catch (e) {
      if (e instanceof TokenAccountNotFoundError) throw new PlayError("noTokenAccount");
      throw e;
    }
    const check = canJoinFree(room, wallet.publicKey.toBase58(), balance, chain.minHolder);
    if (!check.ok) {
      throw new PlayError(check.reason, check.reason, undefined, check.reason === "notEnoughGoshi" ? { min: chain.minHolder.toString(), have: balance.toString() } : undefined);
    }

    const tx = new Transaction().add(this.escrow.joinFree(wallet.publicKey, roomId, playerToken));
    return this.send(tx, wallet, cb);
  }

  private async preflight(tx: Transaction): Promise<void> {
    let sim;
    try {
      sim = await this.connection.simulateTransaction(tx);
    } catch (e) {
      const kind = classifyError(e);
      throw new PlayError(kind === "unknown" ? "network" : kind, e instanceof Error ? e.message : String(e));
    }
    const err = sim.value.err;
    if (!err) return;
    const text = `${txErrorText(err)}\n${(sim.value.logs ?? []).join("\n")}`;
    console.warn("[goshi] pre-flight simulation failed", err, sim.value.logs);
    throw new PlayError(classifyError({ message: text, logs: sim.value.logs ?? [] }), text);
  }

  /**
   * Polls the signature status over plain HTTPS. web3.js's own confirmTransaction opens a WebSocket,
   * which would need a second origin in the Content-Security-Policy and fails on many public RPCs.
   */
  private async waitForConfirmation(signature: string, lastValidBlockHeight: number): Promise<void> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const { value } = await this.connection.getSignatureStatuses([signature]);
      const st = value[0];
      if (st?.err) throw new PlayError(classifyError({ message: txErrorText(st.err) }), txErrorText(st.err), signature);
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return;
      if ((await this.connection.getBlockHeight("confirmed")) > lastValidBlockHeight) {
        throw new PlayError("expired", "The transaction was not confirmed before its blockhash expired", signature);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new PlayError("network", "Timed out waiting for confirmation", signature);
  }

  /** Sign with the wallet, send through our RPC, wait for "confirmed". */
  /**
   * Signs and sends a transaction that the game server built and signed as the authority (a private duel). The wallet adds the host's
   * signature. The server's blockhash is fresh, so this has to happen within about a minute.
   */
  async sendPrebuilt(base64: string, wallet: Signer, expected: { entryFee: bigint; guests: string[] }, cb: SendCallbacks = {}): Promise<string> {
    const chain = await this.verifyConfig();
    let tx: Transaction;
    try {
      tx = Transaction.from(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    } catch {
      throw new PlayError("unknown", "The transaction from the server could not be read");
    }
    // The wallet is only asked to sign what the player asked for: one instruction of this program, for this fee and these guests.
    const verdict = checkDuelTx(tx, {
      programId: this.programId, authority: chain.authority, host: wallet.publicKey, entryFee: expected.entryFee,
      guests: expected.guests.map((g) => new PublicKey(g)), configPda: this.escrow.pda.config, roomPda: (id) => this.escrow.pda.room(id),
    });
    if (!verdict.ok) throw new PlayError("unknown", `The transaction from the server was refused (${verdict.reason}). Nothing was signed.`);
    const lastValidBlockHeight = (await this.connection.getLatestBlockhash("confirmed")).lastValidBlockHeight;
    let signature: string;
    try {
      const signed = await wallet.signTransaction(tx);
      signature = await this.connection.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
    } catch (e) {
      throw e instanceof PlayError ? e : new PlayError(classifyError(e), e instanceof Error ? e.message : String(e));
    }
    cb.onSubmitted?.(signature);
    try {
      await this.waitForConfirmation(signature, lastValidBlockHeight);
    } catch (e) {
      if (e instanceof PlayError) throw e;
      const kind = classifyError(e);
      throw new PlayError(kind === "unknown" ? "network" : kind, e instanceof Error ? e.message : String(e), signature);
    }
    return signature;
  }

  /** Pays an amount straight to an address (the cash arena entry, to its vault on the test network). */
  async payTo(to: string, lamports: bigint, wallet: Signer, cb: SendCallbacks = {}): Promise<string> {
    await this.verifyConfig();
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: new PublicKey(to), lamports }));
    return this.send(tx, wallet, cb);
  }

  /** Pays the house straight from the wallet: half to maintenance (infra wallet), half to the project (liquidity wallet). */
  async payHouse(lamports: bigint, wallet: Signer, cb: SendCallbacks = {}): Promise<string> {
    await this.verifyConfig();
    const half = lamports / 2n;
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: this.infraWallet, lamports: half }),
      SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: this.liquidityWallet, lamports: lamports - half }),
    );
    return this.send(tx, wallet, cb);
  }

  private async send(tx: Transaction, wallet: Signer, cb: SendCallbacks): Promise<string> {
    tx.feePayer = wallet.publicKey;
    // Pre-flight: simulate on OUR network before the wallet is asked to sign. If this fails the problem is the program
    // or the room, and we can say so in plain words. If it passes and the wallet then fails to simulate, the wallet is
    // on another network (classifySignError).
    await this.preflight(tx);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;

    let signature: string;
    try {
      const signed = await wallet.signTransaction(tx);
      signature = await this.connection.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
    } catch (e) {
      throw e instanceof PlayError ? e : new PlayError(classifyError(e), e instanceof Error ? e.message : String(e));
    }
    cb.onSubmitted?.(signature);

    try {
      await this.waitForConfirmation(signature, lastValidBlockHeight);
    } catch (e) {
      if (e instanceof PlayError) throw e;
      // We could not confirm it. It may still land, so the page keeps the link and says so.
      const kind = classifyError(e);
      throw new PlayError(kind === "unknown" ? "network" : kind, e instanceof Error ? e.message : String(e), signature);
    }
    return signature;
  }
}
