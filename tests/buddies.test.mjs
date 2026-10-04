import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PACK_FORMAT, checkImageSize, parsePack } from '../lib/buddies.js';
import { cleanSettings } from '../lib/state.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const gojo = JSON.parse(readFileSync(new URL('../assets/characters/gojo.json', import.meta.url)));
const pack = (extra = {}) => JSON.stringify({ format: PACK_FORMAT, version: 1, name: 'Jane', image: PNG, ...extra });

test('a picture-only buddy file', () => {
  const p = parsePack(pack({ line: 'Hi' }));
  assert.equal(p.name, 'Jane');
  assert.equal(p.line, 'Hi');
  assert.equal(p.sheet, null);
});

test('a full sheet keeps its layout', () => {
  const { image, ...sheet } = gojo;
  const p = parsePack(pack({ sheet }));
  assert.equal(p.sheet.total, 22);
  assert.equal(p.sheet.cheers, gojo.cheers);
  assert.deepEqual(p.sheet.anger, gojo.anger);
  assert.equal('image' in p.sheet, false);
  checkImageSize(p, { width: 64 * 22, height: 100 });
  assert.throws(() => checkImageSize(p, { width: 64, height: 100 }), /doesn't match/);
});

test('broken files are refused with a readable message', () => {
  assert.throws(() => parsePack('{nope'), /isn't a buddy file/);
  assert.throws(() => parsePack(JSON.stringify({ format: 'other' })), /isn't a buddy file/);
  assert.throws(() => parsePack(pack({ version: 2 })), /newer Sip and Surf/);
  assert.throws(() => parsePack(pack({ name: '  ' })), /no name/);
  assert.throws(() => parsePack(pack({ image: 'https://example.com/x.png' })), /no picture/);
  assert.throws(() => parsePack(pack({ image: 'data:image/png;base64,abc")' })), /no picture/);
  assert.throws(() => parsePack(pack({ sheet: { ...gojo, walkStart: 30 } })), /broken sprite sheet/);
});

test('names are trimmed and kept short', () => {
  assert.equal(parsePack(pack({ name: '  A very very long buddy name indeed  ' })).name.length, 24);
});

test('settings keep a custom buddy only while it exists', () => {
  assert.equal(cleanSettings({ character: 'buddy-abc' }, ['buddy-abc']).character, 'buddy-abc');
  assert.equal(cleanSettings({ character: 'buddy-abc' }, []).character, 'gojo');
  assert.equal(cleanSettings({ character: 'ayush' }).character, 'gojo');
  assert.equal(cleanSettings({ character: 'spiderman' }).character, 'spiderman');
});

test('settings clamp the snooze and keep active hours valid', () => {
  const s = cleanSettings({ snoozeMin: 500, activeHours: { on: false, start: 'x' } });
  assert.equal(s.snoozeMin, 120);
  assert.equal(s.activeHours.on, false);
  assert.equal(s.activeHours.start, '08:00');
  assert.equal(s.hideWhenBusy, true);
});
