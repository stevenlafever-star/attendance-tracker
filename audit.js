/* Per-employee audit workbook — port of audit.py, built with SheetJS. */
(function (root) {
  "use strict";
  const E = root.Engine;
  const { REG, OT, TARDY, MISS } = E;
  const mdy = E.mdy, DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const r2 = x => Math.round(x * 100) / 100;

  function buildAuditWorkbook(empNo, name, detail, disciplines, result, adjustments) {
    const hours3 = detail.map(r => ({ d: r.d, cat: r.cat, h: r.h }));
    const byDay = new Map();
    for (const r of detail) {
      if (!byDay.has(r.d)) byDay.set(r.d, { REG: 0, OT: 0, TARDY: 0, MISS: 0, X: 0, codes: [] });
      const rec = byDay.get(r.d);
      rec[[REG, OT, TARDY, MISS].includes(r.cat) ? r.cat : "X"] += r.h;
      rec.codes.push([r.code, r.cat, r.h]);
    }
    const tardyEvents = new Set(E.tardyEventDays(hours3));
    const attDays = E.absenceEventDays(hours3);
    const firstOfWeek = new Map();
    for (const d of attDays) { const wk = E.sundayOf(d); if (!firstOfWeek.has(wk)) firstOfWeek.set(wk, d); }
    const freeDates = new Set(result.free_tardy_dates);
    const sugg = new Map(result.suggestions.map(s => [s.track + "|" + s.event_date, s]));
    const discByDate = new Map();
    for (const r of disciplines) { if (!discByDate.has(r.event_date)) discByDate.set(r.event_date, []); discByDate.get(r.event_date).push(r); }
    const wb = XLSX.utils.book_new();

    const summary = [
      ["Employee", name + " (" + empNo + ")"], ["As of", mdy(result.as_of)],
      ["Rolling 365-day unexcused hrs (numerator)", r2(result.numerator)],
      ["Rolling 365-day worked hrs (denominator)", r2(result.denominator)],
      ["Rolling %", E.pctStr(result.pct)], ["Over 2%?", result.over_2pct ? "YES" : "no"],
      ["Tardy events YTD", result.tardies_ytd], ["Free tardies left this year", result.free_tardies_left],
      ["2% events in rolling 365d", result.att_events_rolling], ["Pending suggestions", result.suggestions.length]];
    let ws = XLSX.utils.aoa_to_sheet(summary); ws["!cols"] = [{ wch: 40 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws, "Summary");

    const rows = [["Date", "Day", "REG hrs", "OT hrs", "Tardy (TA) hrs", "Missed (UA) hrs", "Excluded-code hrs",
      "Counts in 2% numerator (hrs)", "Counts in denominator (hrs)", "Rolling % as of day", "Tardy event", "2% occurrence", "Discipline", "Notes"]];
    for (const d of [...byDay.keys()].sort()) {
      const r = byDay.get(d), weekend = E.isWeekend(d);
      const num = r.TARDY + (weekend ? 0 : r.MISS), den = r.REG + r.OT;
      const pct = E.rollingPct(hours3, d).pct;
      const tardyCol = freeDates.has(d) ? "FREE tardy" : tardyEvents.has(d) ? "Tardy event" : "";
      let occCol = "";
      if (attDays.includes(d)) { const wk = E.sundayOf(d); occCol = firstOfWeek.get(wk) === d ? "OCCURRENCE (week of " + mdy(wk) + ")" : "Lumped into " + mdy(firstOfWeek.get(wk)); }
      const discCol = [];
      for (const tr of [E.TRACK_TARDY, E.TRACK_ATT]) { const s = sugg.get(tr + "|" + d); if (s) discCol.push("SUGGESTED " + tr + ": " + E.levelName(s.level)); }
      for (const rec of discByDate.get(d) || []) discCol.push(rec.status + " " + rec.track + ": " + E.levelName(rec.level));
      const notes = [];
      if (weekend && r.MISS > 0) notes.push("Weekend UA ignored (voluntary OT)");
      if (!weekend && r.MISS > 0 && r.MISS < E.FULL_DAY_HOURS) notes.push("Partial-day miss: 2% hours only");
      rows.push([mdy(d), DOW[E.dow(d)], r2(r.REG), r2(r.OT), r2(r.TARDY), r2(r.MISS), r2(r.X), r2(num), r2(den),
        E.pctStr(pct), tardyCol, occCol, discCol.join("; "), notes.join("; ")]);
    }
    ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [11, 5, 8, 8, 12, 13, 14, 22, 20, 14, 14, 26, 34, 30].map(w => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Day Audit");

    const tx = [["Date", "Day", "PayCode", "Category", "Hours"]];
    for (const d of [...byDay.keys()].sort()) for (const [code, cat, h] of byDay.get(d).codes) tx.push([mdy(d), DOW[E.dow(d)], code, cat, r2(h)]);
    ws = XLSX.utils.aoa_to_sheet(tx); ws["!cols"] = [11, 5, 34, 10, 8].map(w => ({ wch: w })); ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");

    const dl = [["Track", "Level", "Event date", "Issued date", "Status", "% at event", "Notes"]];
    for (const r of disciplines.slice().sort((a, b) => a.event_date < b.event_date ? -1 : 1))
      dl.push([r.track, E.levelName(r.level), mdy(r.event_date), r.issued_date ? mdy(r.issued_date) : "", r.status,
        r.pct_at_event ? E.pctStr(r.pct_at_event) : "", r.notes || ""]);
    ws = XLSX.utils.aoa_to_sheet(dl); ws["!cols"] = [12, 22, 11, 11, 9, 10, 40].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Discipline Log");

    const aj = [["Adjusted at", "Date", "PayCode", "Old hours", "New hours", "Reason"]];
    for (const a of adjustments || []) aj.push([a.adjusted_at.replace("T", " "), mdy(a.work_date), a.paycode,
      a.old_hours === null || a.old_hours === undefined ? "(new)" : a.old_hours, a.new_hours, a.reason]);
    ws = XLSX.utils.aoa_to_sheet(aj); ws["!cols"] = [19, 11, 34, 10, 10, 44].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Adjustments");
    return wb;
  }
  function safeName(s) { return (s || "").replace(/[^A-Za-z0-9 _-]/g, "").trim(); }
  function auditFilename(empNo, name) { const t = E.todayIso(); return "Audit_" + safeName(name || empNo) + "_" + t.slice(5, 7) + "-" + t.slice(8, 10) + "-" + t.slice(0, 4) + ".xlsx"; }
  root.Audit = { buildAuditWorkbook, auditFilename, safeName };
})(window);
