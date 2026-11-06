import { validateColony as validateV2 } from './colony-v2.js';
import { environmentAt } from './environment.js';

export const TICKS_PER_DAY = 144;
export const TICKS_PER_SECOND = 2;
export const LIMITS = Object.freeze({ people: 1024, buildings: 512, shipments: 160, history: 120, journal: 100 });
export const MAX_SAVE_BYTES = 2 * 1024 * 1024;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const RESOURCES = ['food', 'wood', 'stone', 'tools'];
const materials = () => ({ wood: 0, stone: 0 });
const inventory = () => ({ food: 0, wood: 0, stone: 0, tools: 0 });
const sum = object => Object.values(object).reduce((a, b) => a + b, 0);
const serial = id => Number(String(id).split('-').at(-1));
const names = ['Amara', 'Theo', 'Maya', 'Felix', 'Nora', 'Jules', 'Iris', 'Leo', 'Zara', 'Eli', 'Ada', 'Kai', 'Luca', 'Anika', 'Owen', 'Mila', 'Noah', 'Aria', 'Sage', 'Hugo', 'Cleo', 'Ravi', 'Lina', 'Ezra', 'Yuna', 'Finn', 'Esme', 'Remy', 'Alma', 'Lior', 'Nina', 'Ishan', 'Sofia', 'Atlas', 'June', 'Mateo', 'Ines', 'Arlo', 'Rhea', 'Emil', 'Tara', 'Otis', 'Vera', 'Ari', 'Mira', 'Kian', 'Lena', 'Sami'];
export const KINDS = Object.freeze({
  home: { label: 'House', wood: 26, stone: 12, labor: 50, jobs: 0 },
  farm: { label: 'Farm', wood: 20, stone: 6, labor: 44, jobs: 8 },
  forestry: { label: 'Woodland lodge', wood: 12, stone: 8, labor: 40, jobs: 6 },
  quarry: { label: 'Stone yard', wood: 16, stone: 5, labor: 42, jobs: 6 },
  workshop: { label: 'Workshop', wood: 32, stone: 22, labor: 66, jobs: 6 },
  shop: { label: 'Storehouse', wood: 25, stone: 18, labor: 52, jobs: 8 },
  park: { label: 'Common garden', wood: 8, stone: 8, labor: 34, jobs: 0 },
  hospital: { label: 'Care house', wood: 35, stone: 28, labor: 75, jobs: 6 },
  dock: { label: 'River pier', wood: 34, stone: 14, labor: 70, jobs: 8 },
});
// Preserve the schema-2 plot prefix; newly opened land follows the same ordering.
export const PLOTS = Object.freeze(Array.from({ length: 28 * 26 }, (_, i) => ({ x: i % 28 - 9, z: Math.floor(i / 28) - 9 }))
  .filter(p => p.x !== 4 && p.x !== 5)
  .sort((a, b) => Math.hypot(a.x - 2, a.z - 4) - Math.hypot(b.x - 2, b.z - 4) || a.z - b.z || a.x - b.x)
  .slice(0, LIMITS.buildings).map((p, i) => Object.freeze({ ...p, id: `plot-${i + 1}` })));
const runtime = new WeakMap();
function index(w) {
  let cached = runtime.get(w);
  if (!cached || cached.size !== w.buildings.length) {
    cached = { size: w.buildings.length, buildings: new Map(w.buildings.map(b => [b.id, b])) };
    runtime.set(w, cached);
  }
  return cached;
}
const building = (w, id) => index(w).buildings.get(id);
const complete = b => b.progress >= 1;
const usable = b => complete(b) && b.state !== 'Derelict';
const homes = w => w.buildings.filter(b => b.kind === 'home' && usable(b));
const occupants = (w, id) => w.people.reduce((n, p) => n + Number(p.homeId === id), 0);
export const housing = w => homes(w).reduce((n, b) => n + b.capacity, 0);
function random(w) { w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0; return w.rng / 4294967296; }
function note(w, type, text, entity = null) {
  w.journal.push({ tick: w.tick, type, text, entity });
  if (w.journal.length > LIMITS.journal) w.journal.shift();
}
function cargoChanged(w) { index(w).cargo = null; }
function cargoIndex(w) {
  const cached = index(w);
  if (!cached.cargo) {
    const reserved = new Map(), incoming = new Map();
    for (const s of w.shipments) {
      const source = `${s.sourceId}:${s.resource}`, destination = `${s.destinationId}:${s.resource}:${s.projectStarted}`;
      if (!s.loaded) reserved.set(source, (reserved.get(source) || 0) + s.amount);
      incoming.set(destination, (incoming.get(destination) || 0) + s.amount);
    }
    cached.cargo = { reserved, incoming };
  }
  return cached.cargo;
}
function reservedFor(w, b, resource) { return cargoIndex(w).reserved.get(`${b.id}:${resource}`) || 0; }
function incomingFor(w, b, resource, projectStarted) { return cargoIndex(w).incoming.get(`${b.id}:${resource}:${projectStarted}`) || 0; }
function available(w, b, resource) { return Math.max(0, b.inventory[resource] - reservedFor(w, b, resource)); }
function syncResources(w) {
  for (const r of RESOURCES) w.resources[r] = w.buildings.reduce((n, b) => n + b.inventory[r], 0);
}
function deposit(w, b, r, amount) {
  if (!(amount > 0)) return;
  const actual = Math.min(amount, Math.max(0, 100000 - b.inventory[r]));
  b.inventory[r] += actual; w.economy.produced[r] += actual;
}
function consume(w, b, r, amount) {
  const actual = Math.min(available(w, b, r), amount);
  b.inventory[r] -= actual; w.economy.consumed[r] += actual; return actual;
}
function nearest(w, p, predicate) {
  let chosen = null, best = Infinity;
  for (const b of w.buildings) if (predicate(b)) {
    const distance = Math.abs(p.x - b.entrance.x) + Math.abs(p.z - b.entrance.z);
    if (distance < best) { chosen = b; best = distance; }
  }
  return chosen;
}
function makeBuilding(w, kind, ready = false, dockSide = null) {
  if (w.buildings.length >= LIMITS.buildings) return null;
  const i = w.buildings.length, plot = PLOTS[i], variant = Math.floor(random(w) * 6);
  const entrance = dockSide ? { x: dockSide === 'west' ? 4 : 6, z: dockSide === 'west' ? 2 : 6 } : { x: plot.x, z: plot.z };
  const b = { id: `place-${i + 1}`, plotId: dockSide ? `dock-${dockSide}` : plot.id,
    kind, originalKind: kind, variant, label: `${KINDS[kind].label} ${i + 1}`,
    x: dockSide ? dockSide === 'west' ? 4.5 : 5.5 : plot.x + .5, z: entrance.z + .5, entrance,
    capacity: kind === 'home' ? 4 + variant : 0, progress: ready ? 1 : 0, delivered: ready ? 1 : 0,
    founded: w.tick, completed: ready ? w.tick : null, level: 1, state: 'Active', condition: 100,
    vacantDays: 0, additions: [], inventory: inventory(), materials: ready ? { wood: KINDS[kind].wood, stone: KINDS[kind].stone } : materials(), project: null };
  w.buildings.push(b);
  if (!ready) beginProject(w, b, 'construct', kind);
  return b;
}
function beginProject(w, b, type, targetKind = b.kind) {
  if (b.project) return false;
  const base = KINDS[targetKind];
  b.project = { type, progress: 0, started: w.tick, lastWorked: w.tick, targetKind,
    cost: projectCost(targetKind, type), delivered: materials() };
  note(w, type === 'construct' ? 'construction' : 'retrofit', `${b.label}: ${type === 'construct' ? 'new foundations are planned' : type === 'expand' ? 'neighbors are adding usable space' : type === 'convert' ? `the old structure will become a ${base.label.toLowerCase()}` : type === 'salvage' ? 'crews will recover reusable materials' : 'repairs are planned'}.`, { kind: 'building', id: b.id });
  return true;
}
function projectCost(kind, type) {
  const base = KINDS[kind], multiplier = type === 'construct' ? 1 : type === 'expand' ? .6 : type === 'convert' ? .5 : type === 'repair' ? .25 : 0;
  return { wood: Math.ceil(base.wood * multiplier), stone: Math.ceil(base.stone * multiplier) };
}
function vacantHome(w) { return homes(w).find(b => occupants(w, b.id) < b.capacity); }
function addPerson(w, home, source, parentIds = []) {
  if (!home || w.people.length >= LIMITS.people) return null;
  const id = w.nextPerson++, age = source === 'birth' ? 0 : 18 + Math.floor(random(w) * 38);
  const p = { id: `resident-${id}`, name: `${names[(id - 1) % names.length]}${id > names.length ? ` ${Math.floor((id - 1) / names.length) + 1}` : ''}`,
    homeId: home.id, workId: null, role: age < 12 ? 'Child' : 'Builder', age, born: w.tick, lifespan: 145 + Math.floor(random(w) * 90),
    parentIds, partnerId: null, children: 0, x: source === 'arrival' ? 6 : home.entrance.x, z: source === 'arrival' ? 6 : home.entrance.z,
    hunger: 15 + random(w) * 12, energy: 85 + random(w) * 15, health: 96, social: 75,
    sociability: .5 + random(w) * .5, diligence: .7 + random(w) * .6, speed: .2 + random(w) * .07,
    destinationId: home.id, task: source === 'arrival' ? 'Moving in' : 'Resting at home', route: [], routeIndex: 0, harvest: 0,
    walked: 0, job: null, cargo: null, mode: 'porter', experience: { deliveries: 0, meanTrip: 0 } };
  w.people.push(p);
  if (source !== 'founder') {
    w.totals[source === 'birth' ? 'births' : 'arrivals']++;
    note(w, source, source === 'birth' ? `${p.name} was born into a new generation.` : `${p.name} arrived and found a home in ${home.label.toLowerCase()}.`, { kind: 'citizen', id: p.id });
  }
  return p;
}
function emptyWorld(seed, now) {
  return { schema: 3, seed, rng: seed >>> 0, tick: 0, savedAt: now, nextPerson: 1, nextShipment: 1,
    resources: inventory(), buildings: [], people: [], shipments: [], journal: [], history: [], weather: 'Clear', lastBirth: -144,
    totals: { births: 0, arrivals: 0, deaths: 0, completed: 0, deliveries: 0, upgrades: 0, reused: 0, salvaged: 0 },
    learning: {}, economy: { initial: inventory(), produced: inventory(), consumed: inventory() } };
}
export function createColony(seed = 731, now = Date.now()) {
  number(seed, 0, 4294967295, 'World seed', true);
  const w = emptyWorld(seed, now);
  ['home', 'farm', 'home', 'forestry', 'home', 'quarry', 'workshop', 'home', 'shop', 'home', 'park', 'home'].forEach(k => makeBuilding(w, k, true));
  const store = w.buildings.find(b => b.kind === 'shop'); Object.assign(store.inventory, { food: 400, wood: 220, stone: 170, tools: 80 });
  for (const side of ['west', 'east']) {
    const dock = makeBuilding(w, 'dock', true, side);
    for (const [r, amount] of [['wood', 30], ['stone', 20]]) { store.inventory[r] -= amount; dock.inventory[r] += amount; }
  }
  for (let i = 0; i < 24; i++) addPerson(w, vacantHome(w), 'founder');
  makeBuilding(w, 'home'); assignJobs(w); pairHouseholds(w); syncResources(w);
  w.economy.initial = resourceBalance(w).held;
  note(w, 'founding', 'Twenty-four people settled beside the river. Working piers, shared stores and persistent deliveries support a growing home.');
  return w;
}

function assignJobs(w) {
  const adults = w.people.filter(p => p.age >= 12).sort((a, b) => ((serial(a.id) * 2654435761) >>> 0) - ((serial(b.id) * 2654435761) >>> 0));
  const n = adults.length, lowFood = w.resources.food < w.people.length * 4;
  const quotas = { Farmer: Math.ceil(n * (lowFood ? .34 : .24)), Forester: Math.ceil(n * .12), Mason: Math.ceil(n * .1), Craftsperson: Math.ceil(n * .06), Carrier: Math.max(3, Math.ceil(n * .16)), Healer: Math.ceil(n * .025) };
  const kinds = { Farmer: ['farm'], Forester: ['forestry'], Mason: ['quarry'], Craftsperson: ['workshop'], Carrier: ['shop', 'dock'], Healer: ['hospital'] };
  const counts = {}, loads = new Map();
  for (const p of adults) if (p.job) { counts[p.role] = (counts[p.role] || 0) + 1; if (p.workId) loads.set(p.workId, (loads.get(p.workId) || 0) + 1); }
  const work = Object.fromEntries(Object.entries(kinds).map(([role, allowed]) => [role, w.buildings.filter(b => usable(b) && allowed.includes(b.kind))]));
  for (const p of adults) {
    if (p.job) continue;
    let chosen = null, role = 'Builder';
    const home = building(w, p.homeId).entrance;
    for (const r of Object.keys(quotas)) {
      if ((counts[r] || 0) >= quotas[r]) continue;
      let distance = Infinity;
      for (const b of work[r]) {
        if ((loads.get(b.id) || 0) >= KINDS[b.kind].jobs * b.level) continue;
        const d = Math.abs(home.x - b.entrance.x) + Math.abs(home.z - b.entrance.z);
        if (d < distance) { chosen = b; distance = d; }
      }
      if (chosen) { role = r; break; }
    }
    p.role = role; p.workId = chosen?.id || null;
    counts[role] = (counts[role] || 0) + 1;
    if (chosen) loads.set(chosen.id, (loads.get(chosen.id) || 0) + 1);
  }
}
function pairHouseholds(w) {
  const households = new Map();
  for (const p of w.people) if (p.age >= 18 && !p.partnerId) {
    const other = households.get(p.homeId);
    if (other) { p.partnerId = other.id; other.partnerId = p.id; households.delete(p.homeId); }
    else households.set(p.homeId, p);
  }
}
function routeTo(p, target, env, mode = 'porter') {
  const end = target.entrance || target, path = [{ x: p.x, z: p.z }];
  let x = Math.round(p.x) || 0, z = Math.round(p.z) || 0;
  if (x === 5) x = p.x < 5 ? 4 : 6;
  path.push({ x, z: p.z }, { x, z });
  if ((x < 5) !== (end.x < 5)) {
    const iceCrossing = env.river.loadSafe === 'cart' || (mode === 'porter' && env.river.loadSafe === 'foot');
    const bridge = iceCrossing ? Math.round((z + end.z) / 2) || 0 : Math.abs(z - 2) + Math.abs(end.z - 2) < Math.abs(z - 6) + Math.abs(end.z - 6) ? 2 : 6;
    path.push({ x, z: bridge }, { x: end.x, z: bridge }); x = end.x; z = bridge;
  }
  path.push({ x: end.x, z }, { x: end.x, z: end.z });
  return path.filter((v, i) => !i || v.x !== path[i - 1].x || v.z !== path[i - 1].z);
}
function unsafeIceRoute(p, env, mode) {
  if (mode === 'barge' || env.river.loadSafe === 'cart' || mode === 'porter' && env.river.loadSafe === 'foot') return false;
  let previous = { x: p.x, z: p.z };
  for (const next of p.route.slice(p.routeIndex + 1)) {
    const acrossRiver = Math.min(previous.x, next.x) < 6 && Math.max(previous.x, next.x) > 4 && previous.x !== next.x;
    if (acrossRiver && previous.z === next.z && next.z !== 2 && next.z !== 6) return true;
    previous = next;
  }
  return false;
}
function go(w, p, target, task, env, mode = p.mode || 'porter', force = false) {
  if (force || p.destinationId !== target.id || !p.route.length || unsafeIceRoute(p, env, mode)) { p.destinationId = target.id; p.route = routeTo(p, target, env, mode); p.routeIndex = 0; }
  p.task = task;
}
const arrived = p => p.routeIndex >= p.route.length - 1;
function move(p, env) {
  if (p.mode === 'barge' && p.job?.stage === 'river' && env.river.frozen) return;
  let distance = p.speed * (p.mode === 'cart' ? 1.35 * (1 - env.mud * .45) : p.mode === 'barge' && p.job?.stage === 'river' ? 2.4 : 1 - env.mud * .12);
  while (distance > .000001 && p.routeIndex < p.route.length - 1) {
    const next = p.route[p.routeIndex + 1], d = Math.abs(next.x - p.x) + Math.abs(next.z - p.z);
    if (d <= distance) { p.x = next.x; p.z = next.z; p.routeIndex++; distance -= d; p.walked += d; }
    else { p.x += (next.x - p.x) * distance / d; p.z += (next.z - p.z) * distance / d; p.walked += distance; distance = 0; }
  }
}
function chooseMode(w, source, destination, env) {
  const crossing = (source.entrance.x < 5) !== (destination.entrance.x < 5);
  const distance = Math.abs(source.entrance.x - destination.entrance.x) + Math.abs(source.entrance.z - destination.entrance.z);
  const context = crossing ? 'crossing' : distance > 5 ? 'long' : 'local';
  const eligible = source.kind === 'dock' && destination.kind === 'dock' && crossing && !env.river.frozen ? ['porter', 'cart', 'barge'] : ['porter', 'cart'];
  const counts = eligible.map(mode => w.learning[`${context}:${mode}`]?.samples || 0), total = counts.reduce((a, b) => a + b, 0);
  let mode = eligible.find((_, i) => counts[i] === 0);
  if (!mode) mode = eligible.reduce((best, candidate) => {
    const score = name => { const e = w.learning[`${context}:${name}`]; return e.value + .15 * Math.sqrt(Math.log(total + 1) / e.samples); };
    return score(candidate) > score(best) ? candidate : best;
  });
  return { mode, context, capacity: { porter: 3, cart: 10, barge: 30 }[mode] };
}
function dispatch(w, p, env) {
  const stranded = w.shipments.find(s => s.state === 'stranded' && !s.carrierId && (s.mode !== 'barge' || !env.river.frozen));
  if (stranded) {
    stranded.carrierId = p.id; p.job = { kind: 'haul', shipmentId: stranded.id, stage: 'recover', elapsed: 0 }; p.mode = stranded.mode;
    p.route = []; p.routeIndex = 0; return;
  }
  if (w.shipments.length >= LIMITS.shipments) return;
  let candidate = null, best = Infinity;
  const requests = [];
  for (const b of w.buildings) if (b.project && b.project.type !== 'salvage') for (const r of ['wood', 'stone']) {
    const inFlight = incomingFor(w, b, r, b.project.started);
    const needed = b.project.cost[r] - b.project.delivered[r] - inFlight;
    if (needed > .000001) requests.push({ b, r, needed, priority: b.kind === 'home' ? 0 : 4, projectStarted: b.project.started });
  }
  for (const b of w.buildings) {
    const desired = b.kind === 'workshop' && usable(b) ? { wood: 12, stone: 8 } : b.kind === 'shop' && usable(b) ? { food: Math.max(24, w.people.length / 2) } : b.project ? { tools: 1.5 } : null;
    if (!desired) continue;
    for (const [r, target] of Object.entries(desired)) {
      const incoming = incomingFor(w, b, r, null);
      const needed = target - b.inventory[r] - incoming;
      if (needed > .2) requests.push({ b, r, needed, priority: r === 'food' && b.inventory.food < 8 ? -1 : 6, projectStarted: null });
    }
  }
  // Feeder deliveries make river warehouses useful; cross-bank stock movement can use the berth.
  for (const dock of w.buildings.filter(b => b.kind === 'dock' && usable(b))) for (const r of RESOURCES) {
    const inFlight = incomingFor(w, dock, r, null);
    const needed = ({ wood: 28, stone: 18, food: 24, tools: 3 })[r] - dock.inventory[r] - inFlight;
    if (needed > 2) requests.push({ b: dock, r, needed, priority: 8, projectStarted: null });
  }
  for (const request of requests) for (const source of w.buildings) {
    if (source.id === request.b.id || !usable(source) || available(w, source, request.r) < 1) continue;
    if (request.r === 'food' && source.kind !== 'farm' && !(source.kind === 'dock' && request.b.kind === 'dock')) continue;
    if (request.r === 'tools' && source.kind !== 'workshop' && !(source.kind === 'dock' && request.b.kind === 'dock')) continue;
    if (source.kind === 'dock' && request.b.kind === 'dock' && source.inventory[request.r] < request.b.inventory[request.r] + 12) continue;
    const mode = chooseMode(w, source, request.b, env);
    const amount = Math.min(request.needed, available(w, source, request.r), mode.capacity);
    const approach = Math.abs(p.x - source.entrance.x) + Math.abs(p.z - source.entrance.z);
    const trip = Math.abs(source.entrance.x - request.b.entrance.x) + Math.abs(source.entrance.z - request.b.entrance.z);
    const experience = w.learning[`${mode.context}:${mode.mode}`];
    const estimate = experience ? experience.meanDuration / Math.max(1, experience.meanAmount) : trip / (p.speed * mode.capacity);
    const age = request.b.project ? (w.tick - request.b.project.lastWorked) / 144 : 0;
    const score = request.priority + approach + estimate * .05 - Math.min(8, age) - amount * .12;
    if (score < best) { best = score; candidate = { source, ...request, ...mode, amount }; }
  }
  if (!candidate) return;
  const { source, b, r, mode, context, amount } = candidate;
  const s = { id: `shipment-${w.nextShipment++}`, resource: r, amount, sourceId: source.id, destinationId: b.id,
    carrierId: p.id, mode, context, state: 'reserved', loaded: false, created: w.tick, projectStarted: candidate.projectStarted,
    x: p.x, z: p.z, onRiver: false };
  w.shipments.push(s); cargoChanged(w); p.job = { kind: 'haul', shipmentId: s.id, stage: 'pickup', elapsed: 0 }; p.mode = mode; p.route = []; p.routeIndex = 0;
}
function learnDelivery(w, p, s) {
  const key = `${s.context}:${s.mode}`, duration = Math.max(1, w.tick - s.created), reward = s.amount / duration;
  const e = w.learning[key] ||= { samples: 0, meanDuration: 0, meanAmount: 0, value: 0 };
  e.samples++; e.meanDuration += (duration - e.meanDuration) / e.samples; e.meanAmount += (s.amount - e.meanAmount) / e.samples;
  e.value += .2 * (reward - e.value);
  p.experience.deliveries++; p.experience.meanTrip += (duration - p.experience.meanTrip) / p.experience.deliveries;
  w.totals.deliveries++;
}
function finishShipment(w, p, s) {
  const destination = building(w, s.destinationId);
  if (s.projectStarted !== null && destination.project?.started === s.projectStarted) destination.project.delivered[s.resource] += s.amount;
  else destination.inventory[s.resource] += s.amount;
  learnDelivery(w, p, s);
  w.shipments.splice(w.shipments.indexOf(s), 1); cargoChanged(w); p.job = null; p.cargo = null; p.mode = 'porter'; p.route = []; p.routeIndex = 0;
}
function dockCanHandle(w, s, destination) {
  const queue = w.shipments.filter(other => other.mode === 'barge' && other.carrierId && (other.state === 'loading' ? other.sourceId : other.destinationId) === destination.id && ['loading', 'unloading'].includes(other.state))
    .sort((a, b) => a.created - b.created || serial(a.id) - serial(b.id));
  return !queue.length || queue[0].id === s.id;
}
function enterRiver(p, s, destination) {
  p.job.stage = 'river'; p.destinationId = destination.id;
  p.route = [{ x: p.x, z: p.z }, { x: 5, z: p.z }, { x: 5, z: destination.entrance.z }, { ...destination.entrance }];
  p.routeIndex = 0; s.onRiver = true;
}
function haul(w, p, env) {
  const s = w.shipments.find(shipment => shipment.id === p.job.shipmentId);
  if (!s) { p.job = null; p.cargo = null; p.mode = 'porter'; return; }
  const source = building(w, s.sourceId), destination = building(w, s.destinationId);
  let stage = p.job.stage;
  if (stage === 'recover') {
    if (s.mode === 'barge' && env.river.frozen) { p.task = 'Waiting for the river to thaw'; p.route = []; p.routeIndex = 0; return; }
    const target = { id: destination.id, entrance: { x: s.x, z: s.z } };
    go(w, p, target, 'Recovering cargo', env, p.mode);
    if (arrived(p)) {
      s.state = 'transit'; p.job.stage = 'deliver'; p.cargo = { resource: s.resource, amount: s.amount, sourceId: s.sourceId, destinationId: s.destinationId }; p.route = []; p.routeIndex = 0;
      if (s.mode === 'barge' && s.onRiver) enterRiver(p, s, destination);
    }
    return;
  }
  if (stage === 'pickup' || stage === 'load') {
    go(w, p, source, stage === 'load' ? 'Loading cargo' : 'Walking to collect cargo', env, p.mode);
    if (!arrived(p)) return;
    s.state = 'loading'; p.job.stage = 'load';
    if (s.mode === 'barge' && env.river.frozen) { p.task = 'Waiting for the river to thaw'; return; }
    if (s.mode === 'barge' && !dockCanHandle(w, s, source)) { p.task = 'Waiting for the pier'; return; }
    if (++p.job.elapsed < (s.mode === 'barge' ? 5 : 2)) return;
    if (source.inventory[s.resource] + .00001 < s.amount) { s.amount = source.inventory[s.resource]; }
    source.inventory[s.resource] = Math.max(0, source.inventory[s.resource] - s.amount);
    s.loaded = true; cargoChanged(w); s.state = 'transit'; p.cargo = { resource: s.resource, amount: s.amount, sourceId: s.sourceId, destinationId: s.destinationId };
    p.job.elapsed = 0; p.job.stage = 'deliver';
    if (s.mode === 'barge') enterRiver(p, s, destination);
    else { p.route = []; p.routeIndex = 0; }
    return;
  }
  if (stage === 'river') {
    p.task = env.river.frozen ? 'Waiting for the river to thaw' : 'Piloting river cargo';
    if (!env.river.frozen && arrived(p)) { p.job.stage = 'unload'; s.state = 'unloading'; s.onRiver = false; p.job.elapsed = 0; }
    return;
  }
  go(w, p, destination, stage === 'unload' ? 'Unloading cargo' : 'Hauling materials', env, p.mode);
  if (!arrived(p)) return;
  p.job.stage = 'unload'; s.state = 'unloading';
  if (s.mode === 'barge' && !dockCanHandle(w, s, destination)) { p.task = 'Waiting for the pier'; return; }
  if (++p.job.elapsed >= (s.mode === 'barge' ? 5 : 2)) finishShipment(w, p, s);
}
function chooseTask(w, p, env) {
  const hour = w.tick % TICKS_PER_DAY / 6, home = building(w, p.homeId);
  const eating = p.hunger > (p.job ? 83 : 58) || (p.task === 'Having lunch' && p.hunger > 12);
  if (eating && !['river', 'load', 'unload'].includes(p.job?.stage)) {
    const food = nearest(w, p, b => usable(b) && available(w, b, 'food') > .1);
    if (food) { go(w, p, food, 'Having lunch', env); return; }
  }
  if (p.job?.kind === 'haul') { haul(w, p, env); return; }
  if (p.job?.kind === 'build') {
    const b = building(w, p.job.destinationId);
    if (!b?.project) { p.job = null; p.route = []; p.routeIndex = 0; }
    else { go(w, p, b, b.project.type === 'salvage' ? 'Salvaging materials' : b.project.type === 'construct' ? 'Building' : 'Retrofitting a building', env); return; }
  }
  p.mode = 'porter';
  if (p.health < 55 && hour > 7 && hour < 21) {
    const care = nearest(w, p, b => usable(b) && b.kind === 'hospital');
    if (care) { go(w, p, care, 'Receiving care', env); return; }
  }
  if (p.age >= 12 && p.energy > 20 && hour >= 6 && hour < 18) {
    if (p.role === 'Carrier') {
      if (w.tick % 4 === serial(p.id) % 4) dispatch(w, p, env);
      if (p.job) { haul(w, p, env); return; }
    } else if (p.role === 'Builder') {
      const target = nearest(w, p, b => b.project && (b.project.type === 'salvage' || sum(b.project.delivered) > 0));
      if (target) { p.job = { kind: 'build', destinationId: target.id }; p.route = []; p.routeIndex = 0; go(w, p, target, target.project.type === 'construct' ? 'Building' : 'Retrofitting a building', env); return; }
    } else {
      const target = building(w, p.workId);
      if (target && usable(target)) {
        go(w, p, target, ({ Farmer: 'Growing food', Forester: 'Gathering timber', Mason: 'Quarrying stone', Craftsperson: 'Crafting tools', Healer: 'Caring for neighbors' })[p.role], env); return;
      }
    }
    go(w, p, home, 'Resting between projects', env);
  } else if (hour >= 17 && hour < 21 && p.energy > 25) {
    go(w, p, nearest(w, p, b => usable(b) && b.kind === 'park') || home, p.age < 12 ? 'Playing' : 'Socializing', env);
  } else go(w, p, home, 'Resting at home', env);
}
function completeProject(w, b) {
  const project = b.project;
  if (project.type === 'salvage') {
    for (const r of ['wood', 'stone']) { const reclaimed = b.materials[r] * .4; b.materials[r] -= reclaimed; b.inventory[r] += reclaimed * .7; w.economy.consumed[r] += reclaimed * .3; }
    b.additions.push('salvaged-roof'); b.condition = 28; w.totals.salvaged++;
  } else {
    for (const r of ['wood', 'stone']) b.materials[r] += project.delivered[r];
    if (project.type === 'construct') { b.progress = 1; b.delivered = 1; b.completed = w.tick; w.totals.completed++; }
    if (project.type === 'expand') {
      b.level++; b.capacity += b.kind === 'home' ? 4 : 0;
      const addition = b.level === 2 ? 'upper-floor' : b.level === 3 ? 'shopfront' : 'courtyard-shed';
      if (!b.additions.includes(addition)) b.additions.push(addition);
      w.totals.upgrades++;
    }
    if (project.type === 'convert') { b.kind = project.targetKind; b.capacity = b.kind === 'home' ? 5 + b.level * 3 : 0; b.label = `Converted ${KINDS[b.originalKind].label.toLowerCase()} ${serial(b.id)}`; if (!b.additions.includes('converted-home')) b.additions.push('converted-home'); w.totals.reused++; }
    b.additions = b.additions.filter(a => a !== 'salvaged-roof');
    b.state = 'Active'; b.condition = 100; b.vacantDays = 0;
  }
  note(w, 'completion', `${b.label}: ${project.type === 'construct' ? 'construction finished' : project.type === 'expand' ? 'new rooms and usable space are ready' : project.type === 'convert' ? 'an old structure has a new purpose' : project.type === 'salvage' ? 'salvaged materials are available locally' : 'repairs are complete'}.`, { kind: 'building', id: b.id });
  b.project = null; assignJobs(w);
}
function workAndNeeds(w, p, env) {
  const atPlace = arrived(p), task = atPlace ? p.task : 'Walking', target = building(w, p.destinationId);
  p.hunger = clamp(p.hunger + .17, 0, 100);
  p.energy = clamp(p.energy + (task === 'Resting at home' ? 1.15 : ['Socializing', 'Playing', 'Resting between projects'].includes(task) ? .18 : -.12), 0, 100);
  p.social = clamp(p.social + (['Socializing', 'Playing', 'Resting at home'].includes(task) ? p.sociability * .6 : -.09), 0, 100);
  if (task === 'Having lunch' && target) p.hunger = clamp(p.hunger - consume(w, target, 'food', .65) * 15, 0, 100);
  const care = task === 'Receiving care' && w.people.some(q => q.role === 'Healer' && q.destinationId === p.destinationId && q.task === 'Caring for neighbors' && arrived(q));
  p.health = clamp(p.health + (p.hunger > 93 ? -.55 : p.energy < 5 ? -.25 : .045) + (care ? .7 : 0), 0, 100);
  if (p.job?.kind === 'haul') {
    const s = w.shipments.find(s => s.id === p.job.shipmentId);
    if (s && p.job.stage !== 'recover') { s.x = p.x; s.z = p.z; s.onRiver = p.job.stage === 'river'; }
  }
  if (!atPlace || !target) return;
  const factor = p.diligence * (p.energy > 15 ? 1 : .5) * (p.hunger < 85 ? 1 : .45);
  const cap = Math.max(600, w.people.length * 30);
  if (w.resources.food < cap && task === 'Growing food') deposit(w, target, 'food', factor * (.5 + env.rain * .4) * (env.temperature < 0 ? .35 : env.temperature > 32 ? .5 : 1));
  if (w.resources.wood < cap && task === 'Gathering timber') deposit(w, target, 'wood', factor * .34);
  if (w.resources.stone < cap && task === 'Quarrying stone') deposit(w, target, 'stone', factor * .3);
  if (task === 'Crafting tools' && w.resources.tools < cap) {
    if (available(w, target, 'wood') >= .05 && available(w, target, 'stone') >= .035) { consume(w, target, 'wood', .05); consume(w, target, 'stone', .035); deposit(w, target, 'tools', .11 * factor); }
  }
  if (p.job?.kind === 'build' && target.project) {
    const project = target.project, delivered = sum(project.delivered), cost = sum(project.cost), ceiling = cost ? Math.min(1, delivered / cost) : 1;
    const toolSource = available(w, target, 'tools') > .01 ? target : null;
    if (toolSource) consume(w, toolSource, 'tools', .008);
    const change = factor * (toolSource ? 1.3 : .7) / (KINDS[project.targetKind].labor * (project.type === 'construct' ? 1 : .75));
    const next = Math.min(ceiling, project.progress + change);
    if (next > project.progress) { project.progress = next; project.lastWorked = w.tick; }
    if (project.type === 'construct') { target.progress = project.progress; target.delivered = ceiling; }
    if (project.progress >= 1 - .000001) completeProject(w, target);
  }
}
function plan(w) {
  const projects = w.buildings.filter(b => b.project), n = w.people.length;
  const limit = Math.min(16, Math.max(3, Math.ceil(n / 22)));
  if (projects.length >= limit || w.resources.wood < 12 || w.resources.stone < 5) return;
  const count = kind => w.buildings.filter(b => b.kind === kind && b.state !== 'Derelict').reduce((total, b) => total + b.level, 0);
  const futureBeds = w.buildings.reduce((total, b) => total + (b.kind === 'home' ? b.capacity : 0) + (b.project?.type === 'expand' && b.kind === 'home' ? 4 : 0), 0);
  let kind;
  if (futureBeds < n + Math.max(12, n * .25)) kind = 'home';
  else if (count('farm') * 8 < Math.ceil(n * .3)) kind = 'farm';
  else if (count('forestry') * 6 < Math.ceil(n * .12)) kind = 'forestry';
  else if (count('quarry') * 6 < Math.ceil(n * .1)) kind = 'quarry';
  else if (count('workshop') * 6 < Math.ceil(n * .06)) kind = 'workshop';
  else if (count('shop') * 8 + count('dock') * 8 < Math.ceil(n * .16)) kind = 'shop';
  else if (count('hospital') < Math.ceil(n / 85)) kind = 'hospital';
  else if (count('park') < Math.ceil(n / 55)) kind = 'park';
  else if (w.resources.food < n * 3 && count('farm') * 8 < Math.ceil(n * .45)) kind = 'farm';
  if (kind) {
    const reuse = w.buildings.find(b => b.state === 'Derelict' && !b.project && b.kind !== 'dock' && occupants(w, b.id) === 0);
    if (reuse && kind === 'home') { beginProject(w, reuse, 'convert', 'home'); return; }
    const expandable = w.buildings.filter(b => b.kind === kind && usable(b) && !b.project && b.level < (kind === 'home' ? 5 : 3))
      .sort((a, b) => b.level - a.level || a.founded - b.founded)[0];
    // Alternate additions with new land so a prosperous city changes both density and footprint.
    if (expandable && (w.buildings.length >= LIMITS.buildings || w.totals.completed % 3 !== 0)) { beginProject(w, expandable, 'expand'); return; }
    if (makeBuilding(w, kind)) return;
  }
  const derelict = w.buildings.find(b => b.state === 'Derelict' && !b.project && !b.additions.includes('salvaged-roof') && occupants(w, b.id) === 0);
  if (derelict) { beginProject(w, derelict, 'salvage'); return; }
  const damaged = w.buildings.find(b => b.condition < 65 && b.state === 'Active' && !b.project);
  if (damaged) beginProject(w, damaged, 'repair');
}
function dailyLife(w, env) {
  const day = Math.floor(w.tick / TICKS_PER_DAY);
  w.weather = env.weather;
  note(w, 'weather', `${env.season} day ${day + 1}: ${env.weather.toLowerCase()}, ${Math.round(env.temperature)}°C. ${env.river.frozen ? 'River shipping is closed by ice; land routes remain available.' : 'River piers are open to cargo.'}`);
  for (const p of w.people) p.age++;
  const dead = w.people.filter(p => p.age >= p.lifespan || p.health <= 0), deadIds = new Set(dead.map(p => p.id));
  for (const p of dead) {
    w.totals.deaths++; note(w, 'life', `${p.name} died ${p.health <= 0 ? 'after prolonged hardship' : 'in old age'}. Their household carries on.`);
    const shipment = w.shipments.find(s => s.carrierId === p.id);
    if (shipment) {
      if (shipment.loaded) { shipment.state = 'stranded'; shipment.carrierId = null; }
      else w.shipments.splice(w.shipments.indexOf(shipment), 1);
    }
  }
  w.people = w.people.filter(p => !deadIds.has(p.id));
  cargoChanged(w);
  for (const p of w.people) if (deadIds.has(p.partnerId)) p.partnerId = null;
  pairHouseholds(w);
  if (w.resources.food > w.people.length * 2 && day % 3 === 0) {
    const eligibleParent = p => p && p.age >= 22 && p.age < 100 && p.children < 4;
    const parents = w.people.filter(p => p.partnerId && p.id < p.partnerId && eligibleParent(p));
    const max = Math.max(1, Math.ceil(w.people.length / 60));
    let births = 0;
    for (const p of parents) {
      if (births >= max) break;
      const home = building(w, p.homeId), partner = w.people.find(q => q.id === p.partnerId);
      if (eligibleParent(partner) && partner.homeId === home.id && occupants(w, home.id) < home.capacity && addPerson(w, home, 'birth', [p.id, partner.id])) { p.children++; partner.children++; births++; w.lastBirth = w.tick; }
    }
  }
  if (w.resources.food > Math.max(25, w.people.length * 1.5) && (!w.people.length || wellbeing(w) > 45)) {
    const arrivals = 2 + Math.floor(w.people.length / 65) + Math.floor(random(w) * 3);
    for (let i = 0; i < arrivals; i++) addPerson(w, vacantHome(w), 'arrival');
  }
  for (const p of w.people) if (p.age >= 18 && p.parentIds.length && !p.partnerId && occupants(w, p.homeId) > 2) {
    const home = homes(w).find(h => occupants(w, h.id) === 0);
    if (home) { p.homeId = home.id; p.route = []; p.routeIndex = 0; note(w, 'household', `${p.name} established a new household.`, { kind: 'citizen', id: p.id }); }
  }
  pairHouseholds(w); assignJobs(w);
  const occupied = new Set(w.people.flatMap(p => [p.homeId, p.workId]).filter(Boolean));
  for (const b of w.buildings) if (complete(b) && b.kind !== 'dock') {
    if (!occupied.has(b.id) && !b.project && !['park', 'hospital'].includes(b.kind)) {
      b.vacantDays++; b.state = b.vacantDays >= 24 ? 'Derelict' : 'Vacant'; b.condition = Math.max(20, b.condition - 1);
    } else { if (b.state !== 'Derelict') b.state = 'Active'; b.vacantDays = 0; b.condition = Math.max(20, b.condition - .08); }
    if (b.project && w.tick - b.project.lastWorked > 144 * 3) {
      // Stalled projects retain their inventory; fresh dispatch/roles make them recoverable.
      if (day % 7 === 0) note(w, 'recovery', `${b.label}: crews are being reassigned to a delayed project.`, { kind: 'building', id: b.id });
      for (const p of w.people) if (!p.job && p.age >= 12 && serial(p.id) % 5 === 0) { p.role = 'Carrier'; p.workId = w.buildings.find(s => s.kind === 'shop' && usable(s))?.id || null; }
    }
  }
  w.history.push({ day: day + 1, population: w.people.length, buildings: w.buildings.filter(complete).length, food: Math.round(w.resources.food) });
  if (w.history.length > LIMITS.history) w.history.shift();
}
export function wellbeing(w) { return w.people.length ? w.people.reduce((n, p) => n + p.health * .4 + p.energy * .2 + (100 - p.hunger) * .25 + p.social * .15, 0) / w.people.length : 0; }
export function stepColony(w, ticks = 1) {
  number(ticks, 0, 100000, 'step count', true);
  for (let i = 0; i < ticks; i++) {
    w.tick++; cargoChanged(w); const env = environmentAt(w.tick, w.seed);
    if (w.tick % 144 === 0) dailyLife(w, env);
    if (w.tick % 18 === 0) plan(w);
    for (const p of w.people) { chooseTask(w, p, env); move(p, env); workAndNeeds(w, p, env); }
    syncResources(w);
  }
  return w;
}
export function snapshotColony(w) {
  const environment = environmentAt(w.tick, w.seed), projects = w.buildings.filter(b => b.project);
  const docks = w.buildings.filter(b => b.kind === 'dock' && usable(b)).map(b => {
    const queued = w.shipments.filter(s => s.mode === 'barge' && ['loading', 'unloading'].includes(s.state) && (s.state === 'loading' ? s.sourceId : s.destinationId) === b.id);
    return { id: b.id, buildingId: b.id, x: b.entrance.x, z: b.entrance.z, berths: 1, occupied: Number(queued.length > 0), queue: Math.max(0, queued.length - 1) };
  });
  return { seed: w.seed, tick: w.tick, clock: w.tick % 144, day: Math.floor(w.tick / 144) + 1, season: environment.season, weather: environment.weather, environment,
    buildings: w.buildings.map(b => ({ ...b, entrance: { ...b.entrance }, inventory: { ...b.inventory }, materials: { ...b.materials }, additions: [...b.additions], project: b.project ? structuredClone(b.project) : null,
      district: `${b.z < 4 ? 'North' : 'South'} ${b.x < 5 ? 'Westbank' : 'Eastbank'}` })),
    citizens: w.people.map(p => ({ ...p, parentIds: [...p.parentIds], experience: { ...p.experience }, job: p.job ? { ...p.job } : null, cargo: p.cargo ? { ...p.cargo } : null,
      status: !arrived(p) ? `${p.mode === 'barge' && p.job?.stage === 'river' ? 'Sailing' : 'Walking'} · ${p.task.toLowerCase()}` : p.task,
      wellbeing: p.health * .4 + p.energy * .2 + (100 - p.hunger) * .25 + p.social * .15,
      route: [{ x: p.x, z: p.z }, ...p.route.slice(p.routeIndex + 1).map(point => ({ ...point }))] })),
    shipments: w.shipments.map(s => ({ ...s })), docks, effects: {}, resources: { ...w.resources }, capacity: housing(w),
    metrics: { wellbeing: wellbeing(w), supply: w.resources.food, power: 100, travel: 0, treasury: 0 }, totals: { ...w.totals },
    logistics: { active: w.shipments.length, delivered: w.totals.deliveries, waiting: docks.reduce((n, d) => n + d.queue, 0), stalled: projects.filter(b => w.tick - b.project.lastWorked > 432).length,
      modeCounts: Object.fromEntries(['porter', 'cart', 'barge'].map(mode => [mode, w.shipments.filter(s => s.mode === mode).length])) },
    development: { floorArea: w.buildings.filter(complete).reduce((n, b) => n + b.level * 22, 0), upgrades: w.totals.upgrades, reused: w.totals.reused, salvaged: w.totals.salvaged, districts: new Set(w.buildings.map(b => `${b.x < 5}:${b.z < 4}`)).size },
    learning: { deliveries: w.totals.deliveries, contexts: Object.entries(w.learning).map(([key, e]) => ({ context: key.split(':')[0], mode: key.split(':')[1], ...e })) },
    log: w.journal.map(e => ({ ...e, entity: e.entity ? { ...e.entity } : null })), history: w.history.map(h => ({ ...h })) };
}
export function resourceBalance(w) {
  const held = inventory();
  for (const b of w.buildings) {
    for (const r of RESOURCES) held[r] += b.inventory[r];
    for (const r of ['wood', 'stone']) held[r] += b.materials[r] + (b.project?.delivered[r] || 0);
  }
  for (const s of w.shipments) if (s.loaded) held[s.resource] += s.amount;
  return { held, expected: Object.fromEntries(RESOURCES.map(r => [r, w.economy.initial[r] + w.economy.produced[r] - w.economy.consumed[r]])) };
}
export function clockLabel(tick) { const minutes = tick % 144 * 10; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }

function number(n, min, max, label, integer = false) { if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`Invalid ${label}.`); }
function fields(value, keys, label) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(value, k))) throw new Error(`Invalid ${label} fields.`); }
function text(s, max, label) { if (typeof s !== 'string' || !s.length || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) throw new Error(`Invalid ${label}.`); }
function point(p) { fields(p, ['x', 'z'], 'route point'); number(p.x, -20, 30, 'position'); number(p.z, -20, 30, 'position'); }
function stock(value, keys = RESOURCES) { fields(value, keys, 'inventory'); for (const n of Object.values(value)) number(n, 0, 1e9, 'stock'); }
export function migrateColony(old) {
  validateV2(old);
  const w = structuredClone(old), stocks = { ...w.resources };
  w.schema = 3; w.nextShipment = 1; w.shipments = []; w.learning = {}; w.economy = { initial: inventory(), produced: inventory(), consumed: inventory() };
  Object.assign(w.totals, { deliveries: 0, upgrades: 0, reused: 0, salvaged: 0 });
  for (const b of w.buildings) {
    Object.assign(b, { originalKind: b.kind, level: 1, state: 'Active', condition: 100, vacantDays: 0, additions: [], inventory: inventory(), materials: materials(), project: null });
    if (complete(b)) b.materials = { wood: KINDS[b.kind].wood, stone: KINDS[b.kind].stone };
    else {
      const cost = { wood: KINDS[b.kind].wood, stone: KINDS[b.kind].stone };
      // Schema-2 deducted all materials on planning, so migration keeps that paid stock at the site.
      b.project = { type: 'construct', progress: b.progress, started: b.founded, lastWorked: w.tick, targetKind: b.kind, cost, delivered: { ...cost } }; b.delivered = 1;
    }
  }
  const store = w.buildings.find(b => b.kind === 'shop' && complete(b)) || w.buildings[0]; Object.assign(store.inventory, stocks);
  for (const p of w.people) { Object.assign(p, { walked: 0, job: null, cargo: null, mode: 'porter', experience: { deliveries: 0, meanTrip: 0 } }); p.speed = Math.min(.3, p.speed * 1.8); p.route = []; p.routeIndex = 0; p.routeIndex = 0; }
  for (const side of ['west', 'east']) if (w.buildings.length < LIMITS.buildings) makeBuilding(w, 'dock', false, side);
  w.economy.initial = resourceBalance(w).held; syncResources(w);
  note(w, 'migration', 'The existing settlement is preserved. Previously paid site materials remain on-site; persistent cargo and building additions now guide its future.');
  return w;
}
export function validateColony(w) {
  fields(w, ['schema', 'seed', 'rng', 'tick', 'savedAt', 'nextPerson', 'nextShipment', 'resources', 'buildings', 'people', 'shipments', 'journal', 'history', 'weather', 'totals', 'lastBirth', 'learning', 'economy'], 'world');
  if (w.schema !== 3) throw new Error('Choose a CHRONOS living-world save.');
  for (const k of ['seed', 'rng']) number(w[k], 0, 4294967295, k, true);
  number(w.tick, 0, 1e10, 'world age', true); number(w.savedAt, 0, 1e15, 'save time'); number(w.nextPerson, 1, 1e10, 'resident sequence', true); number(w.nextShipment, 1, 1e10, 'cargo sequence', true); number(w.lastBirth, -144, w.tick, 'birth time', true);
  if (!['Clear', 'Cloudy', 'Rain', 'Snow', 'Dry', 'Drought'].includes(w.weather)) throw new Error('Invalid weather.');
  stock(w.resources); fields(w.economy, ['initial', 'produced', 'consumed'], 'economy'); Object.values(w.economy).forEach(value => stock(value));
  fields(w.totals, ['births', 'arrivals', 'deaths', 'completed', 'deliveries', 'upgrades', 'reused', 'salvaged'], 'totals'); Object.values(w.totals).forEach(n => number(n, 0, 1e10, 'total', true));
  if (!Array.isArray(w.buildings) || w.buildings.length < 12 || w.buildings.length > LIMITS.buildings || !Array.isArray(w.people) || w.people.length > LIMITS.people || !Array.isArray(w.shipments) || w.shipments.length > LIMITS.shipments) throw new Error('Invalid settlement size.');
  cargoChanged(w);
  const bIds = new Set();
  for (let i = 0; i < w.buildings.length; i++) {
    const b = w.buildings[i];
    fields(b, ['id', 'plotId', 'kind', 'originalKind', 'variant', 'label', 'x', 'z', 'entrance', 'capacity', 'progress', 'delivered', 'founded', 'completed', 'level', 'state', 'condition', 'vacantDays', 'additions', 'inventory', 'materials', 'project'], 'building');
    if (b.id !== `place-${i + 1}` || !Object.hasOwn(KINDS, b.kind) || !Object.hasOwn(KINDS, b.originalKind)) throw new Error('Invalid building reference.');
    if (b.kind === 'dock') {
      if (!['dock-west', 'dock-east'].includes(b.plotId) || b.x !== (b.plotId === 'dock-west' ? 4.5 : 5.5) || b.entrance.x !== (b.plotId === 'dock-west' ? 4 : 6) || b.entrance.z !== (b.plotId === 'dock-west' ? 2 : 6) || b.z !== b.entrance.z + .5) throw new Error('Invalid pier position.');
    } else if (b.plotId !== PLOTS[i].id || b.x !== PLOTS[i].x + .5 || b.z !== PLOTS[i].z + .5 || b.entrance.x !== PLOTS[i].x || b.entrance.z !== PLOTS[i].z) throw new Error('Invalid building plot.');
    point(b.entrance); number(b.variant, 0, 5, 'architecture', true); text(b.label, 80, 'building name'); number(b.capacity, 0, 40, 'housing', true); number(b.level, 1, 5, 'floors', true); number(b.condition, 0, 100, 'condition'); number(b.vacantDays, 0, 1e9, 'vacancy', true);
    if (!['Active', 'Vacant', 'Derelict'].includes(b.state) || !Array.isArray(b.additions) || b.additions.length > 8 || b.additions.some(a => !['upper-floor', 'shopfront', 'courtyard-shed', 'converted-home', 'salvaged-roof'].includes(a))) throw new Error('Invalid building lifecycle.');
    if (b.kind !== 'home' && b.capacity !== 0) throw new Error('Invalid housing capacity.');
    number(b.progress, 0, 1, 'construction'); number(b.delivered, 0, 1, 'delivery'); number(b.founded, 0, w.tick, 'foundation', true);
    if (b.completed !== null) number(b.completed, b.founded, w.tick, 'completion', true);
    if (complete(b) !== (b.completed !== null)) throw new Error('Invalid completion stage.');
    stock(b.inventory); stock(b.materials, ['wood', 'stone']);
    if (b.project !== null) {
      const p = b.project; fields(p, ['type', 'progress', 'started', 'lastWorked', 'targetKind', 'cost', 'delivered'], 'project');
      if (!['construct', 'expand', 'convert', 'repair', 'salvage'].includes(p.type) || !Object.hasOwn(KINDS, p.targetKind)) throw new Error('Invalid project type.');
      number(p.progress, 0, 1, 'project progress'); number(p.started, 0, w.tick, 'project start', true); number(p.lastWorked, 0, w.tick, 'last work', true); stock(p.cost, ['wood', 'stone']); stock(p.delivered, ['wood', 'stone']);
      if (p.delivered.wood > p.cost.wood + .00001 || p.delivered.stone > p.cost.stone + .00001 || (p.type === 'construct' && complete(b))) throw new Error('Invalid project materials.');
      const expectedCost = projectCost(p.targetKind, p.type);
      if (p.cost.wood !== expectedCost.wood || p.cost.stone !== expectedCost.stone || (p.type !== 'convert' && p.targetKind !== b.kind)) throw new Error('Invalid project plan.');
      if (p.type === 'construct' ? complete(b) || p.progress !== b.progress : !complete(b)) throw new Error('Invalid project stage.');
      if (p.type === 'expand' && (b.level >= (b.kind === 'home' ? 5 : 3) || b.state === 'Derelict')) throw new Error('Building cannot take another addition.');
      if (p.type === 'convert' && (p.targetKind !== 'home' || b.kind === 'dock' || occupants(w, b.id) > 0)) throw new Error('Invalid adaptive reuse.');
      if (p.type === 'salvage' && (b.state !== 'Derelict' || occupants(w, b.id) > 0 || b.additions.includes('salvaged-roof'))) throw new Error('Invalid salvage plan.');
    } else if (!complete(b)) throw new Error('Missing construction project.');
    bIds.add(b.id);
  }
  const pIds = new Set(), roles = ['Child', 'Builder', 'Farmer', 'Forester', 'Mason', 'Craftsperson', 'Carrier', 'Healer'];
  for (const p of w.people) {
    fields(p, ['id', 'name', 'homeId', 'workId', 'role', 'age', 'born', 'lifespan', 'parentIds', 'partnerId', 'children', 'x', 'z', 'hunger', 'energy', 'health', 'social', 'sociability', 'diligence', 'speed', 'destinationId', 'task', 'route', 'routeIndex', 'harvest', 'walked', 'job', 'cargo', 'mode', 'experience'], 'resident');
    if (typeof p.id !== 'string' || !/^resident-[1-9]\d{0,9}$/.test(p.id) || serial(p.id) >= w.nextPerson || pIds.has(p.id) || !bIds.has(p.homeId) || building(w, p.homeId).kind !== 'home' || !complete(building(w, p.homeId)) || !bIds.has(p.destinationId) || p.workId !== null && !bIds.has(p.workId) || !roles.includes(p.role)) throw new Error('Invalid resident reference.');
    text(p.name, 64, 'name'); text(p.task, 80, 'task'); for (const k of ['hunger', 'energy', 'health', 'social']) number(p[k], 0, 100, k);
    number(p.x, -20, 30, 'position'); number(p.z, -20, 30, 'position'); number(p.age, 0, 100000, 'age', true); number(p.born, 0, w.tick, 'birth', true); number(p.lifespan, 100, 250, 'lifespan', true); number(p.children, 0, 4, 'children', true);
    number(p.sociability, .5, 1, 'sociability'); number(p.diligence, .7, 1.3, 'diligence'); number(p.speed, .1, .4, 'speed'); number(p.harvest, 0, 100, 'harvest'); number(p.walked, 0, 1e12, 'walked distance');
    if (!['porter', 'cart', 'barge'].includes(p.mode) || !Array.isArray(p.parentIds) || p.parentIds.length > 2 || p.parentIds.some(id => typeof id !== 'string' || !/^resident-[1-9]\d{0,9}$/.test(id)) || p.partnerId !== null && typeof p.partnerId !== 'string') throw new Error('Invalid family or transport.');
    if (!Array.isArray(p.route) || p.route.length > 10) throw new Error('Invalid route.'); p.route.forEach(point); number(p.routeIndex, 0, Math.max(0, p.route.length - 1), 'route index', true);
    fields(p.experience, ['deliveries', 'meanTrip'], 'experience'); number(p.experience.deliveries, 0, 1e10, 'experience count', true); number(p.experience.meanTrip, 0, 1e10, 'trip estimate');
    if (p.job !== null) {
      if (p.job.kind === 'build') { fields(p.job, ['kind', 'destinationId'], 'work assignment'); if (!bIds.has(p.job.destinationId)) throw new Error('Invalid work target.'); }
      else { fields(p.job, ['kind', 'shipmentId', 'stage', 'elapsed'], 'cargo assignment'); if (p.job.kind !== 'haul' || typeof p.job.shipmentId !== 'string' || !['pickup', 'load', 'river', 'deliver', 'unload', 'recover'].includes(p.job.stage)) throw new Error('Invalid cargo assignment.'); number(p.job.elapsed, 0, 10000, 'loading time', true); }
    }
    if (p.cargo !== null) { fields(p.cargo, ['resource', 'amount', 'sourceId', 'destinationId'], 'carried cargo'); if (!RESOURCES.includes(p.cargo.resource) || !bIds.has(p.cargo.sourceId) || !bIds.has(p.cargo.destinationId)) throw new Error('Invalid cargo references.'); number(p.cargo.amount, 0, 30, 'carried load'); }
    pIds.add(p.id);
  }
  for (const p of w.people) if (p.partnerId !== null && (!pIds.has(p.partnerId) || p.partnerId === p.id || w.people.find(q => q.id === p.partnerId)?.partnerId !== p.id)) throw new Error('Invalid partner.');
  if (homes(w).some(h => occupants(w, h.id) > h.capacity)) throw new Error('A household exceeds capacity.');
  const sIds = new Set();
  for (const s of w.shipments) {
    fields(s, ['id', 'resource', 'amount', 'sourceId', 'destinationId', 'carrierId', 'mode', 'context', 'state', 'loaded', 'created', 'projectStarted', 'x', 'z', 'onRiver'], 'shipment');
    if (typeof s.id !== 'string' || !/^shipment-[1-9]\d{0,9}$/.test(s.id) || serial(s.id) >= w.nextShipment || sIds.has(s.id) || !RESOURCES.includes(s.resource) || !bIds.has(s.sourceId) || !bIds.has(s.destinationId) || s.sourceId === s.destinationId || s.carrierId !== null && !pIds.has(s.carrierId)) throw new Error('Invalid shipment reference.');
    if (!['porter', 'cart', 'barge'].includes(s.mode) || !['local', 'long', 'crossing'].includes(s.context) || !['reserved', 'loading', 'transit', 'unloading', 'stranded'].includes(s.state) || typeof s.loaded !== 'boolean' || typeof s.onRiver !== 'boolean') throw new Error('Invalid shipment state.');
    number(s.amount, .000001, 30, 'load'); number(s.created, 0, w.tick, 'shipment time', true); number(s.x, -20, 30, 'cargo position'); number(s.z, -20, 30, 'cargo position'); if (s.projectStarted !== null) number(s.projectStarted, 0, w.tick, 'cargo project', true);
    const carrier = s.carrierId && w.people.find(p => p.id === s.carrierId);
    if (carrier && (carrier.job?.kind !== 'haul' || carrier.job.shipmentId !== s.id || Boolean(carrier.cargo) !== s.loaded && carrier.job.stage !== 'recover')) throw new Error('Cargo and worker disagree.');
    if (carrier?.cargo && (carrier.cargo.resource !== s.resource || carrier.cargo.amount !== s.amount || carrier.cargo.sourceId !== s.sourceId || carrier.cargo.destinationId !== s.destinationId)) throw new Error('Carried load disagrees with shipment.');
    if (s.loaded !== ['transit', 'unloading', 'stranded'].includes(s.state) || s.onRiver && s.mode !== 'barge') throw new Error('Cargo phase disagrees with inventory.');
    if (!carrier && s.state !== 'stranded') throw new Error('Unassigned cargo is not recoverable.'); sIds.add(s.id);
  }
  for (const p of w.people) {
    if (p.job?.kind === 'haul' && !w.shipments.some(s => s.id === p.job.shipmentId && s.carrierId === p.id)) throw new Error('Missing or multiply assigned shipment.');
    if (p.cargo && p.job?.kind !== 'haul') throw new Error('Carried goods have no shipment.');
  }
  for (const b of w.buildings) for (const r of RESOURCES) if (b.inventory[r] - reservedFor(w, b, r) < -.00001) throw new Error('Inventory is over-reserved.');
  if (!w.learning || typeof w.learning !== 'object' || Array.isArray(w.learning) || Object.keys(w.learning).length > 9) throw new Error('Invalid learned policy.');
  for (const [key, e] of Object.entries(w.learning)) {
    if (!/^(local|long|crossing):(porter|cart|barge)$/.test(key)) throw new Error('Invalid learning context.'); fields(e, ['samples', 'meanDuration', 'meanAmount', 'value'], 'learned estimate'); number(e.samples, 1, 1e10, 'samples', true); number(e.meanDuration, 0, 1e10, 'duration'); number(e.meanAmount, 0, 30, 'mean load'); number(e.value, 0, 30, 'action value');
  }
  if (!Array.isArray(w.journal) || w.journal.length > LIMITS.journal || !Array.isArray(w.history) || w.history.length > LIMITS.history) throw new Error('Invalid history size.');
  let previous = 0;
  for (const e of w.journal) { fields(e, ['tick', 'type', 'text', 'entity'], 'journal'); number(e.tick, previous, w.tick, 'event time', true); previous = e.tick; text(e.type, 24, 'event type'); text(e.text, 300, 'event'); if (e.entity !== null) { fields(e.entity, ['kind', 'id'], 'event subject'); if (!['building', 'citizen'].includes(e.entity.kind)) throw new Error('Invalid subject.'); text(e.entity.id, 40, 'subject'); } }
  previous = 0;
  for (const h of w.history) { fields(h, ['day', 'population', 'buildings', 'food'], 'history'); number(h.day, previous + 1, Math.floor(w.tick / 144) + 1, 'day', true); previous = h.day; number(h.population, 0, LIMITS.people, 'population', true); number(h.buildings, 0, LIMITS.buildings, 'buildings', true); number(h.food, 0, 1e8, 'food', true); }
  const balance = resourceBalance(w);
  for (const r of RESOURCES) {
    if (Math.abs(balance.held[r] - balance.expected[r]) > .02 + Math.abs(balance.expected[r]) * 1e-8) throw new Error(`Invalid ${r} conservation ledger.`);
    if (Math.abs(w.resources[r] - w.buildings.reduce((n, b) => n + b.inventory[r], 0)) > .01) throw new Error('Stored resource summary disagrees with inventories.');
  }
  return w;
}
export function serializeColony(w, now = Date.now()) { const copy = { ...w, savedAt: now }; validateColony(copy); return JSON.stringify(copy); }
export function deserializeColony(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_BYTES) throw new Error('Choose a living-world save smaller than 2 MB.');
  let w; try { w = JSON.parse(raw); } catch { throw new Error('The save is not valid JSON.'); }
  if (w?.schema === 2) w = migrateColony(w);
  return validateColony(w);
}
export function elapsedTicks(savedAt, now = Date.now()) {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now)) return 0;
  // shortcut: seven days of catch-up bounds local recovery; continuous closed-page life needs hosting.
  return Math.floor(clamp((now - savedAt) / 1000, 0, 7 * 86400) * TICKS_PER_SECOND);
}
