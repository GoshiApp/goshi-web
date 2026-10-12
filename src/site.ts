// The few values that change at launch or when the owner decides them.
// Everything marked TODO(owner) is a placeholder, listed in docs/legal-review.md.
import type { PlayConfig } from "./lib/play/config";

/**
 * LOCAL TEST ONLY. With PUBLIC_PLAY_LOCAL=1 (npm run dev:play), the devnet values come from
 * src/lib/play/local-config.generated.json (made by `npm run play:local-config` from ~/goshi-escrow/devnet-config.json,
 * gitignored) and the games are switched on. With the variable unset this does nothing and the games stay off.
 */
const generated = import.meta.glob<Partial<PlayConfig>>("./lib/play/local-config.generated.json", { eager: true, import: "default" });
function withLocalOverride(base: PlayConfig): PlayConfig {
  if (import.meta.env.PUBLIC_PLAY_LOCAL !== "1") return base;
  return { ...base, ...(Object.values(generated)[0] ?? {}), enabled: true };
}

/**
 * On-chain games (the goshi_escrow Solana program). OFF by default.
 *
 * enabled false: the page /es/jugar/ and /en/play/ shows a calm "coming soon" and loads no wallet code.
 * To try it on devnet: fill every TODO(owner) value below, set enabled to true, and add the RPC origin to
 * connect-src for the play page in public/.htaccess and firebase.json (the build checks that it is there).
 * Going to mainnet: see docs/go-mainnet.md. Keep cluster "devnet" until the contract is audited and the lawyer has cleared docs/legal-review.md section 10.
 * The page is noindex while cluster is not "mainnet-beta", whatever `indexable` says.
 */
const play: PlayConfig = withLocalOverride({
  enabled: true,
  cluster: "devnet",
  /** TODO(owner): a reliable devnet RPC. The public one is rate limited. Its origin must be in connect-src (see above). */
  rpcUrl: "https://api.devnet.solana.com",
  /** The program id of goshi_escrow (from its IDL). TODO(owner): replace if you redeploy under another key. */
  programId: "7phmG6f5A7g2GB2xMSV1TzCTDJMLMNf8WsBcwWgC4ggE",
  /** TODO(owner): the $GOSHI mint (6 decimals). Used for the saboteur holder check. Must be the mint stored in the program config. */
  goshiMint: "DiAQBixUdJxCNUdY3NyogaBXScgMiCWPeireAtHEHRC8",
  /** TODO(owner): the wallet that receives the infrastructure share of the rake (SOL). Must match GameConfig.infra_wallet of the v2 program. */
  infraWallet: "JD6zGCtMiwRL6UMuP5a7FN465XDCCuhWzHjU8cQAMQHR",
  /** TODO(owner): the wallet that receives the liquidity and community share of the rake (SOL). Must match GameConfig.liquidity_wallet. */
  liquidityWallet: "CCQnx7EsybugJQvGj2ky9GBRF2eebXXtVeC8zhAiufkt",
  /** The play server (WebSocket). TODO(owner): a wss:// URL once the server is hosted, and add its origin to connect-src in the play page CSP (public/.htaccess and firebase.json, the build checks). */
  serverUrl: "wss://goshi-play-server-suxisoytmq-uc.a.run.app",
  /**
   * The token the games use. TODO(owner): the symbol and name of the real token before mainnet. The symbol is used on every page.
   * While the cluster is devnet or testnet the page says "test" before it automatically.
   */
  token: { symbol: "GOSHI", name: "Goshi" },
  /** true only once an external firm has audited the contract and the server. While false the page says it is not audited. */
  audited: false,
});

export const site = {
  name: "Goshi",
  shortName: "Goshi",
  /** TODO(owner): the final tagline. The copy files carry a working one ("Skill games on Solana, built in the open"). */
  domain: "goshi.app",
  url: "https://goshi.app",
  /**
   * false: every page carries noindex and robots.txt blocks crawlers. Flip to true
   * only when the legal review (docs/legal-review.md) is done.
   */
  indexable: false,
  /** TODO(owner): these mailboxes must exist before the site goes live. */
  supportEmail: "support@goshi.app",
  securityEmail: "support@goshi.app",
  privacyEmail: "support@goshi.app",
  /** TODO(owner): the final legal entity name, shown in the footer and in the legal pages. Empty falls back to the brand name. */
  legalName: "Goshi Labs",
  /** TODO(owner): the GitHub organization URL (https). While empty, the community page says the repository is not public yet. */
  githubUrl: "https://github.com/GoshiApp",
  /** Social profiles, https URLs. Empty entries are not shown. */
  social: {
    x: "https://x.com/GoshiApp",
    tiktok: "https://www.tiktok.com/@goshi.app",
    telegram: "https://t.me/goshi_official",
    github: "https://github.com/GoshiApp",
    instagram: "",
    youtube: "",
  } as Record<string, string>,
  /** Date shown on the legal pages. */
  legalUpdated: "2026-10-09",
  year: 2026,
  themeColor: "#070b1f",
  play,
  /**
   * Launch window. Written by `npm run launch` (scripts/launch.mjs), never by hand.
   * endsAt: ISO time when the window ends. Empty means no banner and no countdown.
   * ca: the token contract address (mint). wallets: the public treasury addresses, shown for transparency.
   */
  launch: {
    endsAt: "" as string,
    ca: "" as string,
    wallets: { infra: "", liquidity: "", burn: "", jackpot: "" } as Record<"infra" | "liquidity" | "burn" | "jackpot", string>,
  },
} as const;
