/* Attendance Tracker data store — port of database.py onto a single JSON
   document (persisted by the app to a file the user chooses). No SQL, no server. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.Store = factory(root.Engine);
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  const SEED_PAYCODES = [
    ["DF-PD-Death In Family", "X"], ["DI-PD-Disability", "X"],
    ["DI-UNPD-Disability", "X"], ["FH-PD-Floating Holiday", "X"],
    ["HL-PD-Holiday", "X"], ["HL-UNPD-Holiday", "X"],
    ["JD-PD-Jury Duty", "X"], ["ML-UNPD-Military Leave", "X"],
    ["OT x 1.5 Day", "OT"], ["OT x 1.5 Eve", "OT"], ["OT x 1.5 Night", "OT"],
    ["OT x 2.0 Day", "OT"], ["OT x 2.0 Eve", "OT"], ["OT x 2.0 Night", "OT"],
    ["PB-PD-Personal Business", "X"],
    ["Regular x 1.0 Day", "REG"], ["Regular x 1.0 Eve", "REG"], ["Regular x 1.0 Night", "REG"],
    ["Shift Diff x 1.0", "X"], ["Shift Diff x 1.5", "X"], ["Shift Diff x 2.0", "X"],
    ["SU-UNPD-Suspension", "X"], ["TA-UNPD-Tardy", "TARDY"],
    ["UA-UNPD-Other Unidentified Abs", "MISS"], ["VA-PD-Vacation", "X"],
    ["PB-UNPD-Personal Business", "X"], ["PL-PD-Parental Leave", "X"],
    ["FL-UNPD-Family Leave", "X"], ["UA-PD-Other Unidentified Abs", "MISS"],
    ["TL-UNPD-Temporary Lack Of Work", "X"], ["SU-PD-Suspension", "X"],
    ["IJ-PD-Injury On Job", "X"], ["HR-UNPD-Other HR Approved", "X"],
    ["ML-PD-Military Leave", "X"], ["PT-PD-Paternity Leave", "X"],
    ["Regular NW Not OT Eligible", "X"],
  ];
  const EMP_HEADERS = new Set(["employee id", "emp id", "employee", "emp no", "employee #",
    "employee number", "id", "person number", "person id", "file number", "emp"]);
  const NAME_HEADERS = new Set(["name", "employee name", "full name", "employee full name", "last name, first name"]);
  const DATE_HEADERS = new Set(["date", "work date", "worked date", "date worked", "apply date"]);
  const CODE_HEADERS = new Set(["paycode", "pay code", "code", "earning", "earning code", "pay type", "paycode name", "pay code name"]);
  const HOURS_HEADERS = new Set(["hours", "hrs", "amount", "duration", "total hours", "hours worked", "quantity"]);

  function nowIso() { const d = new Date(); const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); }

  function newDb() {
    const db = { schema: 1, employees: {}, paycodes: {}, hours: {}, imports: [], disciplines: [],
      adjustments: [], settings: {}, templates: {}, next_id: { discipline: 1, adjustment: 1, batch: 1 } };
    for (const [code, cat] of SEED_PAYCODES) db.paycodes[code] = { category: cat, notes: "seeded from Codes.xlsx" };
    return db;
  }
  function upgrade(db) {
    const fresh = newDb();
    for (const k of Object.keys(fresh)) if (db[k] === undefined) db[k] = fresh[k];
    if (Object.keys(db.paycodes).length === 0) db.paycodes = fresh.paycodes;
    return db;
  }

  const norm = v => (v === null || v === undefined) ? "" : String(v).trim().toLowerCase();
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(v) {
    if (v instanceof Date) { if (isNaN(v)) throw new Error("bad date");
      return v.getUTCFullYear() + "-" + String(v.getUTCMonth() + 1).padStart(2, "0") + "-" + String(v.getUTCDate()).padStart(2, "0"); }
    if (typeof v === "number") {
      if (v < 20000 || v > 80000) throw new Error("bad date serial");
      return E.addDays("1899-12-30", Math.floor(v));
    }
    const s = String(v || "").trim().split(" ")[0];
    let m;
    if ((m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/))) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
    if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))) return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) return "20" + m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
    if ((m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; const mo = MONTHS[m[2].toLowerCase()];
      if (mo) return y + "-" + String(mo).padStart(2, "0") + "-" + m[1].padStart(2, "0"); }
    throw new Error("Unrecognized date: " + v);
  }
  function parseFormulaNumber(f) {
    let m = /^=ROUND\(\s*(-?[0-9.eE+]+)\s*[,)]/.exec(f) || /(-?\d+\.?\d*)/.exec(f);
    return m ? Math.round(parseFloat(m[1]) * 100) / 100 : null;
  }
  function findColumns(row) {
    const cols = {};
    row.forEach((h, i) => {
      h = norm(h); if (!h) return;
      if (EMP_HEADERS.has(h) && cols.emp === undefined) cols.emp = i;
      else if (NAME_HEADERS.has(h) && cols.name === undefined) cols.name = i;
      else if (DATE_HEADERS.has(h) && cols.date === undefined) cols.date = i;
      else if (CODE_HEADERS.has(h) && cols.code === undefined) cols.code = i;
      else if (HOURS_HEADERS.has(h) && cols.hours === undefined) cols.hours = i;
    });
    return cols;
  }
  function parseCsv(text) {
    const rows = []; let row = [], field = "", q = false;
    text = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function importRows(db, rows, filename) {
    let headerIdx = null, cols = {};
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const c = findColumns(rows[i] || []);
      if (["emp", "date", "code", "hours"].every(k => c[k] !== undefined)) { headerIdx = i; cols = c; break; }
    }
    if (headerIdx === null) throw new Error("Could not find the header row. The file needs columns for employee id, date, paycode and hours. Found headers like: " +
      (rows[0] || []).slice(0, 10).map(x => JSON.stringify(x)).join(", "));
    const agg = new Map(), names = {}, unknown = new Set(); let skipped = 0;
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]; if (!row || row.every(v => norm(v) === "")) continue;
      let emp, date, code, hrs;
      try {
        emp = String(row[cols.emp] ?? "").trim(); if (emp.endsWith(".0")) emp = emp.slice(0, -2);
        date = parseDate(row[cols.date]);
        code = String(row[cols.code] ?? "").trim();
        let hv = row[cols.hours];
        if (typeof hv === "string" && hv.startsWith("=")) hv = parseFormulaNumber(hv);
        hrs = parseFloat(hv || 0); if (isNaN(hrs)) throw new Error("hours");
      } catch (e) { skipped++; continue; }
      if (!emp || !code || hrs === 0) continue;
      const k = emp + "\u0000" + date + "\u0000" + code;
      agg.set(k, (agg.get(k) || 0) + hrs);
      if (cols.name !== undefined && row[cols.name]) names[emp] = String(row[cols.name]).trim();
      if (!db.paycodes[code]) unknown.add(code);
    }
    const batch = db.next_id.batch++;
    db.imports.push({ batch_id: batch, filename: filename || "", imported_at: nowIso(), rows: agg.size });
    for (const code of unknown) db.paycodes[code] = { category: "X", notes: "AUTO-ADDED " + E.todayIso() + " - REVIEW CATEGORY" };
    for (const [emp, name] of Object.entries(names)) { db.employees[emp] = db.employees[emp] || { name: "", active: 1 }; db.employees[emp].name = name; }
    const protectedKeys = new Set(db.adjustments.map(a => a.emp_no + "\u0000" + a.work_date + "\u0000" + a.paycode));
    let preserved = 0; const dates = new Set(), emps = new Set();
    for (const [k, hrs] of agg) {
      const [emp, date, code] = k.split("\u0000");
      dates.add(date); emps.add(emp);
      db.employees[emp] = db.employees[emp] || { name: "", active: 1 };
      if (protectedKeys.has(k)) { preserved++; continue; }
      const eh = db.hours[emp] || (db.hours[emp] = {});
      eh[date + "|" + code] = { h: hrs, b: batch };
    }
    const ds = [...dates].sort();
    return { rows: agg.size, employees: emps.size, date_range: ds.length ? [ds[0], ds[ds.length - 1]] : [null, null],
      unknown_codes: [...unknown].sort(), skipped, preserved_adjustments: preserved };
  }

  function adjustHours(db, empNo, workDate, paycode, newHours, reason) {
    const eh = db.hours[empNo] || (db.hours[empNo] = {});
    const key = workDate + "|" + paycode;
    const old = eh[key] ? eh[key].h : null;
    if (newHours && newHours > 0) eh[key] = { h: newHours, b: null };
    else { delete eh[key]; newHours = 0; }
    db.employees[empNo] = db.employees[empNo] || { name: "", active: 1 };
    db.adjustments.push({ id: db.next_id.adjustment++, emp_no: empNo, work_date: workDate, paycode,
      old_hours: old, new_hours: newHours, reason, adjusted_at: nowIso() });
  }
  function loadAdjustments(db, empNo) { return db.adjustments.filter(a => a.emp_no === empNo).sort((a, b) => a.adjusted_at < b.adjusted_at ? -1 : 1); }
  function catOf(db, code) { const p = db.paycodes[code]; return p ? p.category : "X"; }
  function loadHours(db, empNo) {
    const out = [], eh = db.hours[empNo] || {};
    for (const k in eh) { const i = k.indexOf("|"); out.push({ d: k.slice(0, i), cat: catOf(db, k.slice(i + 1)), h: eh[k].h }); }
    return out;
  }
  function loadHoursDetail(db, empNo) {
    const out = [], eh = db.hours[empNo] || {};
    for (const k in eh) { const i = k.indexOf("|"); const code = k.slice(i + 1); out.push({ d: k.slice(0, i), code, cat: catOf(db, code), h: eh[k].h }); }
    return out.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.code < b.code ? -1 : 1);
  }
  function loadDisciplineRows(db, empNo) { return db.disciplines.filter(d => d.emp_no === empNo).sort((a, b) => a.event_date < b.event_date ? -1 : 1); }
  function latestDataDate(db) { let m = null; for (const e in db.hours) for (const k in db.hours[e]) { const d = k.slice(0, 10); if (!m || d > m) m = d; } return m || E.todayIso(); }
  function earliestDataDate(db) { let m = null; for (const e in db.hours) for (const k in db.hours[e]) { const d = k.slice(0, 10); if (!m || d < m) m = d; } return m; }
  function getSetting(db, k, dflt) { return db.settings[k] === undefined || db.settings[k] === null ? dflt : db.settings[k]; }
  function setSetting(db, k, v) { if (v === null || v === undefined) delete db.settings[k]; else db.settings[k] = v; }

  function addDiscipline(db, rec) {
    const r = Object.assign({ id: db.next_id.discipline++, issued_date: null, status: "ISSUED", pct_at_event: null, notes: "" }, rec);
    db.disciplines.push(r); return r;
  }
  function deleteDiscipline(db, id) { db.disciplines = db.disciplines.filter(d => d.id !== id); }
  function setCategory(db, code, cat) { const p = db.paycodes[code]; if (p) { p.category = cat; p.notes = (p.notes || "").replace(" - REVIEW CATEGORY", ""); } }

  function analyzeAll(db, asOf) {
    asOf = asOf || latestDataDate(db);
    const suggestFrom = getSetting(db, "suggest_from", null), dataStart = earliestDataDate(db);
    const out = [];
    const emps = Object.entries(db.employees).filter(([, e]) => e.active !== 0)
      .sort((a, b) => (a[1].name || "").localeCompare(b[1].name || "") || a[0].localeCompare(b[0]));
    for (const [no, e] of emps) {
      const res = E.analyzeEmployee(no, loadHours(db, no), loadDisciplineRows(db, no), asOf, { suggestFrom, dataStart });
      res.name = e.name || ""; out.push(res);
    }
    return out;
  }

  return { SEED_PAYCODES, newDb, upgrade, importRows, parseCsv, parseDate, parseFormulaNumber, adjustHours,
    loadAdjustments, loadHours, loadHoursDetail, loadDisciplineRows, latestDataDate, earliestDataDate,
    getSetting, setSetting, addDiscipline, deleteDiscipline, setCategory, analyzeAll, nowIso };
});
