/* Validates engine.js against the policy handbook examples — port of tests.py.
   Runs in Node (`node tests.js`) or in the browser (tests.html). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"), require("./store.js"));
  else root.runTests = factory(root.Engine, root.Store);
})(typeof self !== "undefined" ? self : this, function (E, S) {
  return function runTests(log) {
    log = log || console.log;
    const { TRACK_ATT, TRACK_TARDY, MISS, TARDY, REG, OT } = E;
    let PASS = 0, FAIL = 0;
    const J = JSON.stringify;
    function check(label, got, want) {
      const ok = J(got) === J(want); if (ok) PASS++; else FAIL++;
      log((ok ? "PASS" : "FAIL") + ": " + label + "  got=" + J(got) + " want=" + J(want));
    }
    const D = (y, m, d) => y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const H = (d, cat, h) => ({ d, cat, h });
    const r4 = x => Math.round(x * 1e4) / 1e4;
    function fw(year, week) { let d = E.addDays(D(year, 1, 1), (week - 1) * 7); while (E.isWeekend(d)) d = E.addDays(d, 1); return d; }
    const max = a => a.reduce((m, x) => x > m ? x : m);

    let r = E.rollingPct([H(D(2021, 6, 1), REG, 2080), H(D(2021, 7, 1), OT, 500), H(D(2021, 8, 2), MISS, 48)], D(2021, 12, 31));
    check("2% ex1: 48/2580", r4(r.pct), r4(48 / 2580));
    r = E.rollingPct([H(D(2022, 1, 1), REG, 2080), H(D(2022, 2, 1), OT, 1000), H(D(2022, 3, 1), MISS, 100)], D(2022, 6, 30));
    check("2% ex2: 100/3080 over threshold", [r4(r.pct), r.pct > 0.02], [r4(100 / 3080), true]);

    function attLevels(eventWeeks) {
      const hours = [H(D(2020, 6, 1), REG, 40)];
      const days = eventWeeks.map(([y, w]) => fw(y, w));
      for (const day of days) { hours.push(H(day, MISS, 8)); hours.push(H(E.addDays(day, -1), REG, 40)); }
      return E.analyzeEmployee("T", hours, [], max(days)).suggestions.filter(s => s.track === TRACK_ATT).map(s => s.level);
    }
    check("Att ex1: verbal/written/3days/term", attLevels([[2021, 40], [2021, 45], [2022, 2], [2022, 39]]), [1, 2, 3, 4]);
    check("Att ex2: 4th event stays at 3-days (oldest rolled off)", attLevels([[2021, 3], [2021, 22], [2021, 40], [2022, 20]]), [1, 2, 3, 3]);
    check("Att ex3: ladder restarts at verbal after 365-day gap", attLevels([[2021, 3], [2021, 10], [2022, 11]]), [1, 2, 1]);

    let hours = [H(D(2022, 1, 10), REG, 2000), H(D(2022, 3, 1), MISS, 8)];
    let res = E.analyzeEmployee("U", hours, [], D(2022, 3, 1));
    check("Below 2%: no suggestion", res.suggestions.length, 0);
    let disc = [{ track: TRACK_ATT, level: 2, event_date: D(2022, 2, 1), status: "ISSUED" }];
    res = E.analyzeEmployee("U", hours, disc, D(2022, 3, 1));
    check("On a step, below 2%: still no new discipline", res.suggestions.length, 0);

    function tardySuggestions(weeks, year, seedFree) {
      year = year || 2021; if (seedFree === undefined) seedFree = true;
      const hours = []; let days = [];
      if (seedFree) days.push(D(year, 1, 2), D(year, 1, 3));
      days = days.concat(weeks.map(w => fw(year, w)));
      for (const day of days) { hours.push(H(day, TARDY, 1)); hours.push(H(day, REG, 2000)); }
      return E.analyzeEmployee("T", hours, [], max(days)).suggestions.filter(s => s.track === TRACK_TARDY);
    }
    let s = tardySuggestions([2, 9, 10, 11]);
    check("Tardy ex1: Q1 verbal/written/3days/term", s.map(x => x.level), [1, 2, 3, 4]);
    s = tardySuggestions([2, 9, 10, 18, 20, 27, 33, 34, 41, 43, 46]);
    check("Tardy ex2: quarterly reset + 3rd step-3 = termination", s.map(x => x.level), [1, 2, 3, 1, 2, 1, 2, 3, 1, 2, 4]);
    s = tardySuggestions([10, 12, 14], 2021, false);
    check("First 2 tardies of the year are free", s.map(x => x.level), [1]);

    hours = [H(D(2022, 1, 10), REG, 100), H(D(2022, 2, 1), MISS, 8), H(D(2022, 2, 8), MISS, 4),
      H(D(2022, 2, 15), MISS, 0.5), H(D(2022, 3, 1), MISS, 12)];
    res = E.analyzeEmployee("D", hours, [], D(2022, 3, 1));
    const tracks = res.suggestions.map(x => [x.track, x.event_date]).sort((a, b) => J(a) < J(b) ? -1 : 1);
    check("Full-day misses = occurrences", tracks.filter(t => t[0] === TRACK_ATT), [[TRACK_ATT, D(2022, 2, 1)], [TRACK_ATT, D(2022, 3, 1)]]);
    const hoursW = [H(D(2022, 1, 10), REG, 1000), H(D(2022, 2, 5), MISS, 4), H(D(2022, 2, 7), MISS, 4)];
    const resW = E.analyzeEmployee("W", hoursW, [], D(2022, 3, 1));
    check("Partial misses (weekday or weekend) trigger nothing", resW.suggestions.map(x => [x.track, x.event_date]), []);
    check("Weekend UA hours excluded from the 2% numerator", E.rollingPct(hoursW, D(2022, 3, 1)).num, 4.0);
    const hoursWe = [H(D(2022, 1, 10), REG, 100), H(D(2022, 2, 5), MISS, 8), H(D(2022, 2, 6), MISS, 0.5), H(D(2022, 2, 5), TARDY, 0.2)];
    const resWe = E.analyzeEmployee("WE", hoursWe, [], D(2022, 3, 1), { dataStart: D(2021, 1, 1) });
    check("Weekend UA creates no occurrences/tardies; TA-coded day still a tardy", [resWe.suggestions.map(x => x.track), resWe.tardies_ytd], [[], 1]);
    check("Weekend: only TA hours reach the numerator", r4(E.rollingPct(hoursWe, D(2022, 3, 1)).num), 0.2);
    check("Partial-day miss (1-8h) triggers no ladder", tracks.filter(t => t[0] !== TRACK_ATT && t[0] !== TRACK_TARDY), []);
    check("Sub-hour UA is never a tardy infraction", [tracks.filter(t => t[0] === TRACK_TARDY), res.tardies_ytd], [[], 0]);
    check("Partial and sub-hour hours still feed the 2% numerator", E.rollingPct(hours, D(2022, 3, 1)).num, 24.5);
    const hoursT = [H(D(2022, 1, 4), TARDY, 0.2), H(D(2022, 1, 5), TARDY, 0.2), H(D(2022, 2, 1), MISS, 0.5), H(D(2022, 2, 8), TARDY, 0.3), H(D(2022, 1, 10), REG, 2000)];
    res = E.analyzeEmployee("D2", hoursT, [], D(2022, 3, 1));
    check("Only TA-coded days advance the tardy ladder", res.suggestions.map(x => [x.track, x.event_date, x.level]), [[TRACK_TARDY, D(2022, 2, 8), 1]]);

    const hoursL = [H(D(2022, 1, 10), REG, 100), H(D(2022, 2, 7), MISS, 8), H(D(2022, 2, 10), MISS, 8), H(D(2022, 2, 14), MISS, 8)];
    res = E.analyzeEmployee("L", hoursL, [], D(2022, 3, 1), { dataStart: D(2021, 1, 1) });
    check("Same-week full-day misses lump into one occurrence", res.suggestions.filter(x => x.track === TRACK_ATT).map(x => [x.event_date, x.level]), [[D(2022, 2, 7), 1], [D(2022, 2, 14), 2]]);
    check("Lumped reason notes the count", res.suggestions[0].reason.includes("2 missed days this fiscal week"), true);
    const discL = [{ track: TRACK_ATT, level: 1, event_date: D(2022, 2, 10), status: "ISSUED" }];
    res = E.analyzeEmployee("L", hoursL, discL, D(2022, 3, 1), { dataStart: D(2021, 1, 1) });
    check("Logged event covers its whole fiscal week", res.suggestions.filter(x => x.track === TRACK_ATT).map(x => [x.event_date, x.level]), [[D(2022, 2, 14), 2]]);

    disc = [{ track: TRACK_ATT, level: 1, event_date: D(2022, 2, 1), status: "ISSUED" }, { track: TRACK_ATT, level: 2, event_date: D(2022, 3, 1), status: "ISSUED" }];
    res = E.analyzeEmployee("D", hours, disc, D(2022, 3, 1));
    check("Logged disciplines suppress duplicate suggestions", res.suggestions.length, 0);
    disc = [{ track: TRACK_ATT, level: 1, event_date: D(2022, 2, 1), status: "WAIVED" }];
    res = E.analyzeEmployee("D", hours, disc, D(2022, 3, 1));
    check("Waived event skipped and not counted", res.suggestions.filter(x => x.track === TRACK_ATT).map(x => [x.event_date, x.level]), [[D(2022, 3, 1), 1]]);

    const hoursDd = [H(D(2026, 1, 5), REG, 100), H(D(2026, 2, 1), TARDY, 0.5)];
    res = E.analyzeEmployee("DD", hoursDd, [], D(2026, 2, 1), { dataStart: D(2025, 1, 1) });
    check("Tardy hours in numerator but no 2% occurrence", [r4(E.rollingPct(hoursDd, D(2026, 2, 1)).num), res.suggestions.map(x => x.track)], [0.5, []]);

    hours = [H(D(2026, 1, 5), REG, 40), H(D(2026, 1, 20), MISS, 8), H(D(2026, 1, 21), REG, 60)];
    res = E.analyzeEmployee("G", hours, [], D(2026, 2, 1), { dataStart: D(2026, 1, 5) });
    check("Guard: no discipline on incomplete rolling window", res.suggestions.length, 0);
    res = E.analyzeEmployee("G", hours, [], D(2026, 2, 1), { dataStart: D(2025, 1, 1) });
    check("Guard: new hire with complete history is evaluated", res.suggestions.filter(x => x.track === TRACK_ATT).map(x => x.level), [1]);
    const hours2 = [H(D(2025, 2, 1), REG, 40), H(D(2026, 2, 10), MISS, 8), H(D(2026, 2, 9), REG, 60)];
    res = E.analyzeEmployee("G", hours2, [], D(2026, 3, 1), { dataStart: D(2025, 2, 1) });
    check("Guard: lifts after a full year of data", res.suggestions.filter(x => x.track === TRACK_ATT).map(x => x.level), [1]);

    const hoursF = [H(D(2026, 1, 5), REG, 2000), H(D(2026, 2, 19), TARDY, 0.5), H(D(2026, 7, 24), TARDY, 0.3), H(D(2026, 8, 7), TARDY, 0.4), H(D(2026, 8, 11), TARDY, 0.2)];
    const discF = [{ track: TRACK_TARDY, level: 1, event_date: D(2026, 2, 19), status: "WAIVED" }, { track: TRACK_TARDY, level: 1, event_date: D(2026, 7, 24), status: "WAIVED" }];
    res = E.analyzeEmployee("F", hoursF, discF, D(2026, 8, 26));
    check("Waived early tardies still consume the free slots", res.free_tardy_dates, [D(2026, 2, 19), D(2026, 7, 24)]);
    check("Later tardies draw discipline, not free slots", res.suggestions.filter(x => x.track === TRACK_TARDY).map(x => [x.event_date, x.level]), [[D(2026, 8, 7), 1], [D(2026, 8, 11), 2]]);
    res = E.analyzeEmployee("F", hoursF, [], D(2026, 8, 26), { suggestFrom: D(2026, 8, 1) });
    check("Amnesty cutoff does not shift the free slots", [res.free_tardy_dates, res.suggestions.filter(x => x.track === TRACK_TARDY).map(x => [x.event_date, x.level])],
      [[D(2026, 2, 19), D(2026, 7, 24)], [[D(2026, 8, 7), 1], [D(2026, 8, 11), 2]]]);

    const db = S.newDb();
    const csv = "Employee ID,Employee Name,Date,PayCode,Hours\n9,\"Test, Amy\",01/05/2026,UA-UNPD-Other Unidentified Abs,8\n9,\"Test, Amy\",01/06/2026,Regular x 1.0 Day,8\n";
    S.importRows(db, S.parseCsv(csv), "w.csv");
    S.adjustHours(db, "9", "2026-01-05", "UA-UNPD-Other Unidentified Abs", 0, "Faulty info - was approved PTO");
    check("Adjustment removes the faulty row", S.loadHours(db, "9").length, 1);
    S.importRows(db, S.parseCsv(csv), "w.csv");
    check("Re-import preserves the manual correction", S.loadHours(db, "9").length, 1);
    check("Adjustment is logged with reason", S.loadAdjustments(db, "9")[0].reason, "Faulty info - was approved PTO");

    check("Formula hours cell =ROUND(8.0,2.0) parses to 8", S.parseFormulaNumber("=ROUND(8.0,2.0)"), 8);
    const rowsX = [["Transactions and Totals"], ["Employee Full Name", "Employee ID", "Day", "Date", "PayCode", "Hours"],
      ["Doe, Jane", 12, "Monday", 46027, "Regular x 1.0 Day", "=ROUND(8.0,2.0)"],
      ["Doe, Jane", 12, "Monday", 46027, "TA-UNPD-Tardy", "=ROUND(0.25,2.0)"],
      [], ["Totals"], ["Doe, Jane", 12, "", "", "", "=ROUND(8.25,2.0)"]];
    const db2 = S.newDb(); const summ = S.importRows(db2, rowsX, "week.xlsx");
    check("Labor xlsx layout: Excel serial dates, formula hours, totals skipped", [summ.rows, summ.skipped, S.loadHoursDetail(db2, "12").map(x => [x.d, x.code, x.h])],
      [2, 2, [["2026-01-05", "Regular x 1.0 Day", 8], ["2026-01-05", "TA-UNPD-Tardy", 0.25]]]);

    log("\n" + PASS + " passed, " + FAIL + " failed");
    return { pass: PASS, fail: FAIL };
  };
});
if (typeof require !== "undefined" && require.main === module) { const r = module.exports(); process.exit(r.fail ? 1 : 0); }
