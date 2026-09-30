import { dayKey, formatMl, getAll } from '../lib/state.js';
import { bestStreak, currentStreak, isMet, lastDays, summarize, toCsv } from '../lib/insights.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const tooltip = $('tooltip');
let range = 30;
let data = null;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// Round tick step (1, 2, 2.5 or 5 x 10^n) so about five gridlines cover the data.
function niceTicks(v) {
  const raw = Math.max(1, v) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  const count = Math.max(1, Math.ceil(v / step));
  return { step, count, max: step * count };
}

function shortDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function longDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function showTip(evt, html) {
  tooltip.innerHTML = html;
  tooltip.hidden = false;
  const pad = 12;
  const { innerWidth } = window;
  const rect = tooltip.getBoundingClientRect();
  let x = evt.clientX + pad;
  if (x + rect.width > innerWidth - 8) x = evt.clientX - rect.width - pad;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${evt.clientY - rect.height - pad}px`;
}

function hideTip() {
  tooltip.hidden = true;
}

// Bars for daily intake with the target as a dashed step line.
function drawDaily(days) {
  const host = $('daily-chart');
  host.innerHTML = '';
  const W = Math.max(320, host.clientWidth || 800);
  const H = 240;
  const m = { l: 48, r: 12, t: 16, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const ticks = niceTicks(Math.max(...days.map((d) => Math.max(d.ml, d.targetMl))) * 1.05);
  const { max } = ticks;
  const y = (v) => m.t + ih - (v / max) * ih;
  const slot = iw / days.length;
  const barW = Math.max(2, Math.min(28, slot - 2));

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Daily water intake compared with the daily target' }, host);

  for (let i = 0; i <= ticks.count; i++) {
    const v = ticks.step * i;
    el('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, svg);
    const t = el('text', { class: 'axis-text', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, svg);
    t.textContent = v >= 1000 ? `${+(v / 1000).toFixed(2)} L` : `${Math.round(v)} ml`;
  }

  const labelEvery = Math.ceil(days.length / 8);
  days.forEach((d, i) => {
    const cx = m.l + slot * i + slot / 2;
    const last = i === days.length - 1;
    if (last || (i % labelEvery === 0 && days.length - 1 - i >= labelEvery * 0.75)) {
      const t = el('text', { class: 'axis-text', x: cx, y: H - 8, 'text-anchor': 'middle' }, svg);
      t.textContent = last ? 'Today' : shortDate(d.key);
    }
    const h = Math.max(0, y(0) - y(d.ml));
    const hit = el('rect', { class: 'hit', x: cx - slot / 2, y: m.t, width: slot, height: ih }, svg);
    if (h > 0) {
      const r = Math.min(4, barW / 2, h);
      // Rounded top, square baseline.
      el('path', {
        class: `bar${isMet(d) ? ' met' : ''}`,
        d: `M${cx - barW / 2} ${y(0)}V${y(d.ml) + r}q0 -${r} ${r} -${r}H${cx + barW / 2 - r}q${r} 0 ${r} ${r}V${y(0)}Z`,
      }, svg);
    }
    if (isMet(d) && barW >= 10) {
      const c = el('text', { class: 'check', x: cx, y: y(d.ml) - 5, 'text-anchor': 'middle' }, svg);
      c.textContent = '✓';
    }
    const pct = d.targetMl ? Math.round((d.ml / d.targetMl) * 100) : 0;
    const html = `<strong>${longDate(d.key)}</strong><br>${formatMl(d.ml)} of ${formatMl(d.targetMl)} (${pct}%)<br>${d.sips} sip${d.sips === 1 ? '' : 's'}, ${d.snoozes} snooze${d.snoozes === 1 ? '' : 's'}${isMet(d) ? '<br>Target met' : ''}`;
    hit.addEventListener('mousemove', (e) => showTip(e, html));
    hit.addEventListener('mouseleave', hideTip);
  });

  // Target as a step line, since the target can change from day to day.
  let path = '';
  days.forEach((d, i) => {
    const x0 = m.l + slot * i;
    const ty = y(d.targetMl);
    path += i === 0 ? `M${x0} ${ty}` : `V${ty}`;
    path += `H${x0 + slot}`;
  });
  el('path', { class: 'target', d: path }, svg);
}

function drawHours(hours) {
  const host = $('hour-chart');
  host.innerHTML = '';
  const total = hours.reduce((a, b) => a + b, 0);
  if (!total) {
    host.innerHTML = '<p class="empty">Sips you log will show up here by hour of day.</p>';
    $('hour-note').textContent = '';
    return;
  }
  const W = Math.max(320, host.clientWidth || 800);
  const H = 160;
  const m = { l: 32, r: 12, t: 12, b: 26 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = Math.max(...hours);
  const slot = iw / 24;
  const barW = Math.max(2, slot - 3);
  const y = (v) => m.t + ih - (v / max) * ih;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Sips by hour of day' }, host);
  el('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) }, svg);
  hours.forEach((v, hr) => {
    const cx = m.l + slot * hr + slot / 2;
    if (hr % 3 === 0) {
      const t = el('text', { class: 'axis-text', x: cx, y: H - 8, 'text-anchor': 'middle' }, svg);
      t.textContent = hr === 0 ? '12a' : hr === 12 ? '12p' : hr < 12 ? `${hr}a` : `${hr - 12}p`;
    }
    const hit = el('rect', { class: 'hit', x: cx - slot / 2, y: m.t, width: slot, height: ih }, svg);
    if (v > 0) {
      const h = y(0) - y(v);
      const r = Math.min(4, barW / 2, h);
      el('path', { class: 'bar', d: `M${cx - barW / 2} ${y(0)}V${y(v) + r}q0 -${r} ${r} -${r}H${cx + barW / 2 - r}q${r} 0 ${r} ${r}V${y(0)}Z` }, svg);
    }
    const label = `${String(hr).padStart(2, '0')}:00 to ${String(hr).padStart(2, '0')}:59`;
    hit.addEventListener('mousemove', (e) => showTip(e, `<strong>${label}</strong><br>${v} sip${v === 1 ? '' : 's'}`));
    hit.addEventListener('mouseleave', hideTip);
  });
  const peak = hours.indexOf(max);
  const morning = hours.slice(5, 12).reduce((a, b) => a + b, 0);
  const afternoon = hours.slice(12, 17).reduce((a, b) => a + b, 0);
  const evening = hours.slice(17, 23).reduce((a, b) => a + b, 0);
  const parts = [['morning', morning], ['afternoon', afternoon], ['evening', evening]].sort((a, b) => b[1] - a[1]);
  $('hour-note').textContent = `You drink most around ${String(peak).padStart(2, '0')}:00, and most of your sips land in the ${parts[0][0]}.`;
}

function renderTable(days) {
  const rows = [...days].reverse().filter((d) => d.recorded);
  const tbody = $('rows');
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center">No days recorded in this range yet.</td></tr>';
    return;
  }
  for (const d of rows) {
    const tr = document.createElement('tr');
    const pct = Math.round((d.ml / d.targetMl) * 100);
    const cells = [
      d.key === dayKey() ? 'Today' : longDate(d.key),
      formatMl(d.ml),
      formatMl(d.targetMl),
      null,
      String(d.sips),
      String(d.snoozes),
    ];
    cells.forEach((text, i) => {
      const td = document.createElement('td');
      if (i === 3) {
        const span = document.createElement('span');
        span.textContent = isMet(d) ? `${pct}% ✓` : `${pct}%`;
        if (isMet(d)) span.className = 'met';
        td.appendChild(span);
      } else {
        td.textContent = text;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function render() {
  if (!data) return;
  const { settings, history } = data;
  const days = lastDays(history, range, settings.targetMl);
  const s = summarize(history, days);
  const today = days[days.length - 1];

  $('t-today').textContent = formatMl(today.ml);
  $('t-today-sub').textContent = `of ${formatMl(today.targetMl)} (${Math.round((today.ml / today.targetMl) * 100)}%)`;
  $('t-streak').textContent = plural(currentStreak(history), 'day');
  $('t-best-streak').textContent = plural(bestStreak(history), 'day');
  $('t-hit').textContent = `${Math.round(s.hitRate * 100)}%`;
  $('t-hit-sub').textContent = s.hitBasis ? `${s.metDays} of ${plural(s.hitBasis, 'day')}` : 'no finished days yet';
  $('t-avg').textContent = formatMl(s.avgMl);
  $('t-avg-sub').textContent = s.completedDays ? `over ${plural(s.completedDays, 'finished day')}` : 'today so far';
  $('t-response').textContent = s.responseRate == null ? '–' : `${Math.round(s.responseRate * 100)}%`;
  $('t-response-sub').textContent = s.reminders ? `${s.reminderSips} of ${plural(s.reminders, 'reminder')}` : 'no reminders yet';

  drawDaily(days);
  const notes = [];
  if (s.bestDay) notes.push(`Best day: ${longDate(s.bestDay.key)} with ${formatMl(s.bestDay.ml)}.`);
  if (s.avgBasis && s.avgMl < settings.targetMl) notes.push(`On average you are ${formatMl(settings.targetMl - s.avgMl)} short of your target, about ${Math.ceil((settings.targetMl - s.avgMl) / settings.glassMl)} more sip${Math.ceil((settings.targetMl - s.avgMl) / settings.glassMl) === 1 ? '' : 's'} a day.`);
  else if (s.avgBasis) notes.push('On average you meet your target. Keep it up.');
  $('daily-note').textContent = notes.join(' ');
  drawHours(s.hours);
  renderTable(days);
  $('subtitle').textContent = `Target ${formatMl(settings.targetMl)} a day, one sip counts as ${formatMl(settings.glassMl)}.`;
}

async function load() {
  data = await getAll();
  render();
}

document.querySelectorAll('.range button').forEach((btn) => {
  btn.addEventListener('click', () => {
    range = Number(btn.dataset.range);
    document.querySelectorAll('.range button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    render();
  });
});

$('export').addEventListener('click', () => {
  const blob = new Blob([toCsv(data.history)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sip-and-surf-history-${dayKey()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('clear').addEventListener('click', async () => {
  if (!confirm('Delete all intake history? This cannot be undone.')) return;
  await chrome.storage.local.set({ history: {} });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.history || changes.settings)) load();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

load();
