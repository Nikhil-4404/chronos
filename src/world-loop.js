import { stepColony, snapshotColony, serializeColony, TICKS_PER_SECOND } from './colony.js';

// The same loop runs in a worker or, if workers are unavailable, on the page.
export function runWorld(world, emit, { monotonic = () => performance.now(), wall = () => Date.now(), schedule = setTimeout, cancel = clearTimeout, timeOrigin = performance.timeOrigin } = {}) {
  const initialWall = wall(), elapsed = Math.max(0, Math.min((initialWall - world.savedAt) / 1000, 7 * 86400)) * TICKS_PER_SECOND;
  let queued = Math.floor(elapsed), fractional = elapsed - queued;
  let lastMono = monotonic(), lastWall = initialWall, lastFrame = -Infinity, lastTick = -1, lastCheckpoint = -Infinity;
  let timer = null, disposed = false;
  function accountTime() {
    const mono = monotonic(), date = wall();
    const monoDelta = Math.max(0, mono - lastMono), wallDelta = Math.max(0, date - lastWall);
    // Some browsers suspend the monotonic clock during sleep; recover that elapsed wall time.
    const elapsed = wallDelta > monoDelta + 5000 ? wallDelta : monoDelta;
    fractional += Math.min(elapsed / 1000, 7 * 86400) * TICKS_PER_SECOND;
    queued += Math.floor(fractional); fractional %= 1; lastMono = mono; lastWall = date;
  }
  function checkpoint() {
    accountTime();
    return serializeColony(world, Math.max(0, wall() - (queued + fractional) / TICKS_PER_SECOND * 1000));
  }
  function frame() {
    const future = structuredClone(world); stepColony(future);
    emit({ type: 'frame', state: snapshotColony(world), predicted: snapshotColony(future), alpha: fractional,
      sampledAt: timeOrigin + lastMono, backlog: queued });
    lastFrame = monotonic(); lastTick = world.tick;
  }
  function pump() {
    if (disposed) return;
    try {
      accountTime();
      const deadline = monotonic() + 12;
      while (queued > 0 && monotonic() < deadline) { stepColony(world); queued--; }
      if (world.tick !== lastTick && monotonic() - lastFrame >= 200) frame();
      if (monotonic() - lastCheckpoint >= 2000) { emit({ type: 'checkpoint', raw: checkpoint() }); lastCheckpoint = monotonic(); }
      timer = schedule(pump, queued >= 5 ? 16 : 100);
    } catch (error) {
      disposed = true; emit({ type: 'error', message: error.message });
    }
  }
  pump();
  return { checkpoint, dispose() { disposed = true; if (timer !== null) cancel(timer); } };
}
