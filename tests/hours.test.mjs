import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHours, isActive, nextActiveTime } from '../lib/hours.js';

const every = [0, 1, 2, 3, 4, 5, 6];
const day = { on: true, start: '08:00', end: '22:00', days: every };
const night = { on: true, start: '22:00', end: '06:00', days: every };
// Monday 5 October 2026, local time
const at = (h, m = 0, d = 5) => new Date(2026, 9, d, h, m);

test('daytime window: inside and outside', () => {
  assert.equal(isActive(at(8), day), true);
  assert.equal(isActive(at(21, 59), day), true);
  assert.equal(isActive(at(22), day), false);
  assert.equal(isActive(at(2), day), false);
});

test('off means always active', () => {
  assert.equal(isActive(at(2), { ...day, on: false }), true);
  assert.equal(nextActiveTime(at(2).getTime(), { ...day, on: false }), at(2).getTime());
});

test('a reminder due at 2 a.m. waits for 8 a.m.', () => {
  assert.equal(nextActiveTime(at(2).getTime(), day), at(8).getTime());
});

test('a reminder due late at night waits for the next morning', () => {
  assert.equal(nextActiveTime(at(23, 30).getTime(), day), at(8, 0, 6).getTime());
});

test('inside the window nothing moves', () => {
  assert.equal(nextActiveTime(at(13, 7).getTime(), day), at(13, 7).getTime());
});

test('work days only: Saturday waits for Monday', () => {
  const work = { ...day, start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };
  const saturday = new Date(2026, 9, 10, 11, 0);
  assert.equal(saturday.getDay(), 6);
  assert.equal(isActive(saturday, work), false);
  assert.equal(nextActiveTime(saturday.getTime(), work), new Date(2026, 9, 12, 9, 0).getTime());
});

test('overnight window runs past midnight on the day it started', () => {
  assert.equal(isActive(at(23), night), true);
  assert.equal(isActive(at(3), night), true);
  assert.equal(isActive(at(12), night), false);
  assert.equal(nextActiveTime(at(12).getTime(), night), at(22).getTime());
  // only Mondays: early Tuesday still counts, early Monday doesn't
  const mondays = { ...night, days: [1] };
  assert.equal(isActive(at(3, 0, 6), mondays), true);
  assert.equal(isActive(at(3, 0, 5), mondays), false);
});

test('same start and end means all day', () => {
  assert.equal(isActive(at(3), { ...day, start: '07:00', end: '07:00' }), true);
});

test('cleanHours fixes bad input', () => {
  assert.deepEqual(cleanHours({ on: 1, start: '25:00', end: '7:00', days: [9, 3, 3, 1] }),
    { on: true, start: '08:00', end: '22:00', days: [1, 3] });
  assert.deepEqual(cleanHours({ days: [] }).days, every);
});
