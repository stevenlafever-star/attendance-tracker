/* Discipline notices — port of notices.py. The template is editable text
   stored in the database file; the notice is written as a .docx (docx.js).
   Template syntax: "# Title" = heading, "**bold**" runs, "| Label | Value |" = table row,
   "---" = blank line. Placeholders anywhere: {EMPLOYEE} {EMP_NO} {DATE_ISSUED} {TRACK}
   {EVENT_DATE} {LEVEL} {PCT} {REASON} {QUARTER_TARDIES} {FREE_TARDIES} {POLICY_TEXT}.
   A list placeholder alone on its line ({QUARTER_TARDIES}/{FREE_TARDIES}) expands to one line per item. */
(function (root) {
  "use strict";
  const E = root.Engine;
  const COMPANY = "Grove City";
  const POLICY_TARDY = "Per the Time and Attendance Policy, the first two tardies of each calendar year do not result in disciplinary action. Subsequent tardies receive progressive discipline within the calendar quarter: verbal warning, written warning, three days off unpaid, and termination. This notice documents the discipline level indicated above.";
  const POLICY_ATT = "Per the Time and Attendance Policy, unexcused absence hours are measured against hours worked over the rolling 365-day period. Once an employee exceeds 2%, each additional unexcused absence receives progressive discipline: verbal warning, written warning, three days off unpaid, and termination. Disciplined events more than 365 days old no longer count toward the discipline level. This notice documents the discipline level indicated above.";
  const SIG = "Employee signature: ______________________________    Date: ______________\nSupervisor signature: ____________________________    Date: ______________\nHR signature: ___________________________________    Date: ______________";
  function defaultTemplate(track) {
    const tardy = track === E.TRACK_TARDY;
    return ["# " + COMPANY + " — " + (tardy ? "Tardiness Discipline Notice" : "Attendance (2% Rule) Discipline Notice"),
      "**CONFIDENTIAL — DRAFT FOR HR REVIEW**", "",
      "| Employee | {EMPLOYEE} ({EMP_NO}) |", "| Date issued | {DATE_ISSUED} |", "| Event date | {EVENT_DATE} |",
      "| Discipline level | {LEVEL} |", ...(tardy ? [] : ["| Attendance % at event | {PCT} |"]), "| Basis | {REASON} |", "",
      "{POLICY_TEXT}", "",
      ...(tardy ? ["**Tardy occurrences this quarter:**", "{QUARTER_TARDIES}", "**Free tardies used this calendar year:**", "{FREE_TARDIES}", ""] : []),
      "Additional comments:", "_".repeat(90), "_".repeat(90), "_".repeat(90), "", ...SIG.split("\n")].join("\n");
  }
  function getTemplate(db, track) { return (db.templates && db.templates[track]) || defaultTemplate(track); }

  function buildMapping(o) {
    const tardy = o.track === E.TRACK_TARDY;
    return {
      "{EMPLOYEE}": o.name || o.emp_no, "{EMP_NO}": o.emp_no, "{DATE_ISSUED}": E.mdy(o.issued_date || E.todayIso()),
      "{TRACK}": tardy ? "Tardiness" : "Unexcused Absence (2% Rule)", "{EVENT_DATE}": E.mdy(o.event_date),
      "{LEVEL}": E.levelName(o.level),
      "{PCT}": o.pct_at_event !== null && o.pct_at_event !== undefined ? E.pctStr(o.pct_at_event) + " (threshold 2.00%)" : "n/a",
      "{REASON}": o.reason || "", "{POLICY_TEXT}": tardy ? POLICY_TARDY : POLICY_ATT,
      "{QUARTER_TARDIES}": tardy ? (o.quarter_tardies || []).map(([d, l]) => E.mdy(d) + " — " + l) : ["n/a"],
      "{FREE_TARDIES}": tardy ? (o.free_tardies || []).map(d => E.mdy(d)) : ["n/a"],
    };
  }
  function fill(text, map) { for (const k in map) { const v = map[k]; text = text.split(k).join(Array.isArray(v) ? v.join("; ") : String(v)); } return text; }
  function runs(text, bold) {
    const out = []; const parts = text.split("**");
    parts.forEach((p, i) => { if (p) out.push(new docx.TextRun({ text: p, bold: bold || i % 2 === 1 })); });
    return out.length ? out : [new docx.TextRun({ text: "" })];
  }
  function expandLines(template, map) {
    const out = [];
    for (const raw of template.split("\n")) {
      const t = raw.trim();
      if (map[t] && Array.isArray(map[t])) { const items = map[t].length ? map[t] : ["(none)"]; items.forEach(x => out.push(x)); }
      else out.push(fill(raw, map));
    }
    return out;
  }
  function buildDoc(template, map) {
    const lines = expandLines(template, map), children = []; let tableRows = [];
    const flush = () => { if (tableRows.length) { children.push(new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, rows: tableRows })); tableRows = []; } };
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("|") && t.endsWith("|")) {
        const cells = t.slice(1, -1).split("|").map(c => c.trim());
        tableRows.push(new docx.TableRow({ children: cells.map((c, i) => new docx.TableCell({
          width: { size: i === 0 ? 30 : 70, type: docx.WidthType.PERCENTAGE },
          children: [new docx.Paragraph({ children: runs(c, i === 0) })] })) }));
        continue;
      }
      flush();
      if (t.startsWith("# ")) children.push(new docx.Paragraph({ text: t.slice(2), heading: docx.HeadingLevel.HEADING_1 }));
      else if (t === "---") children.push(new docx.Paragraph({ text: "" }));
      else children.push(new docx.Paragraph({ children: runs(line) }));
    }
    flush();
    return new docx.Document({ sections: [{ children }] });
  }
  async function noticeBlob(db, o) { return docx.Packer.toBlob(buildDoc(getTemplate(db, o.track), buildMapping(o))); }
  function noticeFilename(o) { return "Notice_" + root.Audit.safeName(o.name || o.emp_no) + "_" + o.track + "_" + o.event_date + ".docx"; }
  root.Notices = { defaultTemplate, getTemplate, noticeBlob, noticeFilename, POLICY_TARDY, POLICY_ATT };
})(window);
