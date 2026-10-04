// The welcome page: opens once on install, and later from the popup ("Buddies and help").
import { CHARACTERS } from '../lib/characters.js';
import { BUDDY_EMAIL_BODY, BUDDY_EMAIL_SUBJECT, BUDDY_PRICE, CONTACT_EMAIL, mailto } from '../lib/config.js';
import { buddySprite, loadImageData, loadSprite } from '../lib/sprite.js';
import { AUTO_SNOOZE_MS } from '../lib/state.js';

const $ = (id) => document.getElementById(id);
const getUrl = (path) => chrome.runtime.getURL(path);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let state = null;

async function call(type, extra = {}) {
  const res = await chrome.runtime.sendMessage({ type, ...extra });
  if (!res || !res.ok) throw new Error(res ? res.error : 'No answer from Sip and Surf. Try again.');
  return res.result;
}

// ---------- The buddy you picked ----------

const sprites = new Map();
function spriteFor(id) {
  if (!sprites.has(id)) {
    const buddy = state.buddies.find((b) => b.id === id);
    sprites.set(id, buddy ? buddySprite(buddy) : loadSprite(getUrl, id));
  }
  return sprites.get(id);
}

// The hero plays a short loop: walk, turn to you, sip, cheers.
let heroTimer = null;
async function playHero() {
  clearTimeout(heroTimer);
  const sprite = await spriteFor(state.settings.character);
  const el = $('hero-sprite');
  const scale = Math.max(1, Math.floor(200 / Math.max(sprite.frameHeight, sprite.frameWidth * 1.4)) || 1);
  const w = sprite.frameWidth * scale;
  const h = sprite.frameHeight * scale;
  Object.assign(el.style, {
    width: `${w}px`,
    height: `${h}px`,
    backgroundImage: `url("${sprite.dataUrl}")`,
    backgroundSize: `${w * sprite.total}px ${h}px`,
  });
  const show = (i) => { el.style.backgroundPosition = `${-i * w}px 0`; };
  const front = sprite.frontIdle ?? sprite.idle;
  if (reduced) {
    show(front);
    return;
  }
  const walk = Array.from({ length: sprite.walkFrames * 2 }, (_, i) => sprite.walkStart + (i % sprite.walkFrames));
  const turn = sprite.turnStart != null ? Array.from({ length: sprite.turnFrames }, (_, i) => sprite.turnStart + i) : [];
  const drink = Array.from({ length: sprite.drinkFrames }, (_, i) => sprite.drinkStart + i);
  const drinkMs = (sprite.drinkMs || 1500) / sprite.drinkFrames;
  const steps = [
    ...walk.map((f) => [f, 225]),
    [sprite.idle, 300],
    ...turn.map((f) => [f, 140]),
    [front, 700],
    ...drink.map((f) => [f, drinkMs]),
    [drink[drink.length - 1], 700],
    ...(sprite.cheers != null ? [[sprite.cheers, 1200]] : []),
    [front, 800],
    ...[...turn].reverse().map((f) => [f, 140]),
  ];
  let k = 0;
  const next = () => {
    const [frame, ms] = steps[k];
    show(frame);
    k = (k + 1) % steps.length;
    heroTimer = setTimeout(next, ms);
  };
  next();
}

async function demo() {
  if (!window.__sipBuddy) return;
  const [sprite, anger] = await Promise.all([
    spriteFor(state.settings.character),
    loadImageData(getUrl, 'assets/anger.png'),
  ]);
  window.__sipBuddy.show({ sprite, anger, snoozeMin: state.settings.snoozeMin, autoSnoozeMs: AUTO_SNOOZE_MS, demo: true });
}

// ---------- Picking ----------

function tile(c, meta, removable) {
  const t = document.createElement('div');
  t.className = 'char';
  t.dataset.id = c.id;
  t.setAttribute('role', 'radio');
  t.tabIndex = 0;
  const preview = document.createElement('span');
  preview.className = 'preview';
  preview.style.backgroundImage = `url("${meta.url}")`;
  if (meta.frameWidth) {
    preview.style.backgroundPosition = `${-(meta.frontIdle ?? meta.idle) * meta.frameWidth}px 0`;
  } else {
    preview.classList.add('single');
  }
  const name = document.createElement('strong');
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
    x.setAttribute('aria-label', `Remove ${c.name}`);
    x.title = `Remove ${c.name}`;
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove ${c.name}? You can add the buddy file again later.`)) return;
      state = await call('REMOVE_BUDDY', { id: c.id });
      render(true);
    });
    t.append(x);
  }
  const pick = async () => {
    state = await call('SET_SETTINGS', { settings: { character: c.id } });
    render();
  };
  t.addEventListener('click', pick);
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  });
  return t;
}

async function buildTiles() {
  const tiles = [];
  for (const c of CHARACTERS) {
    const meta = await fetch(`../assets/characters/${c.id}.json`).then((r) => r.json());
    tiles.push(tile(c, { ...meta, url: `../${meta.image}` }, false));
  }
  for (const b of state.buddies) tiles.push(tile(b, { ...(b.sheet || {}), url: b.image }, true));
  $('chars').replaceChildren(...tiles);
  $('no-buddies').hidden = state.buddies.length > 0;
}

// ---------- Settings ----------

function renderSettings() {
  const { settings } = state;
  const interval = $('interval');
  const value = String(settings.intervalMin);
  if (![...interval.options].some((o) => o.value === value)) {
    interval.append(new Option(`${value} minutes`, value));
  }
  interval.value = value;
  const hours = settings.activeHours;
  $('hours-on').checked = hours.on;
  $('hours-start').value = hours.start;
  $('hours-end').value = hours.end;
  document.querySelector('.times').classList.toggle('off', !hours.on);
  $('busy').checked = settings.hideWhenBusy;
}

async function save(patch) {
  state = await call('SET_SETTINGS', { settings: patch });
  render();
}

const setHours = (patch) => save({ activeHours: { ...state.settings.activeHours, ...patch } });

// ---------- Buddy files ----------

async function addFile(file) {
  const msg = $('file-msg');
  msg.className = 'small';
  msg.textContent = 'Adding…';
  try {
    if (file.size > 4 * 1024 * 1024) throw new Error('That file is too big to be a buddy file.');
    const next = await call('ADD_BUDDY', { text: await file.text() });
    state = next;
    const buddy = state.buddies.find((b) => b.id === next.added);
    msg.className = 'small good';
    msg.textContent = `${buddy.name} is your buddy now. Say hi!`;
    render(true);
  } catch (err) {
    msg.className = 'small bad';
    msg.textContent = err.message;
  }
}

// ---------- Page ----------

let picked = null;
function render(rebuild = false) {
  if (rebuild || !$('chars').children.length) buildTiles().then(() => render());
  for (const t of $('chars').children) t.setAttribute('aria-checked', String(state.settings.character === t.dataset.id));
  renderSettings();
  if (picked !== state.settings.character) {
    picked = state.settings.character;
    playHero();
  }
}

function setupOffer() {
  for (const el of document.querySelectorAll('#price, .price-text')) el.textContent = BUDDY_PRICE;
  const order = $('order');
  const link = mailto(BUDDY_EMAIL_SUBJECT, BUDDY_EMAIL_BODY);
  if (link) {
    order.href = link;
    $('support').hidden = false;
    $('support-link').href = mailto('Sip and Surf');
    $('support-link').textContent = CONTACT_EMAIL;
  } else {
    order.setAttribute('aria-disabled', 'true');
    $('order-off').hidden = false;
  }
}

$('demo').addEventListener('click', demo);
$('interval').addEventListener('change', (e) => save({ intervalMin: Number(e.target.value) }));
$('hours-on').addEventListener('change', (e) => setHours({ on: e.target.checked }));
$('hours-start').addEventListener('change', (e) => e.target.value && setHours({ start: e.target.value }));
$('hours-end').addEventListener('change', (e) => e.target.value && setHours({ end: e.target.value }));
$('busy').addEventListener('change', (e) => save({ hideWhenBusy: e.target.checked }));
$('file').addEventListener('change', (e) => {
  const [file] = e.target.files;
  if (file) addFile(file);
  e.target.value = '';
});

setupOffer();
call('GET_STATE').then((s) => {
  state = s;
  render(true);
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
});
