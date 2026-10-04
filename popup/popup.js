import { dayKey, formatMl, formatMs } from '../lib/state.js';
import { CHARACTERS } from '../lib/characters.js';
import { BUDDY_PRICE } from '../lib/config.js';
import { formatClock } from '../lib/hours.js';

const $ = (id) => document.getElementById(id);
const PRESETS = ['10', '15', '20', '30', '45', '60', '90', '120'];
const SNOOZE_PRESETS = ['1', '2', '3', '5', '10', '15', '30'];
let state = null;
let tick = null;
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function call(type, extra = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...extra });
  if (!res || !res.ok) throw new Error(res ? res.error : 'No answer from Sip and Surf. Try again.');
  return res.result;
}

// ---------- Characters ----------

const sheets = {};
async function sheet(id) {
  if (!sheets[id]) sheets[id] = fetch(`../assets/characters/${id}.json`).then((r) => r.json()).catch(() => null);
  return sheets[id];
}

function tile(c, meta, removable) {
  const t = document.createElement('div');
  t.className = 'char';
  t.dataset.id = c.id;
  t.setAttribute('role', 'radio');
  t.tabIndex = 0;
  t.title = `Use ${c.name}`;
  const preview = document.createElement('span');
  preview.className = 'preview';
  if (meta && meta.frameWidth) {
    preview.style.backgroundImage = `url("${meta.url}")`;
    preview.style.backgroundPosition = `${-(meta.frontIdle ?? meta.idle) * meta.frameWidth}px 0`;
    if (meta.frameHeight > 100) {
      const scale = 100 / meta.frameHeight;
      preview.style.backgroundSize = `${meta.frameWidth * meta.total * scale}px 100px`;
      preview.style.backgroundPosition = `${-(meta.frontIdle ?? meta.idle) * meta.frameWidth * scale}px 0`;
    }
  } else if (meta) {
    preview.classList.add('single');
    preview.style.backgroundImage = `url("${meta.url}")`;
  }
  const name = document.createElement('span');
  name.textContent = c.name;
  const line = document.createElement('span');
  line.className = 'line';
  line.textContent = c.line;
  t.append(preview, name, line);
  if (removable) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'remove';
    x.textContent = '×';
    x.title = `Remove ${c.name}`;
    x.setAttribute('aria-label', `Remove ${c.name}`);
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Remove ${c.name}? You can add the buddy file again later.`)) update('REMOVE_BUDDY', { id: c.id });
    });
    t.append(x);
  }
  const pick = () => saveSettings({ character: c.id });
  t.addEventListener('click', pick);
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  return t;
}

let builtFor = '';
async function renderCharacters() {
  const { buddies } = state;
  const key = buddies.map((b) => b.id).join(',');
  if (key !== builtFor || !$('chars').children.length) {
    builtFor = key;
    const tiles = [];
    for (const c of CHARACTERS) {
      const meta = await sheet(c.id);
      tiles.push(tile(c, meta && { ...meta, url: `../${meta.image}` }, false));
    }
    for (const b of buddies) tiles.push(tile(b, { ...(b.sheet || {}), url: b.image }, true));
    $('chars').replaceChildren(...tiles);
  }
  for (const t of $('chars').children) t.setAttribute('aria-checked', String(state.settings.character === t.dataset.id));
}

function renderToday() {
  const { settings, history } = state;
  const day = history[dayKey()] || { ml: 0, sips: 0 };
  const pct = Math.round((day.ml / settings.targetMl) * 100);
  $('today-ml').textContent = formatMl(day.ml);
  $('today-target').textContent = formatMl(settings.targetMl);
  $('today-pct').textContent = `${pct}%`;
  const bar = $('today-bar');
  bar.querySelector('i').style.width = `${Math.min(100, pct)}%`;
  bar.setAttribute('aria-valuenow', String(Math.min(100, pct)));
  bar.classList.toggle('done', pct >= 100);
  const left = settings.targetMl - day.ml;
  $('today-note').textContent =
    day.sips === 0 ? 'No sips yet today.'
      : left > 0 ? `${day.sips} sip${day.sips === 1 ? '' : 's'} so far, ${formatMl(left)} to go.`
        : `Target reached with ${day.sips} sips. Nice work!`;
  $('glass-label').textContent = formatMl(settings.glassMl);
  $('undo').disabled = !(day.log && day.log.length);
}

function renderTimer() {
  const { timer, settings } = state;
  const mode = $('timer-mode');
  const toggle = $('toggle');
  const note = $('timer-note');
  note.hidden = true;
  if (timer.running && !timer.reminderOpen && timer.deferred === 'quiet') {
    mode.textContent = 'Quiet hours';
    $('countdown').textContent = formatMs(timer.nextFireAt - Date.now());
    note.hidden = false;
    note.textContent = `Your buddy comes back at ${formatClock(settings.activeHours.start)}.`;
  } else if (timer.running && !timer.reminderOpen && timer.deferred === 'busy') {
    mode.textContent = 'Waiting';
    $('countdown').textContent = 'Soon';
    note.hidden = false;
    note.textContent = "You're in full screen or on a call. Your buddy comes once you're done.";
  } else if (timer.reminderOpen) {
    mode.textContent = 'On screen now';
    $('countdown').textContent = 'Sip time!';
  } else if (!timer.running) {
    mode.textContent = 'Paused';
    $('countdown').textContent = formatMs(timer.pausedRemainingMs);
  } else {
    mode.textContent = timer.mode === 'snooze' ? 'Snoozed' : 'Running';
    // Adjust for clock drift between the worker's reply and now.
    $('countdown').textContent = formatMs(timer.nextFireAt - Date.now());
  }
  toggle.textContent = timer.running ? 'Pause' : 'Resume';
  $('remind-now').disabled = timer.reminderOpen;
}

function renderSettings() {
  const { settings } = state;
  const value = String(settings.intervalMin);
  const isPreset = PRESETS.includes(value);
  $('interval').value = isPreset ? value : 'custom';
  $('custom-wrap').hidden = isPreset;
  $('custom').value = value;
  if (document.activeElement !== $('target')) $('target').value = settings.targetMl;
  if (document.activeElement !== $('glass')) $('glass').value = settings.glassMl;
  $('sound').checked = settings.soundOn;
  const hours = settings.activeHours;
  $('hours-on').checked = hours.on;
  if (document.activeElement !== $('hours-start')) $('hours-start').value = hours.start;
  if (document.activeElement !== $('hours-end')) $('hours-end').value = hours.end;
  document.querySelector('.hours .times').classList.toggle('off', !hours.on);
  $('days').classList.toggle('off', !hours.on);
  if (!$('days').children.length) {
    DAY_LETTERS.forEach((letter, d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = letter;
      b.title = DAY_NAMES[d];
      b.setAttribute('aria-label', DAY_NAMES[d]);
      b.addEventListener('click', () => toggleDay(d));
      $('days').append(b);
    });
  }
  [...$('days').children].forEach((b, d) => b.setAttribute('aria-pressed', String(hours.days.includes(d))));
  $('busy').checked = settings.hideWhenBusy;
  const snooze = String(settings.snoozeMin);
  const snoozePreset = SNOOZE_PRESETS.includes(snooze);
  if (document.activeElement !== $('snooze-custom')) {
    $('snooze').value = snoozePreset ? snooze : 'custom';
    $('snooze-custom-wrap').hidden = snoozePreset;
    $('snooze-custom').value = snooze;
  }
}

function render() {
  if (!state) return;
  renderToday();
  renderTimer();
  renderCharacters();
  renderSettings();
}

async function refresh() {
  state = await call('GET_STATE');
  render();
}

async function update(type, extra) {
  state = await call(type, extra);
  render();
}

function saveSettings(patch) {
  return update('SET_SETTINGS', { settings: patch });
}

$('log-glass').addEventListener('click', () => update('LOG_GLASS'));
$('undo').addEventListener('click', () => update('UNDO'));
$('toggle').addEventListener('click', () => update(state.timer.running ? 'PAUSE' : 'RESUME'));
$('remind-now').addEventListener('click', async () => {
  await update('REMIND_NOW');
  window.close();
});
$('interval').addEventListener('change', (e) => {
  if (e.target.value === 'custom') {
    $('custom-wrap').hidden = false;
    $('custom').focus();
    return;
  }
  saveSettings({ intervalMin: Number(e.target.value) });
});
$('custom').addEventListener('change', (e) => {
  const n = Number(e.target.value);
  if (n >= 10) saveSettings({ intervalMin: n });
});
$('target').addEventListener('change', (e) => saveSettings({ targetMl: Number(e.target.value) }));
$('glass').addEventListener('change', (e) => saveSettings({ glassMl: Number(e.target.value) }));
$('sound').addEventListener('change', (e) => saveSettings({ soundOn: e.target.checked }));
$('snooze').addEventListener('change', (e) => {
  if (e.target.value === 'custom') {
    $('snooze-custom-wrap').hidden = false;
    $('snooze-custom').focus();
    return;
  }
  saveSettings({ snoozeMin: Number(e.target.value) });
});
$('snooze-custom').addEventListener('change', (e) => {
  const n = Number(e.target.value);
  if (n >= 1) saveSettings({ snoozeMin: Math.min(120, n) });
});
function setHours(patch) {
  return saveSettings({ activeHours: { ...state.settings.activeHours, ...patch } });
}

function toggleDay(d) {
  const days = state.settings.activeHours.days;
  const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
  if (next.length) setHours({ days: next }); // at least one day stays on
}

function openPage(path) {
  chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  window.close();
}

$('hours-on').addEventListener('change', (e) => setHours({ on: e.target.checked }));
$('hours-start').addEventListener('change', (e) => e.target.value && setHours({ start: e.target.value }));
$('hours-end').addEventListener('change', (e) => e.target.value && setHours({ end: e.target.value }));
$('busy').addEventListener('change', (e) => saveSettings({ hideWhenBusy: e.target.checked }));
$('price').textContent = BUDDY_PRICE;
$('make').addEventListener('click', () => openPage('welcome/welcome.html#make'));
$('add-buddy').addEventListener('click', () => openPage('welcome/welcome.html#buddies'));
$('open-welcome').addEventListener('click', () => openPage('welcome/welcome.html'));
$('open-privacy').addEventListener('click', () => openPage('privacy/privacy.html'));
$('open-history').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'local') refresh();
});

refresh();
tick = setInterval(renderTimer, 1000);
window.addEventListener('unload', () => clearInterval(tick));
