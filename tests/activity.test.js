import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleNpcPose, npcDisplayOffset, blocksStreetView } from '../src/activity.js';
import { createTimeline, getState } from '../src/simulation.js';

test('colony occupations, meals, socializing and journeys choose their actual activity poses', () => {
  const p = { id: 'resident-18', x: 2, z: 4 };
  for (const status of ['Building', 'Growing food', 'Gathering timber', 'Quarrying stone', 'Crafting tools', 'Hauling materials', 'Caring for neighbors']) {
    assert.equal(sampleNpcPose({ ...p, status }, p, 0, 10).activity, 'working');
  }
  assert.equal(sampleNpcPose({ ...p, status: 'Having lunch' }, p).activity, 'eating');
  assert.equal(sampleNpcPose({ ...p, status: 'Socializing' }, p).activity, 'socializing');
  assert.equal(sampleNpcPose({ ...p, status: 'Walking · building' }, { ...p, x: 2.1 }, .5).activity, 'walking');
  assert.equal(sampleNpcPose({ ...p, status: 'Resting between projects' }, p).activity, 'resting');
});

test('street camera cuts away only foliage between the camera and its subject', () => {
  const camera = { x: 0, z: 6 }, subject = { x: 0, z: 0 }, tree = { x: .5, z: 3, sx: 1, sz: 1 };
  assert.equal(blocksStreetView(tree, camera, subject), true);
  assert.equal(blocksStreetView({ ...tree, x: 3 }, camera, subject), false);
  assert.equal(blocksStreetView({ ...tree, z: 9 }, camera, subject), false);
  assert.equal(blocksStreetView(tree, camera, camera), false);
});

test('all 48 residents have distinct display positions inside the street footprint', () => {
  const offsets = Array.from({ length: 48 }, (_, index) => npcDisplayOffset(index));
  assert.equal(new Set(offsets.map(p => `${p.x},${p.z}`)).size, 48);
  for (const point of offsets) assert.ok(Math.abs(point.x) < 1.1 && Math.abs(point.z) < 1.1);
  for (let i = 0; i < offsets.length; i++) for (let j = i + 1; j < offsets.length; j++) {
    assert.ok(Math.hypot(offsets[i].x - offsets[j].x, offsets[i].z - offsets[j].z) >= 0.29);
  }
});

test('NPC positions interpolate and clamp without changing simulation snapshots', () => {
  const person = Object.freeze({ id: 'citizen-1', x: 2, z: 3, status: 'Commuting to work' });
  const next = Object.freeze({ ...person, x: 3, z: 3 });
  assert.equal(sampleNpcPose(person, next, -2, 12).x, 2);
  assert.equal(sampleNpcPose(person, next, 2, 12).x, 3);
  assert.equal(sampleNpcPose(person, next, 0.25, 12).x, 2.25);
  assert.equal(sampleNpcPose(person, next, 0.25, 12).z, 3);
  assert.equal(sampleNpcPose(person, next, 0.25, 12).heading, Math.PI / 2);
  assert.equal(sampleNpcPose(person, next, Infinity, 12).x, 3);
  assert.deepEqual(person, { id: 'citizen-1', x: 2, z: 3, status: 'Commuting to work' });
});

test('walking has opposed limbs, arrival stops the gait and frozen time repeats exactly', () => {
  const person = { id: 'citizen-8', x: 1, z: 2, status: 'Heading home' };
  const next = { ...person, z: 2.4, status: 'Resting at home' };
  const pose = sampleNpcPose(person, next, 0.4, 510);
  assert.equal(pose.activity, 'walking');
  assert.ok(pose.moving);
  assert.ok(pose.armSwing * pose.legSwing <= 0);
  assert.ok(pose.bodyBob >= 0 && pose.bodyBob <= 0.025);
  assert.deepEqual(sampleNpcPose(person, next, 0.4, 510), pose);
  assert.notEqual(sampleNpcPose(person, next, 0.7, 510).legSwing, pose.legSwing);
  const arrival = sampleNpcPose(person, next, 1, 510);
  assert.equal(arrival.activity, 'resting');
  assert.equal(arrival.legSwing, 0);
});

test('stationary work, lunch, outage and rest have distinct task poses', () => {
  const person = { id: 'citizen-4', x: 6, z: 3, status: 'At work' };
  const work = sampleNpcPose(person, person, 0.2, 60);
  assert.equal(work.activity, 'working');
  assert.equal(work.moving, false);
  assert.equal(work.legSwing, 0);
  assert.ok(work.workMotion >= 0 && work.workMotion <= 1);
  assert.notEqual(sampleNpcPose(person, person, 0.7, 60).workMotion, work.workMotion);
  for (const status of ['Having lunch', 'Lunch without power']) {
    assert.equal(sampleNpcPose({ ...person, status }, null, 0.2, 240).activity, 'eating');
  }
  const outage = sampleNpcPose({ ...person, status: 'Work interrupted by outage' }, null, 0.2, 240);
  assert.equal(outage.activity, 'interrupted');
  assert.equal(outage.workMotion, 0);
  for (const status of ['Resting at home', 'Resting in the gardens']) {
    assert.equal(sampleNpcPose({ ...person, status }, null, 0.2, 650).activity, 'resting');
  }
});

test('missing next snapshots and non-finite optional values remain finite and stationary', () => {
  const person = { id: 'citizen-2', x: 3, z: 5, status: 'Walking to market', route: [{ x: 3, z: 5 }, { x: 3, z: 4 }] };
  const pose = sampleNpcPose(person, undefined, 0.3, 230);
  assert.equal(pose.x, 3);
  assert.equal(pose.z, 5);
  assert.equal(pose.moving, false);
  assert.equal(pose.heading, Math.PI);
  for (const args of [[undefined, undefined, NaN, Infinity], [{ x: NaN, z: Infinity }, { x: Infinity, z: NaN }, undefined, NaN]]) {
    for (const value of Object.values(sampleNpcPose(...args))) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value));
    }
  }
});

test('real seeded NPC snapshots sample continuously and deterministically across daily activities', () => {
  const world = createTimeline();
  for (const tick of [0, 20, 60, 240, 540, 650, 720]) {
    const state = getState(world, 'origin', tick);
    const next = getState(world, 'origin', Math.min(720, tick + 1));
    for (const [index, person] of state.citizens.entries()) {
      const pose = sampleNpcPose(person, next.citizens[index], 0.5, tick);
      assert.deepEqual(sampleNpcPose(person, next.citizens[index], 0.5, tick), pose);
      assert.ok(pose.x >= 0 && pose.x <= 10);
      assert.ok(pose.z >= 0 && pose.z <= 8);
      for (const value of Object.values(pose)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value));
      }
    }
  }
});
