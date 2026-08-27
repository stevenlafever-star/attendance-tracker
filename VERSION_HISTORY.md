# Version history

## v3.0.0 — 2026-08-26
Web port. The desktop app (v2.1.0, Tkinter + SQLite, PyInstaller) is replaced by a
single-page HTML/JS app hosted on GitHub Pages. Motivation: PyInstaller builds kept
triggering Windows Defender false positives (Wacatac.B!ml).

- Policy engine ported line-for-line to `engine.js`; the 34-test suite from `tests.py`
  is ported to `tests.js` (plus 2 web-specific import tests) and passes 36/36. Run it
  from the **Tests** button in the app or at `tests.html`.
- Storage is one JSON file (`attendance.json`) in the shared OneDrive folder, opened
  with the File System Access API (Chrome/Edge). Changes save automatically. Nothing
  leaves the machine; the repo contains code only.
- Import reads the weekly "Transactions and Totals" .xlsx directly, including
  `=ROUND(...)` hours cells with no cached value, and skips the totals section.
- All desktop features ported: dashboard (sortable, rolling-% meter, filter),
  exceptions with issue/waive, go-live cutoff, Word notices, editable notice templates
  (now stored in the database so everyone shares the wording), discipline log with
  manual entries, employee audit workbook, record editor with logged adjustments,
  paycode manager with new-code flagging.
- Multi-user: same file, one writer at a time by convention (no lock, as agreed).

## v2.1.0 (desktop) — reference implementation
Last Python/Tkinter release. Source kept in `reference/` for the policy math.
