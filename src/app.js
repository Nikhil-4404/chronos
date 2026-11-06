import './style.css';
import { createCity } from './city.js';
import { createColony, snapshotColony, serializeColony, deserializeColony, elapsedTicks, clockLabel, KINDS, LIMITS } from './colony.js';
import WorldWorker from './world-worker.js?worker&inline';
import { runWorld } from './world-loop.js';
import { buildingForm } from './architecture.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const KEY = 'chronos.colony'; // Earlier chronos.world timeline saves remain untouched.
const BACKUP_KEY = 'chronos.colony.before-river-city';
let world, lastRaw = null, recovery = null, conflict = false, selected = null, following = null;
let migrationRaw = null, previousRaw = null;
let panel = null, layer = 'city', hudHidden = false, backlog = 0, lastSavedWall = 0;
let confirmation = null, current, predicted, pickerStamp = '', initialMessage = '', frameOptions = {};
let runtimeWorker = null, runtimeFallback = null, runtimeGeneration = 0, cachedRaw = null, workerTimeout = null;
const panelCache = {};
try {
  lastRaw = localStorage.getItem(KEY);
  if (lastRaw) {
    try { world = deserializeColony(lastRaw); backlog = elapsedTicks(world.savedAt); if (JSON.parse(lastRaw).schema === 2) migrationRaw = lastRaw; }
    catch { recovery = lastRaw; initialMessage = 'Your unreadable save is protected. Download it from World. This temporary settlement will not overwrite it.'; }
  }
  previousRaw = localStorage.getItem(BACKUP_KEY);
} catch { initialMessage = 'Browser storage is unavailable. Export your world to keep it.'; }
world ||= createColony();
$('#app').innerHTML = `
<main id="workspace" aria-label="CHRONOS living world">
<div id="city-view" class="world-stage"></div><div class="vignette" aria-hidden="true"></div>
<header class="topbar game-hud"><div class="identity"><span class="emblem" aria-hidden="true">◉</span><div><h1>CHRONOS</h1><span>A WORLD TAKING ROOT</span></div></div>
<div class="header-actions"><button id="guide" aria-label="Field guide">?</button><button id="fullscreen" aria-label="Enter fullscreen">⛶</button><button id="hide-hud" aria-label="Hide interface (H)">◌</button></div>
<div class="metrics" aria-label="Settlement vitals"><div><span>RESIDENTS</span><strong id="population">24</strong><small id="population-detail"></small></div><div><span>PLACES</span><strong id="building-count">12</strong><small id="construction-detail"></small></div><div><span>FOOD STORED</span><strong id="food">280</strong><small id="food-detail"></small></div><div><span>WELLBEING</span><strong id="wellbeing">—</strong><small>Health · rest · connection</small></div></div></header>
<div class="world-heading game-hud"><span class="live-dot"></span><span>NEW MERIDIAN</span><b>Observe a world becoming.</b></div>
<nav class="rail game-hud" aria-label="Observation tools"><button data-panel="people" aria-expanded="false"><span aria-hidden="true">♧</span>Residents<kbd>N</kbd></button><button data-panel="places" aria-expanded="false"><span aria-hidden="true">⌂</span>Settlement<kbd>B</kbd></button><button data-panel="journal" aria-expanded="false"><span aria-hidden="true">≋</span>Chronicle<kbd>J</kbd></button><button data-panel="world" aria-expanded="false"><span aria-hidden="true">◈</span>World<kbd>W</kbd></button></nav>
<aside id="observation-panel" class="observation-panel game-hud" hidden><div class="panel-title"><div><span class="eyebrow">FIELD NOTES</span><h2 id="panel-title">Residents</h2></div><button id="close-panel" aria-label="Close observation panel">×</button></div>
<div id="people-pane" hidden><label for="resident-search">Find a resident</label><input id="resident-search" type="search" placeholder="Name or occupation…" autocomplete="off"/><div id="resident-list" class="entity-list"></div></div>
<div id="places-pane" hidden><p class="muted">Every place begins with a need, delivered materials and neighbors’ work.</p><div id="place-list" class="entity-list"></div></div>
<div id="journal-pane" hidden><div id="growth-history"></div><ol id="journal" class="journal"></ol></div>
<div id="world-pane" hidden><span class="eyebrow">THE SETTLEMENT’S STORES</span><div id="resource-stores"></div><div id="development-stats"></div><hr/><span class="eyebrow">CARGO & RIVER TRADE</span><div id="logistics-stats"></div><div id="shipment-list" class="entity-list"></div><div id="dock-stats"></div><hr/><span class="eyebrow">LEARNING FROM JOURNEYS</span><div id="learning-stats"></div><p class="muted">Delivery outcomes update small, persistent travel estimates. These guide transport choices as the settlement changes.</p><p id="save-state" class="storage-state" role="status">Autosave ready</p><div class="button-row"><button id="export" class="primary">Export world</button><button id="import">Import world</button></div><button id="recovery" class="text-button" hidden>Download unreadable save</button><button id="previous-save" class="text-button" hidden>Export pre-migration world</button><button id="legacy" class="text-button" hidden>Export earlier timeline save</button><hr/><p class="muted">Life continues while you explore. One day passes in about 72 seconds. When you return, elapsed time is simulated in the background, up to seven real days.</p><p class="muted">This local world supports ${LIMITS.people} living residents and ${LIMITS.buildings} places. Buildings can grow, adapt and be reused. Families age on a compressed, fictional life cycle.</p><button id="new-world" class="text-button">Begin another world…</button></div>
<section id="entity-details" hidden aria-label="Selected subject"><hr/><div id="detail-copy"></div><div class="button-row"><button id="focus-subject">Locate</button><button id="follow-subject">Follow resident</button></div></section></aside>
<div class="layer-controls game-hud" role="group" aria-label="World overlay"><button data-layer="city" aria-pressed="true" class="active">Natural</button><button data-layer="routes" aria-pressed="false">Journeys</button><button data-layer="wellbeing" aria-pressed="false">Wellbeing</button></div>
<div class="camera-tools game-hud" role="group" aria-label="Camera"><button data-camera="orbit" class="active" aria-pressed="true">Orbit</button><button data-camera="street" aria-pressed="false">Street</button><button data-camera="top" aria-pressed="false">Above</button><button data-camera="sky" aria-pressed="false">Sky</button><button id="reset-view" aria-label="Frame the settlement">↺</button></div><button id="follow-chip" class="follow-chip game-hud" hidden></button>
<footer class="world-clock game-hud"><div class="clock-face"><span class="live-dot"></span><span id="simulation-state">WORLD IS LIVING</span><strong id="clock">00:00</strong><b id="day">DAY 01</b><small id="season">SPRING / CLEAR</small></div><div class="event-ribbon"><span id="ribbon-kind">THE BEGINNING</span><p id="ribbon"></p><button id="witness-event" aria-label="Inspect latest event">↗</button></div><span id="catchup" hidden>Remembering your time away…</span></footer>
<p class="camera-hint game-hud">DRAG TO ORBIT · SCROLL TO EXPLORE · SELECT ANY LIFE</p><span class="world-disclaimer game-hud">A FICTIONAL, RULES-BASED WORLD</span><button id="show-hud" hidden>Show interface <kbd>H</kbd></button></main>
<input id="import-file" type="file" accept=".json,application/json" hidden/><div id="toast" role="status" aria-live="polite" hidden></div>
<dialog id="guide-dialog" aria-labelledby="guide-title"><button class="dialog-close" data-close aria-label="Close field guide">×</button><span class="eyebrow">THE OBSERVER’S FIELD GUIDE</span><h2 id="guide-title">Life finds a way.<br>Stay and watch.</h2><p>This is one living world. Nobody is waiting for you to press play.</p><ol class="guide-steps"><li><b>Follow a life.</b> Select a resident in the world or in Residents. See where they live, what they need and what they are doing. Follow them through a whole day.</li><li><b>Watch a place become.</b> Carriers pick up real cargo, carry it by foot, cart or river barge, and unload it at the destination. Builders raise new structures and add floors, wings and shopfronts to existing places. Vacant buildings can find new uses.</li><li><b>Witness generations.</b> Newcomers seek spare beds. Households welcome children. People grow up, work, socialize and eventually die. The moving Sun and Moon share a seasonal calendar with rain, snow, mud and a freezing river. Weather changes harvests and transport. The chronicle records what happened.</li></ol><p>Drag to rotate 360°, right-drag to pan, scroll or pinch to zoom. Choose Sky to watch the Sun, Moon and weather above the settlement. N / B / J / W open panels, F follows a resident, 1 / 2 / 3 / 4 change the camera, H hides the interface, Escape closes a panel.</p><p class="muted">After closing or sleeping, this local world catches up on return (up to seven real days); it does not run a server. Its outcomes are fictional. Keep exports: browser storage is not a backup.</p><button class="primary" data-close>Keep watching</button></dialog>
<dialog id="confirm-dialog" aria-labelledby="confirm-title"><span class="eyebrow">YOUR LIVING WORLD</span><h2 id="confirm-title"></h2><p id="confirm-copy"></p><div class="button-row"><button data-close>Keep this world</button><button id="confirm-action" class="primary">Continue</button></div></dialog>`;

let city;
try { city = createCity($('#city-view'), { onSelect: selectEntity, onFollowChange: id => { following = id; paintFollow(); } }); }
catch (error) {
  console.error(error); $('#city-view').innerHTML = '<div class="renderer-error"><h2>The 3D view could not start.</h2><p>Use a WebGL-capable browser with hardware acceleration. Observation panels still work.</p></div>';
  city = Object.fromEntries(['update', 'resetView', 'focus', 'setFollow', 'setCameraMode'].map(k => [k, () => {}]));
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 7000); }
function setPanel(name) {
  if (name !== panel) $('#observation-panel').scrollTop = 0;
  panel = name; $('#observation-panel').hidden = !name;
  document.querySelectorAll('[data-panel]').forEach(b => { b.setAttribute('aria-expanded', String(b.dataset.panel === name)); b.classList.toggle('active', b.dataset.panel === name); });
  for (const key of ['people', 'places', 'journal', 'world']) $(`#${key}-pane`).hidden = key !== name;
  $('#panel-title').textContent = ({ people: 'Lives, unfolding.', places: 'A growing home.', journal: 'The chronicle.', world: 'Your world.' })[name] || '';
  $('#entity-details').hidden = !selected || !['people', 'places'].includes(name); pickerStamp = ''; renderPanel();
}
function selectEntity(entity) { selected = entity; if (entity) setPanel(entity.kind === 'citizen' ? 'people' : 'places'); else $('#entity-details').hidden = true; renderScene(); }
function setCamera(mode) {
  city.setFollow(null); following = null; city.setCameraMode(mode); paintFollow();
  paintCamera(mode);
}
function paintCamera(mode) {
  document.querySelectorAll('[data-camera]').forEach(b => { b.classList.toggle('active', b.dataset.camera === mode); b.setAttribute('aria-pressed', String(b.dataset.camera === mode)); });
}
function toggleFollow() {
  if (selected?.kind !== 'citizen') return;
  following = following === selected.id ? null : selected.id; city.setFollow(following); paintFollow();
  if (following && matchMedia('(max-width:600px)').matches) setPanel(null);
}
function paintFollow() {
  const person = current?.citizens.find(p => p.id === following);
  if (person) paintCamera('street');
  $('#follow-chip').hidden = !person; $('#follow-chip').textContent = person ? `FOLLOWING ${person.name.toUpperCase()} · STOP ×` : '';
  $('#follow-subject').textContent = following && following === selected?.id ? 'Stop following' : 'Follow resident';
  $('#follow-subject').setAttribute('aria-pressed', String(Boolean(following && following === selected?.id)));
}
function renderScene() { if (current) city.update(current, { nextState: predicted, ...frameOptions, playing: true, speed: 1, layer, selected }); }
function startWorld(next, fallbackOnly = false) {
  runtimeWorker?.terminate(); runtimeFallback?.dispose(); clearTimeout(workerTimeout);
  runtimeWorker = null; runtimeFallback = null; const generation = ++runtimeGeneration;
  $('#workspace').dataset.simulationRuntime = fallbackOnly ? 'page' : 'starting-worker';
  $('#simulation-state').textContent = 'WORLD IS LIVING';
  world = next; cachedRaw = serializeColony(next, next.savedAt); backlog = elapsedTicks(next.savedAt);
  current = snapshotColony(next); predicted = current; frameOptions = { alpha: 0, sampledAt: performance.now(), tickDurationMs: 500 };
  function receive(packet) {
    if (generation !== runtimeGeneration) return;
    if (packet.type === 'ready') { clearTimeout(workerTimeout); $('#workspace').dataset.simulationRuntime = 'worker'; return; }
    if (packet.type === 'frame') {
      clearTimeout(workerTimeout); current = packet.state; predicted = packet.predicted; backlog = packet.backlog;
      $('#workspace').dataset.simulationRuntime = fallbackOnly ? 'page' : 'worker';
      frameOptions = { alpha: packet.alpha, sampledAt: packet.sampledAt - performance.timeOrigin, tickDurationMs: 500 };
      renderScene(); renderHud(); renderPanel(); paintFollow();
    } else if (packet.type === 'checkpoint') {
      cachedRaw = packet.raw; if (Date.now() - lastSavedWall >= 10000) persist();
    } else if (packet.type === 'error') {
      if (!fallbackOnly) { $('#workspace').dataset.workerError = String(packet.message).slice(0, 200); startWorld(deserializeColony(cachedRaw), true); }
      else {
        $('#workspace').dataset.simulationRuntime = 'stopped'; $('#simulation-state').textContent = 'RECOVERY NEEDED';
        $('#catchup').hidden = false; $('#catchup').textContent = 'Simulation stopped. Open World to export your protected checkpoint.';
        $('#save-state').textContent = `Recovery needed: ${packet.message}. Your retained checkpoint is protected.`;
        setHud(false); toast(`The simulation needs recovery: ${packet.message}. Export your saved world before reloading.`);
      }
    }
  }
  if (!fallbackOnly) {
    try {
      runtimeWorker = new WorldWorker({ name: 'CHRONOS world' });
      runtimeWorker.onmessage = ({ data }) => receive(data);
      runtimeWorker.onerror = event => { event.preventDefault(); receive({ type: 'error', message: event.message || 'Background simulation unavailable' }); };
      workerTimeout = setTimeout(() => receive({ type: 'error', message: 'Background simulation did not start' }), 10000);
      runtimeWorker.postMessage({ type: 'init', world: next });
    } catch { startWorld(next, true); }
  } else runtimeFallback = runWorld(next, receive);
  renderScene(); renderHud(); renderPanel(); paintFollow();
}
function renderHud() {
  const sites = current.buildings.filter(b => b.progress < 1), projects = current.buildings.filter(b => b.project || b.progress < 1);
  $('#population').textContent = current.citizens.length; $('#population-detail').textContent = `${current.capacity} beds · ${current.totals.births} born here`;
  $('#building-count').textContent = current.buildings.length - sites.length; $('#construction-detail').textContent = projects.length ? `${projects.length} building or adapting` : `${current.development?.upgrades || 0} building additions`;
  $('#food').textContent = Math.floor(current.resources.food); $('#food-detail').textContent = current.environment?.rain > .3 ? 'Rain feeds the growing fields' : current.environment?.snow > .2 ? 'Winter stores support the city' : 'Grown by neighbors';
  $('#wellbeing').textContent = `${Math.round(current.metrics.wellbeing)}%`; $('#clock').textContent = clockLabel(current.tick); $('#day').textContent = `DAY ${String(current.day).padStart(2, '0')}`;
  const env = current.environment;
  $('#season').textContent = env ? `${env.season.toUpperCase()} / ${Math.round(env.temperature)}°C · ${env.weather.toUpperCase()}` : `${current.season.toUpperCase()} / ${current.weather.toUpperCase()}`;
  const event = current.log.at(-1); $('#ribbon-kind').textContent = event?.type.toUpperCase() || 'A LIVING WORLD'; $('#ribbon').textContent = event?.text || 'Life keeps finding its own way.'; $('#witness-event').disabled = !event?.entity;
  if ($('#workspace').dataset.simulationRuntime !== 'stopped') {
    $('#catchup').hidden = backlog < 5; if (backlog >= 5) { const days = Math.ceil(backlog / 144); $('#catchup').textContent = `Remembering ${days} ${days === 1 ? 'day' : 'days'} of life…`; }
    $('#workspace').classList.toggle('catching-up', backlog >= 5);
  }
}
const fact = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
const gauge = (label, value) => `<div class="gauge"><div><span>${label}</span><b>${Math.round(value)}%</b></div><i style="--fill:${Math.max(0, Math.min(100, value))}%"></i></div>`;
function renderPanel() {
  if (!panel || !current) return;
  if (panel === 'people') {
    const search = $('#resident-search').value.toLowerCase(), people = current.citizens.filter(p => `${p.name} ${p.role}`.toLowerCase().includes(search));
    const stamp = `${search}:${people.map(p => `${p.id}:${p.role}`).join('|')}`;
    if (pickerStamp !== stamp) { pickerStamp = stamp; $('#resident-list').innerHTML = people.length ? people.map(p => `<button data-person="${p.id}"><span class="person-dot"></span><b>${esc(p.name)}</b><small>${p.role}</small><span>↗</span></button>`).join('') : '<p class="muted">No residents match this search.</p>'; }
  }
  if (panel === 'places') {
    const stamp = current.buildings.map(b => `${b.id}:${Math.floor(b.progress * 100)}:${b.level}:${b.state}:${b.project?.type}:${Math.floor((b.project?.progress || 0) * 100)}`).join('|');
    if (pickerStamp !== stamp) { pickerStamp = stamp; $('#place-list').innerHTML = [...current.buildings].sort((a, b) => Number(!a.project) - Number(!b.project) || a.progress - b.progress).map(b => `<button data-place="${b.id}"><span class="place-symbol">${b.project || b.progress < 1 ? '⚒' : b.kind === 'home' ? '⌂' : b.kind === 'dock' ? '⚓' : '◇'}</span><b>${esc(b.label)}</b><small>${b.project ? `${esc(b.project.type)} ${Math.floor(b.project.progress * 100)}%` : b.state === 'Derelict' ? 'Derelict' : b.progress < 1 ? `${Math.floor(b.progress * 100)}% built` : `Level ${b.level || 1}`}</small><span>↗</span></button>`).join(''); }
  }
  if (panel === 'journal') {
    const stamp = `${current.log.length}:${current.log.at(-1)?.tick}:${current.log.at(-1)?.text}:${current.history.at(-1)?.day}`;
    if (panelCache.journal !== stamp) {
    panelCache.journal = stamp;
    const h = current.history, max = Math.max(1, ...h.map(p => p.population));
    $('#growth-history').innerHTML = h.length ? `<span class="eyebrow">POPULATION THROUGH THE DAYS</span><div class="history-bars" aria-label="Daily population history">${h.map(d => `<div style="--height:${Math.max(5, d.population / max * 100)}%" title="Day ${d.day}: ${d.population} residents"><i></i></div>`).join('')}</div><p class="history-caption">Day ${h[0].day} — ${h.at(-1).day} · ${h.at(-1).population} lives</p>` : '<p class="muted">A first generation. Population history appears as the days pass.</p>';
    $('#journal').innerHTML = [...current.log].reverse().map(e => `<li><time>D${Math.floor(e.tick / 144) + 1}<br>${clockLabel(e.tick)}</time><div><span class="eyebrow">${esc(e.type)}</span><p>${esc(e.text)}</p>${e.entity ? `<button data-event-kind="${e.entity.kind}" data-event-id="${esc(e.entity.id)}" class="text-button">Witness ↗</button>` : ''}</div></li>`).join('');
    }
  }
  if (panel === 'world') {
    const env = current.environment, dev = current.development, freight = current.logistics, learning = current.learning;
    $('#resource-stores').innerHTML = `<dl class="facts">${Object.entries(current.resources).map(([k, v]) => fact(k, Math.floor(v))).join('')}${fact('Newcomers', current.totals.arrivals)}${fact('Born here', current.totals.births)}${fact('Lives remembered', current.totals.deaths)}</dl>`;
    $('#development-stats').innerHTML = `<dl class="facts">${dev ? fact('Floor area units', Math.round(dev.floorArea)) + fact('Additions completed', dev.upgrades) + fact('Reused places', dev.reused) + fact('Salvaged places', dev.salvaged) + fact('Districts', dev.districts) : ''}${env ? fact('River', env.river.frozen ? `Frozen · ${env.river.loadSafe} loads` : 'Open to shipping') + fact('Moon illuminated', `${Math.round(env.moon.illumination * 100)}%`) + fact('Road mud', `${Math.round(env.mud * 100)}%`) : ''}</dl>`;
    $('#logistics-stats').innerHTML = freight ? `<dl class="facts">${fact('Active shipment jobs', freight.active)}${fact('Completed shipments', freight.delivered)}${fact('Waiting / stalled', `${freight.waiting} / ${freight.stalled}`)}</dl>` : '';
    const shipments = current.shipments || [], stamp = shipments.map(s => `${s.id}:${s.state}:${s.amount}:${s.carrierId}`).join('|');
    if (panelCache.shipments !== stamp) { panelCache.shipments = stamp; $('#shipment-list').innerHTML = shipments.length ? shipments.map(s => `<button ${s.carrierId ? `data-person="${esc(s.carrierId)}"` : `data-place="${esc(s.destinationId)}"`}><span class="place-symbol">${s.mode === 'barge' ? '⚓' : s.mode === 'cart' ? '▱' : '◇'}</span><b>${esc(s.resource)} · ${Number(s.amount).toFixed(1)}</b><small>${esc(s.mode)} / ${esc(s.state)}</small><span>↗</span></button>`).join('') : '<p class="muted">No active shipments at this moment.</p>'; }
    $('#dock-stats').innerHTML = (current.docks || []).length ? `<dl class="facts">${current.docks.map(d => fact(current.buildings.find(b => b.id === d.buildingId)?.label || 'River berth', `${d.occupied ? 'Handling cargo' : 'Berth clear'} · ${d.queue} queued`)).join('')}</dl>` : '';
    $('#learning-stats').innerHTML = learning ? `<dl class="facts">${fact('Observed deliveries', learning.deliveries)}${fact('Travel contexts', learning.contexts.length)}${learning.contexts.filter(c => c.samples > 0).map(c => fact(`${c.context} / ${c.mode}`, `${c.samples} trips · ${(Number(c.meanDuration) * 10).toFixed(0)} min`)).join('')}</dl>` : '<p class="muted">Experience accumulates as shipments arrive.</p>';
    $('#recovery').hidden = recovery === null;
  }
  const detailsMatch = selected && ((selected.kind === 'citizen' && panel === 'people') || (selected.kind === 'building' && panel === 'places'));
  $('#entity-details').hidden = !detailsMatch;
  if (detailsMatch) {
    const p = selected.kind === 'citizen' && current.citizens.find(c => c.id === selected.id), b = selected.kind === 'building' && current.buildings.find(c => c.id === selected.id);
    $('#entity-details').hidden = false;
    if (p) {
      $('#panel-title').textContent = p.name;
      const home = current.buildings.find(b => b.id === p.homeId), family = current.citizens.filter(c => c.homeId === p.homeId && c.id !== p.id);
      $('#detail-copy').innerHTML = `<span class="eyebrow">${p.role} / ${p.age < 12 ? 'YOUNG GENERATION' : p.age > 80 ? 'ELDER GENERATION' : 'ADULT'}</span><h3>${esc(p.name)}</h3><p class="subject-task"><span class="live-dot"></span>${esc(p.status)}</p><dl class="facts">${fact('Home', home?.label || 'Seeking a home')}${fact('Destination', current.buildings.find(b => b.id === p.destinationId)?.label || 'Home')}${fact('Household', family.map(p => p.name).join(', ') || 'A home of their own')}${fact('Children', p.children)}${p.cargo ? fact('Cargo', `${Number(p.cargo.amount).toFixed(1)} ${p.cargo.resource}`) + fact('Transport', p.mode || 'porter') : ''}</dl>${gauge('Health', p.health)}${gauge('Energy', p.energy)}${gauge('Hunger', p.hunger)}${gauge('Connection', p.social)}`;
      $('#follow-subject').hidden = false; $('#focus-subject').disabled = false;
    } else if (b) {
      $('#panel-title').textContent = b.label;
      const residents = current.citizens.filter(p => p.homeId === b.id), workers = current.citizens.filter(p => p.destinationId === b.id && /Building|Hauling|Retrofitting|Salvaging|Loading|Unloading/.test(p.task));
      const descriptions = { home: 'A home for rest, households and new generations.', farm: 'Workers and weather determine the harvest.', forestry: 'Foresters supply timber for an expanding settlement.', quarry: 'Masons gather stone for foundations and tools.', workshop: 'Wood and stone become tools that help builders.', shop: 'Neighbors eat from local stores. Carriers supply construction.', park: 'A common place for play and connection.', hospital: 'Neighbors in poor health come here for care.', dock: 'A river landing. Cargo needs a berth, loading time and a carrier before it can reach its destination.', mill: 'A working mill serving the river settlement.', civic: 'A gathering place serving the growing districts.' };
      const architecture = buildingForm(b).label;
      const project = b.project;
      const projectCost = project ? project.cost.wood + project.cost.stone : 0;
      const materialProgress = project ? projectCost ? Math.min(1, (project.delivered.wood + project.delivered.stone) / projectCost) : 1 : b.delivered;
      const inventory = b.inventory ? Object.entries(b.inventory).filter(([, n]) => n >= 1).map(([k, n]) => `${Math.floor(n)} ${k}`).join(', ') : '';
      $('#detail-copy').innerHTML = `<span class="eyebrow">${project ? `${esc(project.type).toUpperCase()} / WORK IN PROGRESS` : esc(b.state || KINDS[b.kind].label).toUpperCase()}</span><h3>${esc(b.label)}</h3><p class="muted">${descriptions[b.kind] || 'A place serving the settlement.'}</p>${project || b.progress < 1 ? `${gauge(project?.type === 'expand' ? 'Addition' : project?.type === 'convert' ? 'Conversion' : project?.type === 'salvage' ? 'Salvage' : 'Construction', (project?.progress ?? b.progress) * 100)}${project?.type === 'salvage' ? '' : gauge('Materials delivered', materialProgress * 100)}<p class="muted">${workers.length ? workers.map(p => esc(p.name)).join(', ') : 'Crews are dispatched from nearby districts.'}</p>` : ''}<dl class="facts">${fact('Architecture', architecture || KINDS[b.kind].label)}${fact('Level', b.level || 1)}${fact('Condition', `${Math.round(b.condition ?? 100)}%`)}${b.additions?.length ? fact('Additions', b.additions.join(', ')) : ''}${fact('Founded', `Day ${Math.floor(b.founded / 144) + 1}`)}${inventory ? fact('Stored here', inventory) : ''}${b.kind === 'home' ? fact('Household', `${residents.length} / ${b.capacity} beds`) + fact('Residents', residents.map(p => p.name).join(', ') || 'Awaiting a household') : ''}</dl>`;
      $('#follow-subject').hidden = true; $('#focus-subject').disabled = false;
    } else { $('#detail-copy').innerHTML = '<p class="muted">This life is now part of the settlement’s history.</p>'; $('#follow-subject').hidden = true; $('#focus-subject').disabled = true; }
  }
}
function persist() {
  if (recovery) return;
  try {
    if (conflict || localStorage.getItem(KEY) !== lastRaw) { conflict = true; $('#save-state').textContent = 'Another tab changed this world · export this window to keep it'; return; }
    if (!cachedRaw) return;
    if (migrationRaw) {
      // Preserve the validated earlier format before the first automatic migration write.
      if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, migrationRaw);
      previousRaw = localStorage.getItem(BACKUP_KEY); migrationRaw = null;
      $('#previous-save').hidden = !previousRaw;
    }
    // Checkpoint timestamps retain unprocessed life, including the short interval since the latest packet.
    localStorage.setItem(KEY, cachedRaw); lastRaw = cachedRaw; lastSavedWall = Date.now();
    $('#save-state').textContent = backlog >= 1 ? 'Recovery checkpoint saved · remembering time away' : 'Saved on this device · life continues';
  } catch { $('#save-state').textContent = 'Browser storage unavailable · export to keep this world'; }
}
function download(raw, name) { const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
function confirmAction(title, copy, label, action) { $('#confirm-title').textContent = title; $('#confirm-copy').textContent = copy; $('#confirm-action').textContent = label; confirmation = action; $('#confirm-dialog').showModal(); }
function replaceWorld(next) {
  selected = null; following = null; city.setFollow(null); recovery = null; conflict = false; lastSavedWall = 0;
  try { lastRaw = localStorage.getItem(KEY); } catch { /* Export remains available. */ }
  pickerStamp = ''; for (const key of Object.keys(panelCache)) delete panelCache[key]; startWorld(next); city.resetView(); persist();
}
function setHud(hidden) { hudHidden = hidden; $('#workspace').classList.toggle('hud-hidden', hidden); $('#show-hud').hidden = !hidden; if (hidden) { setPanel(null); $('#city-view canvas')?.focus(); } }
function focusSubject() {
  const item = selected?.kind === 'citizen' ? current.citizens.find(p => p.id === selected.id) : current.buildings.find(b => b.id === selected?.id)?.entrance;
  city.setFollow(null); following = null; if (item) city.focus(item); paintFollow();
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.panel) setPanel(panel === b.dataset.panel ? null : b.dataset.panel);
  if (b.dataset.camera) setCamera(b.dataset.camera);
  if (b.dataset.layer) { layer = b.dataset.layer; document.querySelectorAll('[data-layer]').forEach(c => { c.classList.toggle('active', c === b); c.setAttribute('aria-pressed', String(c === b)); }); renderScene(); }
  if (b.dataset.person) { selectEntity({ kind: 'citizen', id: b.dataset.person }); $('#entity-details').scrollIntoView({ block: 'nearest' }); }
  if (b.dataset.place) { selectEntity({ kind: 'building', id: b.dataset.place }); $('#entity-details').scrollIntoView({ block: 'nearest' }); }
  if (b.dataset.eventId) { selectEntity({ kind: b.dataset.eventKind, id: b.dataset.eventId }); focusSubject(); }
  if (b.hasAttribute('data-close')) b.closest('dialog').close();
});
$('#resident-search').addEventListener('input', renderPanel);
$('#close-panel').onclick = () => { setPanel(null); $('#city-view canvas')?.focus(); };
$('#focus-subject').onclick = focusSubject; $('#follow-subject').onclick = toggleFollow;
$('#follow-chip').onclick = () => { city.setFollow(null); following = null; paintFollow(); };
$('#reset-view').onclick = () => { city.resetView(); following = null; paintFollow(); paintCamera('orbit'); };
$('#guide').onclick = () => $('#guide-dialog').showModal(); $('#hide-hud').onclick = () => setHud(true); $('#show-hud').onclick = () => setHud(false);
$('#fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('Fullscreen is unavailable here.'); } };
document.addEventListener('fullscreenchange', () => $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
$('#witness-event').onclick = () => { const entity = current.log.at(-1)?.entity; if (entity) { selectEntity(entity); focusSubject(); } };
$('#export').onclick = () => { if (cachedRaw) download(cachedRaw, `chronos-world-day-${current.day}.json`); toast('World exported. Life continues.'); };
$('#import').onclick = () => $('#import-file').click();
$('#new-world').onclick = () => confirmAction('Begin a new world?', 'This replaces the living-world save on this device. Export this world first to keep it. Earlier timeline saves stay separate.', 'Begin new world', () => { replaceWorld(createColony(crypto.getRandomValues(new Uint32Array(1))[0])); toast('A new founding generation has arrived.'); });
$('#import-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try { if (file.size > 2 * 1024 * 1024) throw new Error('Choose a world save smaller than 2 MB.'); const next = deserializeColony(await file.text()); confirmAction('Observe this saved world?', 'Import replaces the living world in this window. Export the current world first to keep it. The imported world catches up from its saved time.', 'Import world', () => { replaceWorld(next); toast('World restored. Life continues.'); }); }
  catch (error) { toast(error.message); }
};
$('#confirm-action').onclick = () => { const action = confirmation; confirmation = null; $('#confirm-dialog').close(); action?.(); };
$('#confirm-dialog').addEventListener('close', () => { confirmation = null; });
$('#recovery').onclick = () => { if (recovery) download(recovery, 'chronos-unreadable-save.json'); };
$('#previous-save').onclick = () => { if (previousRaw) download(previousRaw, 'chronos-before-river-city.json'); };
try { $('#legacy').hidden = !localStorage.getItem('chronos.world'); } catch { /* Storage is optional. */ }
$('#legacy').onclick = () => { try { const raw = localStorage.getItem('chronos.world'); if (raw) download(raw, 'chronos-earlier-timelines.json'); } catch { toast('Earlier storage is unavailable.'); } };
document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input,select,textarea,dialog') || (e.target.closest('button') && e.key !== 'Escape')) return;
  const k = e.key.toLowerCase(), panels = { n: 'people', b: 'places', j: 'journal', w: 'world' };
  if (panels[k]) { e.preventDefault(); setPanel(panel === panels[k] ? null : panels[k]); }
  if (k === 'h') { e.preventDefault(); setHud(!hudHidden); } if (k === 'f') { e.preventDefault(); toggleFollow(); }
  if (['1', '2', '3', '4'].includes(k)) { e.preventDefault(); setCamera(({ 1: 'orbit', 2: 'street', 3: 'top', 4: 'sky' })[k]); }
  if (k === 'escape') { if (hudHidden) setHud(false); else setPanel(null); }
});
document.querySelector('.skip-link').onclick = () => { setHud(false); $('[data-panel="people"]').focus(); };
window.addEventListener('storage', e => { if (e.key === KEY && e.newValue !== lastRaw) { conflict = true; $('#save-state').textContent = 'Another tab changed this world · export this window to keep it'; toast('Another tab saved this world. This window keeps living independently; export to preserve it.'); } });
window.addEventListener('pagehide', persist); document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
$('#previous-save').hidden = !previousRaw;
startWorld(world); city.resetView(); if (initialMessage) toast(initialMessage); if (!lastRaw && !recovery) persist();
