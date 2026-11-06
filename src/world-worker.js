import { runWorld } from './world-loop.js';
let runtime = null;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      runtime?.dispose(); runtime = runWorld(data.world, packet => self.postMessage(packet));
      self.postMessage({ type: 'ready' });
    }
  } catch (error) { self.postMessage({ type: 'error', id: data.id, message: error.message }); }
};
