/* Attendance Tracker policy engine — line-for-line port of engine.py.
   Pure logic: no UI, no storage. Dates are ISO strings "YYYY-MM-DD".
   Hours rows are {d, cat, h}. Discipline rows are {track, level, event_date, status}. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const REG = "REG", OT = "OT", TARDY = "TARDY", MISS = "MISS", IGNORE = "X";
  const CATEGORIES = [REG, OT, TARDY, MISS, IGNORE];
  const NUMERATOR_CATS = new Set([TARDY, MISS]);
  const DENOMINATOR_CATS = new Set([REG, OT]);
  const LEVEL_NAMES = { 1: "Verbal Warning", 2: "Written Warning",
    3: "Three Days Off (Unpaid)", 4: "Termination" };
  const WINDOW_DAYS = 365, FULL_DAY_HOURS = 8.0, TARDY_MAX_HOURS = 1.0;
  const THRESHOLD = 0.02, FREE_TARDIES_PER_YEAR = 2;
  const TRACK_ATT = "ATTENDANCE", TRACK_TARDY = "TARDY";

  const MS = 86400000;
  function toNum(iso) { return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS); }
  function fromNum(n) { return new Date(n * MS).toISOString().slice(0, 10); }
  function addDays(iso, n) { return fromNum(toNum(iso) + n); }
  function dow(iso) { return new Date(toNum(iso) * MS).getUTCDay(); }
  function isWeekend(iso) { const w = dow(iso); return w === 0 || w === 6; }
  function yearOf(iso) { return +iso.slice(0, 4); }
  function quarterOf(iso) { return yearOf(iso) + "Q" + (Math.floor((+iso.slice(5, 7) - 1) / 3) + 1); }
  function sundayOf(iso) { return addDays(iso, -dow(iso)); }
  function mdy(iso) { return iso ? iso.slice(5, 7) + "/" + iso.slice(8, 10) + "/" + iso.slice(0, 4) : ""; }
  function todayIso() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parseMdy(s) {
    s = (s || "").trim(); if (!s) return null;
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (m) return "20" + m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return s;
    throw new Error("Not a valid date: " + s + " (use MM/DD/YYYY)");
  }
  function levelName(l) { return LEVEL_NAMES[l] || String(l); }
  function pctStr(p) { return (p * 100).toFixed(2) + "%"; }

  function rollingPct(hours, asOf) {
    const start = addDays(asOf, -(WINDOW_DAYS - 1));
    let num = 0, den = 0;
    for (const r of hours) {
      if (r.d >= start && r.d <= asOf) {
        if (NUMERATOR_CATS.has(r.cat)) {
          if (r.cat === MISS && isWeekend(r.d)) continue;
          num += r.h;
        }
        if (DENOMINATOR_CATS.has(r.cat)) den += r.h;
      }
    }
    return { num, den, pct: den > 0 ? num / den : 0 };
  }

  function dailySums(hours, cat) {
    const out = new Map();
    for (const r of hours) if (r.cat === cat && r.h > 0) out.set(r.d, (out.get(r.d) || 0) + r.h);
    return out;
  }
  function tardyEventDays(hours) { return [...dailySums(hours, TARDY).keys()].sort(); }
  function absenceEventDays(hours) {
    return [...dailySums(hours, MISS)].filter(([d, h]) => h >= FULL_DAY_HOURS && !isWeekend(d)).map(([d]) => d).sort();
  }

  function analyzeEmployee(empNo, hours, disciplines, asOf, opts) {
    opts = opts || {};
    const suggestFrom = opts.suggestFrom || null, dataStart = opts.dataStart || null;
    let windowOkFrom = null;
    if (dataStart && hours.length) {
      let empStart = hours[0].d; for (const r of hours) if (r.d < empStart) empStart = r.d;
      if (empStart <= dataStart) windowOkFrom = addDays(dataStart, WINDOW_DAYS - 1);
    }
    const issued = disciplines.filter(d => d.status === "ISSUED");
    const loggedKeys = new Set(disciplines.map(d => d.track + "|" + d.event_date));
    const suggestions = [];
    const byDate = (a, b) => (a.event_date < b.event_date ? -1 : a.event_date > b.event_date ? 1 : 0);

    const tardyDays = tardyEventDays(hours).filter(d => d <= asOf);
    let tardyDisc = issued.filter(d => d.track === TRACK_TARDY).map(d => ({ event_date: d.event_date, level: d.level })).sort(byDate);
    const freeUsed = {}, freeDates = [];
    const issuedTardyDates = new Set(issued.filter(d => d.track === TRACK_TARDY).map(d => d.event_date));
    for (const day of tardyDays) {
      const yr = yearOf(day);
      if ((freeUsed[yr] || 0) < FREE_TARDIES_PER_YEAR && !issuedTardyDates.has(day)) {
        freeUsed[yr] = (freeUsed[yr] || 0) + 1; freeDates.push(day); continue;
      }
      if (suggestFrom && day < suggestFrom) continue;
      if (loggedKeys.has(TRACK_TARDY + "|" + day)) continue;
      const q = quarterOf(day);
      const priorInQ = tardyDisc.filter(t => quarterOf(t.event_date) === q && t.event_date < day).length;
      let level = priorInQ + 1, reason;
      const step3ThisYear = tardyDisc.filter(t => yearOf(t.event_date) === yr && t.level === 3 && t.event_date < day).length;
      if (level >= 4) { level = 4; reason = "4th tardy infraction in one quarter"; }
      else if (level === 3 && step3ThisYear >= 2) { level = 4; reason = "Would be 3rd 'Three Days Off' step in one calendar year"; }
      else reason = "Tardy infraction #" + level + " this quarter (free tardies used)";
      suggestions.push({ emp_no: empNo, track: TRACK_TARDY, level, event_date: day, pct_at_event: null, reason });
      tardyDisc.push({ event_date: day, level }); tardyDisc.sort(byDate);
    }

    const attDays = absenceEventDays(hours).filter(d => d <= asOf);
    let attDisc = issued.filter(d => d.track === TRACK_ATT).map(d => ({ event_date: d.event_date, level: d.level })).sort(byDate);
    const handledWeeks = new Set(disciplines.filter(d => d.track === TRACK_ATT).map(d => sundayOf(d.event_date)));
    for (const day of attDays) {
      const wk = sundayOf(day);
      if (handledWeeks.has(wk)) continue;
      if (suggestFrom && day < suggestFrom) continue;
      if (windowOkFrom && day < windowOkFrom) continue;
      if (loggedKeys.has(TRACK_ATT + "|" + day)) continue;
      handledWeeks.add(wk);
      const daysInWeek = attDays.filter(d2 => sundayOf(d2) === wk);
      const { pct } = rollingPct(hours, day);
      if (pct <= THRESHOLD) continue;
      const winStart = addDays(day, -(WINDOW_DAYS - 1));
      const prior = attDisc.filter(t => t.event_date >= winStart && t.event_date < day).length;
      const level = Math.min(prior + 1, 4);
      const lump = daysInWeek.length > 1 ? " (" + daysInWeek.length + " missed days this fiscal week = 1 occurrence)" : "";
      const reason = "Unexcused absence while over 2% (" + pctStr(pct) + "); disciplined event #" + (prior + 1) + " in rolling 365 days" + lump;
      suggestions.push({ emp_no: empNo, track: TRACK_ATT, level, event_date: day, pct_at_event: pct, reason });
      attDisc.push({ event_date: day, level }); attDisc.sort(byDate);
    }

    const { num, den, pct } = rollingPct(hours, asOf);
    const yr = yearOf(asOf), winStart = addDays(asOf, -(WINDOW_DAYS - 1));
    suggestions.sort((a, b) => byDate(a, b) || (a.track < b.track ? -1 : a.track > b.track ? 1 : 0));
    return {
      emp_no: empNo, as_of: asOf, numerator: num, denominator: den, pct,
      over_2pct: pct > THRESHOLD,
      tardies_ytd: tardyDays.filter(d => yearOf(d) === yr).length,
      free_tardies_left: Math.max(0, FREE_TARDIES_PER_YEAR - (freeUsed[yr] || 0)),
      att_events_rolling: attDisc.filter(t => t.event_date >= winStart && t.event_date <= asOf).length,
      free_tardy_dates: freeDates,
      tardy_timeline: tardyDisc.slice().sort(byDate),
      tardy_days: tardyDays,
      suggestions,
    };
  }

  return { REG, OT, TARDY, MISS, IGNORE, CATEGORIES, LEVEL_NAMES, WINDOW_DAYS, FULL_DAY_HOURS,
    TARDY_MAX_HOURS, THRESHOLD, FREE_TARDIES_PER_YEAR, TRACK_ATT, TRACK_TARDY,
    rollingPct, dailySums, tardyEventDays, absenceEventDays, analyzeEmployee,
    quarterOf, sundayOf, addDays, dow, isWeekend, yearOf, mdy, parseMdy, todayIso, levelName, pctStr };
});
