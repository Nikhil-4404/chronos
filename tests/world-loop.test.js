import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorld } from '../src/world-loop.js';
import { createColony, deserializeColony, stepColony, elapsedTicks } from '../src/colony.js';

function clockHarness(world, initialTime = 100000) {
  let time = initialTime, next = null;
  const packets = [];
  const runtime = runWorld(world, p => packets.push(p), {
    monotonic: () => time, wall: () => time, timeOrigin: 0,
    schedule: callback => { next = callback; return 1; }, cancel: () => { next = null; },
  });
  return { packets, runtime, advance(ms) { time += ms; const callback = next; next = null; callback?.(); }, time: () => time };
}
test('one authoritative timeline emits tick changes, not repeated forecasts for UI refreshes', () => {
  const w = createColony(731, 100000), h = clockHarness(w);
  assert.equal(h.packets.filter(p => p.type === 'frame').length, 1);
  h.advance(250); assert.equal(w.tick, 0);
  h.advance(250); assert.equal(w.tick, 1);
  const frames = h.packets.filter(p => p.type === 'frame');
  assert.equal(frames.length, 2); assert.equal(frames[1].sampledAt, 100500);
  assert.equal(frames[1].predicted.tick, frames[1].state.tick + 1);
  h.runtime.dispose(); h.advance(1000); assert.equal(w.tick, 1);
});
test('checkpoint preserves fractional elapsed life and resumes the same deterministic state', () => {
  const w = createColony(731, 100000), h = clockHarness(w);
  h.advance(750);
  const loaded = deserializeColony(h.runtime.checkpoint());
  assert.equal(loaded.tick, 1); assert.equal(loaded.savedAt, 100500);
  assert.equal(elapsedTicks(loaded.savedAt, h.time() + 250), 1);
  stepColony(loaded); h.advance(250); loaded.savedAt = w.savedAt;
  assert.deepEqual(loaded, w);
  h.runtime.dispose();
});
test('restarting the real loop retains the checkpoint sub-tick remainder', () => {
  const w = createColony(731, 100000), live = clockHarness(w);
  live.advance(750);
  const loaded = deserializeColony(live.runtime.checkpoint()), resumed = clockHarness(loaded, 100750);
  live.advance(250); resumed.advance(250);
  assert.equal(loaded.tick, 2); assert.equal(w.tick, loaded.tick);
  loaded.savedAt = w.savedAt; assert.deepEqual(loaded, w);
  live.runtime.dispose(); resumed.runtime.dispose();
});
