import { path, ROUTE_KEYS, type Lang, type RouteKey } from "./i18n";
import { site } from "../site";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Tiny inline markup for the copy files, so a sentence can hold a link:
 *   [text](@rewards)            internal page (route key)
 *   [text](@rewards#pool)       internal page and anchor
 *   [text](https://example.org) external link (https only)
 *   [text](mailto:a@b.c)        mail link
 *   **bold**   `code`
 * Everything else is escaped, so copy can never inject markup.
 */
export function inline(text: string, lang: Lang): string {
  // Placeholders for contact details that live in src/site.ts.
  const filled = text
    .replace(/\{supportEmail\}/g, `[${site.supportEmail}](mailto:${site.supportEmail})`)
    .replace(/\{privacyEmail\}/g, `[${site.privacyEmail}](mailto:${site.privacyEmail})`)
    .replace(/\{securityEmail\}/g, `[${site.securityEmail}](mailto:${site.securityEmail})`);
  let out = esc(filled);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, target: string) => {
    if (target.startsWith("@")) {
      const [key, hash] = target.slice(1).split("#");
      if (!(ROUTE_KEYS as readonly string[]).includes(key)) throw new Error(`inline(): unknown route key "${key}" in "${text}"`);
      return `<a href="${path(lang, key as RouteKey, hash ?? "")}">${label}</a>`;
    }
    if (target.startsWith("mailto:")) return `<a href="${target}">${label}</a>`;
    if (target.startsWith("https://")) return `<a href="${target}" rel="noopener noreferrer">${label}</a>`;
    throw new Error(`inline(): unsupported link target "${target}" in "${text}"`);
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}
