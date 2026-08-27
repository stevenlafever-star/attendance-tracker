/* Attendance Tracker — web UI (port of main.py). Client-side only. */
(function () {
  "use strict";
  const VERSION = "3.0.0";
  const E = window.Engine, S = window.Store;
  const { TRACK_ATT, TRACK_TARDY } = E;
  const $ = s => document.querySelector(s);
  const el = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const k in attrs || {}) { if (k === "class") n.className = attrs[k]; else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]); else if (k === "html") n.innerHTML = attrs[k]; else n.setAttribute(k, attrs[k]); } for (const c of kids) if (c !== null && c !== undefined) n.append(c); return n; };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&", "<": "<", ">": ">", '"': """ }[c]));
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const state = { db: null, results: [], names: {}, handle: null, dirty: false, saving: false, fallbackName: "attendance.json",
    sel: { dash: new Set(), exc: new Set(), log: new Set(), codes: new Set() }, sort: {}, filter: { dash: "", log: "" } };
  const supportsFS = "showOpenFilePicker" in window;
  $("#ver").textContent = "v" + VERSION; document.title = "Attendance Tracker v" + VERSION;

  let toastT; function toast(msg, ms) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms || 3500); }
  function dialog(title, bodyNode, buttons, opts) {
    return new Promise(resolve => {
      const d = $("#dlg"); d.innerHTML = "";
      const foot = el("div", { class: "dfoot" });
      const close = v => { d.close(); resolve(v); };
      for (const b of buttons) foot.append(el("button", { class: "btn " + (b.cls || ""), onclick: () => { const v = b.value ? b.value() : b.result; if (v !== undefined) close(v); } }, b.label));
      d.append(el("div", { class: "dhead" }, title), bodyNode, foot);
      d.oncancel = e => { e.preventDefault(); close(null); };
      if (opts && opts.wide) d.style.width = "min(96vw,900px)"; else d.style.width = "";
      d.showModal();
      const first = bodyNode.querySelector("input,select,textarea"); if (first) first.focus();
    });
  }
  function alertBox(msg, title) { return dialog(title || "Attendance Tracker", el("div", { class: "dbody wide" }, el("p", {}, msg)), [{ label: "OK", cls: "primary", result: true }]); }
  function confirmBox(msg, title) { return dialog(title || "Confirm", el("div", { class: "dbody wide" }, el("p", {}, msg)), [{ label: "Cancel", result: false }, { label: "Yes", cls: "primary", result: true }]); }
  function form(title, fields, okLabel) {
    const body = el("div", { class: "dbody" }); const inputs = {};
    for (const f of fields) {
      if (f.type === "note") { body.append(el("p", {}, f.value)); continue; }
      let inp;
      if (f.type === "select") { inp = el("select", {}); for (const o of f.options) { const [v, l] = Array.isArray(o) ? o : [o, o]; inp.append(el("option", { value: v }, l)); } inp.value = f.value ?? f.options[0]?.[0] ?? ""; }
      else if (f.type === "textarea") { inp = el("textarea", { rows: 3, style: "min-height:70px" }); inp.value = f.value || ""; }
      else if (f.type === "datalist") { inp = el("input", { type: "text", list: "dl-" + f.key, placeholder: f.placeholder || "" }); const dl = el("datalist", { id: "dl-" + f.key }); for (const o of f.options) dl.append(el("option", { value: o })); body.append(dl); inp.value = f.value || ""; }
      else { inp = el("input", { type: f.type || "text", placeholder: f.placeholder || "" }); if (f.step) inp.step = f.step; if (f.min !== undefined) inp.min = f.min; inp.value = f.value ?? ""; }
      inputs[f.key] = inp; body.append(el("label", {}, f.label), inp);
    }
    return dialog(title, body, [{ label: "Cancel", result: null }, { label: okLabel || "OK", cls: "primary", value: () => {
      const out = {}; for (const f of fields) { if (f.type === "note") continue; const v = inputs[f.key].value.trim(); if (f.required && !v) { inputs[f.key].focus(); toast(f.label + " is required."); return undefined; } out[f.key] = v; } return out; } }]);
  }

  const idb = { open: () => new Promise((res, rej) => { const r = indexedDB.open("attendance-tracker", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    get: async k => { const db = await idb.open(); return new Promise((res, rej) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); },
    set: async (k, v) => { const db = await idb.open(); return new Promise((res, rej) => { const t = db.transaction("kv", "readwrite").objectStore("kv").put(v, k); t.onsuccess = () => res(); t.onerror = () => rej(t.error); }); } };
  function setDot(cls, name) { $("#dbdot").className = "dot " + cls; if (name !== undefined) $("#dbname").textContent = name; }
  async function loadFromHandle(h) {
    const file = await h.getFile(); const text = await file.text();
    state.db = S.upgrade(text.trim() ? JSON.parse(text) : S.newDb()); state.handle = h; state.dirty = false;
    await idb.set("handle", h).catch(() => {});
    setDot("open", h.name); afterOpen();
  }
  async function openDb() {
    if (!supportsFS) { const inp = el("input", { type: "file", accept: ".json" }); inp.onchange = async () => { const f = inp.files[0]; if (!f) return; state.db = S.upgrade(JSON.parse(await f.text() || "{}")); state.handle = null; state.fallbackName = f.name; setDot("open", f.name + " (download to save)"); afterOpen(); }; inp.click(); return; }
    try { const [h] = await window.showOpenFilePicker({ types: [{ description: "Attendance database", accept: { "application/json": [".json"] } }] }); await loadFromHandle(h); }
    catch (e) { if (e.name !== "AbortError") alertBox("Could not open the database: " + e.message); }
  }
  async function newDb() {
    if (!supportsFS) { state.db = S.newDb(); state.handle = null; setDot("open", "attendance.json (download to save)"); afterOpen(); return; }
    try { const h = await window.showSaveFilePicker({ suggestedName: "attendance.json", types: [{ description: "Attendance database", accept: { "application/json": [".json"] } }] });
      state.db = S.newDb(); state.handle = h; await idb.set("handle", h).catch(() => {}); setDot("open", h.name); await save(true); afterOpen(); }
    catch (e) { if (e.name !== "AbortError") alertBox("Could not create the database: " + e.message); }
  }
  let saveT;
  function commit() { state.dirty = true; setDot("dirty"); clearTimeout(saveT); saveT = setTimeout(() => save(), 400); }
  async function save(force) {
    if (!state.db) return;
    const json = JSON.stringify(state.db);
    if (!state.handle) { if (!force && !state.dirty) return; download(new Blob([json], { type: "application/json" }), state.fallbackName); state.dirty = false; setDot("open"); return; }
    if (state.saving) { state.dirty = true; return; }
    state.saving = true;
    try { const w = await state.handle.createWritable(); await w.write(json); await w.close(); state.dirty = false; setDot("open"); }
    catch (e) { setDot("err"); toast("Save failed: " + e.message + "\nThe file may be locked or permission was lost. Use Save to retry."); }
    finally { state.saving = false; }
  }
  function download(blob, name) { const a = el("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  async function tryReopen() {
    if (!supportsFS) { $("#setup-note").textContent = "This browser does not support direct file access. You can still load a database file and download it after changes; for automatic saving into the shared folder use Chrome or Edge."; return; }
    const h = await idb.get("handle").catch(() => null);
    if (!h) return;
    const note = $("#setup-note"); note.innerHTML = "";
    note.append("Last opened: ", el("span", { class: "mono" }, h.name), " — ", el("button", { class: "btn", onclick: async () => {
      try { const p = await h.requestPermission({ mode: "readwrite" }); if (p === "granted") await loadFromHandle(h); else toast("Permission not granted."); }
      catch (e) { toast("Could not reopen: " + e.message); } } }, "Reopen"));
  }
  function afterOpen() { $("#setup").hidden = true; document.querySelectorAll(".panel").forEach(p => p.style.display = ""); refresh(); }

  function sortKey(v) {
    if (v === null || v === undefined || v === "") return [3, ""];
    if (typeof v === "number") return [0, v];
    const s = String(v).trim(); const n = parseFloat(s.replace(/%$/, "").replace(/,/g, ""));
    if (!isNaN(n) && /^-?[\d,.]+%?$/.test(s)) return [0, n];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return [1, s.slice(6) + s.slice(0, 2) + s.slice(3, 5)];
    return [2, s.toLowerCase()];
  }
  function renderTable(container, id, cols, rows, opts) {
    opts = opts || {};
    const sort = state.sort[id] || (opts.defaultSort ? Object.assign({}, opts.defaultSort) : null);
    if (sort) { const c = cols.find(x => x.key === sort.key); if (c) rows = rows.slice().sort((a, b) => { const ka = sortKey(c.sortValue ? c.sortValue(a) : a[c.key]), kb = sortKey(c.sortValue ? c.sortValue(b) : b[c.key]); const r = ka[0] - kb[0] || (ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0); return sort.desc ? -r : r; }); }
    const sel = opts.selectable ? state.sel[id] : null;
    const table = el("table"), thead = el("thead"), tr = el("tr");
    if (sel) { const all = el("input", { type: "checkbox", title: "Select all shown" }); all.checked = rows.length > 0 && rows.every(r => sel.has(opts.rowKey(r))); all.onchange = () => { rows.forEach(r => all.checked ? sel.add(opts.rowKey(r)) : sel.delete(opts.rowKey(r))); table.querySelectorAll("tbody tr").forEach(t => t.classList.toggle("selected", all.checked)); table.querySelectorAll("tbody input[type=checkbox]").forEach(c => c.checked = all.checked); if (opts.onSelect) opts.onSelect(); }; tr.append(el("th", { class: "sel", onclick: e => e.stopPropagation() }, all)); }
    for (const c of cols) { const th = el("th", { class: c.cls || "", onclick: () => { const cur = state.sort[id]; state.sort[id] = cur && cur.key === c.key ? { key: c.key, desc: !cur.desc } : { key: c.key, desc: false }; opts.rerender(); } }, c.label); if (sort && sort.key === c.key) th.append(el("span", { class: "arrow" }, sort.desc ? "▼" : "▲")); tr.append(th); }
    thead.append(tr); table.append(thead);
    const tbody = el("tbody");
    for (const r of rows) {
      const key = opts.rowKey ? opts.rowKey(r) : null; const trr = el("tr", { class: (opts.rowClass ? opts.rowClass(r) : "") + (sel && sel.has(key) ? " selected" : "") });
      if (sel) { const cb = el("input", { type: "checkbox" }); cb.checked = sel.has(key); cb.onchange = () => { cb.checked ? sel.add(key) : sel.delete(key); trr.classList.toggle("selected", cb.checked); if (opts.onSelect) opts.onSelect(); }; trr.append(el("td", { class: "sel" }, cb)); trr.onclick = e => { if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON" || e.target.tagName === "A") return; cb.checked = !cb.checked; cb.onchange(); }; }
      for (const c of cols) { const v = c.render ? c.render(r) : r[c.key]; trr.append(el("td", { class: c.cls || "" }, v ?? "")); }
      if (opts.onDblClick) trr.ondblclick = () => opts.onDblClick(r);
      tbody.append(trr);
    }
    table.append(tbody); container.innerHTML = "";
    if (!rows.length && opts.empty) { const em = el("div", { class: "empty" }); em.append(el("b", {}, opts.empty[0]), opts.empty[1] || ""); container.append(em); } else container.append(table);
  }
  const meter = pct => { const m = el("div", { class: "meter" }); m.append(el("span", { class: "mono" }, E.pctStr(pct))); const t = el("div", { class: "track" }); t.append(el("div", { class: "fill" + (pct > E.THRESHOLD ? " over" : ""), style: "width:" + Math.min(100, pct / 0.04 * 100) + "%" }), el("div", { class: "tick", title: "2% threshold" })); m.append(t); return m; };

  function refresh() {
    if (!state.db) return;
    try { state.results = S.analyzeAll(state.db); }
    catch (e) { alertBox("Analysis failed: " + e.message); console.error(e); return; }
    state.names = {}; for (const r of state.results) state.names[r.emp_no] = r.name;
    $("#dash-asof").textContent = "As of latest data: " + E.mdy(S.latestDataDate(state.db));
    const sf = S.getSetting(state.db, "suggest_from", ""); $("#exc-from").value = sf || "";
    fillDashboard(); fillExceptions(); fillLog(); fillPaycodes();
  }

  function fillDashboard() {
    const q = state.filter.dash.toLowerCase();
    const rows = state.results.filter(r => !q || r.emp_no.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q));
    renderTable($("#dash-table"), "dash", [
      { key: "emp_no", label: "Emp #", cls: "mono" }, { key: "name", label: "Name" },
      { key: "pct", label: "Rolling %", cls: "num", render: r => meter(r.pct) },
      { key: "numerator", label: "Unexcused hrs", cls: "num", render: r => r.numerator.toFixed(1) },
      { key: "denominator", label: "Worked hrs", cls: "num", render: r => r.denominator.toFixed(1) },
      { key: "tardies_ytd", label: "Tardies YTD", cls: "num" }, { key: "free_tardies_left", label: "Free left", cls: "num" },
      { key: "att_events_rolling", label: "2% events (365d)", cls: "num" },
      { key: "pending", label: "Pending actions", cls: "num", sortValue: r => r.suggestions.length, render: r => r.suggestions.length || "" },
    ], rows, { selectable: true, rowKey: r => r.emp_no, rerender: fillDashboard, defaultSort: { key: "pct", desc: true },
      rowClass: r => r.suggestions.length ? "pending" : r.over_2pct ? "over" : "", onDblClick: r => editRecord(r.emp_no),
      empty: ["No employees yet", "Import a weekly labor report to get started."] });
  }
  function selectedEmps() { const s = [...state.sel.dash].filter(e => state.db.employees[e]); if (!s.length) alertBox("Tick one or more employees on the dashboard first."); return s; }
  function exportDashboard() {
    const wb = XLSX.utils.book_new();
    const rows = [["Emp #", "Name", "Rolling %", "Unexcused hrs", "Worked hrs", "Tardies YTD", "Free tardies left", "2% events (365d)", "Pending actions"]];
    for (const r of state.results.slice().sort((a, b) => b.pct - a.pct)) rows.push([r.emp_no, r.name, Math.round(r.pct * 1e4) / 1e4, Math.round(r.numerator * 100) / 100, Math.round(r.denominator * 100) / 100, r.tardies_ytd, r.free_tardies_left, r.att_events_rolling, r.suggestions.length]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Dashboard");
    const ex = [["Emp #", "Name", "Track", "Event date", "Level", "Discipline", "% at event", "Reason"]];
    for (const r of state.results) for (const s of r.suggestions) ex.push([s.emp_no, r.name, s.track, s.event_date, s.level, E.levelName(s.level), s.pct_at_event ? Math.round(s.pct_at_event * 1e4) / 1e4 : "", s.reason]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ex), "Exceptions");
    const t = E.todayIso(); XLSX.writeFile(wb, "Labor Report " + t.slice(5, 7) + "-" + t.slice(8, 10) + "-" + t.slice(0, 4) + ".xlsx");
  }
  function exportAudit() {
    const emps = selectedEmps(); if (!emps.length) return;
    const byEmp = {}; for (const r of state.results) byEmp[r.emp_no] = r;
    const names = [];
    for (const emp of emps) { const r = byEmp[emp]; if (!r) continue;
      const wb = window.Audit.buildAuditWorkbook(emp, state.names[emp] || "", S.loadHoursDetail(state.db, emp), S.loadDisciplineRows(state.db, emp), r, S.loadAdjustments(state.db, emp));
      const fn = window.Audit.auditFilename(emp, state.names[emp]); XLSX.writeFile(wb, fn); names.push(fn); }
    toast("Audit workbook(s) downloaded:\n" + names.join("\n"));
  }
