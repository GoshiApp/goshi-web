import { site } from "../site";

export const LANGS = ["es", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "es";

export const ROUTE_KEYS = [
  "home", "games", "ideas", "verify", "matches", "replay", "invite", "profile", "how", "play", "token", "security", "risks", "faq",
  "opensource", "contribute", "roadmap", "support", "privacy", "terms",
] as const;
export type RouteKey = (typeof ROUTE_KEYS)[number];

/** Localized, readable slugs. An empty slug is the language home. */
export const SLUGS: Record<RouteKey, Record<Lang, string>> = {
  home: { es: "", en: "" },
  games: { es: "juegos", en: "games" },
  ideas: { es: "ideas", en: "ideas" },
  verify: { es: "verificar", en: "verify" },
  matches: { es: "partidas", en: "matches" },
  replay: { es: "reproductor", en: "replay" },
  invite: { es: "invitar", en: "invite" },
  profile: { es: "perfil", en: "profile" },
  how: { es: "como-funciona", en: "how-it-works" },
  play: { es: "jugar", en: "play" },
  token: { es: "token", en: "token" },
  security: { es: "seguridad", en: "security" },
  risks: { es: "riesgos", en: "risks" },
  faq: { es: "preguntas-frecuentes", en: "faq" },
  opensource: { es: "comunidad", en: "community" },
  contribute: { es: "contribuir", en: "contribute" },
  roadmap: { es: "hoja-de-ruta", en: "roadmap" },
  support: { es: "contacto", en: "contact" },
  privacy: { es: "privacidad", en: "privacy" },
  terms: { es: "terminos", en: "terms" },
};

/** Path with leading and trailing slash, e.g. /es/como-funciona/ . */
export function path(lang: Lang, key: RouteKey, hash = ""): string {
  const slug = SLUGS[key][lang];
  return `/${lang}/${slug ? slug + "/" : ""}${hash ? "#" + hash : ""}`;
}

export function absolute(p: string): string {
  return new URL(p, site.url).toString();
}

export function otherLang(lang: Lang): Lang {
  return lang === "es" ? "en" : "es";
}

export function routeFromSlug(lang: Lang, slug: string | undefined): RouteKey | undefined {
  const s = slug ?? "";
  return ROUTE_KEYS.find((k) => SLUGS[k][lang] === s);
}
