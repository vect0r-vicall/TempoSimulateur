# Implementation Brief — page-discoverability

**Date:** 2026-11-26
**Mode:** fast
**Status:** COMPLETED

## Modified files

| File | Change | Reason |
|---|---|---|
| `src/index.html`, `src/app.css` | modification | French title, description, canonical link, Open Graph and Twitter summary tags; footer icon link to the source repository (inline GitHub mark, new tab, rel noopener noreferrer, accessible name) |
| `src/robots.txt`, `src/sitemap.xml`, `build.mjs` | addition / modification | Crawl hints copied to `dist/` (effective at a host root; on a github.io project path crawlers ignore robots.txt, so the sitemap is submitted in a search console) |
| `scripts/check-dist.mjs` | modification | Seven-file dist; the two sanctioned external URLs (footer link, canonical) are the only exemptions from the external-URL and anchor rules; discoverability assertions |
| `specs/tempo-simulator.md`, `README.md` | modification | FR-064, FR-065, AC-59, stale dist lists, privacy wording about the footer link, exemption list |

## Decisions made

- The footer link opens in a new tab so a click does not discard the loaded CSV; it is a navigation, not a request, so the "no network request" promise is unchanged.
- No og:image until a logo is chosen.

## Verification

`npm test` (both modes), `npm run lint` and `check-spdx` pass; mutation tests of the relaxed dist check all fail as they should.
