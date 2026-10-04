// Sip and Surf service worker: owns the reminder timer, shows the reminder, records intake.
import {
  AUTO_SNOOZE_MS,
  getAll,
  getSettings,
  getTimer,
  recordEvent,
  saveSettings,
  saveTimer,
} from './lib/state.js';
import { buddySprite, loadImageData, loadSprite } from './lib/sprite.js';
import { DEFAULT_CHARACTER, builtInCharacter } from './lib/characters.js';
import { addBuddy, checkImageSize, getBuddies, isCustomId, parsePack, removeBuddy } from './lib/buddies.js';
import { nextActiveTime } from './lib/hours.js';
import { busyReason } from './lib/busy.js';

const REMINDER_ALARM = 'sip-reminder';
const AUTO_SNOOZE_ALARM = 'sip-auto-snooze';
const NOTIFICATION_ID = 'sip-reminder';
const BUSY_RETRY_MS = 2 * 60 * 1000; // while you're in full screen or on a call, look again this often

// ---------- Scheduling ----------

async function setAlarm(fields) {
  await chrome.alarms.clear(REMINDER_ALARM);
  await chrome.alarms.create(REMINDER_ALARM, { when: fields.nextFireAt });
  return saveTimer({
    running: true,
    pausedRemainingMs: null,
    reminderOpen: false,
    reminderOpenedAt: null,
    reminderTabId: null,
    ...fields,
  });
}

// The reminder is due at dueAt; outside your active hours it waits for them to start.
async function scheduleAt(dueAt, mode) {
  const { activeHours } = await getSettings();
  const nextFireAt = nextActiveTime(dueAt, activeHours);
  return setAlarm({ mode, dueAt, nextFireAt, deferred: nextFireAt > dueAt ? 'quiet' : null });
}

function schedule(delayMs, mode) {
  return scheduleAt(Date.now() + delayMs, mode);
}

async function startMain() {
  const { intervalMin } = await getSettings();
  return schedule(intervalMin * 60 * 1000, 'main');
}

async function startSnooze() {
  const { snoozeMin } = await getSettings();
  return schedule(snoozeMin * 60 * 1000, 'snooze');
}

async function pause() {
  const timer = await getTimer();
  if (!timer.running) return timer;
  await chrome.alarms.clear(REMINDER_ALARM);
  const due = timer.dueAt || timer.nextFireAt;
  const remaining = due ? Math.max(0, due - Date.now()) : null;
  return saveTimer({ running: false, pausedRemainingMs: remaining, nextFireAt: null, dueAt: null, deferred: null });
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

const getUrl = (path) => chrome.runtime.getURL(path);
const spriteCache = new Map();
function cached(key, load) {
  if (!spriteCache.has(key)) {
    spriteCache.set(key, load().catch((err) => {
      spriteCache.delete(key);
      throw err;
    }));
  }
  return spriteCache.get(key);
}

// The chosen character: a built-in one, or a custom buddy you added. Falls back to the default.
async function currentCharacter() {
  const { character } = await getSettings();
  if (builtInCharacter(character)) return { id: character, load: () => loadSprite(getUrl, character) };
  if (isCustomId(character)) {
    const buddy = (await getBuddies()).find((b) => b.id === character);
    if (buddy) return { id: buddy.id, load: () => buddySprite(buddy) };
  }
  return { id: DEFAULT_CHARACTER, load: () => loadSprite(getUrl, DEFAULT_CHARACTER) };
}

async function injectOverlay(tab) {
  const character = await currentCharacter();
  const [sprite, anger, { snoozeMin }] = await Promise.all([
    cached(character.id, character.load),
    cached('anger', () => loadImageData(getUrl, 'assets/anger.png')),
    getSettings(),
  ]);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (config) => window.__sipBuddy && window.__sipBuddy.show(config),
    args: [{ sprite, anger, snoozeMin, autoSnoozeMs: AUTO_SNOOZE_MS }],
  });
  if (!result || result.result !== true) throw new Error('overlay did not start');
}

// Full screen (a video, a game, a presentation) or a call: the buddy waits rather than walk on.
async function whyBusy(tab) {
  let windowState = null;
  let pageFullscreen = false;
  if (tab) {
    try {
      windowState = (await chrome.windows.get(tab.windowId)).state;
    } catch (_) {
      // the window closed
    }
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => Boolean(document.fullscreenElement),
      });
      pageFullscreen = Boolean(res && res.result);
    } catch (_) {
      // pages that block scripts
    }
  }
  const tabs = await chrome.tabs.query({ audible: true });
  if (tab) tabs.push({ ...tab, active: true });
  return busyReason({ windowState, pageFullscreen, tabs });
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

// force: you asked for the buddy from the popup, so quiet hours and busy checks don't apply.
async function fireReminder({ force = false } = {}) {
  const timer = await getTimer();
  if (timer.reminderOpen && Date.now() - (timer.reminderOpenedAt || 0) < AUTO_SNOOZE_MS + 30000) return;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!force) {
    const settings = await getSettings();
    const now = Date.now();
    const dueAt = timer.dueAt || now;
    const mode = timer.mode === 'snooze' ? 'snooze' : 'main';
    const activeAt = nextActiveTime(now, settings.activeHours);
    if (activeAt > now) return setAlarm({ mode, dueAt, nextFireAt: activeAt, deferred: 'quiet' });
    if (settings.hideWhenBusy && (await whyBusy(tab))) {
      return setAlarm({ mode, dueAt, nextFireAt: now + BUSY_RETRY_MS, deferred: 'busy' });
    }
  }

  await chrome.alarms.clear(REMINDER_ALARM);
  await saveTimer({
    mode: 'waiting', dueAt: null, nextFireAt: null, deferred: null,
    reminderOpen: true, reminderOpenedAt: Date.now(), reminderTabId: null,
  });
  await recordEvent('reminder');
  // Backstop in case the tab closes or navigates before anyone answers.
  // The margin covers the walk in, the turn and his first sip before the 60 s countdown starts.
  await chrome.alarms.create(AUTO_SNOOZE_ALARM, { when: Date.now() + AUTO_SNOOZE_MS + 15000 });

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

async function customIds() {
  return (await getBuddies()).map((b) => b.id);
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await saveSettings({});
    await startMain();
    await chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  } else {
    await saveSettings({}, await customIds()); // drops characters that no longer exist
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
  const [{ settings, timer, history }, buddies] = await Promise.all([getAll(), getBuddies()]);
  return { settings, timer, history, buddies, now: Date.now() };
}

// Re-plans a waiting reminder after its rules changed (active hours, or waiting while busy).
async function replan() {
  const timer = await getTimer();
  if (!timer.running || timer.reminderOpen || timer.mode === 'waiting') return;
  await scheduleAt(timer.dueAt || timer.nextFireAt || Date.now(), timer.mode);
}

async function pictureSize(dataUrl) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

const handlers = {
  // From the on-page buddy
  ARRIVED: async () => { await playSipSound(); return true; },
  SIP: () => answer('sip'),
  SNOOZE: () => answer('snooze'),
  AUTO_SNOOZE: () => answer('autoSnooze'),
  // From the popup, the history page and the buddies page
  GET_STATE: () => stateForUi(),
  START: async () => { await startMain(); return stateForUi(); },
  PAUSE: async () => { await pause(); return stateForUi(); },
  RESUME: async () => { await resume(); return stateForUi(); },
  REMIND_NOW: async () => { await fireReminder({ force: true }); return stateForUi(); },
  LOG_GLASS: async (msg) => {
    const { glassMl } = await getSettings();
    await recordEvent('manual', Number(msg.ml) || glassMl);
    return stateForUi();
  },
  UNDO: async () => { await recordEvent('undo'); return stateForUi(); },
  SET_SETTINGS: async (msg) => {
    const before = await getSettings();
    const patch = { ...(msg.settings || {}) };
    const ids = await customIds();
    if ('character' in patch && !builtInCharacter(patch.character) && !ids.includes(patch.character)) {
      throw new Error('That buddy has been removed.');
    }
    const after = await saveSettings(patch, ids);
    const timer = await getTimer();
    if (after.intervalMin !== before.intervalMin && timer.running && timer.mode === 'main' && !timer.reminderOpen) {
      await startMain(); // a new interval takes effect right away
    } else if (JSON.stringify(after.activeHours) !== JSON.stringify(before.activeHours)
      || after.hideWhenBusy !== before.hideWhenBusy) {
      await replan();
    }
    return stateForUi();
  },
  ADD_BUDDY: async (msg) => {
    const pack = parsePack(msg.text); // throws with a message the page shows
    checkImageSize(pack, await pictureSize(pack.image));
    const buddy = await addBuddy(pack);
    await saveSettings({ character: buddy.id }, await customIds());
    return { ...(await stateForUi()), added: buddy.id };
  },
  REMOVE_BUDDY: async (msg) => {
    await removeBuddy(msg.id);
    spriteCache.delete(msg.id);
    await saveSettings({}, await customIds()); // if it was the chosen one, back to the default
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
