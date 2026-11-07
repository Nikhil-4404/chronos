import test from 'node:test';
import assert from 'node:assert/strict';
import { mindMarkup } from '../src/observation.js';

test('city mind distinguishes pending work from measured outcomes and escapes world labels', () => {
  const snapshot = { buildings: [{ id: 'place-1' }], development: { footprint: { minX: -3, maxX: 8, minZ: 0, maxZ: 5 }, districtDetails: [{ name: '<river>', population: 5, places: 3, services: ['school'] }] }, learning: { deliveries: 7, contexts: [{ context: 'local', mode: 'cart', samples: 7, meanDuration: 3, value: .5 }], city: { observations: 1, pending: 1, contexts: [{ context: 'prosperity', action: 'outward', samples: 1, value: .4 }], recent: [{ tick: 144, status: 'pending', action: 'outward', reason: '<new land>', reward: 0 }, { tick: 288, status: 'evaluated', action: 'repair', reason: 'Condition improved', reward: .75 }] } } };
  const html = mindMarkup(snapshot);
  assert.match(html.footprint, /12 × 6 blocks/);
  assert.match(html.districts, /&lt;river&gt;/);
  assert.match(html.decisions, /&lt;new land&gt;/);
  assert.equal((html.decisions.match(/Measured reward/g) || []).length, 1);
  assert.match(html.decisions, /0\.750/);
  assert.match(html.decisions, /Awaiting a measured outcome/);
  assert.match(html.transport, /30 min/);
});

test('a fresh world shows no invented observations or outcomes', () => {
  const html = mindMarkup({ buildings: [], learning: { contexts: [] } });
  assert.match(html.city, /Outcomes evaluated<\/dt><dd>0/);
  assert.match(html.decisions, /first development decision/);
  assert.doesNotMatch(html.city, /NaN|undefined/);
});

test('planned empty hubs do not count as neighborhoods and type availability is not population coverage', () => {
  const html = mindMarkup({ buildings: [{}], development: { serviceCoverage: 1 / 3, districtDetails: [{ name: 'Occupied', places: 1, population: 1, services: [] }, { name: 'Future', places: 0, population: 0, services: [] }] } });
  assert.match(html.footprint, /Neighborhoods<\/dt><dd>1/);
  assert.match(html.footprint, /Service types built<\/dt><dd>3 \/ 9/);
  assert.doesNotMatch(html.districts, /Future/);
  assert.match(html.districts, /Services not built here yet/);
});
