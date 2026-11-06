// A tick is ten fictional minutes. The world has no final day or playback state.
export const TICKS_PER_DAY = 144;
export const TICKS_PER_SECOND = 2;
export const LIMITS = Object.freeze({ people: 512, buildings: 256, history: 90, journal: 80 });
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const names = ['Amara', 'Theo', 'Maya', 'Felix', 'Nora', 'Jules', 'Iris', 'Leo', 'Zara', 'Eli', 'Ada', 'Kai', 'Luca', 'Anika', 'Owen', 'Mila', 'Noah', 'Aria', 'Sage', 'Hugo', 'Cleo', 'Ravi', 'Lina', 'Ezra', 'Yuna', 'Finn', 'Esme', 'Remy', 'Alma', 'Lior', 'Nina', 'Ishan', 'Sofia', 'Atlas', 'June', 'Mateo', 'Ines', 'Arlo', 'Rhea', 'Emil', 'Tara', 'Otis', 'Vera', 'Ari', 'Mira', 'Kian', 'Lena', 'Sami'];
export const KINDS = Object.freeze({
  home: { label: 'House', wood: 26, stone: 12, labor: 70, jobs: 0 },
  farm: { label: 'Farm', wood: 20, stone: 6, labor: 65, jobs: 6 },
  forestry: { label: 'Woodland lodge', wood: 12, stone: 8, labor: 55, jobs: 5 },
  quarry: { label: 'Stone yard', wood: 16, stone: 5, labor: 60, jobs: 5 },
  workshop: { label: 'Workshop', wood: 32, stone: 22, labor: 90, jobs: 5 },
  shop: { label: 'Storehouse', wood: 25, stone: 18, labor: 75, jobs: 4 },
  park: { label: 'Common garden', wood: 8, stone: 8, labor: 45, jobs: 0 },
  hospital: { label: 'Care house', wood: 35, stone: 28, labor: 110, jobs: 4 },
});
export const PLOTS = Object.freeze(Array.from({ length: 28 * 26 }, (_, i) => ({ x: i % 28 - 9, z: Math.floor(i / 28) - 9 }))
  .filter(p => p.x !== 4 && p.x !== 5)
  .sort((a, b) => Math.hypot(a.x - 2, a.z - 4) - Math.hypot(b.x - 2, b.z - 4) || a.z - b.z || a.x - b.x)
  .slice(0, LIMITS.buildings).map((p, i) => Object.freeze({ ...p, id: `plot-${i + 1}` })));

function random(w) {
  w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
  return w.rng / 4294967296;
}
function note(w, type, text, entity = null) {
  w.journal.push({ tick: w.tick, type, text, entity });
  if (w.journal.length > LIMITS.journal) w.journal.shift();
}
const complete = b => b.progress >= 1;
const building = (w, id) => w.buildings.find(b => b.id === id);
const homes = w => w.buildings.filter(b => b.kind === 'home' && complete(b));
export const housing = w => homes(w).reduce((n, b) => n + b.capacity, 0);
const occupants = (w, id) => w.people.filter(p => p.homeId === id).length;
function vacantHome(w) { return homes(w).find(b => occupants(w, b.id) < b.capacity); }
function addBuilding(w, kind, ready = false) {
  if (w.buildings.length >= LIMITS.buildings) return null;
  const cost = KINDS[kind];
  if (!ready && (w.resources.wood < cost.wood || w.resources.stone < cost.stone)) return null;
  const plot = PLOTS[w.buildings.length];
  const variant = Math.floor(random(w) * 6);
  const b = { id: `place-${w.buildings.length + 1}`, plotId: plot.id, kind, variant,
    label: `${KINDS[kind].label} ${w.buildings.length + 1}`, x: plot.x + .5, z: plot.z + .5,
    entrance: { x: plot.x, z: plot.z }, capacity: kind === 'home' ? 4 + variant : 0,
    progress: ready ? 1 : 0, delivered: ready ? 1 : 0, founded: w.tick, completed: ready ? w.tick : null };
  if (!ready) { w.resources.wood -= cost.wood; w.resources.stone -= cost.stone; }
  w.buildings.push(b);
  if (!ready) note(w, 'construction', `Residents broke ground on ${b.label.toLowerCase()}. Materials reserved; carriers and builders are needed.`, { kind: 'building', id: b.id });
  return b;
}
function addPerson(w, home, source, parentIds = []) {
  if (!home || w.people.length >= LIMITS.people) return null;
  const serial = w.nextPerson++;
  const age = source === 'birth' ? 0 : 18 + Math.floor(random(w) * 38);
  const p = { id: `resident-${serial}`, name: `${names[(serial - 1) % names.length]}${serial > names.length ? ` ${Math.floor((serial - 1) / names.length) + 1}` : ''}`,
    homeId: home.id, workId: null, role: age < 12 ? 'Child' : 'Builder', age, born: w.tick,
    lifespan: 105 + Math.floor(random(w) * 60), parentIds, partnerId: null, children: 0,
    x: source === 'arrival' ? 6 : home.entrance.x, z: source === 'arrival' ? 6 : home.entrance.z,
    hunger: 18 + random(w) * 12, energy: 75 + random(w) * 22, health: 95, social: 70,
    sociability: .5 + random(w) * .5, diligence: .7 + random(w) * .6, speed: .11 + random(w) * .055,
    destinationId: home.id, task: source === 'arrival' ? 'Moving in' : 'Resting at home', route: [], routeIndex: 0, harvest: 0 };
  w.people.push(p);
  if (source === 'arrival') { w.totals.arrivals++; note(w, 'arrival', `${p.name} arrived and found a home in ${home.label.toLowerCase()}.`, { kind: 'citizen', id: p.id }); }
  if (source === 'birth') { w.totals.births++; note(w, 'birth', `${p.name} was born. A new generation is taking root.`, { kind: 'citizen', id: p.id }); }
  return p;
}

export function createColony(seed = 731, now = Date.now()) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Invalid world seed.');
  const w = { schema: 2, seed, rng: seed >>> 0, tick: 0, savedAt: now, nextPerson: 1,
    resources: { food: 280, wood: 150, stone: 100, tools: 45 }, buildings: [], people: [], journal: [], history: [],
    weather: 'Clear', totals: { births: 0, arrivals: 0, deaths: 0, completed: 0 }, lastBirth: -144 };
  ['home', 'farm', 'home', 'forestry', 'home', 'quarry', 'workshop', 'home', 'shop', 'home', 'park', 'home'].forEach(k => addBuilding(w, k, true));
  for (let i = 0; i < 24; i++) addPerson(w, vacantHome(w), 'founder');
  addBuilding(w, 'home');
  assignJobs(w); pairHouseholds(w);
  note(w, 'founding', 'Twenty-four people settled beside the river. Their needs, work and choices will shape what grows here.');
  return w;
}

function assignJobs(w) {
  const adults = w.people.filter(p => p.age >= 12);
  const n = adults.length, assigned = new Map();
  const quotas = { Farmer: Math.ceil(n * (w.resources.food < w.people.length * 3 ? .42 : .27)), Forester: Math.ceil(n * .14), Mason: Math.ceil(n * .12), Craftsperson: Math.ceil(n * .08), Carrier: Math.max(1, Math.ceil(n * .08)), Healer: Math.ceil(n * .04) };
  const kinds = { Farmer: 'farm', Forester: 'forestry', Mason: 'quarry', Craftsperson: 'workshop', Carrier: 'shop', Healer: 'hospital' };
  const counts = {};
  for (const p of adults) {
    let role = 'Builder', work = null;
    for (const r of Object.keys(quotas)) {
      if ((counts[r] || 0) >= quotas[r]) continue;
      const home = building(w, p.homeId).entrance;
      const place = w.buildings.filter(b => b.kind === kinds[r] && complete(b) && (assigned.get(b.id) || 0) < KINDS[b.kind].jobs)
        .sort((a, b) => Math.abs(a.entrance.x - home.x) + Math.abs(a.entrance.z - home.z) - Math.abs(b.entrance.x - home.x) - Math.abs(b.entrance.z - home.z))[0];
      if (place) { role = r; work = place; break; }
    }
    p.role = role; p.workId = work?.id || null;
    counts[role] = (counts[role] || 0) + 1;
    if (work) assigned.set(work.id, (assigned.get(work.id) || 0) + 1);
  }
}
function pairHouseholds(w) {
  for (const home of homes(w)) {
    const singles = w.people.filter(p => p.homeId === home.id && p.age >= 18 && !p.partnerId);
    for (let i = 0; i + 1 < singles.length; i += 2) {
      singles[i].partnerId = singles[i + 1].id; singles[i + 1].partnerId = singles[i].id;
    }
  }
}
function nearest(w, person, predicate) {
  let best = null, distance = Infinity;
  for (const b of w.buildings) if (predicate(b)) {
    const d = Math.abs(person.x - b.entrance.x) + Math.abs(person.z - b.entrance.z);
    if (d < distance) { distance = d; best = b; }
  }
  return best;
}
function routeTo(person, target) {
  const path = [{ x: person.x, z: person.z }];
  let x = Math.round(person.x), z = Math.round(person.z);
  if (x === 5) x = person.x < 5 ? 4 : 6;
  path.push({ x, z: person.z }, { x, z });
  const end = target.entrance;
  if ((x < 5) !== (end.x < 5)) {
    const bridge = Math.abs(z - 2) + Math.abs(end.z - 2) < Math.abs(z - 6) + Math.abs(end.z - 6) ? 2 : 6;
    path.push({ x, z: bridge }, { x: end.x, z: bridge }); z = bridge; x = end.x;
  }
  path.push({ x: end.x, z }, { x: end.x, z: end.z });
  return path.filter((p, i) => i === 0 || p.x !== path[i - 1].x || p.z !== path[i - 1].z);
}
function chooseTask(w, p) {
  const hour = (w.tick % TICKS_PER_DAY) / 6;
  let target = building(w, p.homeId), task = 'Resting at home';
  if ((p.hunger > 55 || (p.task === 'Having lunch' && p.hunger > 12) || (hour >= 12 && hour < 13.5)) && w.resources.food > 0) {
    target = nearest(w, p, b => complete(b) && ['shop', 'farm'].includes(b.kind)) || target; task = 'Having lunch';
  } else if (p.health < 60 && hour > 7 && hour < 20) {
    target = nearest(w, p, b => b.kind === 'hospital' && complete(b)) || target; task = 'Receiving care';
  } else if (hour >= 6 + (Number(p.id.split('-')[1]) % 6) / 6 && hour < 17 && p.energy > 20 && p.age >= 12) {
    if (p.role === 'Builder') {
      target = nearest(w, p, b => !complete(b) && b.delivered >= 1) || target;
      task = target.progress < 1 ? 'Building' : 'Resting between projects';
    } else if (p.role === 'Carrier') {
      target = nearest(w, p, b => !complete(b) && b.delivered < 1) || building(w, p.workId) || target;
      task = target.progress < 1 ? 'Hauling materials' : 'Stocking the storehouse';
    } else { target = building(w, p.workId) || target; task = ({ Farmer: 'Growing food', Forester: 'Gathering timber', Mason: 'Quarrying stone', Craftsperson: 'Crafting tools', Healer: 'Caring for neighbors' })[p.role] || 'Resting between projects'; }
  } else if (hour >= 17 && hour < 21 && p.energy > 25) {
    target = nearest(w, p, b => b.kind === 'park' && complete(b)) || target; task = p.age < 12 ? 'Playing' : 'Socializing';
  }
  if (target.id !== p.destinationId || p.route.length === 0) {
    p.destinationId = target.id; p.route = routeTo(p, target); p.routeIndex = 0;
  }
  p.task = task;
}
function move(p) {
  let distance = p.speed;
  while (distance > .000001 && p.routeIndex < p.route.length - 1) {
    const next = p.route[p.routeIndex + 1], d = Math.abs(next.x - p.x) + Math.abs(next.z - p.z);
    if (d <= distance) { p.x = next.x; p.z = next.z; p.routeIndex++; distance -= d; }
    else { p.x += (next.x - p.x) * distance / d; p.z += (next.z - p.z) * distance / d; distance = 0; }
  }
}
function workAndNeeds(w, p) {
  const arrived = p.routeIndex >= p.route.length - 1, task = arrived ? p.task : 'Walking';
  p.hunger = clamp(p.hunger + .24, 0, 100);
  p.energy = clamp(p.energy + (task === 'Resting at home' ? 1.15 : ['Socializing', 'Playing', 'Resting between projects'].includes(task) ? .12 : -.22), 0, 100);
  p.social = clamp(p.social + (['Socializing', 'Playing', 'Resting at home'].includes(task) ? p.sociability * .55 : -.13), 0, 100);
  if (task === 'Having lunch') {
    const eaten = Math.min(w.resources.food, .65); w.resources.food -= eaten; p.hunger = clamp(p.hunger - eaten * 14, 0, 100);
  }
  const receivingCare = task === 'Receiving care' && w.people.some(q => q.role === 'Healer' && q.destinationId === p.destinationId && q.task === 'Caring for neighbors' && q.routeIndex >= q.route.length - 1);
  p.health = clamp(p.health + (p.hunger > 88 ? -.8 : p.energy < 8 ? -.3 : .035) + (receivingCare ? .8 : 0), 0, 100);
  if (!arrived) return;
  const factor = p.diligence * (p.energy > 20 ? 1 : .4) * (p.hunger < 85 ? 1 : .35);
  const cap = Math.max(500, w.people.length * 24);
  if (task === 'Growing food') w.resources.food = Math.min(cap, w.resources.food + factor * (w.weather === 'Drought' ? .24 : w.weather === 'Rain' ? .9 : .7));
  if (task === 'Gathering timber') w.resources.wood = Math.min(cap, w.resources.wood + factor * .25);
  if (task === 'Quarrying stone') w.resources.stone = Math.min(cap, w.resources.stone + factor * .22);
  if (task === 'Crafting tools' && w.resources.wood >= .06 && w.resources.stone >= .04) {
    w.resources.wood -= .06; w.resources.stone -= .04; w.resources.tools = Math.min(cap, w.resources.tools + .09 * factor);
  }
  const site = building(w, p.destinationId);
  if (task === 'Hauling materials' && site && !complete(site)) site.delivered = Math.min(1, site.delivered + .08 * factor);
  if (task === 'Building' && site && !complete(site) && site.delivered >= 1) {
    site.progress = Math.min(1, site.progress + factor * (w.resources.tools > 0 ? 1.35 : .65) / KINDS[site.kind].labor);
    w.resources.tools = Math.max(0, w.resources.tools - .015);
    if (complete(site)) {
      site.completed = w.tick; w.totals.completed++;
      note(w, 'completion', `${site.label} is finished. ${site.kind === 'home' ? `${site.capacity} new beds are ready for a growing household.` : 'Neighbors can now work and gather here.'}`, { kind: 'building', id: site.id });
      assignJobs(w);
    }
  }
}
function plan(w) {
  if (w.buildings.filter(b => !complete(b)).length >= 2) return;
  const n = w.people.length;
  const count = kind => w.buildings.filter(b => b.kind === kind).length;
  let kind;
  const reservedBeds = w.buildings.filter(b => b.kind === 'home').reduce((s, b) => s + b.capacity, 0);
  if (reservedBeds < n + Math.max(6, n * .2)) kind = 'home';
  else if (count('farm') * 6 < Math.ceil(n * .27)) kind = 'farm';
  else if (count('forestry') * 5 < Math.ceil(n * .14)) kind = 'forestry';
  else if (count('quarry') * 5 < Math.ceil(n * .12)) kind = 'quarry';
  else if (count('workshop') * 5 < Math.ceil(n * .08)) kind = 'workshop';
  else if (count('shop') * 4 < Math.ceil(n * .08)) kind = 'shop';
  else if (count('hospital') < Math.ceil(n / 70)) kind = 'hospital';
  else if (count('park') < Math.ceil(n / 45)) kind = 'park';
  else if (w.resources.food < n * 3 && count('farm') < Math.ceil(n / 12)) kind = 'farm';
  if (kind) addBuilding(w, kind);
}
function dailyLife(w) {
  const day = Math.floor(w.tick / TICKS_PER_DAY);
  const season = Math.floor(day / 12) % 4;
  const roll = random(w); w.weather = roll < (season === 2 ? .2 : .08) ? 'Drought' : roll < .4 ? 'Rain' : 'Clear';
  note(w, 'weather', `${['Spring', 'Summer', 'Autumn', 'Winter'][season]} day ${day + 1}. ${w.weather === 'Drought' ? 'Dry weather slows the farms.' : w.weather === 'Rain' ? 'Rain is helping crops grow.' : 'Clear skies over the settlement.'}`);
  for (const p of w.people) p.age++;
  const deaths = w.people.filter(p => p.age >= p.lifespan || p.health <= 0);
  for (const p of deaths) {
    w.totals.deaths++;
    note(w, 'life', `${p.name} died ${p.health <= 0 ? 'after prolonged hardship' : 'in old age'}. Their household carries on.`);
    w.people.forEach(other => { if (other.partnerId === p.id) other.partnerId = null; });
  }
  const deadIds = new Set(deaths.map(p => p.id)); w.people = w.people.filter(p => !deadIds.has(p.id));
  if (day % 4 === 0 && w.resources.food > w.people.length * 2) {
    pairHouseholds(w);
    const parents = w.people.find(p => p.partnerId && p.age >= 20 && p.age < 85 && p.children < 3 && occupants(w, p.homeId) < building(w, p.homeId).capacity);
    if (parents) {
      const partner = w.people.find(p => p.id === parents.partnerId);
      if (partner && addPerson(w, building(w, parents.homeId), 'birth', [parents.id, partner.id])) { parents.children++; partner.children++; w.lastBirth = w.tick; }
    }
  }
  if (w.resources.food > Math.max(25, w.people.length * 1.5) && (!w.people.length || wellbeing(w) > 48)) {
    const arrivals = 2 + Math.floor(random(w) * 3);
    for (let i = 0; i < arrivals; i++) addPerson(w, vacantHome(w), 'arrival');
  }
  // Adult children establish a new household when spare housing becomes available.
  for (const p of w.people) if (p.age >= 18 && p.parentIds.length && !p.partnerId && occupants(w, p.homeId) > 2) {
    const home = homes(w).find(h => occupants(w, h.id) === 0);
    if (home) { p.homeId = home.id; p.partnerId = null; note(w, 'household', `${p.name} established a new household.`, { kind: 'citizen', id: p.id }); }
  }
  pairHouseholds(w); assignJobs(w);
  w.history.push({ day: day + 1, population: w.people.length, buildings: w.buildings.filter(complete).length, food: Math.round(w.resources.food) });
  if (w.history.length > LIMITS.history) w.history.shift();
}
export function wellbeing(w) {
  return w.people.length ? w.people.reduce((s, p) => s + p.health * .4 + p.energy * .2 + (100 - p.hunger) * .25 + p.social * .15, 0) / w.people.length : 0;
}
export function stepColony(w, ticks = 1) {
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > 100000) throw new Error('Invalid step count.');
  for (let i = 0; i < ticks; i++) {
    w.tick++;
    if (w.tick % TICKS_PER_DAY === 0) dailyLife(w);
    if (w.tick % 18 === 0) plan(w);
    for (const p of w.people) { chooseTask(w, p); move(p); workAndNeeds(w, p); }
  }
  return w;
}
export function snapshotColony(w) {
  return {
    tick: w.tick, clock: w.tick % TICKS_PER_DAY, day: Math.floor(w.tick / TICKS_PER_DAY) + 1,
    season: ['Spring', 'Summer', 'Autumn', 'Winter'][Math.floor(w.tick / TICKS_PER_DAY / 12) % 4], weather: w.weather,
    buildings: w.buildings.map(b => ({ ...b, entrance: { ...b.entrance } })),
    citizens: w.people.map(p => ({ ...p, status: p.routeIndex < p.route.length - 1 ? `Walking · ${p.task.toLowerCase()}` : p.task,
      wellbeing: p.health * .4 + p.energy * .2 + (100 - p.hunger) * .25 + p.social * .15,
      route: [{ x: p.x, z: p.z }, ...p.route.slice(p.routeIndex + 1)] })),
    effects: {}, metrics: { wellbeing: wellbeing(w), supply: w.resources.food, power: 100, travel: 0, treasury: 0 },
    resources: { ...w.resources }, capacity: housing(w), totals: { ...w.totals }, log: w.journal.map(e => ({ ...e })), history: w.history.map(h => ({ ...h })),
  };
}
export function clockLabel(tick) {
  const mins = (tick % TICKS_PER_DAY) * 10;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function number(n, min, max, label, integer = false) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`Invalid ${label}.`);
}
function fields(o, keys, label) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(o, k))) throw new Error(`Invalid ${label} fields.`);
}
function text(s, max, label) { if (typeof s !== 'string' || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) throw new Error(`Invalid ${label}.`); }
function point(p) { fields(p, ['x', 'z'], 'route point'); number(p.x, -20, 30, 'position'); number(p.z, -20, 30, 'position'); }
export function validateColony(w) {
  fields(w, ['schema', 'seed', 'rng', 'tick', 'savedAt', 'nextPerson', 'resources', 'buildings', 'people', 'journal', 'history', 'weather', 'totals', 'lastBirth'], 'world');
  if (w.schema !== 2) throw new Error('Choose a living-world save. Earlier timeline exports stay compatible with the earlier game.');
  for (const k of ['seed', 'rng']) number(w[k], 0, 4294967295, k, true);
  number(w.tick, 0, 1e10, 'world age', true); number(w.savedAt, 0, 1e15, 'save time'); number(w.nextPerson, 1, 1e10, 'resident sequence', true); number(w.lastBirth, -144, w.tick, 'birth time', true);
  if (!['Clear', 'Rain', 'Drought'].includes(w.weather)) throw new Error('Invalid weather.');
  fields(w.resources, ['food', 'wood', 'stone', 'tools'], 'resources'); Object.values(w.resources).forEach(n => number(n, 0, 1e8, 'resource'));
  fields(w.totals, ['births', 'arrivals', 'deaths', 'completed'], 'totals'); Object.values(w.totals).forEach(n => number(n, 0, 1e10, 'total', true));
  if (!Array.isArray(w.buildings) || w.buildings.length < 12 || w.buildings.length > LIMITS.buildings || !Array.isArray(w.people) || w.people.length > LIMITS.people) throw new Error('Invalid settlement size.');
  const bIds = new Set();
  w.buildings.forEach((b, i) => {
    fields(b, ['id', 'plotId', 'kind', 'variant', 'label', 'x', 'z', 'entrance', 'capacity', 'progress', 'delivered', 'founded', 'completed'], 'building');
    if (b.id !== `place-${i + 1}` || b.plotId !== PLOTS[i].id || !Object.hasOwn(KINDS, b.kind) || b.x !== PLOTS[i].x + .5 || b.z !== PLOTS[i].z + .5) throw new Error('Invalid building plot.');
    point(b.entrance); if (b.entrance.x !== PLOTS[i].x || b.entrance.z !== PLOTS[i].z) throw new Error('Invalid entrance.');
    number(b.variant, 0, 5, 'architecture', true); text(b.label, 80, 'building name'); number(b.capacity, 0, 9, 'capacity', true);
    if (b.capacity !== (b.kind === 'home' ? 4 + b.variant : 0)) throw new Error('Invalid housing capacity.');
    number(b.progress, 0, 1, 'construction'); number(b.delivered, 0, 1, 'delivery'); number(b.founded, 0, w.tick, 'foundation time', true);
    if (b.completed !== null) number(b.completed, b.founded, w.tick, 'completion', true);
    if ((b.progress === 1) !== (b.completed !== null) || (b.progress === 1 && b.delivered !== 1)) throw new Error('Invalid construction stage.');
    bIds.add(b.id);
  });
  const pIds = new Set(), roles = ['Child', 'Builder', 'Farmer', 'Forester', 'Mason', 'Craftsperson', 'Carrier', 'Healer'];
  w.people.forEach(p => {
    fields(p, ['id', 'name', 'homeId', 'workId', 'role', 'age', 'born', 'lifespan', 'parentIds', 'partnerId', 'children', 'x', 'z', 'hunger', 'energy', 'health', 'social', 'sociability', 'diligence', 'speed', 'destinationId', 'task', 'route', 'routeIndex', 'harvest'], 'resident');
    if (typeof p.id !== 'string' || !/^resident-[1-9]\d{0,9}$/.test(p.id) || Number(p.id.split('-')[1]) >= w.nextPerson || pIds.has(p.id) || !bIds.has(p.homeId) || building(w, p.homeId).kind !== 'home' || !complete(building(w, p.homeId)) || !bIds.has(p.destinationId) || (p.workId !== null && !bIds.has(p.workId)) || !roles.includes(p.role)) throw new Error('Invalid resident reference.');
    text(p.name, 64, 'name'); text(p.task, 64, 'task'); if (!p.name) throw new Error('Missing name.');
    for (const k of ['hunger', 'energy', 'health', 'social']) number(p[k], 0, 100, k);
    number(p.x, -20, 30, 'position'); number(p.z, -20, 30, 'position'); number(p.age, 0, 100000, 'age', true); number(p.born, 0, w.tick, 'birth', true);
    number(p.lifespan, 100, 170, 'lifespan', true); number(p.children, 0, 3, 'children', true);
    number(p.sociability, .5, 1, 'sociability'); number(p.diligence, .7, 1.3, 'diligence'); number(p.speed, .1, .2, 'speed'); number(p.harvest, 0, 100, 'harvest');
    if (!Array.isArray(p.parentIds) || p.parentIds.length > 2 || p.parentIds.some(id => typeof id !== 'string' || !/^resident-[1-9]\d{0,9}$/.test(id)) || (p.partnerId !== null && typeof p.partnerId !== 'string')) throw new Error('Invalid family.');
    if (!Array.isArray(p.route) || p.route.length > 10) throw new Error('Invalid route.'); p.route.forEach(point); number(p.routeIndex, 0, Math.max(0, p.route.length - 1), 'route index', true); pIds.add(p.id);
  });
  for (const p of w.people) if (p.partnerId !== null && (!pIds.has(p.partnerId) || p.partnerId === p.id || w.people.find(q => q.id === p.partnerId)?.partnerId !== p.id)) throw new Error('Invalid partner.');
  if (homes(w).some(h => occupants(w, h.id) > h.capacity)) throw new Error('A household exceeds its capacity.');
  if (!Array.isArray(w.journal) || w.journal.length > LIMITS.journal || !Array.isArray(w.history) || w.history.length > LIMITS.history) throw new Error('Invalid world history.');
  let previous = -1;
  for (const e of w.journal) {
    fields(e, ['tick', 'type', 'text', 'entity'], 'journal'); number(e.tick, Math.max(0, previous), w.tick, 'event time', true); previous = e.tick; text(e.type, 24, 'event type'); text(e.text, 300, 'event');
    if (e.entity !== null) { fields(e.entity, ['kind', 'id'], 'event subject'); if (!['building', 'citizen'].includes(e.entity.kind)) throw new Error('Invalid subject.'); text(e.entity.id, 40, 'subject'); }
  }
  let lastDay = 0;
  for (const h of w.history) { fields(h, ['day', 'population', 'buildings', 'food'], 'history'); number(h.day, lastDay + 1, Math.floor(w.tick / 144) + 1, 'day', true); lastDay = h.day; number(h.population, 0, LIMITS.people, 'population', true); number(h.buildings, 0, LIMITS.buildings, 'buildings', true); number(h.food, 0, 1e8, 'food', true); }
  return w;
}
export function serializeColony(w, now = Date.now()) { const copy = { ...w, savedAt: now }; validateColony(copy); return JSON.stringify(copy); }
export function deserializeColony(raw) {
  if (typeof raw !== 'string' || raw.length > 2 * 1024 * 1024) throw new Error('Choose a living-world JSON save smaller than 2 MB.');
  let w; try { w = JSON.parse(raw); } catch { throw new Error('The save is not valid JSON.'); }
  return validateColony(w);
}
export function elapsedTicks(savedAt, now = Date.now()) {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now)) return 0;
  // shortcut: seven days of unattended growth per return bounds recovery work; use a server for continuous hosting.
  return Math.floor(clamp((now - savedAt) / 1000, 0, 7 * 86400) * TICKS_PER_SECOND);
}
