# Goshi website (goshi.app)

The site of Goshi: open source, community driven skill games on Solana. Astro, fully static (`dist/`), Spanish first and English
second, no cookies, no trackers, no third-party requests (the play page talks to a Solana RPC node and the game server only when the
games are switched on). Today everything runs on a test network.

## Run it

```
npm install
npm run dev          # http://localhost:4321
npm run verify       # type check + tests + build + quality gates + contrast (run this before every commit)
```

| Command | What it does |
|---|---|
| `npm run build` | `astro build`, then `scripts/prune-play.mjs` (drops the unused wallet chunks while the games are off), then the quality gates (`scripts/check-dist.mjs`). Fails if a gate fails. |
| `npm run build:only` | Build without the gates. |
| `npm run check` | `astro check` (types in `.astro` and `.ts` files). |
| `npm test` | The tests of the play logic in `src/lib/play/` (`node --test`): money math, protocol, snapshots, errors, copy. |
| `npm run gates` | Only the gates, on the existing `dist/`. |
| `npm run contrast` | WCAG contrast check of the colour tokens, dark and light. |
| `npm run brand` | Regenerates the mark, favicons and Open Graph images (`scripts/make-brand-assets.mjs`, needs only `sharp`). |
| `npm run dev:play` | `PUBLIC_PLAY_LOCAL=1 astro dev`: the games on, with the devnet values from `npm run play:local-config`. Local test only. |
| `npm run deploy` | `scripts/deploy-firebase.sh`: verifies, then asks you to type the domain before it publishes. Never run it by accident. |

## Structure

```
src/
  site.ts                 values that change at launch: indexable, emails, legal name, GitHub, socials, and site.play (the games)
  lib/i18n.ts             languages, route keys and the localized slugs (one place)
  lib/inline.ts           tiny inline markup for copy ([text](@route), **bold**, `code`, {supportEmail})
  lib/play/               the games logic: money math (mirrors the contract), wallet, Anchor client, server client, Orb Rush canvas
  content/                ALL the words. en/ and es/ implement the same `Copy` type, so a missing string in one
                          language is a type error (npm run check)
  components/             Header, Footer, Hero, Blocks (renders page content), Calculators, OrbIllustration, Play*, ...
  pages/[lang]/[...slug]  one template that builds every page in both languages from src/content
  pages/index.astro       the root: language chooser, plus /js/lang-redirect.js
  pages/404.astro         bilingual 404
  pages/sitemap.xml.ts    sitemap with hreflang alternates; robots.txt.ts comes from site.indexable
  scripts/                client scripts (menu and theme, calculators, play page)
  styles/global.css       design tokens (dark first, light by system or toggle) and all components
public/                   .htaccess, icons, OG images, manifest, play.css, two tiny scripts (theme, language)
scripts/                  check-dist.mjs, prune-play.mjs, make-brand-assets.mjs, contrast.mjs, deploy-firebase.sh, play-local-config.mjs
docs/                     play-local.md (run the games locally), 
```

### Pages (each exists in /es/ and /en/)

Home, Games, How it works, Play, Token, Security and fairness, Risks, FAQ, Community and open source, Contribute, Roadmap and
changelog, Contact, Privacy (draft), Terms (draft). Plus the root language page, `404.html`, `sitemap.xml`, `robots.txt` and
`manifest.webmanifest`.

### Adding or changing text

Edit `src/content/en/*` and `src/content/es/*`. Pages are lists of typed blocks (prose, cards, steps, table, notice, split, faq,
phases, facts, cta, component, legal). A new page is a new route key in `src/lib/i18n.ts` plus a `Page` in both languages. Spanish is
neutral Latin American (tuteo, no regional slang). No em dashes anywhere (the gates check).

## The play page (feature `play`, OFF by default)

The marketing and information pages are always live. The interactive play section depends on `site.play`:

- `enabled: false` (default): the page shows "coming soon" and loads no wallet code (the build removes it from `dist/`, and a gate checks).
- `enabled: true`: wallet connect (Phantom, Solflare), rooms with paid and saboteur seats, the pot and rake breakdown, the pre-entry modal, transaction status, and the live game
  through the game server (create room, test faucet, bots in dev test mode, lobby, Orb Rush on a canvas, result and payout).
  A visible test banner shows whenever the cluster is not mainnet, and the page is noindex then.

To turn it on (devnet): fill every `TODO(owner)` in `site.play`, set `enabled: true`, make sure the RPC origin and the game server
origin are in the play page CSP in `public/.htaccess` and `firebase.json`, run `npm run verify`. The build fails if a setting is
missing, the test banner is absent, the page is indexable on a test network, or the CSP does not allow the origins.
Local end to end test: `docs/play-local.md`.

## Quality gates

`scripts/check-dist.mjs` runs after every `npm run build` and fails the build when:

- the old brand, or any word of the previous product (see `oldProduct` in the script), appears in the output;
- a page lacks a title, description, canonical or hreflang (the 404 is exempt from the last two);
- an internal link, asset or `#anchor` is broken, or an `http://` asset URL is present;
- a page has no single `h1`, no `lang`, an `img` without `alt`, an inline script or handler (the CSP forbids them);
- `noindex` and `robots.txt` do not match `indexable` in `src/site.ts`;
- the sitemap, manifest icons or the hosting files (`.htaccess`, `404.html`) are missing, or an em dash is present;
- with `cluster: "mainnet-beta"`: any page that still says test network, test token or test environment (en or es), a missing real funds banner, eligibility gate or risk and token links in the play notice, the faucet or bots UI, or "not audited" missing while `audited` is false;
- the play state is inconsistent with `site.play` (wallet code while off, missing test banner, indexable on a test network, origins missing in the CSP).

## Going live

The site is **noindex** until `indexable` is `true` in `src/site.ts` (robots.txt then allows crawlers and lists the sitemap). Flip it
only when the lawyer has cleared the internal legal review. Also fill the `TODO(owner)` values in `src/site.ts` and in the pages.

Hosting: Firebase Hosting (`firebase.json`, `scripts/deploy-firebase.sh`). `public/.htaccess` carries the same rules for Apache.

## Rules for this site

- Spanish first, English second. No translation is ever machine-only.
- No price, return, yield or earnings talk, ever. No "play to earn". A risk notice sits wherever the token or prizes are discussed.
- Governance, votes and the community process are PLANNED, and are described as planned.
- Everything that needs a lawyer is listed in the internal legal review. Update that file in the same commit as any claim.
