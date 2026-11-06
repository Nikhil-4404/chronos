import test from 'node:test';
import assert from 'node:assert/strict';
import { CALENDAR, environmentAt } from '../src/environment.js';

const at = (day, hour = 12, seed = 731) => environmentAt((day + hour / 24) * CALENDAR.ticksPerDay, seed);

test('the sun moves through a repeating day and seasonal daylight changes', () => {
  const night = at(0, 0), morning = at(0, 6), noon = at(0, 12), evening = at(0, 18);
  assert.equal(night.sun.daylight, 0); assert.equal(noon.sun.daylight, 1);
  assert.ok(morning.sun.direction.x > .9); assert.ok(evening.sun.direction.x < -.9);
  assert.ok(noon.sun.elevation > morning.sun.elevation);
  assert.ok(at(48, 6).sun.daylight > at(144, 6).sun.daylight);
  assert.ok(at(48, 12).sun.elevation > at(144, 12).sun.elevation);
});

test('calendar and lunar phases progress separately and directions stay normalized', () => {
  assert.equal(at(0).season, 'Spring'); assert.equal(at(48).season, 'Summer');
  assert.equal(at(96).season, 'Autumn'); assert.equal(at(144).season, 'Winter');
  assert.equal(at(192).year, 2); assert.equal(at(192).dayOfYear, 1);
  const now = at(3), cycle = at(3 + CALENDAR.lunarDays), half = at(3 + CALENDAR.lunarDays / 2);
  assert.ok(Math.abs(now.moon.phase - cycle.moon.phase) < 1e-10);
  assert.ok(Math.abs(now.moon.illumination + half.moon.illumination - 1) < 1e-10);
  for (const value of [now.sun, now.moon, cycle.sun, cycle.moon]) {
    assert.ok(Math.abs(Math.hypot(value.direction.x, value.direction.y, value.direction.z) - 1) < 1e-10);
    assert.ok(value.azimuth >= 0 && value.azimuth < Math.PI * 2);
  }
});

test('weather is reproducible, seed-sensitive and smooth across ticks and day boundaries', () => {
  assert.deepEqual(at(12, 10), at(12, 10));
  assert.notDeepEqual(at(12, 10, 1), at(12, 10, 2));
  const tick = 144 * 24, before = environmentAt(tick - .0001), after = environmentAt(tick + .0001);
  for (const key of ['temperature', 'precipitation', 'rain', 'snow', 'cloud', 'mud']) assert.ok(Math.abs(before[key] - after[key]) < .001, key);
  assert.ok(Math.abs(before.river.ice - after.river.ice) < .001);
  const first = environmentAt(341), later = environmentAt(342);
  assert.ok(Math.abs(first.precipitation - later.precipitation) < .02);
});

test('cold history can freeze the river while warm seasons keep navigation open', () => {
  const year = Array.from({ length: CALENDAR.daysPerYear }, (_, day) => at(day));
  const iceDays = year.filter(e => e.river.frozen);
  assert.ok(iceDays.length > 5);
  assert.ok(year.some(e => e.river.loadSafe === 'foot'));
  assert.ok(year.some(e => e.river.loadSafe === 'cart'));
  assert.ok(year.filter(e => e.season === 'Summer').every(e => !e.river.frozen));
  assert.ok(iceDays.every(e => e.river.ice >= .35));
  assert.ok(year.filter(e => e.river.loadSafe !== 'none').every(e => e.river.frozen));
});

test('environment values stay finite and physically bounded across many seeds and years', () => {
  for (const seed of [0, 1, 731, 4294967295]) for (let day = 0; day < 384; day += 3) {
    const e = at(day, 7.25, seed);
    for (const key of ['precipitation', 'rain', 'snow', 'cloud', 'mud']) assert.ok(e[key] >= 0 && e[key] <= 1, key);
    assert.ok(Math.abs(e.precipitation - e.rain - e.snow) < 1e-12);
    assert.ok(e.river.ice >= 0 && e.river.ice <= 1); assert.ok(e.river.level >= .15 && e.river.level <= .95);
    assert.ok(e.temperature > -30 && e.temperature < 40); assert.ok(e.wind.speed >= 1.5 && e.wind.speed < 11);
  }
  const end = environmentAt(1e10); assert.ok(Number.isFinite(end.sun.elevation)); assert.ok(Number.isFinite(end.temperature));
});

test('invalid times and seeds are rejected, and callers cannot poison cached samples', () => {
  for (const tick of [NaN, Infinity, -1, 1e10 + 1, '144', null]) assert.throws(() => environmentAt(tick));
  for (const seed of [-1, .5, NaN, Infinity, 4294967296, '731']) assert.throws(() => environmentAt(0, seed));
  const first = environmentAt(100); first.river.ice = 99; first.sun.direction.y = 99;
  assert.notEqual(environmentAt(100).river.ice, 99); assert.notEqual(environmentAt(100).sun.direction.y, 99);
});
