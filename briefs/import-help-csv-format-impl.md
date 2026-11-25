# import-help-csv-format — implementation (express)

Mode: express. Status: COMPLETED.

Added to the import card (src/index.html): a short how-to on where to find the export in the EDF customer area (wording hedged, since the exact menu labels are not verifiable offline), and a collapsed `<details>` "Format attendu du fichier (utilisateurs avancés)" with the format rules (separator, encodings, date column, HC/HP or six Tempo indexes, limits) and a two-line sample. Rules were checked against src/core/csv.ts and periods.ts. CSS in src/app.css (existing tokens only). Static markup: no script, style attribute or link.

Gates: build, npm test, TEMPO_DEMO_DATA=1 npm test, lint all exit 0. Chromium screenshots (light, dark, 390px): no horizontal overflow.

Follow-up: format section now shows HC/HP and Tempo (six index) samples plus an Option Base note (the parser requires HC/HP or Tempo columns, so Base has no format of its own). Gates and screenshots re-run.
