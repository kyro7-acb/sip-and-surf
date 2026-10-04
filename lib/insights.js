// Pure functions that turn the saved history into the numbers on the insights page.
// No chrome.* calls here, so they can be tested with plain Node.
import { dayKey } from './state.js';

export function isMet(day) {
  return Boolean(day && day.targetMl && day.ml >= day.targetMl);
}

function shift(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// The last `n` calendar days ending today, oldest first, zero-filled.
export function lastDays(history, n, targetMl, today = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = dayKey(shift(today, -i));
    const rec = history[key];
    out.push({
      key,
      recorded: Boolean(rec),
      ml: rec ? rec.ml : 0,
      targetMl: rec && rec.targetMl ? rec.targetMl : targetMl,
      sips: rec ? rec.sips : 0,
      snoozes: rec ? (rec.snoozes || 0) + (rec.autoSnoozes || 0) : 0,
      reminders: rec ? rec.reminders || 0 : 0,
      log: rec ? rec.log || [] : [],
    });
  }
  return out;
}

// Current streak counts today only once today's target is met; an unfinished today
// doesn't break the streak.
export function currentStreak(history, today = new Date()) {
  let streak = 0;
  let date = today;
  if (!isMet(history[dayKey(date)])) date = shift(date, -1);
  while (isMet(history[dayKey(date)])) {
    streak += 1;
    date = shift(date, -1);
  }
  return streak;
}

export function bestStreak(history) {
  const keys = Object.keys(history).filter((k) => isMet(history[k])).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of keys) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    run = prev && dayKey(shift(prev, 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

// Summary for the selected range. "Completed" days are tracked days before today,
// from the first day the extension recorded anything.
export function summarize(history, days, todayKey = dayKey()) {
  const firstKey = Object.keys(history).sort()[0];
  const tracked = firstKey ? days.filter((d) => d.key >= firstKey) : [];
  const completed = tracked.filter((d) => d.key < todayKey);
  const today = days.find((d) => d.key === todayKey);
  const hitDays = [...completed, ...(today && isMet(today) ? [today] : [])];
  const met = hitDays.filter(isMet).length;
  const basis = completed.length ? completed : today ? [today] : [];
  const avg = basis.length ? Math.round(basis.reduce((s, d) => s + d.ml, 0) / basis.length) : 0;
  const best = tracked.reduce((b, d) => (!b || d.ml > b.ml ? d : b), null);
  const reminders = tracked.reduce((s, d) => s + d.reminders, 0);
  const reminderSips = tracked.reduce((s, d) => s + d.log.filter((e) => e.kind === 'sip').length, 0);
  const snoozes = tracked.reduce((s, d) => s + d.snoozes, 0);
  const hours = new Array(24).fill(0);
  for (const d of tracked) for (const e of d.log) hours[new Date(e.t).getHours()] += 1;
  return {
    trackedDays: tracked.length,
    completedDays: completed.length,
    hitRate: hitDays.length ? met / hitDays.length : 0,
    metDays: met,
    hitBasis: hitDays.length,
    avgMl: avg,
    avgBasis: basis.length,
    bestDay: best && best.ml > 0 ? best : null,
    reminders,
    reminderSips,
    snoozes,
    responseRate: reminders ? Math.min(1, reminderSips / reminders) : null,
    hours,
  };
}

export function toCsv(history) {
  const rows = [['date', 'intake_ml', 'target_ml', 'target_met', 'sips', 'snoozes', 'auto_snoozes', 'reminders']];
  for (const key of Object.keys(history).sort()) {
    const d = history[key];
    rows.push([key, d.ml, d.targetMl, isMet(d) ? 'yes' : 'no', d.sips, d.snoozes || 0, d.autoSnoozes || 0, d.reminders || 0]);
  }
  return rows.map((r) => r.join(',')).join('\n') + '\n';
}
