import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, MAX_TICK, createTimeline, getState, seek, advance, fork, serializeTimeline, deserializeTimeline } from '../src/simulation.js';

test('a seeded day replays exactly, with moving residents and bounded metrics', () => {
  const first = createTimeline(731);
  const second = createTimeline(731);
  const morning = getState(first);
  const commute = getState(first, 'origin', 15);
  assert.equal(morning.citizens.length, 48);
  assert.ok(commute.citizens.some((person, i) => person.x !== morning.citizens[i].x || person.z !== morning.citizens[i].z));
  assert.deepEqual(getState(first, 'origin', 350), getState(second, 'origin', 350));
  assert.notDeepEqual(morning.citizens, getState(createTimeline(45)).citizens);
  for (const tick of [0, 30, 240, 540, MAX_TICK]) {
    const state = getState(first, 'origin', tick);
    for (const metric of ['wellbeing', 'power', 'supply']) assert.ok(state.metrics[metric] >= 0 && state.metrics[metric] <= 100);
    for (const person of state.citizens) {
      assert.ok(person.x >= 0 && person.x <= 10 && person.z >= 0 && person.z <= 8);
      assert.ok(WORLD.buildings.some((building) => building.id === person.destinationId));
    }
  }
});

test('branching preserves the original, changes no past positions, and makes bridge detours measurable', () => {
  const world = createTimeline();
  seek(world, 12);
  const before = getState(world);
  const originalFuture = getState(world, 'origin', 60);
  const branch = fork(world, { type: 'bridge', enabled: true });
  const altered = getState(world);
  assert.equal(branch.parentId, 'origin');
  assert.equal(branch.forkTick, 12);
  assert.equal(altered.effects.bridgeClosed, true);
  assert.deepEqual(altered.citizens.map(({ x, z }) => [x, z]), before.citizens.map(({ x, z }) => [x, z]));
  assert.ok(altered.metrics.travel > before.metrics.travel);
  assert.deepEqual(getState(world, branch.id, 11), getState(world, 'origin', 11));
  assert.deepEqual(getState(world, 'origin', 60), originalFuture);
  const later = getState(world, branch.id, 60);
  assert.ok(later.metrics.supply < originalFuture.metrics.supply);
  assert.ok(later.citizens.every((person) => Number.isFinite(person.x) && Number.isFinite(person.z)));
});

test('a traveler on a newly closed crossing can reach the bank and destination', () => {
  const world = createTimeline();
  let crossing;
  for (let tick = 1; tick < 80 && !crossing; tick++) {
    const person = getState(world, 'origin', tick).citizens.find((p) => p.x > 4 && p.x < 6 && p.z === 2);
    if (person) crossing = { tick, id: person.id, x: person.x };
  }
  assert.ok(crossing, 'fixture day should contain a northern bridge traveler');
  seek(world, crossing.tick);
  fork(world, { type: 'bridge', enabled: true });
  const atClosure = getState(world).citizens.find((p) => p.id === crossing.id);
  assert.equal(atClosure.x, crossing.x);
  const later = getState(world, world.activeId, crossing.tick + 80).citizens.find((p) => p.id === crossing.id);
  assert.equal(later.status, 'At work');
  const destination = WORLD.buildings.find((b) => b.id === later.destinationId);
  assert.equal(later.x, destination.entrance.x);
  assert.equal(later.z, destination.entrance.z);
});

test('power loss has immediate coverage impact and gradual supply consequences, then recovers', () => {
  const world = createTimeline();
  seek(world, 70);
  const before = getState(world);
  fork(world, { type: 'power', enabled: true });
  assert.equal(getState(world).metrics.power, 50);
  assert.equal(getState(world).metrics.supply, before.metrics.supply);
  const outage = getState(world, world.activeId, 180);
  assert.ok(outage.metrics.supply < before.metrics.supply);
  assert.ok(outage.metrics.wellbeing < getState(world, 'origin', 180).metrics.wellbeing);
  assert.ok(outage.citizens.some((p) => p.status === 'Work interrupted by outage'));
  seek(world, 180);
  fork(world, { type: 'power', enabled: false });
  const restored = getState(world);
  assert.equal(restored.metrics.power, 100);
  assert.equal(restored.metrics.supply, outage.metrics.supply);
  assert.ok(getState(world, world.activeId, 300).metrics.supply > outage.metrics.supply);
});

test('healthcare and gardens cost capital and produce real health and evening routine outcomes', () => {
  const world = createTimeline();
  fork(world, { type: 'hospital', enabled: true });
  assert.equal(getState(world).metrics.treasury, 200000);
  seek(world, 10);
  fork(world, { type: 'park', enabled: true });
  const enhanced = getState(world, world.activeId, 645);
  const baseline = getState(world, 'origin', 645);
  assert.ok(enhanced.metrics.wellbeing > baseline.metrics.wellbeing);
  assert.ok(enhanced.citizens.some((p) => p.status === 'Resting in the gardens'));
  assert.ok(enhanced.metrics.treasury < baseline.metrics.treasury);
  seek(world, 645);
  fork(world, { type: 'hospital', enabled: false });
  const paused = getState(world).metrics.treasury;
  fork(world, { type: 'hospital', enabled: true });
  assert.equal(getState(world).metrics.treasury, paused, 're-enabling does not charge for the same building twice');
});

test('rewinding before an intervention creates a clean alternative without inheriting future events', () => {
  const world = createTimeline();
  seek(world, 100);
  const first = fork(world, { type: 'bridge', enabled: true });
  seek(world, 50);
  const second = fork(world, { type: 'power', enabled: true });
  assert.equal(second.parentId, first.id);
  assert.deepEqual(second.events, [{ tick: 50, type: 'power', enabled: true }]);
  assert.equal(getState(world, second.id, 150).effects.bridgeClosed, false);
  assert.equal(getState(world, first.id, 150).effects.bridgeClosed, true);
  assert.doesNotThrow(() => deserializeTimeline(serializeTimeline(world)));
});

test('public snapshots and all nested routes are immutable and cannot poison replay caches', () => {
  const world = createTimeline();
  const state = getState(world, 'origin', 15);
  const expected = JSON.stringify(state);
  assert.throws(() => { state.metrics.power = 0; }, TypeError);
  assert.throws(() => { state.citizens[0].x = 100; }, TypeError);
  assert.throws(() => { state.citizens[0].route.push({ x: 8, z: 8 }); }, TypeError);
  assert.throws(() => { state.log[0].text = 'altered'; }, TypeError);
  assert.equal(JSON.stringify(getState(world, 'origin', 15)), expected);
});

test('seek and advance clamp valid whole-minute input and reject invalid time', () => {
  const world = createTimeline();
  seek(world, -50);
  assert.equal(world.cursor, 0);
  advance(world, MAX_TICK + 1);
  assert.equal(world.cursor, MAX_TICK);
  advance(world, -999);
  assert.equal(world.cursor, 0);
  for (const invalid of [NaN, Infinity, 0.5, '5', null]) {
    assert.throws(() => seek(world, invalid));
    assert.throws(() => getState(world, 'origin', invalid));
  }
  assert.throws(() => getState(world, 'missing'));
  assert.throws(() => createTimeline(-1));
});

test('export/import preserves every timeline and exact replay outcomes', () => {
  const world = createTimeline(4294967295);
  seek(world, 27);
  fork(world, { type: 'bridge', enabled: true });
  seek(world, 120);
  fork(world, { type: 'hospital', enabled: true });
  seek(world, 320);
  const restored = deserializeTimeline(serializeTimeline(world));
  assert.deepEqual(restored, world);
  assert.deepEqual(getState(restored), getState(world));
  assert.notEqual(restored, world);
});

test('malformed and hostile save data is rejected without modifying an existing world', () => {
  const world = createTimeline();
  const valid = serializeTimeline(world);
  const invalid = [null, '', '{', '{}', '[]', 'x'.repeat(2 * 1024 * 1024 + 1)];
  const changes = [
    (v) => { v.schema = 2; }, (v) => { v.seed = -1; }, (v) => { v.cursor = 900; },
    (v) => { v.activeId = 'missing'; }, (v) => { v.branches = []; },
    (v) => { v.branches[0].events.push({ tick: 0, type: 'power', enabled: true }); },
    (v) => { v.branches[0].unknown = 1; }, (v) => { v.branches[0].name = '\u0000'; },
    (v) => { v.extra = '__proto__'; },
  ];
  for (const change of changes) {
    const value = JSON.parse(valid);
    change(value);
    invalid.push(JSON.stringify(value));
  }
  invalid.push(valid.replace('"schema": 1', '"schema": 1, "__proto__": {"polluted": true}'));
  for (const value of invalid) assert.throws(() => deserializeTimeline(value));
  assert.equal(serializeTimeline(world), valid);
  assert.equal({}.polluted, undefined);
});

test('import validates parent history, event order, IDs and interventions', () => {
  const world = createTimeline();
  seek(world, 20);
  fork(world, { type: 'bridge', enabled: true });
  seek(world, 40);
  fork(world, { type: 'power', enabled: true });
  const valid = serializeTimeline(world);
  const corruptions = [
    (v) => { v.branches[1].parentId = 'missing'; },
    (v) => { v.branches[2].id = v.branches[1].id; },
    (v) => { v.branches[2].events[0].enabled = false; },
    (v) => { v.branches[2].events.reverse(); },
    (v) => { v.branches[2].events[1].type = 'constructor'; },
    (v) => { v.branches[2].events[1].enabled = 1; },
    (v) => { v.branches[2].forkTick = 50; },
    (v) => { v.branches[2].events[1].tick = 99; },
  ];
  for (const change of corruptions) {
    const value = JSON.parse(valid);
    change(value);
    assert.throws(() => deserializeTimeline(JSON.stringify(value)));
  }
});

test('eight-timeline limit and no-op interventions fail explicitly', () => {
  const world = createTimeline();
  assert.throws(() => fork(world, { type: 'bridge', enabled: false }), /already active/);
  assert.throws(() => fork(world, { type: 'unknown', enabled: true }));
  for (let i = 0; i < 7; i++) fork(world, { type: 'bridge', enabled: i % 2 === 0 });
  assert.equal(world.branches.length, 8);
  assert.throws(() => fork(world, { type: 'power', enabled: true }), /eight timelines/);
  assert.doesNotThrow(() => deserializeTimeline(serializeTimeline(world)));
});
