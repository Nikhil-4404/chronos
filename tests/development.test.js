import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseDevelopment, observeDevelopment } from '../src/development.js';

const mind = () => ({ policy: 'learned', observations: 0, estimates: {}, pending: [], recent: [] });
test('development bandit explores legal actions, learns measured outcomes and never selects masked work', () => {
  const learning = mind();
  assert.equal(chooseDevelopment(learning, 'prosperous', ['outward', 'upgrade']).action, 'outward');
  const decision = { buildingId: 'place-1', context: 'prosperous', action: 'outward', kind: 'market', reason: 'Service demand', exploring: true, baseline: { coverage: 0, wellbeing: 60, food: 10, condition: 100 } };
  const reward = observeDevelopment(learning, decision, { coverage: .5, wellbeing: 70, food: 15, condition: 100 }, 1440);
  assert.ok(reward > 1); assert.equal(learning.observations, 1);
  assert.equal(chooseDevelopment(learning, 'prosperous', ['outward', 'upgrade']).action, 'upgrade');
  for (let i = 0; i < 20; i++) {
    observeDevelopment(learning, { ...decision, action: 'outward' }, { coverage: .5, wellbeing: 70, food: 15, condition: 100 }, 1440 + i);
    observeDevelopment(learning, { ...decision, action: 'upgrade' }, { coverage: 0, wellbeing: 40, food: 0, condition: 100 }, 1440 + i);
  }
  assert.equal(chooseDevelopment(learning, 'prosperous', ['outward', 'upgrade']).action, 'outward');
  assert.equal(chooseDevelopment(learning, 'prosperous', ['repair']).action, 'repair');
  assert.equal(chooseDevelopment(learning, 'prosperous', []), null);
  assert.equal(learning.recent.length, 12);
});

test('unfinished projects yield a negative observation and fixed baseline is explicit', () => {
  const learning = mind(), decision = { buildingId: 'place-1', context: 'crowded', action: 'outward', kind: 'home', reason: 'Households need room', exploring: true, baseline: { coverage: 0, wellbeing: 60, food: 10, condition: 100 } };
  assert.equal(observeDevelopment(learning, decision, { completed: false }, 4032), -1);
  learning.policy = 'baseline';
  assert.deepEqual(chooseDevelopment(learning, 'crowded', ['outward', 'upgrade']), { action: 'outward', exploring: false });
});
