import { absolute, path, LANGS, ROUTE_KEYS } from "../lib/i18n";

// One entry per page and language, each listing its alternates (hreflang).
export function GET() {
  const urls = LANGS.flatMap((lang) =>
    ROUTE_KEYS.map((route) => {
      const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${absolute(path(l, route))}"/>`).join("\n");
      return `  <url>\n    <loc>${absolute(path(lang, route))}</loc>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${absolute("/")}"/>\n  </url>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
