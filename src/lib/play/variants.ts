// Copy that depends on the network and on the audit status.
// The words of the site are written once, and a few markers choose the right sentence at build time from `site.play`:
//   [[t:text]]  kept only while the cluster is a test network (devnet or testnet)
//   [[m:text]]  kept only on mainnet-beta
//   [[n:text]]  kept only while the contract is NOT audited by an external firm (site.play.audited is false)
//   [[y:text]]  kept only once it is audited
// Placeholders: $GOSHI becomes $ plus the token symbol, {symbol} and {tokenName} come from site.play.token.
// An array item that becomes empty is dropped, so a whole bullet can be marked.

export interface Variant {
  mainnet: boolean;
  audited: boolean;
  symbol: string;
  tokenName: string;
}

export function resolveString(s: string, v: Variant): string {
  let out = s;
  const keep = (flag: string, on: boolean) => {
    out = out.replace(new RegExp(`\\[\\[${flag}:([\\s\\S]*?)\\]\\]`, "g"), (_m, text: string) => (on ? text : ""));
  };
  keep("t", !v.mainnet);
  keep("m", v.mainnet);
  keep("n", !v.audited);
  keep("y", v.audited);
  return out
    .replace(/\$GOSHI\b/g, `$${v.symbol}`)
    .replace(/\{symbol\}/g, v.symbol)
    .replace(/\{tokenName\}/g, v.tokenName)
    .trim();
}

/** Applies resolveString to every string of a copy tree. Does not change the input. */
export function resolveCopy<T>(tree: T, v: Variant): T {
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") return resolveString(x, v);
    if (Array.isArray(x)) {
      const items = x.map(walk);
      // Drop strings that the markers emptied, but never touch arrays of other things.
      return items.filter((it, i) => !(typeof x[i] === "string" && x[i] !== "" && it === ""));
    }
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, walk(val)]));
    return x;
  };
  return walk(tree) as T;
}
