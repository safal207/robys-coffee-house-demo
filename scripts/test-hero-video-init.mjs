import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const runtime = readFileSync(new URL('../qa.js', import.meta.url), 'utf8');
const boundary = runtime.indexOf('\nfunction applyImmediateA11yFixes()');
assert.ok(boundary > 0, 'Cannot isolate the real hero initialization runtime');
const heroRuntime = runtime.slice(0, boundary);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hero = html.match(/<video\b[^>]*class="hero-video"[^>]*>[\s\S]*?<\/video>/)?.[0];
const approvedSource = hero?.match(/<source\b[^>]*\bsrc="([^"]+)"/)?.[1];
assert.ok(approvedSource, 'The homepage must declare the approved video source');

function initialize({ src = approvedSource, media = null, error = null } = {}) {
  const attributes = new Map();
  if (src !== null) attributes.set('src', src);
  if (media !== null) attributes.set('media', media);
  const calls = { sourceWrites: 0, loads: 0, plays: 0 };
  const timers = [];
  const source = {
    getAttribute: name => attributes.get(name) ?? null,
    hasAttribute: name => attributes.has(name),
    removeAttribute: name => attributes.delete(name),
    set src(value) { calls.sourceWrites++; attributes.set('src', value); }
  };
  const video = Object.assign(new EventTarget(), {
    currentTime: 2.5,
    ended: false,
    error,
    querySelector: selector => selector === 'source' ? source : null,
    load() { calls.loads++; this.currentTime = 0; this.error = null; },
    play() { calls.plays++; }
  });
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: selector => selector === '.hero-video' ? video : null
  });
  const window = Object.assign(new EventTarget(), {
    setTimeout(callback) { timers.push(callback); return timers.length; }
  });
  vm.runInNewContext(heroRuntime + '\nenableHeroVideo();', { document, window });
  return {
    calls, video, source, document, window, timers,
    flushTimers() { while (timers.length) timers.shift()(); }
  };
}

for (const fixture of [
  { name: 'preserves a parser-started approved video without resetting its timeline', loads: 0, writes: 0 },
  { name: 'replaces a different source and reloads once', src: 'src/old.mp4', loads: 1, writes: 1 },
  { name: 'removes a media restriction and refreshes source selection once', media: '(min-width: 900px)', loads: 1, writes: 0 },
  { name: 'changing source and media together still reloads only once', src: 'src/old.mp4', media: 'all', loads: 1, writes: 1 },
  { name: 'initializes a missing source and loads it once', src: null, loads: 1, writes: 1 },
  { name: 'retains one initial recovery for an already failed approved video', error: { code: 2 }, loads: 1, writes: 0 }
]) {
  test(fixture.name, () => {
    const h = initialize(fixture);
    assert.equal(h.calls.loads, fixture.loads);
    assert.equal(h.calls.sourceWrites, fixture.writes);
    assert.equal(h.video.currentTime, fixture.loads ? 0 : 2.5);
    assert.equal(h.video.error, null);
    assert.equal(h.source.getAttribute('src'), approvedSource);
    assert.equal(h.source.hasAttribute('media'), false);
    assert.equal(h.calls.plays, 1, 'Every initialization must explicitly request playback');
    assert.ok(h.video.autoplay && h.video.muted && h.video.defaultMuted && h.video.loop && h.video.playsInline);
  });
}

test('retains playback recovery without restarting media loading', () => {
  const h = initialize();
  const send = (target, type) => target.dispatchEvent(new Event(type));
  for (const type of ['loadeddata', 'canplay']) {
    const before = h.calls.plays;
    send(h.video, type);
    assert.equal(h.calls.plays, before + 1, type + ' must retry playback');
  }
  let before = h.calls.plays;
  send(h.window, 'pointerdown');
  assert.equal(h.calls.plays, before + 1, 'First interaction must retry playback');
  send(h.window, 'pointerdown');
  assert.equal(h.calls.plays, before + 1, 'First-interaction retry must remain one-shot');

  before = h.calls.plays;
  send(h.video, 'pause');
  assert.equal(h.calls.plays, before, 'Unexpected pause recovery must remain deferred');
  assert.equal(h.timers.length, 1);
  h.flushTimers();
  assert.equal(h.calls.plays, before + 1);

  h.document.hidden = true;
  before = h.calls.plays;
  send(h.video, 'canplay');
  send(h.video, 'pause');
  send(h.document, 'visibilitychange');
  assert.equal(h.calls.plays, before, 'A hidden page must not request playback');
  assert.equal(h.timers.length, 0, 'A hidden page must not schedule pause recovery');
  h.document.hidden = false;
  send(h.document, 'visibilitychange');
  assert.equal(h.calls.plays, before + 1, 'Returning to the page must retry playback');

  h.video.ended = true;
  before = h.calls.plays;
  send(h.video, 'pause');
  assert.equal(h.timers.length, 0, 'Ended media must not schedule unexpected-pause recovery');
  assert.equal(h.calls.plays, before);
  assert.equal(h.calls.loads, 0, 'Playback recovery must not reset a healthy media request');
  assert.equal(h.calls.sourceWrites, 0);
  assert.equal(h.video.currentTime, 2.5);
});
