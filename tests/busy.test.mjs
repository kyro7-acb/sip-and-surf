import test from 'node:test';
import assert from 'node:assert/strict';
import { busyReason, isCallTab } from '../lib/busy.js';

test('full screen window or page means busy', () => {
  assert.equal(busyReason({ windowState: 'fullscreen', tabs: [] }), 'fullscreen');
  assert.equal(busyReason({ windowState: 'normal', pageFullscreen: true, tabs: [] }), 'fullscreen');
  assert.equal(busyReason({ windowState: 'maximized', tabs: [] }), null);
});

test('meeting sites count when open in front, even if quiet', () => {
  assert.equal(isCallTab({ url: 'https://meet.google.com/abc-defg-hij', active: true }), true);
  assert.equal(isCallTab({ url: 'https://us02web.zoom.us/wc/123', active: false, audible: true }), true);
  assert.equal(isCallTab({ url: 'https://meet.google.com/', active: false, audible: false }), false);
});

test('chat apps only count while they play sound', () => {
  assert.equal(isCallTab({ url: 'https://discord.com/channels/1/2', active: true, audible: false }), false);
  assert.equal(isCallTab({ url: 'https://discord.com/channels/1/2', audible: true }), true);
  assert.equal(isCallTab({ url: 'https://teams.microsoft.com/v2/', audible: true }), true);
});

test('other sites never count as calls', () => {
  assert.equal(isCallTab({ url: 'https://www.youtube.com/watch?v=x', active: true, audible: true }), false);
  assert.equal(isCallTab({ url: 'https://notzoom.us.example.com/', active: true }), false);
  assert.equal(isCallTab({ url: 'not a url', active: true }), false);
  assert.equal(busyReason({ windowState: 'normal', tabs: [{ url: 'https://example.com', audible: true }] }), null);
});
