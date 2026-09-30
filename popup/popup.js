import { SNOOZE_FRACTION, dayKey, formatMl, formatMs } from '../lib/state.js';

const $ = (id) => document.getElementById(id);
const PRESETS = ['10', '15', '20', '30', '45', '60', '90', '120'];
let state = null;
let tick = null;

async function call(type, extra = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...extra });
  if (!res || !res.ok) throw new Error(res ? res.error : 'no response');
  return res.result;
}

function describeSnooze(intervalMin) {
  const sec = Math.round(intervalMin * 60 * SNOOZE_FRACTION);
  const text = sec % 60 === 0 ? `${sec / 60} minute${sec === 60 ? '' : 's'}` : sec < 60 ? `${sec} seconds` : `${Math.floor(sec / 60)} min ${sec % 60} s`;
  return `Snooze waits ${text} (5% of the interval).`;
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
  const { timer } = state;
  const mode = $('timer-mode');
  const toggle = $('toggle');
  if (timer.reminderOpen) {
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
  $('snooze-note').textContent = describeSnooze(settings.intervalMin);
}

function render() {
  if (!state) return;
  renderToday();
  renderTimer();
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
$('open-history').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'local') refresh();
});

refresh();
tick = setInterval(renderTimer, 1000);
window.addEventListener('unload', () => clearInterval(tick));
