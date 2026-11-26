# Implementation Brief — github-pages-deploy

**Date:** 2026-11-26
**Mode:** express
**Status:** COMPLETED

## Modified files

| File | Change | Reason |
|---|---|---|
| `.github/workflows/pages.yml` | addition | On push to main and manual dispatch: `npm ci`, `npm test`, then deploy `dist/` with the official Pages actions |
| `README.md` | modification | 'GitHub Pages (optionnel)' note: public repo or paid plan, Source = GitHub Actions, no HTTP headers on Pages so only the meta CSP/referrer apply; nginx/Caddy stays the reference |

## Decisions made

- No app change: the `<meta name="referrer">` tag already exists in `src/index.html` and is asserted by check-dist.
- Version tags for first-party actions, as chosen by the owner; `npm test` gates the deploy.
