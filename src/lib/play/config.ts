// Shape and checks of the on-chain games settings that live in src/site.ts (`site.play`).
// Pure functions only: this file is safe to import from the server side of Astro and from tests.

export type Cluster = "devnet" | "testnet" | "mainnet-beta";

export interface PlayConfig {
  /** Master switch. false: the page shows "coming soon" and no wallet code is loaded. */
  enabled: boolean;
  cluster: Cluster;
  /** HTTPS JSON RPC endpoint. Its origin must also be allowed in connect-src (public/.htaccess and firebase.json). */
  rpcUrl: string;
  /** The deployed goshi_escrow program. */
  programId: string;
  /** The $GOSHI mint (6 decimals), used only for the saboteur holder check. Must match GameConfig.goshi_mint on chain. */
  goshiMint: string;
  /** The wallet that receives the infrastructure share of the rake (SOL). Must match GameConfig.infra_wallet. */
  infraWallet: string;
  /** The wallet that receives the liquidity and community share of the rake (SOL). Must match GameConfig.liquidity_wallet. */
  liquidityWallet: string;
  /** The play server (WebSocket). ws:// only for localhost, wss:// everywhere else. Its origin must be in connect-src. */
  serverUrl: string;
  /** The token the games use. The symbol is shown everywhere, so a token of your own only needs these two values. */
  token: { symbol: string; name: string };
  /** true only once an external firm has audited the contract and the server. While false the page says it is not audited. */
  audited: boolean;
  /** Which network the explorer links point to. Defaults to `cluster`. On mainnet-beta the links carry no cluster parameter. */
  explorerCluster?: Cluster;
}

const BASE58_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isPublicKeyText = (s: string): boolean => BASE58_KEY.test(s);

export const isMainnet = (c: Cluster): boolean => c === "mainnet-beta";

/** Problems that stop the page from going live. Empty means ready. Each entry names the field. */
export function configProblems(cfg: PlayConfig): string[] {
  const out: string[] = [];
  if (!/^https:\/\/[^\s/]+/.test(cfg.rpcUrl)) out.push("rpcUrl (https URL)");
  if (!/^(wss:\/\/[^\s/]+|ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?)(\/\S*)?$/.test(cfg.serverUrl)) out.push("serverUrl (wss:// URL, or ws:// for localhost)");
  for (const k of ["programId", "goshiMint", "infraWallet", "liquidityWallet"] as const) {
    if (!isPublicKeyText(cfg[k])) out.push(k);
  }
  if (!/^[A-Z0-9]{2,10}$/.test(cfg.token.symbol)) out.push("token.symbol (2 to 10 capital letters or digits)");
  if (cfg.token.name.trim() === "") out.push("token.name");
  if (isMainnet(cfg.cluster) && !/^wss:\/\//.test(cfg.serverUrl)) out.push("serverUrl (wss:// is required on mainnet-beta)");
  if (isMainnet(cfg.cluster) && cfg.explorerCluster !== undefined && cfg.explorerCluster !== "mainnet-beta") out.push("explorerCluster (must be mainnet-beta on mainnet-beta)");
  return out;
}

/** The cluster explorer links use: explorerCluster when set, else the cluster. */
export const explorerClusterOf = (cfg: Pick<PlayConfig, "cluster" | "explorerCluster">): Cluster => cfg.explorerCluster ?? cfg.cluster;

const EXPLORER = "https://explorer.solana.com";
const clusterQuery = (c: Cluster) => (isMainnet(c) ? "" : `?cluster=${c}`);

/** Link to a transaction on the Solana Explorer for the configured cluster. */
export const explorerTxUrl = (c: Cluster, signature: string): string =>
  `${EXPLORER}/tx/${encodeURIComponent(signature)}${clusterQuery(c)}`;

export const explorerAddressUrl = (c: Cluster, address: string): string =>
  `${EXPLORER}/address/${encodeURIComponent(address)}${clusterQuery(c)}`;

/** First and last characters of an address, for display: "7Q8J...pxMxz". */
export const shortAddress = (a: string, head = 4, tail = 4): string =>
  a.length <= head + tail + 3 ? a : `${a.slice(0, head)}...${a.slice(-tail)}`;
