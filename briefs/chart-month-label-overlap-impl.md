# chart-month-label-overlap — implementation (express)

Mode: express. Status: COMPLETED.

Bug: on multi-year month views (>~30 groups) the abbreviated month labels were all drawn and overlapped. Fix in src/core/scene.ts: `monthLabelStep(groupW)` = ceil(38 / group width); in month view only every n-th group gets a label (starting with the first, so the partial first month and its year stay labelled). Year sub-labels unchanged (>= 12 groups apart). Tooltips/aria are unaffected.

Test: scripts/check-chart.mjs, 3-year synthetic series at widths 1200/960/520: shown labels >= 38 units apart, first label and year kept; short ranges keep every label.

Gates: build, npm test, TEMPO_DEMO_DATA=1 npm test, lint exit 0. Review: lead only (assurance local; recorded skip). Not visually re-screenshotted; geometry is covered by the scene test.
