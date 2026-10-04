// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestStreak, currentStreak, lastDays, summarize, toCsv } from '../lib/insights.js';
import { dayKey, formatMl, formatMs } from '../lib/state.js';

const today = new Date(2026, 8, 30); // Sep 30, 2026
const key = (offset) => dayKey(new Date(2026, 8, 30 + offset));
const day = (ml, extra = {}) => ({ ml, targetMl: 2000, sips: ml / 250, snoozes: 0, autoSnoozes: 0, reminders: 0, log: [], ...extra });

test('current streak ignores an unfinished today', () => {
  const h = { [key(-2)]: day(2000), [key(-1)]: day(2250), [key(0)]: day(500) };
  assert.equal(currentStreak(h, today), 2);
});

test('current streak counts today once the target is met', () => {
  const h = { [key(-1)]: day(2000), [key(0)]: day(2000) };
  assert.equal(currentStreak(h, today), 2);
});

test('a missed day breaks the streak', () => {
  const h = { [key(-3)]: day(2000), [key(-2)]: day(1000), [key(-1)]: day(2000) };
  assert.equal(currentStreak(h, today), 1);
  assert.equal(bestStreak(h), 1);
});

test('best streak spans month boundaries', () => {
  const h = { '2026-08-30': day(2000), '2026-08-31': day(2000), '2026-09-01': day(2000), '2026-09-03': day(2000) };
  assert.equal(bestStreak(h), 3);
});

test('summary uses finished days for average and hit rate', () => {
  const h = { [key(-2)]: day(2000), [key(-1)]: day(1000), [key(0)]: day(250) };
  const days = lastDays(h, 7, 2000, today);
  const s = summarize(h, days, key(0));
  assert.equal(s.completedDays, 2);
  assert.equal(s.avgMl, 1500);
  assert.equal(s.metDays, 1);
  assert.equal(s.hitBasis, 2);
  assert.equal(s.trackedDays, 3);
});

test('response rate counts reminder sips, not manual logs', () => {
  const log = [{ t: 0, ml: 250, kind: 'sip' }, { t: 0, ml: 250, kind: 'manual' }];
  const h = { [key(0)]: day(500, { reminders: 4, log }) };
  const s = summarize(h, lastDays(h, 1, 2000, today), key(0));
  assert.equal(s.responseRate, 0.25);
});

test('csv has a header and one row per day', () => {
  const csv = toCsv({ [key(0)]: day(2000) });
  assert.equal(csv.trim().split('\n').length, 2);
  assert.match(csv, /2026-09-30,2000,2000,yes/);
});

test('formatting helpers', () => {
  assert.equal(formatMl(250), '250 ml');
  assert.equal(formatMl(1500), '1.5 L');
  assert.equal(formatMl(10000), '10 L');
  assert.equal(formatMs(90_000), '01:30');
  assert.equal(formatMs(3_723_000), '1:02:03');
});
