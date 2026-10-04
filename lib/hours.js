// Active hours: reminders only come between a start and an end time, on the days you pick.
// A window can run past midnight (22:00 to 06:00); its early-morning part belongs to the day
// it started. The same start and end time means all day.

export const DEFAULT_HOURS = { on: true, start: '08:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] };
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toMinutes(text) {
  const m = TIME.exec(String(text));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function cleanHours(raw) {
  const h = { ...DEFAULT_HOURS, ...(raw || {}) };
  const days = Array.isArray(h.days) ? [...new Set(h.days.map(Number))].filter((d) => d >= 0 && d <= 6) : [];
  return {
    on: Boolean(h.on),
    start: toMinutes(h.start) == null ? DEFAULT_HOURS.start : h.start,
    end: toMinutes(h.end) == null ? DEFAULT_HOURS.end : h.end,
    days: days.length ? days.sort() : [...DEFAULT_HOURS.days],
  };
}

export function isActive(date, hours) {
  if (!hours || !hours.on) return true;
  const start = toMinutes(hours.start);
  const end = toMinutes(hours.end);
  const day = date.getDay();
  const m = date.getHours() * 60 + date.getMinutes();
  if (start === end) return hours.days.includes(day);
  if (start < end) return hours.days.includes(day) && m >= start && m < end;
  if (m >= start) return hours.days.includes(day);
  if (m < end) return hours.days.includes((day + 6) % 7);
  return false;
}

// The first moment at or after `ms` when reminders are allowed.
export function nextActiveTime(ms, hours) {
  const t = new Date(ms);
  if (isActive(t, hours)) return ms;
  const start = toMinutes(hours.start);
  for (let i = 0; i <= 7; i++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i, Math.floor(start / 60), start % 60);
    if (d.getTime() > ms && hours.days.includes(d.getDay())) return d.getTime();
  }
  return ms;
}

export function formatClock(text) {
  const m = toMinutes(text);
  const date = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
