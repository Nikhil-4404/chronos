import test from 'node:test';
import assert from 'node:assert/strict';
import { createColony, stepColony, snapshotColony, serializeColony, deserializeColony, resourceBalance, elapsedTicks, housing, LIMITS, TICKS_PER_DAY, PLOTS, KINDS } from '../src/colony.js';
import { environmentAt } from '../src/environment.js';
import { createColony as createV2, stepColony as stepV2, serializeColony as serializeV2 } from '../src/colony-v2.js';

const stocks = ['food', 'wood', 'stone', 'tools'];
function balanced(w) {
  const { held, expected } = resourceBalance(w);
  for (const r of stocks) assert.ok(Math.abs(held[r] - expected[r]) < .02, `${r}: ${held[r]} != ${expected[r]}`);
}
function payForProject(w, b, type, targetKind = b.kind) {
  const base = KINDS[targetKind];
  const factor = ({ expand: .6, convert: .5, salvage: 0 })[type];
  const cost = { wood: Math.ceil(base.wood * factor), stone: Math.ceil(base.stone * factor) };
  const source = w.buildings.find(p => p.kind === 'shop');
  for (const r of ['wood', 'stone']) source.inventory[r] -= cost[r];
  b.project = { type, progress: 0, started: w.tick, lastWorked: w.tick, targetKind, cost, delivered: { ...cost } };
  for (const r of stocks) w.resources[r] = w.buildings.reduce((n, b) => n + b.inventory[r], 0);
}
let grown;
test('growth keeps developing beyond the reproduced day-90 stall with real additions and shipping', () => {
  const w = createColony(731, 0); let at60;
  for (let day = 1; day <= 120; day++) {
    stepColony(w, TICKS_PER_DAY);
    if (day === 60) at60 = { population: w.people.length, places: w.buildings.length, finished: w.totals.completed };
    if (day % 20 === 0) { balanced(w); assert.doesNotThrow(() => serializeColony(w, 0)); }
    assert.ok(w.people.length <= housing(w));
  }
  assert.ok(w.people.length > at60.population + 200);
  assert.ok(w.buildings.length > at60.places + 30);
  assert.ok(w.totals.completed > at60.finished + 30);
  assert.ok(w.totals.upgrades > 100 && w.totals.deliveries > 1000);
  assert.ok(w.learning['crossing:barge']?.samples > 0);
  assert.ok(w.people.length <= LIMITS.people && w.buildings.length <= LIMITS.buildings);
  assert.ok(serializeColony(w, 0).length < 2 * 1024 * 1024);
  grown = structuredClone(w);
});
test('a shipment reserves, physically picks up and unloads goods without manufacturing material', () => {
  const w = createColony(19, 0);
  let loaded;
  for (let tick = 0; tick < 300 && !loaded; tick++) {
    stepColony(w); balanced(w);
    loaded = w.shipments.find(s => s.loaded && s.state === 'transit' && s.mode !== 'barge' && s.projectStarted !== null);
  }
  assert.ok(loaded, 'a real loaded delivery exists');
  const id = loaded.id, destination = w.buildings.find(b => b.id === loaded.destinationId), before = destination.project.delivered[loaded.resource];
  const worker = w.people.find(p => p.id === loaded.carrierId);
  assert.equal(worker.cargo.amount, loaded.amount);
  assert.equal(destination.project.delivered[loaded.resource], before, 'in-transit goods are not yet delivered');
  worker.hunger = 99;
  stepColony(w);
  assert.equal(worker.job.shipmentId, id, 'a meal interruption retains the shipment assignment');
  for (let tick = 0; tick < 600 && w.shipments.some(s => s.id === id); tick++) { stepColony(w); balanced(w); }
  assert.ok(!w.shipments.some(s => s.id === id), 'the interrupted delivery eventually finishes');
  assert.ok(worker.experience.deliveries > 0);
  assert.ok(Object.values(w.learning).some(e => e.samples > 0 && e.value > 0 && e.meanDuration > 0));
});
test('a full shipment queue still recovers stranded loads after carriers die', () => {
  const w = createColony(731, 0); w.tick = 40;
  const source = w.buildings.find(b => b.kind === 'shop'), destination = w.buildings.find(b => b.kind === 'dock');
  source.inventory.wood -= LIMITS.shipments; w.resources.wood -= LIMITS.shipments;
  w.shipments = Array.from({ length: LIMITS.shipments }, (_, i) => ({ id: `shipment-${i + 1}`, resource: 'wood', amount: 1,
    sourceId: source.id, destinationId: destination.id, carrierId: null, mode: 'porter', context: 'local', state: 'stranded', loaded: true,
    created: 0, projectStarted: null, x: source.entrance.x, z: source.entrance.z, onRiver: false }));
  w.nextShipment = LIMITS.shipments + 1;
  for (const p of w.people) { p.role = 'Carrier'; p.workId = source.id; p.hunger = 0; }
  assert.doesNotThrow(() => serializeColony(w, 0));
  stepColony(w, 4);
  assert.ok(w.shipments.some(s => s.carrierId), 'existing cargo can be adopted without allocating a shipment slot');
  stepColony(w, 86);
  assert.ok(w.totals.deliveries > 0, 'recovered cargo is delivered');
  balanced(w); assert.doesNotThrow(() => serializeColony(w, 0));
});
test('a full city keeps adding usable space or repairing when new land is unavailable', () => {
  const w = createColony(731, 0); w.tick = 17;
  for (const b of w.buildings) {
    b.project = null; b.progress = 1; b.delivered = 1; b.completed = 0;
    if (b.kind === 'home') b.capacity = w.people.filter(p => p.homeId === b.id).length;
  }
  const prototype = w.buildings.find(b => b.kind === 'park');
  while (w.buildings.length < LIMITS.buildings) {
    const i = w.buildings.length, plot = PLOTS[i];
    w.buildings.push({ ...structuredClone(prototype), id: `place-${i + 1}`, plotId: plot.id,
      x: plot.x + .5, z: plot.z + .5, entrance: { x: plot.x, z: plot.z } });
  }
  w.economy.initial = resourceBalance(w).held;
  assert.doesNotThrow(() => serializeColony(w, 0));
  const maintenance = structuredClone(w);
  stepColony(w);
  assert.equal(w.buildings.length, LIMITS.buildings);
  assert.ok(w.buildings.some(b => b.kind === 'home' && b.project?.type === 'expand'));
  for (const b of maintenance.buildings) if (b.kind === 'home') b.level = 5;
  const damaged = maintenance.buildings.find(b => b.kind === 'park'); damaged.condition = 60;
  stepColony(maintenance);
  assert.equal(damaged.project?.type, 'repair', 'an unavailable development request cannot block maintenance');
  balanced(w); balanced(maintenance);
  assert.doesNotThrow(() => serializeColony(w, 0)); assert.doesNotThrow(() => serializeColony(maintenance, 0));
});
test('no workers means no construction progress even when stock is available', () => {
  const w = createColony(731, 0), site = w.buildings.at(-1);
  w.people = []; stepColony(w, 140);
  assert.equal(site.progress, 0); assert.equal(site.project.delivered.wood, 0);
  assert.equal(w.totals.completed, 0); balanced(w);
});
test('new growth does not depend on a single seed', () => {
  for (const seed of [11, 88]) {
    const w = createColony(seed, 0); stepColony(w, 144 * 40);
    assert.ok(w.people.length > 100, `seed ${seed} grows households`);
    assert.ok(w.totals.completed > 10 && w.totals.upgrades > 10, `seed ${seed} builds and retrofits`);
    balanced(w); assert.doesNotThrow(() => serializeColony(w, 0));
  }
});
test('schema-2 worlds validate before migration and previously paid site stock is retained', () => {
  const old = createV2(731, 0); stepV2(old, 144 * 90);
  const raw = serializeV2(old, 0), original = structuredClone(old);
  const loaded = deserializeColony(raw);
  assert.equal(loaded.schema, 3); assert.equal(loaded.tick, old.tick);
  assert.deepEqual(loaded.people.map(p => p.id), old.people.map(p => p.id));
  assert.deepEqual(loaded.people.map(p => p.name), old.people.map(p => p.name));
  for (const b of old.buildings.filter(b => b.progress < 1)) {
    const migrated = loaded.buildings.find(p => p.id === b.id);
    assert.deepEqual(migrated.project.delivered, migrated.project.cost);
  }
  assert.ok(loaded.buildings.filter(b => b.kind === 'dock').every(b => b.progress === 0), 'new piers must actually be built after migration');
  assert.deepEqual(old, original, 'migration does not mutate input state');
  const initial = loaded.totals.completed;
  stepColony(loaded, 144 * 20);
  assert.ok(loaded.totals.completed > initial + 3, 'the old stalled world resumes construction');
  balanced(loaded); assert.doesNotThrow(() => serializeColony(loaded, 0));
  const bad = JSON.parse(raw); bad.people[0].homeId = 'missing';
  assert.throws(() => deserializeColony(JSON.stringify(bad)));
});
test('retrofitting adds rooms without replacing the building identity', () => {
  const w = createColony(731, 0), b = w.buildings[0], id = b.id, capacity = b.capacity, origin = b.originalKind;
  payForProject(w, b, 'expand'); stepColony(w, 144);
  assert.equal(b.id, id); assert.equal(b.originalKind, origin);
  assert.equal(b.level, 2); assert.equal(b.capacity, capacity + 4);
  assert.ok(b.additions.includes('upper-floor')); assert.ok(w.totals.upgrades >= 1);
  balanced(w); assert.doesNotThrow(() => serializeColony(w, 0));
});
test('reuse retains the old shell and salvage transfers recoverable stock with material loss', () => {
  const reuse = createColony(731, 0), hall = reuse.buildings.find(b => b.kind === 'workshop'), oldId = hall.id;
  payForProject(reuse, hall, 'convert', 'home'); stepColony(reuse, 144);
  assert.equal(hall.id, oldId); assert.equal(hall.kind, 'home'); assert.equal(hall.originalKind, 'workshop');
  assert.ok(hall.capacity > 0 && hall.additions.includes('converted-home'));
  balanced(reuse); assert.doesNotThrow(() => serializeColony(reuse, 0));
  const salvage = createColony(731, 0), shell = salvage.buildings.find(b => b.kind === 'workshop'), material = shell.materials.wood;
  shell.state = 'Derelict'; shell.condition = 20; payForProject(salvage, shell, 'salvage');
  stepColony(salvage, 144);
  assert.ok(shell.materials.wood < material);
  assert.ok(shell.inventory.wood > 0 && salvage.economy.consumed.wood > 0);
  assert.equal(salvage.totals.salvaged, 1); balanced(salvage);
});
test('learned dispatch, in-flight cargo and state continue exactly after save/import', () => {
  const original = grown || createColony(731, 0);
  const loaded = deserializeColony(serializeColony(original, 0)), a = structuredClone(original);
  stepColony(a, 30); stepColony(loaded, 30);
  assert.deepEqual(loaded, a);
  assert.ok(Object.keys(loaded.learning).length > 0); balanced(loaded);
});
test('snapshot nesting is fully detached from model state', () => {
  const w = createColony(731, 0); stepColony(w, 70); const before = serializeColony(w, 0), s = snapshotColony(w);
  s.buildings[0].materials.wood++; s.buildings[0].inventory.food++;
  s.citizens[0].experience.deliveries++; s.citizens[0].parentIds.push('resident-999');
  if (s.citizens[0].route[1]) s.citizens[0].route[1].x = 999;
  if (s.log[0]?.entity) s.log[0].entity.id = 'changed';
  assert.equal(serializeColony(w, 0), before);
});
test('same seeded state and batched steps remain deterministic', () => {
  const a = createColony(91, 0), b = createColony(91, 0);
  stepColony(a, 600); for (let i = 0; i < 600; i++) stepColony(b);
  assert.deepEqual(a, b); assert.notDeepEqual(createColony(92, 0).people, createColony(91, 0).people);
});
test('malformed saves, bad references and false conservation ledgers are rejected', () => {
  const raw = serializeColony(createColony(731, 0), 0);
  for (const corrupt of [w => { w.people[0].homeId = 'missing'; }, w => { w.resources.food = -1; },
    w => { w.people[0].route = [{ x: 1e9, z: 0 }]; }, w => { w.people[0].partnerId = w.people[0].id; },
    w => { w.buildings[0].capacity = 99; }, w => { w.tick = '144'; }, w => { w.extra = true; },
    w => { w.buildings[0].kind = '__proto__'; }, w => { w.buildings[0].inventory.wood = 100; },
    w => { w.learning['local:cart'] = { samples: 1, meanDuration: -1, meanAmount: 1, value: 1 }; },
    w => { w.people.push(...Array(LIMITS.people + 1).fill(w.people[0])); },
    w => { w.history = [{ day: 100, population: 1, buildings: 1, food: 1 }]; }]) {
    const bad = JSON.parse(raw); corrupt(bad); assert.throws(() => deserializeColony(JSON.stringify(bad)));
  }
  assert.throws(() => deserializeColony('{bad'));
  assert.throws(() => deserializeColony(' '.repeat(2 * 1024 * 1024 + 1)));
});
test('duplicate shipment workers and impossible building conversions are rejected before a step', () => {
  const w = createColony(731, 0); stepColony(w, 55);
  const shipment = w.shipments.find(s => s.carrierId); assert.ok(shipment);
  const carrier = w.people.find(p => p.id === shipment.carrierId), other = w.people.find(p => p.id !== carrier.id);
  const duplicated = structuredClone(w); duplicated.people.find(p => p.id === other.id).job = { ...carrier.job };
  assert.throws(() => deserializeColony(JSON.stringify(duplicated)), /assigned|disagree/);
  const impossible = createColony(731, 0), old = impossible.buildings.find(b => b.kind === 'shop');
  payForProject(impossible, old, 'convert', 'dock');
  assert.throws(() => deserializeColony(JSON.stringify(impossible)), /reuse/);
});
function loadedFixture(w, carrier, id, source, destination, mode = 'cart', loaded = true, amount = 3) {
  carrier.role = 'Carrier'; carrier.workId = source.id; carrier.mode = mode;
  carrier.job = { kind: 'haul', shipmentId: `shipment-${id}`, stage: loaded ? 'deliver' : 'load', elapsed: 0 };
  carrier.cargo = loaded ? { resource: 'wood', amount, sourceId: source.id, destinationId: destination.id } : null;
  if (loaded) source.inventory.wood -= amount;
  w.shipments.push({ id: `shipment-${id}`, resource: 'wood', amount, sourceId: source.id, destinationId: destination.id, carrierId: carrier.id,
    mode, context: 'crossing', state: loaded ? 'transit' : 'loading', loaded, created: w.tick, projectStarted: null, x: carrier.x, z: carrier.z, onRiver: false });
  w.nextShipment = id + 1;
  w.resources.wood = w.buildings.reduce((n, b) => n + b.inventory.wood, 0);
}
test('a loaded barge stops for river ice and resumes after thaw without becoming an overloaded cart', () => {
  const w = createColony(731, 0); w.tick = 160 * 144 + 40;
  const [source, destination] = w.buildings.filter(b => b.kind === 'dock'), p = w.people[0];
  p.x = 5; p.z = 4; p.hunger = 0; p.destinationId = destination.id;
  p.route = [{ x: 5, z: 4 }, { x: 5, z: 6 }, { ...destination.entrance }]; p.routeIndex = 0;
  loadedFixture(w, p, 1, source, destination, 'barge', true, 30);
  p.job.stage = 'river'; const s = w.shipments[0]; s.x = 5; s.z = 4; s.onRiver = true;
  assert.equal(environmentAt(w.tick, w.seed).river.frozen, true);
  assert.doesNotThrow(() => serializeColony(w, 0)); stepColony(w, 4);
  assert.deepEqual({ x: p.x, z: p.z, mode: p.mode, amount: p.cargo.amount }, { x: 5, z: 4, mode: 'barge', amount: 30 });
  assert.equal(p.job.stage, 'river'); assert.equal(s.onRiver, true);
  w.tick = 232 * 144 + 40; assert.equal(environmentAt(w.tick, w.seed).river.frozen, false);
  stepColony(w, 2); assert.ok(p.z > 4); assert.equal(s.mode, 'barge'); assert.equal(s.amount, 30);
  balanced(w); assert.doesNotThrow(() => serializeColony(w, 0));
});
test('barge loading waits for thaw before taking stock and launching', () => {
  const w = createColony(731, 0); w.tick = 160 * 144 + 40;
  const [source, destination] = w.buildings.filter(b => b.kind === 'dock'), p = w.people[0];
  p.x = source.entrance.x; p.z = source.entrance.z; p.hunger = 0; p.destinationId = source.id;
  p.route = [{ ...source.entrance }]; p.routeIndex = 0;
  loadedFixture(w, p, 1, source, destination, 'barge', false, 30);
  const s = w.shipments[0], stock = source.inventory.wood;
  stepColony(w, 6); assert.equal(s.loaded, false); assert.equal(source.inventory.wood, stock);
  assert.equal(p.job.stage, 'load'); assert.equal(p.job.elapsed, 0);
  w.tick = 232 * 144 + 40; stepColony(w, 5);
  assert.equal(s.loaded, true); assert.equal(s.mode, 'barge'); assert.equal(s.amount, 30); assert.equal(p.job.stage, 'river');
  balanced(w); assert.doesNotThrow(() => serializeColony(w, 0));
});
test('stranded river cargo stays put until recovery and resumes a legal barge route after thaw', () => {
  const w = createColony(731, 0); w.tick = 160 * 144 + 40;
  const [source, destination] = w.buildings.filter(b => b.kind === 'dock'), p = w.people[0];
  loadedFixture(w, p, 1, source, destination, 'barge', true, 30);
  const s = w.shipments[0]; Object.assign(s, { carrierId: null, state: 'stranded', x: 5, z: 4, onRiver: true });
  Object.assign(p, { job: null, cargo: null, partnerId: null, hunger: 0, x: 4, z: 4, route: [], routeIndex: 0 }); w.people = [p];
  for (const b of w.buildings) for (const r of stocks) b.inventory[r] = 0;
  for (const r of stocks) w.resources[r] = 0;
  w.economy.initial = resourceBalance(w).held;
  assert.doesNotThrow(() => serializeColony(w, 0)); stepColony(w, 4);
  assert.equal(s.carrierId, null, 'a frozen barge is not dispatched as a land load');
  w.tick = 232 * 144 + 40;
  for (let i = 0; i < 80 && p.job?.stage !== 'river'; i++) {
    stepColony(w);
    if (p.job?.stage === 'recover') assert.deepEqual({ x: s.x, z: s.z, onRiver: s.onRiver }, { x: 5, z: 4, onRiver: true });
  }
  assert.equal(p.job?.stage, 'river'); assert.equal(s.mode, 'barge'); assert.equal(p.cargo.amount, 30);
  assert.deepEqual(p.route.at(-1), destination.entrance);
  assert.ok(p.route.slice(0, -1).every(point => point.x === 5), 'recovery discards its approach route and follows the channel');
  for (let i = 0; i < 80 && w.shipments.includes(s); i++) stepColony(w);
  assert.ok(!w.shipments.includes(s)); assert.equal(destination.inventory.wood, 30);
  balanced(w); assert.doesNotThrow(() => serializeColony(w, 0));
});
test('a thaw reroutes an underway loaded cart via a bridge without discarding cargo', () => {
  const w = createColony(731, 0); let transition;
  for (let tick = 1; tick < 385 * 144; tick++) if (environmentAt(tick - 1, w.seed).river.loadSafe === 'cart' && environmentAt(tick, w.seed).river.loadSafe !== 'cart') { transition = tick; break; }
  assert.ok(transition); w.tick = transition - 1;
  const [source, destination] = w.buildings.filter(b => b.kind === 'dock'), p = w.people[0];
  p.x = 4.25; p.z = 4; p.hunger = 0; p.destinationId = destination.id;
  p.route = [{ x: 4, z: 4 }, { x: 6, z: 4 }, { x: 6, z: 6 }]; p.routeIndex = 0;
  loadedFixture(w, p, 1, source, destination);
  assert.doesNotThrow(() => serializeColony(w, 0)); stepColony(w);
  assert.ok(p.x <= 4.25, 'the cart retreats to shore rather than continuing on thawed ice');
  assert.equal(p.cargo.amount, 3);
  for (let i = 1; i < p.route.length; i++) {
    const a = p.route[i - 1], b = p.route[i];
    if ((a.x <= 4 && b.x >= 6) || (a.x >= 6 && b.x <= 4)) assert.ok(b.z === 2 || b.z === 6);
  }
  balanced(w);
});
test('a single pier berth queues competing barge loading work', () => {
  const w = createColony(731, 0); w.tick = 40 * 144 + 40;
  const [source, destination] = w.buildings.filter(b => b.kind === 'dock');
  for (let i = 0; i < 2; i++) {
    const p = w.people[i]; p.x = source.entrance.x; p.z = source.entrance.z; p.hunger = 0;
    p.destinationId = source.id; p.route = [{ ...source.entrance }]; p.routeIndex = 0;
    loadedFixture(w, p, i + 1, source, destination, 'barge', false);
  }
  assert.equal(snapshotColony(w).docks.find(d => d.id === source.id).queue, 1);
  stepColony(w, 5);
  assert.equal(w.shipments.find(s => s.id === 'shipment-1').loaded, true);
  assert.equal(w.shipments.find(s => s.id === 'shipment-2').loaded, false);
  balanced(w); assert.doesNotThrow(() => serializeColony(w, 0));
});
test('empty settlements can welcome newcomers while food and completed homes remain', () => {
  const w = createColony(731, 0); w.people = [];
  stepColony(w, TICKS_PER_DAY); assert.ok(w.people.length >= 2);
  balanced(w); assert.doesNotThrow(() => serializeColony(w, 0));
});
test('repartnering never exceeds either parent lifetime child limit or reproductive age', () => {
  for (const [childrenA, childrenB, ageA, ageB, expectedBirths] of [[0, 4, 40, 40, 0], [4, 0, 40, 40, 0], [3, 4, 40, 40, 0], [3, 3, 40, 40, 1], [0, 0, 40, 100, 0], [0, 0, 99, 40, 0]]) {
    const w = createColony(731, 0), [a, b] = w.people;
    w.people = [a, b]; w.tick = 3 * 144 - 1;
    a.partnerId = b.id; b.partnerId = a.id; b.homeId = a.homeId;
    a.children = childrenA; b.children = childrenB; a.age = ageA; b.age = ageB;
    stepColony(w);
    assert.equal(w.totals.births, expectedBirths, `parents ${childrenA}/${childrenB}, age ${ageA}/${ageB}`);
    assert.ok(w.people.every(p => p.children <= 4));
    assert.doesNotThrow(() => serializeColony(w, 0));
    if (expectedBirths) { stepColony(w, 3 * 144); assert.equal(a.children, 4); assert.equal(b.children, 4); assert.ok(w.people.every(p => p.children <= 4)); assert.doesNotThrow(() => serializeColony(w, 0)); }
  }
});
test('elapsed recovery checkpoints retain remaining time without reversing the clock', () => {
  assert.equal(elapsedTicks(1000, 4000), 6); assert.equal(elapsedTicks(4000, 1000), 0); assert.equal(elapsedTicks(0, Infinity), 0);
  assert.equal(elapsedTicks(0, 8 * 86400000), 7 * 86400 * 2);
  const original = createColony(731, 0), now = 100000; stepColony(original, 120);
  const checkpoint = deserializeColony(serializeColony(original, now - 80 / 2 * 1000));
  stepColony(checkpoint, elapsedTicks(checkpoint.savedAt, now)); stepColony(original, 80); checkpoint.savedAt = original.savedAt;
  assert.deepEqual(checkpoint, original);
});
test('expanded plots preserve unique developable land outside the river channel', () => {
  assert.equal(PLOTS.length, LIMITS.buildings);
  assert.equal(new Set(PLOTS.map(p => `${p.x},${p.z}`)).size, PLOTS.length);
  assert.ok(PLOTS.every(p => p.x !== 4 && p.x !== 5));
});
