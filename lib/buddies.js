// Custom buddies from "Make me a buddy". The buyer gets a .buddy.json file (made with
// tools/make_buddy_pack.py) and adds it on the buddies page. It holds the buddy's name and its
// sprite: either a full sheet laid out like the built-in characters, or one picture that
// lib/sprite.js animates. Buddies are kept in chrome.storage.local, on this computer only.

export const PACK_FORMAT = 'sip-and-surf-buddy';
export const MAX_BUDDIES = 12;
const MAX_IMAGE_CHARS = 3 * 1024 * 1024; // a 2 MB PNG as base64
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function fail(message) {
  throw new Error(message);
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function cleanSheet(raw) {
  const s = raw || {};
  if (!int(s.frameWidth, 8, 512) || !int(s.frameHeight, 8, 512) || !int(s.total, 1, 64)) {
    fail('The buddy file has a broken sprite sheet.');
  }
  const frame = (v) => int(v, 0, s.total - 1);
  const count = (start, n) => frame(start) && int(n, 1, s.total) && start + n <= s.total;
  if (!frame(s.idle) || !count(s.walkStart, s.walkFrames) || !count(s.drinkStart, s.drinkFrames)) {
    fail('The buddy file has a broken sprite sheet.');
  }
  const out = {
    frameWidth: s.frameWidth, frameHeight: s.frameHeight, total: s.total, idle: s.idle,
    walkStart: s.walkStart, walkFrames: s.walkFrames, drinkStart: s.drinkStart, drinkFrames: s.drinkFrames,
  };
  if (count(s.turnStart, s.turnFrames) && frame(s.frontIdle)) {
    Object.assign(out, { turnStart: s.turnStart, turnFrames: s.turnFrames, frontIdle: s.frontIdle });
    if (frame(s.cheers)) out.cheers = s.cheers;
    if (count(s.angryStart, s.angryFrames)) Object.assign(out, { angryStart: s.angryStart, angryFrames: s.angryFrames });
  }
  if (typeof s.stride === 'number' && s.stride > 0 && s.stride < 512) out.stride = s.stride;
  if (int(s.drinkMs, 200, 10000)) out.drinkMs = s.drinkMs;
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Math.abs(n) < 1024);
  if (s.anger && point(s.anger.front) && point(s.anger.side)) out.anger = { front: [...s.anger.front], side: [...s.anger.side] };
  return out;
}

// Checks a .buddy.json file's text. Returns { name, line, image, sheet|null } or throws with a
// message for the person.
export function parsePack(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (_) {
    fail("That isn't a buddy file. Buddy files end in .buddy.json.");
  }
  if (!raw || raw.format !== PACK_FORMAT) fail("That isn't a buddy file. Buddy files end in .buddy.json.");
  if (raw.version !== 1) fail('This buddy file is from a newer Sip and Surf. Update the extension, then try again.');
  const name = cleanText(raw.name, 24);
  if (!name) fail('The buddy file has no name.');
  const image = String(raw.image || '');
  if (!PNG_DATA_URL.test(image) || image.length > MAX_IMAGE_CHARS) fail('The buddy file has no picture, or it is too big.');
  return {
    name,
    line: cleanText(raw.line, 80) || 'Your very own buddy.',
    image,
    sheet: raw.sheet ? cleanSheet(raw.sheet) : null,
  };
}

// Checks the picture really has the size the sheet says. size: { width, height }.
export function checkImageSize(pack, size) {
  if (!pack.sheet) {
    if (size.width < 8 || size.height < 8 || size.width > 1024 || size.height > 1024) {
      fail('The buddy picture should be between 8 and 1024 pixels on each side.');
    }
    return;
  }
  const { frameWidth, frameHeight, total } = pack.sheet;
  if (size.width !== frameWidth * total || size.height !== frameHeight) fail("The buddy file's picture doesn't match its sheet.");
}

export function isCustomId(id) {
  return typeof id === 'string' && id.startsWith('buddy-');
}

// ---------- Storage ----------

export async function getBuddies() {
  const { buddies } = await chrome.storage.local.get('buddies');
  return Array.isArray(buddies) ? buddies : [];
}

export async function addBuddy(pack) {
  const buddies = await getBuddies();
  if (buddies.length >= MAX_BUDDIES) fail(`You can keep up to ${MAX_BUDDIES} buddies. Remove one first.`);
  const id = `buddy-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const buddy = { id, name: pack.name, line: pack.line, image: pack.image, sheet: pack.sheet, added: Date.now() };
  await chrome.storage.local.set({ buddies: [...buddies, buddy] });
  return buddy;
}

export async function removeBuddy(id) {
  const buddies = await getBuddies();
  await chrome.storage.local.set({ buddies: buddies.filter((b) => b.id !== id) });
}
