// Shared state helpers for the service worker, popup and history page.
// Everything persists in chrome.storage.local so nothing resets when Chrome closes.

export const MIN_INTERVAL_MIN = 10; // chrome.alarms floor is 30 s, and 5% of 10 min = 30 s
export const SNOOZE_FRACTION = 0.05;
export const AUTO_SNOOZE_MS = 60 * 1000;

export const DEFAULT_SETTINGS = {
  intervalMin: 60,
  targetMl: 2000,
  glassMl: 250,
  soundOn: true,
};

export const DEFAULT_TIMER = {
  running: false,
  mode: 'main', // 'main' | 'snooze'
  nextFireAt: null, // epoch ms
  pausedRemainingMs: null, // set while paused
  reminderOpen: false,
  reminderOpenedAt: null,
};

export async function getAll() {
  const data = await chrome.storage.local.get(['settings', 'timer', 'history']);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    timer: { ...DEFAULT_TIMER, ...(data.timer || {}) },
    history: data.history || {},
  };
}

export async function getSettings() {
  return (await getAll()).settings;
}

export async function saveSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  settings.intervalMin = Math.max(MIN_INTERVAL_MIN, Math.round(Number(settings.intervalMin) || DEFAULT_SETTINGS.intervalMin));
  settings.targetMl = Math.max(100, Math.round(Number(settings.targetMl) || DEFAULT_SETTINGS.targetMl));
  settings.glassMl = Math.max(10, Math.round(Number(settings.glassMl) || DEFAULT_SETTINGS.glassMl));
  settings.soundOn = Boolean(settings.soundOn);
  await chrome.storage.local.set({ settings });
  return settings;
}

export async function getTimer() {
  return (await getAll()).timer;
}

export async function saveTimer(patch) {
  const timer = { ...(await getTimer()), ...patch };
  await chrome.storage.local.set({ timer });
  return timer;
}

// Local calendar day, e.g. "2026-09-30".
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function emptyDay(targetMl) {
  return { ml: 0, sips: 0, snoozes: 0, autoSnoozes: 0, reminders: 0, targetMl, log: [] };
}

// Records an event against today. kind: 'sip' | 'manual' | 'snooze' | 'autoSnooze' | 'reminder' | 'undo'
export async function recordEvent(kind, ml = 0) {
  const { settings, history } = await getAll();
  const key = dayKey();
  const day = { ...emptyDay(settings.targetMl), ...(history[key] || {}) };
  // The target that counts for a day is whatever it was set to on that day.
  day.targetMl = settings.targetMl;
  const now = Date.now();
  if (kind === 'sip' || kind === 'manual') {
    day.ml += ml;
    day.sips += 1;
    day.log = [...(day.log || []), { t: now, ml, kind }].slice(-200);
  } else if (kind === 'undo') {
    const log = [...(day.log || [])];
    const last = log.pop();
    if (last) {
      day.ml = Math.max(0, day.ml - last.ml);
      day.sips = Math.max(0, day.sips - 1);
    }
    day.log = log;
  } else if (kind === 'snooze') {
    day.snoozes += 1;
  } else if (kind === 'autoSnooze') {
    day.autoSnoozes += 1;
  } else if (kind === 'reminder') {
    day.reminders += 1;
  }
  history[key] = day;
  await chrome.storage.local.set({ history });
  return day;
}

export function formatMs(ms) {
  if (ms == null || ms < 0) ms = 0;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatMl(ml) {
  return ml >= 1000 ? `${+(ml / 1000).toFixed(2)} L` : `${ml} ml`;
}
