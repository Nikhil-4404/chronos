import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentAt } from '../src/environment.js';
import { skyPresentation, rainSample } from '../src/sky.js';

test('distant celestial bearings use world directions and respect the real horizon', () => {
  const morning = skyPresentation(environmentAt(36, 731)), noon = skyPresentation(environmentAt(72, 731)), evening = skyPresentation(environmentAt(108, 731));
  assert.ok(morning.sun.x > .5 && evening.sun.x < -.5);
  assert.ok(noon.sun.y > morning.sun.y);
  assert.equal(skyPresentation(environmentAt(0, 731)).sun.visible, false);
  for (const [tick, p] of [[36, morning], [72, noon], [108, evening]]) {
    const actual = environmentAt(tick, 731).sun.direction;
    assert.equal(p.sun.x, actual.x); assert.equal(p.sun.y, actual.y); assert.equal(p.sun.z, actual.z);
  }
});

test('night stars, seasonal terrain and lunar phase use the same environment', () => {
  const night = skyPresentation(environmentAt(0, 731)), day = skyPresentation(environmentAt(72, 731));
  assert.ok(night.stars > .15); assert.equal(day.stars, 0);
  const autumn = skyPresentation(environmentAt(100 * 144 + 72, 731)), winter = skyPresentation(environmentAt(160 * 144, 731));
  assert.notEqual(autumn.foliage, day.foliage); assert.notEqual(winter.ground, day.ground);
  assert.ok(winter.frost > .5);
});

test('Moon fades out in bright daytime and remains phase and horizon constrained at night', () => {
  for (let day = 0; day < 30; day++) {
    const noon = skyPresentation(environmentAt(day * 144 + 72, 731));
    assert.equal(noon.moon.visible, false); assert.equal(noon.moon.opacity, 0);
  }
  const env = environmentAt(1140, 731), moon = skyPresentation(env).moon;
  assert.ok(moon.visible && moon.opacity > .4); assert.equal(moon.elevation, env.moon.elevation);
});

test('rain has varied short droplets with wind travel and bounded falling cycles', () => {
  const calm = rainSample(3, 4, { direction: 0, speed: 0 }), wind = rainSample(3, 4, { direction: 0, speed: 8 });
  assert.ok(wind.x > calm.x); assert.notEqual(wind.size, rainSample(9, 4, { direction: 0, speed: 8 }).size);
  const a = rainSample(3, 0, { direction: Math.PI / 2, speed: 5 }), b = rainSample(3, .1, { direction: Math.PI / 2, speed: 5 });
  assert.ok(b.y < a.y); assert.ok(b.z > a.z);
  for (let tick = 0; tick < 200; tick += .3) { const drop = rainSample(13, tick, { direction: .7, speed: 10 }); assert.ok(drop.y >= 0 && drop.y <= 55 && Object.values(drop).every(Number.isFinite)); }
});
