// Shared state helpers for the service worker, popup and history page.
// Everything persists in chrome.storage.local so nothing resets when Chrome closes.

import { DEFAULT_CHARACTER, builtInCharacter } from './characters.js';
import { DEFAULT_HOURS, cleanHours } from './hours.js';

export const MIN_INTERVAL_MIN = 10;
export const MIN_SNOOZE_MIN = 1; // chrome.alarms can't fire sooner than 30 s
export const MAX_SNOOZE_MIN = 120;
export const AUTO_SNOOZE_MS = 60 * 1000;

export const DEFAULT_SETTINGS = {
  intervalMin: 60,
  snoozeMin: 3,
  targetMl: 2000,
  glassMl: 250,
  soundOn: true,
  character: DEFAULT_CHARACTER,
  activeHours: DEFAULT_HOURS, // reminders only between these times (lib/hours.js)
  hideWhenBusy: true, // wait while you're in full screen or on a call
};

export const DEFAULT_TIMER = {
  running: false,
  mode: 'main', // 'main' | 'snooze'
  dueAt: null, // epoch ms: when the interval or snooze runs out
  nextFireAt: null, // epoch ms: when the buddy actually comes (later than dueAt in quiet hours or while busy)
  deferred: null, // null | 'quiet' (outside active hours) | 'busy' (full screen or a call)
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

// Keeps every setting in range. customIds are the ids of the custom buddies you've added.
export function cleanSettings(raw, customIds = []) {
  const s = { ...DEFAULT_SETTINGS, ...raw };
  const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  s.intervalMin = Math.max(MIN_INTERVAL_MIN, Math.round(num(s.intervalMin, DEFAULT_SETTINGS.intervalMin)));
  s.snoozeMin = Math.min(MAX_SNOOZE_MIN, Math.max(MIN_SNOOZE_MIN, Math.round(num(s.snoozeMin, DEFAULT_SETTINGS.snoozeMin))));
  s.targetMl = Math.max(100, Math.round(num(s.targetMl, DEFAULT_SETTINGS.targetMl)));
  s.glassMl = Math.max(10, Math.round(num(s.glassMl, DEFAULT_SETTINGS.glassMl)));
  s.soundOn = Boolean(s.soundOn);
  s.character = builtInCharacter(s.character) || customIds.includes(s.character) ? s.character : DEFAULT_CHARACTER;
  s.activeHours = cleanHours(s.activeHours);
  s.hideWhenBusy = Boolean(s.hideWhenBusy);
  return s;
}

export async function saveSettings(patch, customIds = []) {
  const settings = cleanSettings({ ...(await getSettings()), ...patch }, customIds);
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
