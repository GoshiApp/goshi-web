import type { Lang } from "../lib/i18n";
import type { Copy } from "./types";
import { en } from "./en";
import { es } from "./es";
import { site } from "../site";
import { resolveCopy } from "../lib/play/variants";

// Words that depend on the network (test or mainnet), the audit status and the token symbol are chosen here, once, at build time.
const variant = { mainnet: site.play.cluster === "mainnet-beta", audited: site.play.audited, symbol: site.play.token.symbol, tokenName: site.play.token.name };
export const copy: Record<Lang, Copy> = { en: resolveCopy(en, variant), es: resolveCopy(es, variant) };
export type { Copy } from "./types";
