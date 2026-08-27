  async function editRecord(emp) {
    if (!emp) { const s = [...state.sel.dash]; if (s.length !== 1) { alertBox("Tick exactly one employee on the dashboard first."); return; } emp = s[0]; }
    const name = state.names[emp] || "";
    const body = el("div", { class: "dbody wide" });
    const bar = el("div", { class: "bar" }); const wrap = el("div", { class: "tablewrap" });
    let selected = null;
    const fill = () => { const rows = S.loadHoursDetail(state.db, emp); selected = null;
      renderTable(wrap, "rec", [{ key: "d", label: "Date", cls: "date", render: r => E.mdy(r.d) }, { key: "day", label: "Day", render: r => DOW[E.dow(r.d)] }, { key: "code", label: "PayCode" }, { key: "cat", label: "Category" }, { key: "h", label: "Hours", cls: "num", render: r => Math.round(r.h * 100) / 100 }], rows,
        { rerender: fill, defaultSort: { key: "d", desc: false }, empty: ["No hours on record", ""], onDblClick: r => { selected = r; doEdit(); } });
      wrap.querySelectorAll("tbody tr").forEach((tr, i) => { tr.style.cursor = "pointer"; tr.onclick = () => { wrap.querySelectorAll("tbody tr").forEach(t => t.classList.remove("selected")); tr.classList.add("selected"); const t = tr.children; selected = { d: E.parseMdy(t[0].textContent), code: t[2].textContent, h: parseFloat(t[4].textContent) }; }; }); };
    const reason = async () => { const r = await form("Reason for this correction", [{ key: "reason", label: "Reason (required, logged)", type: "text", required: true }]); return r && r.reason; };
    const doEdit = async () => { if (!selected) { toast("Select a row first."); return; } const r = await form("Edit hours", [{ key: "h", label: "New hours for " + selected.code + " on " + E.mdy(selected.d), type: "number", step: "0.01", min: 0, value: selected.h, required: true }, { key: "reason", label: "Reason (required, logged)", type: "text", required: true }]); if (!r) return; const h = parseFloat(r.h); if (isNaN(h) || h < 0) { toast("Enter a number (0 removes the row)."); return; } S.adjustHours(state.db, emp, selected.d, selected.code, h, r.reason); commit(); fill(); refresh(); };
    const doDelete = async () => { if (!selected) { toast("Select a row first."); return; } if (!await confirmBox("Remove " + selected.h + " hrs of " + selected.code + " on " + E.mdy(selected.d) + "?")) return; const rs = await reason(); if (!rs) return; S.adjustHours(state.db, emp, selected.d, selected.code, 0, rs); commit(); fill(); refresh(); };
    const doAdd = async () => { const r = await form("Add hours row", [{ key: "d", label: "Date", type: "date", value: E.todayIso(), required: true }, { key: "code", label: "PayCode", type: "select", options: Object.keys(state.db.paycodes).sort() }, { key: "h", label: "Hours", type: "number", step: "0.01", min: 0, required: true }, { key: "reason", label: "Reason (required, logged)", type: "text", required: true }]); if (!r) return; const h = parseFloat(r.h); if (!(h > 0)) { toast("Hours must be positive."); return; } S.adjustHours(state.db, emp, r.d, r.code, h, r.reason); commit(); fill(); refresh(); };
    bar.append(el("button", { class: "btn", onclick: doEdit }, "Edit hours…"), el("button", { class: "btn", onclick: doDelete }, "Delete row…"), el("button", { class: "btn", onclick: doAdd }, "Add row…"), el("span", { class: "hint" }, "Every change requires a reason and is logged"));
    body.append(bar, wrap); fill();
    await dialog("Edit record — " + name + " (" + emp + ")", body, [{ label: "Close", result: true }], { wide: true });
  }

  function allSuggestions() { const out = []; for (const r of state.results) for (const s of r.suggestions) out.push(Object.assign({ name: r.name, key: s.emp_no + "|" + s.track + "|" + s.event_date }, s)); return out; }
  function fillExceptions() {
    const rows = allSuggestions();
    const c = $("#exc-count"); c.textContent = rows.length; c.hidden = !rows.length;
    for (const k of [...state.sel.exc]) if (!rows.some(r => r.key === k)) state.sel.exc.delete(k);
    renderTable($("#exc-table"), "exc", [
      { key: "emp_no", label: "Emp #", cls: "mono" }, { key: "name", label: "Name" }, { key: "track", label: "Track" },
      { key: "event_date", label: "Event date", cls: "date", render: r => E.mdy(r.event_date) },
      { key: "level", label: "Discipline", render: r => { const p = el("span", { class: "pill" + (r.level >= 4 ? " term" : "") }, r.level); return el("span", {}, p, " ", E.levelName(r.level)); } },
      { key: "pct_at_event", label: "% at event", cls: "num", render: r => r.pct_at_event !== null ? E.pctStr(r.pct_at_event) : "\u2014" },
      { key: "reason", label: "Reason", cls: "wrap" },
    ], rows, { selectable: true, rowKey: r => r.key, rerender: fillExceptions, rowClass: r => r.level >= 4 ? "term" : "",
      empty: ["Nothing pending", "No discipline appears due beyond what is already in the log."] });
  }
  function selectedExceptions() { const all = allSuggestions(); const s = all.filter(r => state.sel.exc.has(r.key)); if (!s.length) alertBox("Tick one or more rows first."); return s; }
  async function markIssued() {
    const sel = selectedExceptions(); if (!sel.length) return;
    const r = await form("Mark issued (" + sel.length + ")", [{ key: "issued", label: "Date issued", type: "date", value: E.todayIso(), required: true }, { key: "notes", label: "Notes (optional)", type: "text" }], "Mark issued");
    if (!r) return;
    for (const s of sel) S.addDiscipline(state.db, { emp_no: s.emp_no, track: s.track, level: s.level, event_date: s.event_date, issued_date: r.issued, status: "ISSUED", pct_at_event: s.pct_at_event, notes: r.notes || s.reason });
    state.sel.exc.clear(); commit(); refresh();
  }
  async function waive() {
    const sel = selectedExceptions(); if (!sel.length) return;
    const r = await form("Waive (" + sel.length + ")", [{ key: "notes", label: "Reason for waiving (recorded in the log)", type: "text", required: true }], "Waive");
    if (!r) return;
    for (const s of sel) S.addDiscipline(state.db, { emp_no: s.emp_no, track: s.track, level: s.level, event_date: s.event_date, issued_date: E.todayIso(), status: "WAIVED", pct_at_event: s.pct_at_event, notes: r.notes });
    state.sel.exc.clear(); commit(); refresh();
  }
  async function genNotice(track) {
    let sel = selectedExceptions(); if (!sel.length) return;
    sel = sel.filter(s => s.track === track);
    if (!sel.length) { alertBox("No ticked rows are on the " + (track === TRACK_TARDY ? "TARDY" : "ATTENDANCE (2%)") + " track — use the other notice button for those."); return; }
    const byEmp = {}; for (const r of state.results) byEmp[r.emp_no] = r;
    const names = [];
    for (const s of sel) {
      const r = byEmp[s.emp_no] || {}; let quarterTardies = [], freeTardies = [];
      if (track === TRACK_TARDY) {
        const q = E.quarterOf(s.event_date); const levels = {}; for (const t of r.tardy_timeline || []) levels[t.event_date] = t.level;
        const free = new Set(r.free_tardy_dates || []);
        for (const d of r.tardy_days || []) if (E.quarterOf(d) === q && d <= s.event_date) {
          const label = free.has(d) ? "Free tardy (no discipline)" : d === s.event_date ? "THIS EVENT — " + E.levelName(s.level) : levels[d] ? E.levelName(levels[d]) : "On record";
          quarterTardies.push([d, label]); }
        freeTardies = [...free].filter(d => E.yearOf(d) === E.yearOf(s.event_date) && d <= s.event_date).sort();
      }
      const o = { emp_no: s.emp_no, name: state.names[s.emp_no] || "", track, level: s.level, event_date: s.event_date, pct_at_event: s.pct_at_event, reason: s.reason, quarter_tardies: quarterTardies, free_tardies: freeTardies };
      try { const blob = await window.Notices.noticeBlob(state.db, o); const fn = window.Notices.noticeFilename(o); download(blob, fn); names.push(fn); }
      catch (e) { alertBox("Notice failed: " + e.message); console.error(e); return; }
    }
    toast("Draft notice(s) downloaded:\n" + names.join("\n"));
  }
  async function editTemplates() {
    const body = el("div", { class: "dbody wide" });
    const sel = el("select", {}, el("option", { value: TRACK_TARDY }, "Tardy notice"), el("option", { value: TRACK_ATT }, "2% notice"));
    const ta = el("textarea", { spellcheck: "false" });
    const load = () => ta.value = window.Notices.getTemplate(state.db, sel.value);
    sel.onchange = load; load();
    body.append(el("div", { class: "bar" }, el("label", {}, "Template: "), sel, el("button", { class: "btn", onclick: () => { ta.value = window.Notices.defaultTemplate(sel.value); } }, "Reset to starter")),
      el("p", {}, "Lines: \u201c# \u201d heading \u00b7 **bold** \u00b7 \u201c| Label | Value |\u201d table row. Placeholders: {EMPLOYEE} {EMP_NO} {DATE_ISSUED} {TRACK} {EVENT_DATE} {LEVEL} {PCT} {REASON} {POLICY_TEXT} {QUARTER_TARDIES} {FREE_TARDIES}. A list placeholder alone on a line expands to one line per item. Saved in the database file, so everyone gets the same wording."), ta);
    const r = await dialog("Edit notice templates", body, [{ label: "Close", result: null }, { label: "Save template", cls: "primary", result: true }], { wide: true });
    if (r) { state.db.templates = state.db.templates || {}; state.db.templates[sel.value] = ta.value; commit(); toast("Template saved."); }
  }
  function applySuggestFrom() { const v = $("#exc-from").value; S.setSetting(state.db, "suggest_from", v || null); commit(); refresh(); }

  function fillLog() {
    const q = state.filter.log.toLowerCase();
    const rows = state.db.disciplines.map(d => Object.assign({ name: state.names[d.emp_no] || (state.db.employees[d.emp_no] || {}).name || "" }, d))
      .filter(r => !q || r.emp_no.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    for (const k of [...state.sel.log]) if (!rows.some(r => r.id === k)) state.sel.log.delete(k);
    renderTable($("#log-table"), "log", [
      { key: "id", label: "ID", cls: "num" }, { key: "emp_no", label: "Emp #", cls: "mono" }, { key: "name", label: "Name" }, { key: "track", label: "Track" },
      { key: "level", label: "Discipline", render: r => E.levelName(r.level), sortValue: r => r.level },
      { key: "event_date", label: "Event date", cls: "date", render: r => E.mdy(r.event_date) },
      { key: "issued_date", label: "Issued", cls: "date", render: r => E.mdy(r.issued_date) },
      { key: "status", label: "Status", render: r => el("span", { class: "pill " + r.status.toLowerCase() }, r.status) },
      { key: "notes", label: "Notes", cls: "wrap" },
    ], rows, { selectable: true, rowKey: r => r.id, rerender: fillLog, defaultSort: { key: "event_date", desc: true }, empty: ["Log is empty", "Mark exceptions issued/waived, or add prior history manually."] });
  }
  async function addLogEntry() {
    const emps = Object.entries(state.db.employees).map(([no, e]) => no + " \u2014 " + (e.name || "")).sort();
    const r = await form("Add discipline log entry", [
      { key: "emp", label: "Employee", type: "datalist", options: emps, placeholder: "Emp # \u2014 Name", required: true },
      { key: "track", label: "Track", type: "select", options: [TRACK_TARDY, TRACK_ATT] },
      { key: "level", label: "Level", type: "select", options: Object.entries(E.LEVEL_NAMES).map(([k, v]) => [k, k + " \u2014 " + v]) },
      { key: "event", label: "Event date", type: "date", value: E.todayIso(), required: true },
      { key: "issued", label: "Issued date", type: "date", value: E.todayIso(), required: true },
      { key: "status", label: "Status", type: "select", options: ["ISSUED", "WAIVED"] },
      { key: "notes", label: "Notes", type: "text" }], "Add entry");
    if (!r) return;
    const emp = r.emp.split("\u2014")[0].trim(); if (!emp) { toast("Employee required."); return; }
    if (!state.db.employees[emp]) state.db.employees[emp] = { name: r.emp.split("\u2014")[1]?.trim() || "", active: 1 };
    S.addDiscipline(state.db, { emp_no: emp, track: r.track, level: +r.level, event_date: r.event, issued_date: r.issued, status: r.status, notes: r.notes });
    commit(); refresh();
  }
  async function deleteLogEntries() {
    const ids = [...state.sel.log]; if (!ids.length) { alertBox("Tick a row first."); return; }
    if (!await confirmBox("Delete " + ids.length + " log entr" + (ids.length === 1 ? "y" : "ies") + "? This changes future ladder calculations.")) return;
    for (const id of ids) S.deleteDiscipline(state.db, id); state.sel.log.clear(); commit(); refresh();
  }

  function logImport(msg) { const l = $("#imp-log"); l.textContent += msg + "\n"; l.scrollTop = l.scrollHeight; }
  async function importFile(file) {
    if (!state.db) { alertBox("Open a database first."); return; }
    let rows;
    try {
      const name = file.name.toLowerCase();
      if (/\.(xlsx|xlsm|xltx)$/.test(name)) {
        const wb = XLSX.read(await file.arrayBuffer(), { cellFormula: true, cellDates: false, cellNF: false, sheetStubs: true });
        const ws = wb.Sheets[wb.SheetNames[0]]; const range = XLSX.utils.decode_range(ws["!ref"]); rows = [];
        for (let R = range.s.r; R <= range.e.r; R++) { const row = []; for (let C = range.s.c; C <= range.e.c; C++) { const c = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (!c) { row.push(null); continue; } if (c.f && (c.t === "z" || c.v === undefined || c.v === null || c.v === "")) row.push("=" + c.f); else if (c.t === "z") row.push(null); else row.push(c.v); } rows.push(row); }
      } else if (/\.(csv|txt|tsv)$/.test(name)) { const text = await file.text(); rows = name.endsWith(".tsv") ? text.split(/\r?\n/).map(l => l.split("\t")) : S.parseCsv(text); }
      else throw new Error("Unsupported file type. Use .xlsx or .csv.");
      const s = S.importRows(state.db, rows, file.name);
      commit();
      const dr = s.date_range;
      logImport("[" + S.nowIso().replace("T", " ").slice(0, 16) + "] " + file.name + ": " + s.rows + " rows, " + s.employees + " employees, dates " + E.mdy(dr[0] || "") + " \u2192 " + E.mdy(dr[1] || "") + ", " + s.skipped + " rows skipped" + (s.preserved_adjustments ? ", " + s.preserved_adjustments + " manually-corrected rows preserved" : ""));
      if (s.unknown_codes.length) { logImport("  \u26a0 NEW PAYCODES added as 'X' (excluded) \u2014 review on the Paycodes tab: " + s.unknown_codes.join(", ")); alertBox("New paycodes were found and excluded from the calculation by default:\n\n" + s.unknown_codes.join("\n") + "\n\nReview them on the Paycodes tab.", "New paycodes"); }
      refresh();
    } catch (e) { logImport("  \u2716 Import failed: " + e.message); alertBox("Import failed: " + e.message); console.error(e); }
  }

  function fillPaycodes() {
    const rows = Object.entries(state.db.paycodes).map(([code, p]) => ({ code, category: p.category, notes: p.notes || "" }));
    renderTable($("#codes-table"), "codes", [{ key: "code", label: "Paycode" }, { key: "category", label: "Category", render: r => el("span", { class: "pill" }, r.category) }, { key: "notes", label: "Notes", cls: "wrap" }], rows,
      { selectable: true, rowKey: r => r.code, rerender: fillPaycodes, defaultSort: { key: "code", desc: false }, rowClass: r => r.notes.includes("REVIEW") ? "review" : "" });
  }
  function setCategory(cat) { const sel = [...state.sel.codes]; if (!sel.length) { alertBox("Tick paycode rows first."); return; } for (const c of sel) S.setCategory(state.db, c, cat); state.sel.codes.clear(); commit(); refresh(); }

  async function runTestsInBrowser() {
    if (!window.runTests) { await new Promise((res, rej) => { const s = el("script", { src: "tests.js" }); s.onload = res; s.onerror = rej; document.head.append(s); }); }
    const lines = []; const r = window.runTests(m => lines.push(m));
    const pre = el("pre", { class: "log", style: "max-height:60vh;font-size:12px" }, lines.join("\n"));
    const body = el("div", { class: "dbody wide" }, el("p", {}, r.fail ? "\u26a0 " + r.fail + " test(s) FAILED \u2014 do not trust this build." : "\u2714 All " + r.pass + " policy tests pass (handbook worked examples, HR clarifications, import/adjustment behaviour)."), pre);
    await dialog("Policy engine self-test", body, [{ label: "Close", result: true }], { wide: true });
  }

  document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => { document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("active", x === b)); document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + b.dataset.tab)); });
  $("#btn-open").onclick = $("#setup-open").onclick = openDb;
  $("#btn-new").onclick = $("#setup-new").onclick = newDb;
  $("#btn-save").onclick = () => save(true);
  $("#btn-tests").onclick = runTestsInBrowser;
  $("#dash-refresh").onclick = refresh; $("#dash-export").onclick = exportDashboard; $("#dash-audit").onclick = exportAudit; $("#dash-edit").onclick = () => editRecord();
  $("#dash-search").oninput = e => { state.filter.dash = e.target.value; fillDashboard(); };
  $("#log-search").oninput = e => { state.filter.log = e.target.value; fillLog(); };
  $("#exc-issue").onclick = markIssued; $("#exc-waive").onclick = waive; $("#exc-notice-tardy").onclick = () => genNotice(TRACK_TARDY); $("#exc-notice-att").onclick = () => genNotice(TRACK_ATT);
  $("#exc-templates").onclick = editTemplates; $("#exc-apply").onclick = applySuggestFrom;
  $("#log-add").onclick = addLogEntry; $("#log-del").onclick = deleteLogEntries;
  $("#imp-pick").onclick = () => $("#imp-file").click(); $("#imp-file").onchange = e => { for (const f of e.target.files) importFile(f); e.target.value = ""; };
  const drop = $("#drop"); drop.ondragover = e => { e.preventDefault(); drop.classList.add("drag"); }; drop.ondragleave = () => drop.classList.remove("drag"); drop.ondrop = e => { e.preventDefault(); drop.classList.remove("drag"); for (const f of e.dataTransfer.files) importFile(f); };
  document.querySelectorAll("#tab-codes [data-cat]").forEach(b => b.onclick = () => setCategory(b.dataset.cat));
  window.addEventListener("beforeunload", e => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
  document.querySelectorAll(".panel").forEach(p => p.style.display = "none");
  tryReopen();
})();
