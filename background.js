// Sip and Surf service worker: owns the reminder timer, shows the reminder, records intake.
import {
  AUTO_SNOOZE_MS,
  SNOOZE_FRACTION,
  getAll,
  getSettings,
  getTimer,
  recordEvent,
  saveSettings,
  saveTimer,
} from './lib/state.js';
import { loadSprite } from './lib/sprite.js';

const REMINDER_ALARM = 'sip-reminder';
const AUTO_SNOOZE_ALARM = 'sip-auto-snooze';
const NOTIFICATION_ID = 'sip-reminder';

// ---------- Scheduling ----------

async function schedule(delayMs, mode) {
  const nextFireAt = Date.now() + delayMs;
  await chrome.alarms.clear(REMINDER_ALARM);
  await chrome.alarms.create(REMINDER_ALARM, { when: nextFireAt });
  return saveTimer({
    running: true,
    mode,
    nextFireAt,
    pausedRemainingMs: null,
    reminderOpen: false,
    reminderOpenedAt: null,
    reminderTabId: null,
  });
}

async function startMain() {
  const { intervalMin } = await getSettings();
  return schedule(intervalMin * 60 * 1000, 'main');
}

async function startSnooze() {
  const { intervalMin } = await getSettings();
  // Exactly 5% of the interval: 60 min -> 3 min, 30 min -> 90 s.
  return schedule(intervalMin * 60 * 1000 * SNOOZE_FRACTION, 'snooze');
}

async function pause() {
  const timer = await getTimer();
  if (!timer.running) return timer;
  await chrome.alarms.clear(REMINDER_ALARM);
  const remaining = timer.nextFireAt ? Math.max(0, timer.nextFireAt - Date.now()) : null;
  return saveTimer({ running: false, pausedRemainingMs: remaining, nextFireAt: null });
}

async function resume() {
  const timer = await getTimer();
  if (timer.running) return timer;
  if (timer.pausedRemainingMs) return schedule(timer.pausedRemainingMs, timer.mode === 'waiting' ? 'main' : timer.mode);
  return startMain();
}

// Re-creates the alarm from saved state after a browser restart or an extension update.
async function restore() {
  const timer = await getTimer();
  if (timer.reminderOpen) {
    // Chrome closed while the buddy was on screen: treat it as ignored.
    await chrome.alarms.clear(AUTO_SNOOZE_ALARM);
    return startSnooze();
  }
  if (!timer.running || !timer.nextFireAt) return timer;
  const existing = await chrome.alarms.get(REMINDER_ALARM);
  if (existing) return timer;
  // A reminder that came due while Chrome was closed fires a few seconds after start.
  const when = Math.max(timer.nextFireAt, Date.now() + 3000);
  await chrome.alarms.create(REMINDER_ALARM, { when });
  return timer;
}

// ---------- Showing the reminder ----------

let spriteCache = null;
async function getSprite() {
  if (!spriteCache) {
    spriteCache = loadSprite((path) => chrome.runtime.getURL(path)).catch((err) => {
      spriteCache = null;
      throw err;
    });
  }
  return spriteCache;
}

async function injectOverlay(tab) {
  const sprite = await getSprite();
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (config) => window.__sipBuddy && window.__sipBuddy.show(config),
    args: [{ sprite, autoSnoozeMs: AUTO_SNOOZE_MS }],
  });
  if (!result || result.result !== true) throw new Error('overlay did not start');
}

async function showNotification() {
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Time for a sip',
    message: 'Your buddy brought you some water.',
    buttons: [{ title: 'Sip' }, { title: 'Snooze' }],
    requireInteraction: true,
    priority: 2,
  });
}

async function fireReminder() {
  const timer = await getTimer();
  if (timer.reminderOpen && Date.now() - (timer.reminderOpenedAt || 0) < AUTO_SNOOZE_MS + 30000) return;

  await chrome.alarms.clear(REMINDER_ALARM);
  await saveTimer({ mode: 'waiting', nextFireAt: null, reminderOpen: true, reminderOpenedAt: Date.now(), reminderTabId: null });
  await recordEvent('reminder');
  // Backstop in case the tab closes or navigates before anyone answers.
  // The margin covers the walk in, the turn and his first sip before the 60 s countdown starts.
  await chrome.alarms.create(AUTO_SNOOZE_ALARM, { when: Date.now() + AUTO_SNOOZE_MS + 15000 });

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  try {
    if (!tab || tab.id == null) throw new Error('no active tab');
    await injectOverlay(tab);
    await saveTimer({ reminderTabId: tab.id });
  } catch (err) {
    // chrome:// pages, the Web Store, PDFs and similar pages block scripts.
    console.info('Sip and Surf: overlay unavailable, using a notification.', err && err.message);
    await showNotification();
    await playSipSound();
  }
}

async function closeOverlay(tabId) {
  if (tabId == null) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__sipBuddy && window.__sipBuddy.dismiss(),
    });
  } catch (_) {
    // Tab is gone or navigated; nothing to close.
  }
}

async function answer(kind) {
  const timer = await getTimer();
  if (!timer.reminderOpen) return timer;
  await chrome.alarms.clear(AUTO_SNOOZE_ALARM);
  chrome.notifications.clear(NOTIFICATION_ID);
  if (kind === 'sip') {
    const { glassMl } = await getSettings();
    await recordEvent('sip', glassMl);
    return startMain();
  }
  await recordEvent(kind === 'autoSnooze' ? 'autoSnooze' : 'snooze');
  return startSnooze();
}

// ---------- Sound ----------

async function playSipSound() {
  const { soundOn } = await getSettings();
  if (!soundOn) return;
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Plays the sip sound when the reminder character arrives.',
      });
    }
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PLAY_SIP' });
  } catch (err) {
    console.warn('Sip and Surf: could not play sound.', err);
  }
}

// ---------- Events ----------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await saveSettings({});
    await startMain();
  } else {
    await restore();
  }
});

chrome.runtime.onStartup.addListener(restore);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REMINDER_ALARM) {
    const timer = await getTimer();
    if (timer.running) await fireReminder();
  } else if (alarm.name === AUTO_SNOOZE_ALARM) {
    const timer = await getTimer();
    if (timer.reminderOpen) {
      await closeOverlay(timer.reminderTabId);
      await answer('autoSnooze');
    }
  }
});

chrome.notifications.onButtonClicked.addListener(async (id, index) => {
  if (id !== NOTIFICATION_ID) return;
  await answer(index === 0 ? 'sip' : 'snooze');
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id === NOTIFICATION_ID) await answer('sip');
});

async function stateForUi() {
  const { settings, timer, history } = await getAll();
  return { settings, timer, history, now: Date.now() };
}

const handlers = {
  // From the on-page buddy
  ARRIVED: async () => { await playSipSound(); return true; },
  SIP: () => answer('sip'),
  SNOOZE: () => answer('snooze'),
  AUTO_SNOOZE: () => answer('autoSnooze'),
  // From the popup and history page
  GET_STATE: () => stateForUi(),
  START: async () => { await startMain(); return stateForUi(); },
  PAUSE: async () => { await pause(); return stateForUi(); },
  RESUME: async () => { await resume(); return stateForUi(); },
  REMIND_NOW: async () => { await fireReminder(); return stateForUi(); },
  LOG_GLASS: async (msg) => {
    const { glassMl } = await getSettings();
    await recordEvent('manual', Number(msg.ml) || glassMl);
    return stateForUi();
  },
  UNDO: async () => { await recordEvent('undo'); return stateForUi(); },
  SET_SETTINGS: async (msg) => {
    const before = await getSettings();
    const after = await saveSettings(msg.settings || {});
    const timer = await getTimer();
    // A new interval takes effect right away if the main timer is running.
    if (after.intervalMin !== before.intervalMin && timer.running && timer.mode === 'main') await startMain();
    return stateForUi();
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;
  const handler = handlers[msg.type];
  if (!handler) return false;
  Promise.resolve(handler(msg, sender))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
  return true;
});
