const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const traveling = /commuting|walking|heading/i;

export function npcVisualSeed(id) {
  if (typeof id === 'number') return Math.max(0, Math.floor(finite(id)));
  const serial = typeof id === 'string' && id.match(/\d+$/);
  if (serial) return Math.max(0, Number(serial[0]) - 1);
  let hash = 0;
  for (const character of String(id || '')) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return hash;
}

export function npcDisplayOffset(identity) {
  const index = npcVisualSeed(identity) % 49;
  return { x: ((index % 7) - 3) * 0.3, z: (Math.floor(index / 7) - 3) * 0.3 };
}

export function renderFraction(sampledAt, alpha, now, tickDurationMs = 500, playing = true) {
  const elapsed = playing ? Math.max(0, finite(now) - finite(sampledAt)) / Math.max(1, finite(tickDurationMs, 500)) : 0;
  return Math.max(0, Math.min(1, finite(alpha) + elapsed));
}

export function updateRenderSample(previous, { tick, seed, alpha = 0, sampledAt }, now) {
  const timestamp = Number.isFinite(sampledAt) ? sampledAt : null;
  const sameTick = previous?.tick === tick && previous?.seed === seed;
  // UI repainting reuses a packet; only a new authoritative sample can re-anchor that tick.
  if (sameTick && (timestamp === null || previous.sourceSampledAt !== null && timestamp <= previous.sourceSampledAt)) return previous;
  return { tick, seed, alpha: Math.max(0, Math.min(1, finite(alpha))), sampledAt: timestamp ?? finite(now), sourceSampledAt: timestamp };
}

export function smoothHeading(previous, desired, deltaSeconds, response = 12) {
  const difference = Math.atan2(Math.sin(desired - previous), Math.cos(desired - previous));
  return previous + difference * (1 - Math.exp(-Math.max(0, finite(deltaSeconds)) * response));
}

export function crossingHeight(x, z) {
  const distance = Math.min(Math.abs(z + 16), Math.abs(z - 16));
  if(distance<=1.6&&Math.abs(x)<13.3)return .13+2.315*Math.max(0,Math.min(1,(13.3-Math.abs(x))/4));
  if(Math.abs(Math.abs(x)-8)<1.35&&distance<5.6)return .13+2.315*(5.6-distance)/4;
  return 0;
}

export function npcGroundHeight(surface, size = 1) { return surface - .13 * size; }

export function riverCrew(person, nextPerson, alpha = 0) {
  const aboard = p => p?.mode === 'barge' && ['river', 'recover-river'].includes(p.job?.stage);
  return aboard(person) || alpha > 0 && (!person?.id || person.id === nextPerson?.id) && aboard(nextPerson);
}

function routePosition(person, nextX, nextZ, fraction) {
  const x = finite(person?.x), z = finite(person?.z), dx = nextX - x, dz = nextZ - z;
  if (Math.abs(dx) < .000001 || Math.abs(dz) < .000001 || !person?.route?.length) {
    return { x: x + dx * fraction, z: z + dz * fraction, dx, dz, distance: Math.hypot(dx, dz) };
  }
  const points = [{ x, z }];
  let previous = points[0], total = 0, found = false;
  for (const point of person.route) {
    const px = finite(point.x, previous.x), pz = finite(point.z, previous.z);
    const sx = px - previous.x, sz = pz - previous.z, length = Math.hypot(sx, sz);
    if (length < .000001) continue;
    const projection = ((nextX - previous.x) * sx + (nextZ - previous.z) * sz) / (length * length);
    const error = Math.hypot(previous.x + sx * projection - nextX, previous.z + sz * projection - nextZ);
    if (projection >= -.00001 && projection <= 1.00001 && error < .00001) {
      points.push({ x: nextX, z: nextZ }); total += Math.hypot(nextX - previous.x, nextZ - previous.z); found = true; break;
    }
    points.push({ x: px, z: pz }); total += length; previous = points.at(-1);
  }
  if (!found) return { x: x + dx * fraction, z: z + dz * fraction, dx, dz, distance: Math.hypot(dx, dz) };
  let remaining = total * fraction;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], sx = b.x - a.x, sz = b.z - a.z, length = Math.hypot(sx, sz);
    if (remaining <= length || i === points.length - 1) {
      const local = length ? Math.min(1, remaining / length) : 0;
      return { x: a.x + sx * local, z: a.z + sz * local, dx: sx, dz: sz, distance: total };
    }
    remaining -= length;
  }
}

export function blocksStreetView(tree, camera, subject) {
  const dx = subject.x - camera.x, dz = subject.z - camera.z;
  const lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return false;
  const fraction = ((tree.x - camera.x) * dx + (tree.z - camera.z) * dz) / lengthSquared;
  return fraction >= 0 && fraction <= 1 && Math.hypot(tree.x - camera.x - dx * fraction, tree.z - camera.z - dz * fraction) < Math.max(tree.sx, tree.sz) + 0.35;
}

export function sampleNpcPose(person, nextPerson, alpha = 0, tick = 0) {
  if (person?.id && nextPerson?.id && person.id !== nextPerson.id) nextPerson = person;
  const fraction = typeof alpha === 'number' && !Number.isNaN(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
  const x = finite(person?.x);
  const z = finite(person?.z);
  const nextX = finite(nextPerson?.x, x);
  const nextZ = finite(nextPerson?.z, z);
  const sampled = routePosition(person, nextX, nextZ, fraction);
  const distance = sampled.distance;
  const status = (fraction === 1 ? nextPerson?.status : person?.status) || person?.status || '';
  const moving = distance > 0.000001 && traveling.test(fraction === 1 ? status : `${status} ${nextPerson?.status || ''}`);
  const activity = moving ? 'walking' : /interrupted/i.test(status) ? 'interrupted' : /lunch/i.test(status) ? 'eating' : /At work|Building|Retrofitting|Salvaging|Gathering|Quarrying|Crafting|Growing|Hauling|Loading|Unloading|Stocking|Maintaining|Caring|Teaching|Sharing|Trading|Milling|Managing|Inspecting|Supplying|Welcoming/i.test(status) ? 'working' : /Socializing|Playing/.test(status) ? 'socializing' : 'resting';
  const target = person?.route?.[1];
  const directionX = distance > 0.000001 ? sampled.dx : finite(target?.x, x) - x;
  const directionZ = distance > 0.000001 ? sampled.dz : finite(target?.z, z) - z;
  const id = typeof person?.id === 'string' ? person.id : '';
  const offset = finite(Number.parseInt(id.match(/\d+$/)?.[0], 10)) * 1.618;
  const phase = ((finite(tick) % 1024) + fraction) * 7.5 + offset;
  const walked = Number.isFinite(person?.walked) ? person.walked + distance * fraction : ((finite(tick) + fraction) * finite(person?.speed, .4));
  const stride = moving ? Math.sin(walked * 20 + offset) : 0;
  const workMotion = activity === 'working' ? (Math.sin(phase * 0.62) + 1) / 2 : activity === 'eating' ? (Math.sin(phase * 0.34) + 1) / 2 : 0;
  return {
    x: sampled.x,
    z: sampled.z,
    heading: Math.atan2(directionX, directionZ),
    moving,
    activity,
    stride,
    armSwing: -stride * 0.52,
    legSwing: stride * 0.65,
    workMotion,
    bodyBob: moving ? Math.abs(stride) * 0.025 : activity === 'working' ? Math.sin(phase * 1.24) * 0.008 : 0,
  };
}
