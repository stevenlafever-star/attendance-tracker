# Attendance Tracker (web)

**Live site:** https://stevenlafever-star.github.io/attendance-tracker/

Client-side tool that enforces a factory Time & Attendance policy: the rolling **2% rule**
for unexcused absences and the **tardy discipline ladder**. HR imports the weekly labor
report, the app computes who is due discipline, HR confirms or waives, and the app
produces Word notices and Excel audit exports.

**Everything runs in the browser. No server. No data is uploaded anywhere.**
This repository contains code only — the database is a `.json` file that lives in the
company's shared OneDrive folder and is opened directly by the page.

## Using it
1. Open https://stevenlafever-star.github.io/attendance-tracker/ in **Chrome or Edge** (needed for direct file access).
2. **Open database…** and pick `2 percent/Database/attendance.json`
   (or **New database…** the first time). The browser asks permission once per session;
   after that, changes save automatically.
3. **Import** the weekly "Transactions and Totals" export (.xlsx). Re-importing a week
   is safe — rows are replaced, not doubled, and manually corrected rows are kept.
4. Work the **Exceptions** tab: tick rows, **Mark issued** or **Waive**, generate
   **Tardy notice** / **2% notice** (.docx downloads).
5. **Discipline Log** for history (seed pre-app disciplines manually). **Paycodes** to
   review any new codes an import flagged.

Convention for shared use: one person edits at a time. There is no lock.

## Policy engine
`engine.js` is a direct port of the Python reference (`reference/engine.py`). The
handbook's worked examples and HR clarifications are encoded in `tests.js`; open
`tests.html` or click **Tests** in the app to run them (36/36 pass).

## Files
| File | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js`, `ui.js` | UI |
| `engine.js` | Policy math (pure, no DOM) |
| `store.js` | JSON data model, weekly-file import, adjustments |
| `audit.js` | Per-employee audit workbook (SheetJS) |
| `notices.js` | Word notices from editable templates (docx.js) |
| `tests.js`, `tests.html` | Test suite |
| `reference/` | Python desktop app v2.1.0 (reference implementation) |
| `VERSION_HISTORY.md` | Changelog; version is `VERSION` in `app.js` |

Libraries load from cdnjs (SheetJS 0.18.5, docx 8.5.0) and Google Fonts; the page works
without the fonts if they are blocked.
