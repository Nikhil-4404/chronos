export const DEVELOPMENT_ACTIONS = Object.freeze(['outward', 'upgrade', 'repair']);
export const DEVELOPMENT_CONTEXTS = Object.freeze(['crowded', 'underserved', 'prosperous', 'declining']);

export function chooseDevelopment(learning, context, eligible) {
  if (!eligible.length) return null;
  if (learning.policy === 'baseline') return { action: eligible[0], exploring: false };
  const unseen = eligible.find(action => !learning.estimates[`${context}:${action}`]);
  if (unseen) return { action: unseen, exploring: true };
  const total = eligible.reduce((n, action) => n + learning.estimates[`${context}:${action}`].samples, 0);
  const score = action => { const e = learning.estimates[`${context}:${action}`]; return e.value + .35 * Math.sqrt(Math.log(total + 1) / e.samples); };
  return { action: eligible.reduce((best, action) => score(action) > score(best) ? action : best), exploring: false };
}

export function observeDevelopment(learning, decision, outcome, tick) {
  const key = `${decision.context}:${decision.action}`;
  const reward = outcome.completed === false ? -1 : Math.max(-2, Math.min(2,
    (outcome.coverage - decision.baseline.coverage) * 1.5 +
    (outcome.wellbeing - decision.baseline.wellbeing) / 30 +
    (outcome.food - decision.baseline.food) / 30 +
    (outcome.condition - decision.baseline.condition) / 100 + .15));
  const estimate = learning.estimates[key] ||= { samples: 0, value: 0, meanReward: 0 };
  estimate.samples++; estimate.value += .2 * (reward - estimate.value);
  estimate.meanReward += (reward - estimate.meanReward) / estimate.samples;
  learning.observations++;
  learning.recent.push({ tick, targetId: decision.buildingId, context: decision.context, action: decision.action, kind: decision.kind,
    reason: decision.reason, reward, status: 'evaluated', exploring: decision.exploring });
  if (learning.recent.length > 12) learning.recent.shift();
  return reward;
}
