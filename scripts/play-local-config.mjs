// LOCAL TEST ONLY. Reads the devnet deployment written by the escrow repo (~/goshi-escrow/devnet-config.json)
// and writes src/lib/play/local-config.generated.json, which `npm run dev:play` (PUBLIC_PLAY_LOCAL=1) uses.
// The output is gitignored. Override the source with GOSHI_ESCROW_DIR=/path/to/goshi-escrow.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.GOSHI_ESCROW_DIR ?? join(homedir(), "goshi-escrow");
const src = join(dir, "devnet-config.json");

let cfg;
try {
  cfg = JSON.parse(readFileSync(src, "utf8"));
} catch (e) {
  console.error(`Could not read ${src}: ${e.message}\nDeploy and initialize the program on devnet first (see ~/goshi-escrow).`);
  process.exit(1);
}
// v2 fields. A field that is missing keeps the value in src/site.ts (it is simply not written).
if (cfg.cluster !== "devnet") {
  console.error(`Refusing: the cluster in ${src} is "${cfg.cluster}", this local test is devnet only.`);
  process.exit(1);
}
// The local test talks to a game server on this machine (override with GOSHI_SERVER_URL).
const out = { cluster: "devnet", serverUrl: process.env.GOSHI_SERVER_URL ?? "ws://localhost:8787" };
for (const k of ["programId", "goshiMint", "infraWallet", "liquidityWallet"]) {
  if (typeof cfg[k] === "string" && cfg[k]) out[k] = cfg[k];
}
// The v1 file called the two wallets devTreasury and maintTreasury: accept them as a fallback for the same two roles.
if (!out.infraWallet && typeof cfg.devTreasury === "string") out.infraWallet = cfg.devTreasury;
if (!out.liquidityWallet && typeof cfg.maintTreasury === "string") out.liquidityWallet = cfg.maintTreasury;
const missing = ["programId", "goshiMint", "infraWallet", "liquidityWallet"].filter((k) => !out[k]);
const dest = join(root, "src/lib/play/local-config.generated.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${dest}\n` + Object.entries(out).map(([k, v]) => `${k.padEnd(16)} ${v}`).join("\n") + (missing.length ? `\nNot in the file, kept from src/site.ts: ${missing.join(", ")}` : "") + "\nRun: npm run dev:play");
