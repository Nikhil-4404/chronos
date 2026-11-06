import test from 'node:test';
import assert from 'node:assert/strict';
import { createColony, stepColony, snapshotColony, serializeColony, deserializeColony, elapsedTicks, housing, LIMITS, TICKS_PER_DAY, PLOTS } from '../src/colony.js';

test('the world grows through actual labor, new homes, migrants and births over many days', () => {
  const w = createColony(731, 0);
  const start = { people: w.people.length, buildings: w.buildings.length };
  for (let day = 0; day < 45; day++) {
    stepColony(w, TICKS_PER_DAY);
    assert.doesNotThrow(() => serializeColony(w, 0));
    assert.ok(w.people.length <= housing(w));
    assert.ok(Object.values(w.resources).every(n => Number.isFinite(n) && n >= 0));
  }
  assert.ok(w.people.length > start.people);
  assert.ok(w.buildings.length > start.buildings);
  assert.ok(w.totals.completed >= 10);
  assert.ok(w.totals.births > 0 && w.totals.arrivals > 0);
  assert.ok(new Set(w.buildings.map(b => b.variant)).size >= 4);
  assert.ok(new Set(w.people.map(p => p.role)).size >= 5);
  assert.ok(w.tick > 720, 'there is no original end-of-day limit');
});
test('reserved materials and delivery gate construction; no residents means no progress', () => {
  const w = createColony(731, 0), b = w.buildings.at(-1);
  const start = b.progress;
  w.people = [];
  stepColony(w, 140);
  assert.equal(b.progress, start);
  assert.equal(b.delivered, 0);
  assert.equal(w.totals.completed, 0);
});
test('identical seeds and batched steps yield identical worlds; snapshots are separate', () => {
  const a = createColony(19, 0), b = createColony(19, 0);
  stepColony(a, 500); for (let i = 0; i < 500; i++) stepColony(b);
  assert.deepEqual(a, b);
  const s = snapshotColony(a); s.citizens[0].hunger = -12; s.buildings[0].progress = .5;
  assert.notEqual(a.people[0].hunger, -12); assert.equal(a.buildings[0].progress, 1);
  assert.notDeepEqual(createColony(20, 0).people, createColony(19, 0).people);
});
test('save/import continues the same causal world with bounded records', () => {
  const w = createColony(731, 0); stepColony(w, 15000);
  const loaded = deserializeColony(serializeColony(w, 0));
  stepColony(w, 100); stepColony(loaded, 100);
  assert.deepEqual(loaded, w);
  assert.ok(w.journal.length <= LIMITS.journal && w.history.length <= LIMITS.history);
  assert.ok(w.people.length <= LIMITS.people && w.buildings.length <= LIMITS.buildings);
});
test('import rejects malformed references, nonfinite numbers, excess arrays, and injected fields', () => {
  const raw = serializeColony(createColony(731, 0), 0);
  for (const corrupt of [w => { w.people[0].homeId = 'missing'; }, w => { w.resources.food = -1; },
    w => { w.people[0].route = [{ x: 1e9, z: 0 }]; }, w => { w.people[0].partnerId = w.people[0].id; },
    w => { w.buildings[0].capacity = 99; }, w => { w.tick = '144'; },
    w => { w.people.push(...Array(513).fill(w.people[0])); }, w => { w.extra = true; },
    w => { w.buildings[0].kind = '__proto__'; }, w => { w.history = [{ day: 100, population: 1, buildings: 1, food: 1 }]; }]) {
    const w = JSON.parse(raw); corrupt(w); assert.throws(() => deserializeColony(JSON.stringify(w)));
  }
  assert.throws(() => deserializeColony('{bad'));
  assert.throws(() => deserializeColony(' '.repeat(2 * 1024 * 1024 + 1)));
});
test('unattended catch-up respects the clock and a documented seven-day budget', () => {
  assert.equal(elapsedTicks(1000, 4000), 6);
  assert.equal(elapsedTicks(4000, 1000), 0);
  assert.equal(elapsedTicks(0, Infinity), 0);
  assert.equal(elapsedTicks(0, 8 * 86400000), 7 * 86400 * 2);
  const original = createColony(731, 0), now = 100000;
  stepColony(original, 120);
  const remaining = 80, checkpoint = deserializeColony(serializeColony(original, now - remaining / 2 * 1000));
  stepColony(checkpoint, elapsedTicks(checkpoint.savedAt, now));
  stepColony(original, remaining); checkpoint.savedAt = original.savedAt;
  assert.deepEqual(checkpoint, original, 'a partial recovery checkpoint keeps the same unfinished life');
});
test('planned expansion has unique plots clear of the river', () => {
  assert.equal(PLOTS.length, LIMITS.buildings);
  assert.equal(new Set(PLOTS.map(p => `${p.x},${p.z}`)).size, PLOTS.length);
  assert.ok(PLOTS.every(p => p.x !== 4 && p.x !== 5));
});
test('an empty settlement can welcome new households when food and homes remain', () => {
  const w = createColony(731, 0); w.people = [];
  stepColony(w, TICKS_PER_DAY);
  assert.ok(w.people.length >= 2);
  assert.doesNotThrow(() => serializeColony(w, 0));
});
test('medical recovery needs a healer present at the care house', () => {
  const base = createColony(731, 0); base.tick = 60;
  const care = base.buildings.find(b => b.kind === 'park'); care.kind = 'hospital';
  const [patient, healer] = base.people;
  for (const p of [patient, healer]) { p.x = care.entrance.x; p.z = care.entrance.z; p.destinationId = care.id; p.route = [{ ...care.entrance }]; p.routeIndex = 0; }
  patient.health = 40; patient.hunger = 0; healer.role = 'Healer'; healer.workId = care.id; healer.task = 'Caring for neighbors';
  const unstaffed = structuredClone(base); unstaffed.people[1].role = 'Builder'; unstaffed.people[1].task = 'Resting at home';
  stepColony(base); stepColony(unstaffed);
  assert.ok(base.people[0].health > unstaffed.people[0].health + .7);
});
