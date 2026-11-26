# Implementation Brief — landing-polish

**Date:** 2026-11-26
**Mode:** fast
**Status:** COMPLETED

## Modified files

| File | Change | Reason |
|---|---|---|
| `favicon.svg`, `docs/logo.svg` | modification / addition | New logo (calendar tile with a gold bolt) as favicon and README logo |
| `src/index.html`, `src/app.css` | modification | The page title shows the same mark inline and decorative (FR-066); og:image, og:image size and alt, twitter large card |
| `src/og-image.png`, `build.mjs` | addition / modification | 1200 x 630 social preview copied to dist (eight dist files) |
| `docs/screenshot-*.png`, `docs/try-it.svg` | addition | README screenshots (synthetic demo data, light and dark) and a large 'Essayer en ligne' button, label outlined from Inter Bold (OFL 1.1, noted) |
| `README.md` | modification | Landing: hero, button, badges, screenshot, how it works, features, privacy TL;DR; previous detail kept in a collapsible block and sections |
| `scripts/check-dist.mjs`, `specs/tempo-simulator.md` | modification | og:image/PNG checks, header mark equals favicon, eight files; FR-065, FR-066 |

## Verification

`npm test` (both modes), `npm run lint`, `check-spdx` pass; SVGs parse; header mark checked in a browser in light, dark and at 390 px.
