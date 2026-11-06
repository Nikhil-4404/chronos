const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const traveling = /commuting|walking|heading/i;

export function npcDisplayOffset(index) {
  return { x: ((index % 7) - 3) * 0.3, z: (Math.floor(index / 7) - 3) * 0.3 };
}

export function blocksStreetView(tree, camera, subject) {
  const dx = subject.x - camera.x, dz = subject.z - camera.z;
  const lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return false;
  const fraction = ((tree.x - camera.x) * dx + (tree.z - camera.z) * dz) / lengthSquared;
  return fraction >= 0 && fraction <= 1 && Math.hypot(tree.x - camera.x - dx * fraction, tree.z - camera.z - dz * fraction) < Math.max(tree.sx, tree.sz) + 0.35;
}

export function sampleNpcPose(person, nextPerson, alpha = 0, tick = 0) {
  const fraction = typeof alpha === 'number' && !Number.isNaN(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
  const x = finite(person?.x);
  const z = finite(person?.z);
  const nextX = finite(nextPerson?.x, x);
  const nextZ = finite(nextPerson?.z, z);
  const distance = Math.hypot(nextX - x, nextZ - z);
  const status = (fraction === 1 ? nextPerson?.status : person?.status) || person?.status || '';
  const moving = distance > 0.000001 && traveling.test(fraction === 1 ? status : `${status} ${nextPerson?.status || ''}`);
  const activity = moving ? 'walking' : /interrupted/i.test(status) ? 'interrupted' : /lunch/i.test(status) ? 'eating' : /At work|Building|Gathering|Quarrying|Crafting|Growing|Hauling|Stocking|Maintaining|Caring/i.test(status) ? 'working' : /Socializing|Playing/.test(status) ? 'socializing' : 'resting';
  const target = person?.route?.[1];
  const directionX = distance > 0.000001 ? nextX - x : finite(target?.x, x) - x;
  const directionZ = distance > 0.000001 ? nextZ - z : finite(target?.z, z) - z;
  const id = typeof person?.id === 'string' ? person.id : '';
  const offset = finite(Number.parseInt(id.match(/\d+$/)?.[0], 10)) * 1.618;
  const phase = ((finite(tick) % 1024) + fraction) * 7.5 + offset;
  const stride = moving ? Math.sin(phase) : 0;
  const workMotion = activity === 'working' ? (Math.sin(phase * 0.62) + 1) / 2 : activity === 'eating' ? (Math.sin(phase * 0.34) + 1) / 2 : 0;
  return {
    x: x + (nextX - x) * fraction,
    z: z + (nextZ - z) * fraction,
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
