# Properties / invariants
- P1 No network: no fetch/XHR/WebSocket/beacon, no cookies, no localStorage/sessionStorage/IndexedDB.
- P2 Strict CSP (default-src 'none', no inline script, no connect-src); sample server headers shipped.
- P3 No raw HTML from file content: textContent / DOM API only, never innerHTML.
- P4 Input limits (file size, rows); tolerant parsing; French error messages, no unhandled exceptions.
- P5 Money in integer cents/micro-euros; no float drift in totals.
- P6 No personal data in git (*.csv ignored).
- Zero runtime dependencies, no CDN.
## Test policy
Pragmatic and light: parser, pricing engine, aggregation only. Test debt is noted in the friction log, never blocking.
