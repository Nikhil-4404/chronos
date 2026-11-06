export const MAX_TICK = 720;
export const MAX_BRANCHES = 8;

const ACTIONS = Object.freeze({ bridge: 'bridgeClosed', power: 'blackout', hospital: 'hospital', park: 'park' });
const LABELS = {
  bridge: ['North bridge reopened', 'North bridge closed'],
  power: ['Eastbank power restored', 'Eastbank power outage'],
  hospital: ['Healthcare expansion paused', 'Healthcare expanded'],
  park: ['Green-space program paused', 'Green spaces expanded'],
};
const NAMES = ['Amara', 'Theo', 'Maya', 'Felix', 'Nora', 'Jules', 'Iris', 'Leo', 'Zara', 'Eli', 'Ada', 'Kai', 'Luca', 'Anika', 'Owen', 'Mila', 'Noah', 'Aria', 'Sage', 'Hugo', 'Cleo', 'Ravi', 'Lina', 'Ezra', 'Yuna', 'Finn', 'Esme', 'Remy', 'Alma', 'Lior', 'Nina', 'Ishan', 'Sofia', 'Atlas', 'June', 'Mateo', 'Ines', 'Arlo', 'Rhea', 'Emil', 'Tara', 'Otis', 'Vera', 'Ari', 'Mira', 'Kian', 'Lena', 'Sami'];
const ROLES = ['Designer', 'Engineer', 'Teacher', 'Florist', 'Researcher', 'Cook', 'Architect', 'Shopkeeper'];
const caches = new WeakMap();
const routeCaches = [new Map(), new Map()];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = (n, places = 1) => Number(n.toFixed(places));
const key = (p) => `${p.x},${p.z}`;

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function random(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n + 0x6D2B79F5) >>> 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWorld() {
  const buildings = [];
  for (let z = 0; z < 8; z++) {
    for (let x = 0; x < 10; x++) {
      if (x === 4 || x === 5) continue;
      const index = buildings.length;
      let kind = (x + z) % 3 === 0 ? 'work' : 'home';
      if ((x === 2 || x === 7) && (z === 2 || z === 5)) kind = 'shop';
      if ((x === 1 && z === 3) || (x === 8 && z === 5)) kind = 'park';
      if (x === 7 && z === 3) kind = 'hospital';
      if (x === 8 && z === 1) kind = 'power';
      const district = x < 5 ? 'Westhaven' : 'Eastbank';
      const names = { home: `${district} residence ${index + 1}`, work: `${district} studio ${index + 1}`, shop: `${district} market`, park: `${district} gardens`, hospital: 'Meridian Medical Center', power: 'Eastbank substation' };
      buildings.push({ id: `building-${index + 1}`, kind, label: names[kind], x: x + 0.5, z: z + 0.5, entrance: { x, z }, district });
    }
  }
  return freeze({ name: 'New Meridian', buildings, bridges: [{ id: 'north', x: 5, z: 2 }, { id: 'south', x: 5, z: 6 }], riverX: 5, width: 10, depth: 8 });
}

export const WORLD = makeWorld();
const buildingById = new Map(WORLD.buildings.map((b) => [b.id, b]));
const shops = WORLD.buildings.filter((b) => b.kind === 'shop');
const parks = WORLD.buildings.filter((b) => b.kind === 'park');

function isNode(x, z, closed) {
  return x >= 0 && x <= 10 && z >= 0 && z <= 8 && (x !== 5 || z === 6 || (z === 2 && !closed));
}

function nearestNode(position, closed) {
  let nearest;
  let distance = Infinity;
  for (let z = 0; z <= 8; z++) {
    for (let x = 0; x <= 10; x++) {
      if (!isNode(x, z, closed)) continue;
      const d = Math.abs(position.x - x) + Math.abs(position.z - z);
      if (d < distance) {
        distance = d;
        nearest = { x, z };
      }
    }
  }
  return nearest;
}

function pathBetween(from, to, closed) {
  const cache = routeCaches[Number(closed)];
  const cacheKey = `${key(from)}>${key(to)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const queue = [from];
  const previous = new Map([[key(from), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === to.x && p.z === to.z) break;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: p.x + dx, z: p.z + dz };
      if (!isNode(next.x, next.z, closed) || previous.has(key(next))) continue;
      previous.set(key(next), p);
      queue.push(next);
    }
  }
  if (!previous.has(key(to))) throw new Error('No safe route to the destination.');
  const path = [];
  for (let p = to; p; p = previous.get(key(p))) path.push({ x: p.x, z: p.z });
  path.reverse();
  freeze(path);
  cache.set(cacheKey, path);
  return path;
}

function routeFrom(position, destination, closed) {
  const node = nearestNode(position, closed);
  const path = pathBetween(node, destination.entrance, closed);
  const start = Math.abs(position.x - node.x) + Math.abs(position.z - node.z) < 0.00001 ? [] : [{ x: position.x, z: position.z }];
  return freeze([...start, ...path]);
}

function createCitizens(seed) {
  const rng = random(seed);
  const homes = WORLD.buildings.filter((b) => b.kind === 'home');
  const workplaces = WORLD.buildings.filter((b) => ['work', 'shop', 'hospital', 'power'].includes(b.kind));
  return NAMES.map((name, i) => {
    const home = homes[(i * 7) % homes.length];
    const across = workplaces.filter((b) => (b.x < 5) !== (home.x < 5));
    const work = across[(i * 3) % across.length];
    const shop = shops.filter((b) => (b.x < 5) === (work.x < 5))[i % 2];
    const park = parks.find((b) => (b.x < 5) === (home.x < 5));
    return {
      id: `citizen-${i + 1}`, name, role: ROLES[i % ROLES.length], homeId: home.id, workId: work.id,
      shopId: shop.id, parkId: park.id, departure: Math.floor(rng() * 35), lunch: 225 + Math.floor(rng() * 25),
      returnHome: 510 + Math.floor(rng() * 35), speed: 0.35 + rng() * 0.12,
      x: home.entrance.x, z: home.entrance.z, destinationId: home.id, route: freeze([home.entrance]), routeIndex: 0,
      energy: 88 + rng() * 10, hunger: 12 + rng() * 8, baseHealth: 76 + rng() * 10, tripMinutes: 0,
      phase: 'home', arrivals: 0,
    };
  });
}

function destinationAt(citizen, tick, effects) {
  if (tick < citizen.departure) return ['home', citizen.homeId];
  if (tick < citizen.lunch) return ['work', citizen.workId];
  if (tick < citizen.lunch + 45) return ['lunch', citizen.shopId];
  if (tick < citizen.returnHome) return ['work', citizen.workId];
  if (tick >= 605 && tick < 655 && effects.park) return ['park', citizen.parkId];
  return ['home', citizen.homeId];
}

function navigate(citizen, tick, effects, reroute = false) {
  const [phase, destinationId] = destinationAt(citizen, tick, effects);
  if (destinationId !== citizen.destinationId || reroute) {
    return { ...citizen, phase, destinationId, route: routeFrom(citizen, buildingById.get(destinationId), effects.bridgeClosed), routeIndex: 0, tripMinutes: destinationId !== citizen.destinationId ? 0 : citizen.tripMinutes };
  }
  return phase === citizen.phase ? citizen : { ...citizen, phase };
}

function move(citizen) {
  let { x, z, routeIndex } = citizen;
  let remaining = citizen.speed;
  let moved = false;
  while (remaining > 0.000001 && routeIndex < citizen.route.length - 1) {
    const next = citizen.route[routeIndex + 1];
    const distance = Math.abs(next.x - x) + Math.abs(next.z - z);
    if (distance <= remaining + 0.000001) {
      x = next.x; z = next.z; remaining -= distance; routeIndex++;
    } else {
      const fraction = remaining / distance;
      x += (next.x - x) * fraction;
      z += (next.z - z) * fraction;
      remaining = 0;
    }
    moved = true;
  }
  return { ...citizen, x, z, routeIndex, tripMinutes: citizen.tripMinutes + Number(moved), arrivals: citizen.arrivals + Number(moved && routeIndex === citizen.route.length - 1) };
}

function updateNeeds(citizen, effects) {
  const arrived = citizen.routeIndex === citizen.route.length - 1;
  const resting = arrived && citizen.phase === 'home';
  const eating = arrived && citizen.phase === 'lunch';
  const atPark = arrived && citizen.phase === 'park';
  const powerLoss = effects.blackout && buildingById.get(citizen.destinationId).x > 5;
  return {
    ...citizen,
    energy: clamp(citizen.energy + (resting ? 0.09 : atPark ? 0.2 : -0.035) - (powerLoss ? 0.015 : 0), 0, 100),
    hunger: clamp(citizen.hunger + (eating ? -0.7 : 0.045), 0, 100),
    baseHealth: clamp(citizen.baseHealth + (effects.hospital ? 0.014 : -0.001) + (atPark ? 0.016 : 0), 0, 100),
  };
}

function eventAt(frame, event) {
  const effects = { ...frame.effects, [ACTIONS[event.type]]: event.enabled };
  const paid = { ...frame.paid };
  let treasury = frame.treasury;
  if (event.enabled && (event.type === 'hospital' || event.type === 'park') && !paid[event.type]) {
    treasury -= event.type === 'hospital' ? 48000 : 18000;
    paid[event.type] = true;
  }
  return {
    ...frame, effects, paid, treasury,
    agents: frame.agents.map((a) => navigate(a, frame.tick, effects, event.type === 'bridge')),
    log: [...frame.log, { tick: event.tick, text: `${LABELS[event.type][Number(event.enabled)]}. ${event.type === 'bridge' ? (event.enabled ? 'Journeys reroute via the south crossing.' : 'The direct northern crossing is available again.') : event.type === 'power' ? (event.enabled ? 'Eastbank workplaces lose electricity; supplies begin to fall.' : 'Eastbank workplaces resume; supplies recover gradually.') : event.type === 'hospital' ? (event.enabled ? 'Additional care improves health over time. Capital cost: 48,000.' : 'Additional care stops; the capital investment remains.') : event.enabled ? 'Residents gain an evening garden routine. Capital cost: 18,000.' : 'The added evening garden routine stops.'}` }].slice(-40),
  };
}

function initialFrame(seed, events) {
  let frame = {
    tick: 0, agents: createCitizens(seed), effects: { bridgeClosed: false, blackout: false, hospital: false, park: false },
    supply: 94, treasury: 248000, paid: { hospital: false, park: false },
    log: [{ tick: 0, text: 'New Meridian begins its day. Forty-eight residents follow their daily routines.' }],
  };
  for (const event of events.filter((e) => e.tick === 0)) frame = eventAt(frame, event);
  frame.agents = frame.agents.map((a) => navigate(a, 0, frame.effects));
  return frame;
}

function nextFrame(previous, events) {
  const tick = previous.tick + 1;
  const { effects } = previous;
  const supplyTarget = 94 - (effects.bridgeClosed ? 12 : 0) - (effects.blackout ? 37 : 0);
  let frame = {
    ...previous, tick,
    agents: previous.agents.map((a) => updateNeeds(move(navigate(a, tick, effects)), effects)),
    supply: clamp(previous.supply + clamp(supplyTarget - previous.supply, -0.16, 0.11), 0, 100),
    treasury: previous.treasury + (effects.blackout ? 22 : 68) - (effects.hospital ? 17 : 0) - (effects.park ? 5 : 0) - (effects.bridgeClosed ? 9 : 0),
  };
  if ([60, 225, 510, 605, MAX_TICK].includes(tick)) {
    const text = tick === 60 ? 'Morning routines continue. Inspect a resident to see their destination and journey.' : tick === 225 ? 'Lunch hour begins. Workers visit their district markets before returning to work.' : tick === 510 ? 'Evening departures begin. Residents make their way back home.' : tick === 605 ? (effects.park ? 'The green-space program brings residents to their neighborhood gardens.' : 'The city winds down. Residents spend the evening at home.') : '20:00. The simulated day is complete. Rewind or explore another branch.';
    frame = { ...frame, log: [...frame.log, { tick, text }].slice(-40) };
  }
  for (const event of events.filter((e) => e.tick === tick)) frame = eventAt(frame, event);
  return frame;
}

function statusOf(citizen, effects) {
  if (citizen.routeIndex < citizen.route.length - 1) return citizen.phase === 'work' ? 'Commuting to work' : citizen.phase === 'lunch' ? 'Walking to market' : citizen.phase === 'park' ? 'Walking to gardens' : 'Heading home';
  if (citizen.phase === 'home') return 'Resting at home';
  if (citizen.phase === 'lunch') return effects.blackout && citizen.x > 5 ? 'Lunch without power' : 'Having lunch';
  if (citizen.phase === 'park') return 'Resting in the gardens';
  return effects.blackout && citizen.x > 5 ? 'Work interrupted by outage' : 'At work';
}

function projectFrame(frame) {
  const citizens = frame.agents.map((a) => {
    const wellbeing = clamp(a.baseHealth + (a.energy - 80) * 0.15 - a.hunger * 0.12 - (frame.effects.blackout && a.x > 5 ? 13 : 0) - (frame.effects.bridgeClosed ? 2 : 0), 0, 100);
    return {
      id: a.id, name: a.name, role: a.role, homeId: a.homeId, workId: a.workId,
      x: round(a.x, 5), z: round(a.z, 5), destinationId: a.destinationId,
      status: statusOf(a, frame.effects), wellbeing: round(wellbeing), energy: round(a.energy), hunger: round(a.hunger), tripMinutes: a.tripMinutes,
      route: [{ x: round(a.x, 5), z: round(a.z, 5) }, ...a.route.slice(a.routeIndex + 1)],
    };
  });
  const travel = frame.agents.reduce((sum, a) => sum + (pathBetween(buildingById.get(a.homeId).entrance, buildingById.get(a.workId).entrance, frame.effects.bridgeClosed).length - 1) / a.speed, 0) / citizens.length;
  return freeze({
    tick: frame.tick, citizens, effects: { ...frame.effects },
    metrics: {
      wellbeing: round(citizens.reduce((sum, a) => sum + a.wellbeing, 0) / citizens.length),
      power: frame.effects.blackout ? 50 : 100, supply: round(frame.supply), travel: round(travel), treasury: Math.round(frame.treasury),
    },
    log: frame.log.map((entry) => ({ ...entry })),
  });
}

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}

function tickValue(value) {
  if (!Number.isInteger(value)) throw new Error('Time must be a whole number of minutes.');
  return clamp(value, 0, MAX_TICK);
}

export function createTimeline(seed = 731) {
  integer(seed, 0, 4294967295, 'World seed');
  return { schema: 1, seed, branches: [{ id: 'origin', name: 'Original', parentId: null, forkTick: 0, events: [] }], activeId: 'origin', cursor: 0 };
}

export function getState(timeline, branchId = timeline.activeId, tick = timeline.cursor) {
  tick = tickValue(tick);
  const branch = timeline.branches.find((b) => b.id === branchId);
  if (!branch) throw new Error('That timeline does not exist.');
  let timelineCache = caches.get(timeline);
  if (!timelineCache) caches.set(timeline, (timelineCache = new Map()));
  const signature = `${timeline.seed}:${JSON.stringify(branch.events)}`;
  let cached = timelineCache.get(branchId);
  if (!cached || cached.signature !== signature) {
    cached = { signature, frames: [initialFrame(timeline.seed, branch.events)], projected: new Map() };
    timelineCache.set(branchId, cached);
  }
  // shortcut: minute snapshots suit this 12-hour/48-resident world; use checkpoints for longer simulations.
  for (let i = cached.frames.length; i <= tick; i++) cached.frames.push(nextFrame(cached.frames[i - 1], branch.events));
  if (!cached.projected.has(tick)) cached.projected.set(tick, projectFrame(cached.frames[tick]));
  return cached.projected.get(tick);
}

export function seek(timeline, tick) {
  timeline.cursor = tickValue(tick);
  return timeline;
}

export function advance(timeline, ticks = 1) {
  if (!Number.isInteger(ticks)) throw new Error('Advance by a whole number of minutes.');
  return seek(timeline, timeline.cursor + ticks);
}

export function fork(timeline, action) {
  if (!action || !Object.hasOwn(ACTIONS, action.type) || typeof action.enabled !== 'boolean') throw new Error('Choose a supported intervention and an on/off state.');
  if (timeline.branches.length >= MAX_BRANCHES) throw new Error('This world already has eight timelines. Export it, then start a new world to explore more.');
  const current = timeline.branches.find((b) => b.id === timeline.activeId);
  if (!current) throw new Error('That timeline does not exist.');
  if (getState(timeline).effects[ACTIONS[action.type]] === action.enabled) throw new Error('That condition is already active on this timeline.');
  let suffix = 1;
  while (timeline.branches.some((b) => b.id === `branch-${suffix}`)) suffix++;
  const branch = {
    id: `branch-${suffix}`, name: LABELS[action.type][Number(action.enabled)], parentId: current.id, forkTick: timeline.cursor,
    events: [...current.events.filter((e) => e.tick <= timeline.cursor).map((e) => ({ ...e })), { tick: timeline.cursor, type: action.type, enabled: action.enabled }],
  };
  timeline.branches.push(branch);
  timeline.activeId = branch.id;
  return branch;
}

function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k)) || keys.some((k) => !Object.hasOwn(value, k))) throw new Error(`Invalid ${label} fields.`);
}

function validateTimeline(value) {
  record(value, ['schema', 'seed', 'branches', 'activeId', 'cursor'], 'world');
  if (value.schema !== 1) throw new Error('This world uses an unsupported save format.');
  integer(value.seed, 0, 4294967295, 'World seed');
  integer(value.cursor, 0, MAX_TICK, 'Saved time');
  if (!Array.isArray(value.branches) || value.branches.length < 1 || value.branches.length > MAX_BRANCHES) throw new Error('A world must contain one to eight timelines.');
  const known = new Map();
  value.branches.forEach((branch, index) => {
    record(branch, ['id', 'name', 'parentId', 'forkTick', 'events'], 'timeline');
    if (typeof branch.id !== 'string' || !/^(origin|branch-[1-9]\d{0,2})$/.test(branch.id) || known.has(branch.id)) throw new Error('Timeline identifiers must be unique and valid.');
    if (typeof branch.name !== 'string' || branch.name.trim().length === 0 || branch.name.length > 48 || /[\u0000-\u001f\u007f]/.test(branch.name)) throw new Error('Timeline names must contain 1 to 48 printable characters.');
    integer(branch.forkTick, 0, MAX_TICK, 'Branch time');
    if (!Array.isArray(branch.events) || branch.events.length > 64) throw new Error('A timeline contains too many interventions.');
    let previousTick = -1;
    branch.events.forEach((event) => {
      record(event, ['tick', 'type', 'enabled'], 'intervention');
      integer(event.tick, 0, MAX_TICK, 'Intervention time');
      if (event.tick < previousTick || !Object.hasOwn(ACTIONS, event.type) || typeof event.enabled !== 'boolean') throw new Error('Invalid or unordered intervention.');
      previousTick = event.tick;
    });
    if (index === 0) {
      if (branch.id !== 'origin' || branch.parentId !== null || branch.forkTick !== 0 || branch.events.length !== 0) throw new Error('The original timeline must remain unchanged.');
    } else {
      const parent = known.get(branch.parentId);
      if (!parent || branch.id === 'origin') throw new Error('Each branch must reference an earlier parent timeline.');
      const inherited = parent.events.filter((e) => e.tick <= branch.forkTick);
      if (branch.events.length !== inherited.length + 1 || branch.events.at(-1).tick !== branch.forkTick || inherited.some((event, i) => event.tick !== branch.events[i].tick || event.type !== branch.events[i].type || event.enabled !== branch.events[i].enabled)) throw new Error('Branch history does not match its parent.');
      const last = branch.events.at(-1);
      const previousValue = [...inherited].reverse().find((e) => e.type === last.type)?.enabled ?? false;
      if (last.enabled === previousValue) throw new Error('An intervention must change the current condition.');
    }
    known.set(branch.id, branch);
  });
  if (typeof value.activeId !== 'string' || !known.has(value.activeId)) throw new Error('The selected timeline does not exist.');
  return value;
}

export function serializeTimeline(timeline) {
  validateTimeline(timeline);
  return JSON.stringify(timeline, null, 2);
}

export function deserializeTimeline(text) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error('Choose a CHRONOS JSON world smaller than 2 MB.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose an exported CHRONOS world.'); }
  return validateTimeline(parsed);
}
