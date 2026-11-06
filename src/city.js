import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LIMITS } from './colony.js';
import { sampleNpcPose, npcDisplayOffset, blocksStreetView } from './activity.js';

const TILE = 8;
const worldX = x => (x - 5) * TILE;
const worldZ = z => (z - 4) * TILE;
const seeded = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const entityKey = item => item ? `${item.kind}:${item.id}` : '';

export function createCity(container, { onSelect, onViewChange, onFollowChange, interactive = true } = {}) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#344751');
  scene.fog = new THREE.FogExp2('#344751', .0065);
  const camera = new THREE.PerspectiveCamera(43, 1, .12, 1000);
  camera.position.set(66, 57, 72);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', interactive
    ? 'Living 3D city. Drag for a full 360 degree orbit, scroll to zoom down to the streets, right-drag to pan. Citizens and places are also available in the inspector.'
    : 'Living settlement observation camera.');
  renderer.domElement.tabIndex = interactive ? 0 : -1;
  renderer.domElement.style.cssText = `display:block;width:100%;height:100%;touch-action:none;cursor:${interactive ? 'grab' : 'default'};`;
  container.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = interactive;
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = .09;
  controls.minDistance = 4;
  controls.maxDistance = 420;
  controls.minPolarAngle = .035;
  controls.maxPolarAngle = 1.48;
  controls.panSpeed = .7;
  controls.rotateSpeed = .5;
  controls.zoomSpeed = .8;
  controls.screenSpacePanning = false;
  controls.target.set(0, 1.5, 0);
  controls.update();
  let applyingView = false;
  let cameraMode = 'orbit';
  let followId = null;
  let cinematic = false;
  const viewChanged = () => { if (!applyingView) onViewChange?.(getView()); };
  const manualView = () => { if (followId) onFollowChange?.(null); followId = null; cinematic = false; };
  controls.addEventListener('change', viewChanged);
  controls.addEventListener('start', manualView);

  const hemisphere = new THREE.HemisphereLight('#b2c7ce', '#253328', 1.8);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#ffca91', 2.65);
  sun.position.set(-36, 54, -24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 58, bottom: -58, near: 1, far: 170 });
  sun.shadow.bias = -.0003;
  sun.shadow.normalBias = .06;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#6bb6c4', .65);
  fill.position.set(45, 15, 40);
  scene.add(fill);

  const textures = new Set();
  function texture(kind) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = kind === 'asphalt' ? '#878d89' : kind === 'grass' ? '#9aab8a' : '#c3bdae';
    context.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1800; i++) {
      context.fillStyle = `rgba(${seeded(i + 7) > .5 ? '255,255,255' : '0,0,0'},${.035 + seeded(i) * .08})`;
      context.fillRect(seeded(i + 2) * 128, seeded(i + 3) * 128, 1 + seeded(i + 5) * 2, 1);
    }
    if (kind === 'brick') {
      context.strokeStyle = '#726e62'; context.lineWidth = 1;
      for (let y = 0; y < 128; y += 16) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(128, y); context.stroke();
        for (let x = (y % 32 ? -16 : 0); x < 128; x += 32) { context.beginPath(); context.moveTo(x, y); context.lineTo(x, y + 16); context.stroke(); }
      }
    } else if (kind === 'metal') {
      context.strokeStyle = '#8d918c'; context.lineWidth = 2;
      for (let x = 0; x < 128; x += 12) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 128); context.stroke(); }
    } else if (kind === 'paving') {
      context.strokeStyle = '#8c9186'; context.lineWidth = 1;
      for (let p = 0; p < 128; p += 32) { context.beginPath(); context.moveTo(p, 0); context.lineTo(p, 128); context.moveTo(0, p); context.lineTo(128, p); context.stroke(); }
    }
    const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); textures.add(map); return map;
  }
  const maps = { asphalt: texture('asphalt'), brick: texture('brick'), metal: texture('metal'), paving: texture('paving'), grass: texture('grass') };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const plain = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
  const materials = {
    ground: plain('#3d493d', { map: maps.grass }), paving: plain('#767d71', { map: maps.paving }), road: plain('#303a39', { map: maps.asphalt }),
    brick: plain('#ffffff', { map: maps.brick }), plaster: plain('#ffffff', { map: maps.paving }), steel: plain('#ffffff', { map: maps.metal, metalness: .18 }),
    roof: plain('#445552', { map: maps.metal, metalness: .12 }), stone: plain('#8b8d7b'), grass: plain('#3d674a', { map: maps.grass }),
    trunk: plain('#574738'), tree: plain('#ffffff'), rail: plain('#657a75', { metalness: .45 }), dark: plain('#263735'), rust: plain('#a45d3e'), body: plain('#ffffff'),
    glass: plain('#344f56', { metalness: .3, roughness: .3 }), warmWindow: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    marking: new THREE.MeshBasicMaterial({ color: '#b5b091', transparent: true, opacity: .58 }), amber: new THREE.MeshBasicMaterial({ color: '#ffbd70' }), teal: new THREE.MeshBasicMaterial({ color: '#68c4bd' }),
  };
  const color = new THREE.Color(), matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0), euler = new THREE.Euler(), limbRotation = new THREE.Quaternion(), limbPosition = new THREE.Vector3(), personRotation = new THREE.Quaternion();
  function cube(x, y, z, sx, sy, sz, material, cast = false, parent = scene) {
    const mesh = new THREE.Mesh(boxGeometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function instances(geometry, material, entries, cast = false) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, entries.length)); mesh.count = entries.length;
    entries.forEach((item, i) => {
      position.set(item.x || 0, item.y || 0, item.z || 0); scale.set(item.sx ?? 1, item.sy ?? 1, item.sz ?? 1); quaternion.setFromAxisAngle(yAxis, item.rotation || 0);
      matrix.compose(position, quaternion, scale); mesh.setMatrixAt(i, matrix); if (item.color) mesh.setColorAt(i, color.set(item.color));
    });
    mesh.castShadow = cast; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  function makeDynamic(geometry, material, capacity) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 120); scene.add(mesh); return mesh;
  }

  // Terrain continues to the horizon; the playable streets are not a floating display slab.
  const ground = cube(0, -.17, 0, 400, .25, 400, materials.ground);
  ground.material.map = maps.grass.clone(); ground.material.map.repeat.set(90, 90); textures.add(ground.material.map);

  const waterMaterial = new THREE.MeshPhysicalMaterial({ color: '#2c6869', roughness: .33, metalness: .2, clearcoat: .8 });
  cube(0, -.025, 0, 9.7, .06, 400, waterMaterial);
  const ripples = Array.from({ length: 105 }, (_, i) => ({ x: -4.3 + seeded(i + 10) * 8.6, y: .02, z: -80 + seeded(i + 200) * 160, sx: .035, sy: .008, sz: .7 + seeded(i) * 2.2 }));
  const rippleMesh = instances(boxGeometry, new THREE.MeshBasicMaterial({ color: '#a7c4b0', transparent: true, opacity: .18 }), ripples);
  const riverBanks = [];
  for (const x of [-5.05, 5.05]) {
    cube(x, .08, 0, .38, .35, 160, materials.stone); cube(x + Math.sign(x) * .8, .08, 0, 1.2, .16, 80, materials.paving);
    for (let z = -38; z <= 38; z += 4) riverBanks.push({ x, y: .65, z, sx: .06, sy: 1.1, sz: .06 });
    riverBanks.push({ x, y: 1.05, z: 0, sx: .06, sy: .06, sz: 78 });
  }
  instances(boxGeometry, materials.rail, riverBanks);
  const bridgeBarriers = new THREE.Group(); scene.add(bridgeBarriers);
  for (const z of [2, 6]) {
    cube(0, .18, worldZ(z), 16.6, .27, 3.2, materials.stone, true); cube(0, .33, worldZ(z), 16.5, .03, 2.12, materials.road);
    for (const side of [-1.45, 1.45]) {
      cube(0, 1.04, worldZ(z) + side, 16.8, .08, .08, materials.rail); cube(0, .62, worldZ(z) + side, 16.8, .05, .07, materials.rail);
      for (let x = -8; x <= 8; x += 1.1) cube(x, .68, worldZ(z) + side, .065, 1, .065, materials.rail);
    }
  }
  for (const x of [-7.4, 7.4]) {
    cube(x, .65, worldZ(2), .16, .7, 2.55, materials.rust, true, bridgeBarriers);
    for (const offset of [-.9, 0, .9]) cube(x, 1.12, worldZ(2) + offset, .12, .13, .12, materials.amber, false, bridgeBarriers);
  }
  bridgeBarriers.visible = false;
  const buildingInfo = [], treeEntries = [], trunkEntries = [], lamps = [];
  const hospitalExpansion = new THREE.Group(), parkExpansion = new THREE.Group(); scene.add(hospitalExpansion, parkExpansion);
  function addTree(x, z, size = 1) {
    trunkEntries.push({ x, y: .7 * size, z, sx: .12 * size, sy: 1.4 * size, sz: .12 * size });
    treeEntries.push({ x, y: 1.65 * size, z, sx: .8 * size, sy: 1.1 * size, sz: .8 * size, color: ['#456b4c', '#547d55', '#687a4c'][treeEntries.length % 3] });
  }
  const architecture = [materials.brick, materials.plaster, materials.steel, materials.roof, materials.rust, materials.grass, materials.stone, materials.rail].map(m => makeDynamic(boxGeometry, m, 12000));
  const windows = makeDynamic(boxGeometry, materials.warmWindow, 12000);
  const roadMesh = makeDynamic(boxGeometry, materials.road, 3000); roadMesh.castShadow = false;
  const roofPeaks = makeDynamic(new THREE.ConeGeometry(1, 1, 4), materials.rust, LIMITS.buildings * 4);
  const buildingPicks = makeDynamic(boxGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), LIMITS.buildings);
  buildingPicks.userData.kind = 'building'; buildingPicks.userData.entries = [];
  const buildingMeshes = [buildingPicks];
  let architectureStamp = '';
  function syncArchitecture() {
    const stamp = state.buildings.map(b => `${b.id}:${b.progress.toFixed(3)}:${b.delivered.toFixed(2)}`).join('|');
    if (stamp === architectureStamp) return; architectureStamp = stamp;
    for (const mesh of [...architecture, windows, roofPeaks, roadMesh, buildingPicks]) mesh.count = 0;
    buildingInfo.length = 0; buildingPicks.userData.entries = [];
    const palettes = ['#b99573', '#9e644e', '#b8b59b', '#7c9b91', '#68818e', '#b99863'];
    const roads = new Set();
    function part(mesh, x, y, z, sx, sy, sz, tint = null, yaw = 0) {
      position.set(x, y, z); scale.set(sx, sy, sz); quaternion.setFromAxisAngle(yAxis, yaw); matrix.compose(position, quaternion, scale);
      if (mesh.count >= mesh.instanceMatrix.count) return;
      mesh.setMatrixAt(mesh.count, matrix); if (tint) mesh.setColorAt(mesh.count, color.set(tint)); mesh.count++;
    }
    for (const b of state.buildings) {
      const x = worldX(b.x), z = worldZ(b.z), v = b.variant, progress = b.progress, ready = progress >= 1;
      const width = 3.8 + (v % 3) * .5, depth = 3.8 + ((v + 1) % 3) * .5;
      const garden = ['farm', 'park', 'forestry', 'quarry'].includes(b.kind);
      const height = garden ? .4 : b.kind === 'home' ? 2.6 + Math.floor(v / 2) * 1.25 : b.kind === 'workshop' ? 4 + v * .45 : b.kind === 'hospital' ? 4.1 : 2.8;
      const tint = palettes[v], material = architecture[b.kind === 'workshop' ? 2 : v % 3];
      buildingInfo.push({ ...b, height, width, depth, baseColor: tint, worldX: x, worldZ: z });
      buildingPicks.userData.entries.push({ id: b.id });
      part(buildingPicks, x, height / 2, z, width, height + 1, depth);
      part(architecture[6], x, .13, z, 6.1, .2, 6.1, ready ? '#7c8273' : '#a49173');
      for (const [axis, line, other] of [['x', b.entrance.x, b.entrance.z], ['x', b.entrance.x + 1, b.entrance.z], ['z', b.entrance.z, b.entrance.x], ['z', b.entrance.z + 1, b.entrance.x]]) {
        const key = `${axis}:${line}:${other}`; if (roads.has(key)) continue; roads.add(key);
        part(roadMesh, axis === 'x' ? worldX(line) : worldX(other + .5), .08, axis === 'z' ? worldZ(line) : worldZ(other + .5), axis === 'x' ? 1.9 : 8, .1, axis === 'z' ? 1.9 : 8);
      }
      if (!ready) {
        for (const dx of [-2.7, 2.7]) for (const dz of [-2.7, 2.7]) part(architecture[7], x + dx, 1.7, z + dz, .09, 3.3, .09, '#b3986c');
        for (const y of [1, 2.4]) for (const dz of [-2.7, 2.7]) part(architecture[4], x, y, z + dz, 5.6, .09, .09, '#d0a161');
        for (let i = 0; i < 4; i++) part(architecture[4], x - 2 + i * .4, .35, z - 2, .3, .4, 1.5, '#a98057');
        part(architecture[4], x + 2.7, 4, z + 2.7, .12, 8, .12, '#e1ad59');
        part(architecture[4], x + .6, 7.6, z + 2.7, 5, .12, .12, '#e1ad59');
      }
      if (garden && ready) {
        if (b.kind === 'farm') for (let row = 0; row < 5; row++) {
          part(architecture[4], x - 2 + row, .27, z, .65, .15, 5, '#65503c');
          for (let col = 0; col < 5; col++) part(architecture[5], x - 2 + row, .5 + (v % 2) * .2, z - 2 + col, .4, .5, .45, v % 2 ? '#9faa52' : '#598746');
        }
        if (b.kind === 'park') {
          part(architecture[5], x, .26, z, 5.8, .13, 5.8, '#3d6948');
          part(architecture[6], x, .4, z, 1.1, .4, 1.1, '#8bb7b2');
          for (const side of [-1.8, 1.8]) part(architecture[4], x + side, .5, z + 1.8, 1.4, .2, .6, '#a67a51');
        }
        if (b.kind === 'forestry') for (const dx of [-1.5, 1.4]) for (const dz of [-1.6, 1.2]) {
          part(architecture[4], x + dx, 1, z + dz, .2, 2, .2, '#665341');
          part(roofPeaks, x + dx, 2.3, z + dz, 1.3, 3.1, 1.3, '#52734d');
        }
        if (b.kind === 'quarry') for (let i = 0; i < 7; i++) part(architecture[6], x - 2 + (i % 3) * 1.3, .5 + (i % 2) * .3, z - 1.5 + Math.floor(i / 3) * 1.2, 1.1, 1 + (i % 2) * .5, 1, '#9da399');
        continue;
      }
      const wallHeight = Math.max(.12, height * progress);
      part(material, x, wallHeight / 2 + .2, z, width, wallHeight, depth, tint);
      if (progress > .85) {
        if (b.kind === 'home' && v % 2 === 0) part(roofPeaks, x, height + .85, z, width * .75, 1.7, depth * .75, '#915e46', Math.PI / 4);
        else { part(architecture[3], x, height + .3, z, width + .25, .2, depth + .25, '#3e5555'); part(architecture[2], x - .8, height + .6, z, 1.1, .5, 1.3, '#6e8985'); }
      }
      if (!ready) continue;
      part(architecture[4], x, .85, z + depth / 2 + .025, .7, 1.4, .06, '#334b48');
      const floors = Math.max(1, Math.floor(height / 1.25));
      for (let floor = 0; floor < floors; floor++) for (let col = 0; col < 3; col++) for (const side of [-1, 1]) {
        part(windows, x - 1.2 + col * 1.2, 1 + floor * 1.2, z + side * (depth / 2 + .03), .5, .6, .04);
        part(windows, x + side * (width / 2 + .03), 1 + floor * 1.2, z - 1.2 + col * 1.2, .04, .6, .5);
      }
      if (v % 3 === 1) for (const side of [-1, 1]) part(architecture[3], x + side * width * .35, 1.6, z + depth / 2 + .6, .08, 2.8, .08, '#6d7f73');
      if (b.kind === 'shop') part(architecture[4], x, 2.2, z + depth / 2 + .6, width + .1, .16, 1.4, '#b89051');
      if (b.kind === 'hospital') { part(architecture[7], x, height + .5, z, 1.4, .1, .4, '#88d2bc'); part(architecture[7], x, height + .5, z, .4, .1, 1.4, '#88d2bc'); }
      if (b.kind === 'workshop') { part(architecture[6], x + 1.3, height + .6, z - 1, .55, 1.4, .55, '#687970'); part(architecture[3], x, height + .45, z, width * .7, .16, 1.6, '#345b6d'); }
    }
    powerBuilding = buildingInfo.find(b => b.kind === 'workshop' && b.progress === 1);
    for (const mesh of [...architecture, windows, roofPeaks, roadMesh, buildingPicks]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }
  for (const side of [-1, 1]) for (let i = 0; i < 27; i++) {
    const z = -37 + i * 2.8; if (Math.abs(z - worldZ(2)) > 2 && Math.abs(z - worldZ(6)) > 2) addTree(side * 6.4, z, .9 + seeded(i + 83) * .4);
  }
  for (let i = 0; i < 35; i++) { const side = i % 2 ? -1 : 1; addTree(side * (46 + seeded(i + 1) * 18), -48 + seeded(i + 16) * 96, 1.3 + seeded(i) * .8); }
  instances(new THREE.CylinderGeometry(1, 1, 1, 6), materials.trunk, trunkEntries, true);
  const trees = instances(new THREE.IcosahedronGeometry(1, 1), materials.tree, treeEntries, true);
  for (const x of [1, 3, 7, 9]) for (const z of [1, 3, 5, 7]) {
    const px = worldX(x) + 1.3, pz = worldZ(z) + 1.3; cube(px, 1.55, pz, .08, 2.9, .08, materials.rail); cube(px - .32, 2.95, pz, .72, .07, .07, materials.rail);
    lamps.push({ x: px - .6, y: 2.91, z: pz, sx: .3, sy: .08, sz: .2, east: x > 5 });
  }
  const lampMesh = instances(boxGeometry, materials.warmWindow, lamps);
  // Emissive pools light the street without dozens of dynamic point lights.
  const poolGeometry = new THREE.CircleGeometry(1, 20); poolGeometry.rotateX(-Math.PI / 2);
  const pools = makeDynamic(poolGeometry, new THREE.MeshBasicMaterial({ color: '#ffc580', transparent: true, opacity: .13, depthWrite: false, blending: THREE.AdditiveBlending }), lamps.length); pools.castShadow = false;
  const capacity = LIMITS.people;
  const npc = {
    torso: makeDynamic(boxGeometry, materials.body, capacity), head: makeDynamic(new THREE.SphereGeometry(1, 8, 6), materials.body, capacity), hips: makeDynamic(boxGeometry, materials.body, capacity),
    arms: makeDynamic(boxGeometry, materials.body, capacity * 2), legs: makeDynamic(boxGeometry, materials.body, capacity * 2), hats: makeDynamic(new THREE.SphereGeometry(1, 8, 4), materials.body, capacity), props: makeDynamic(boxGeometry, materials.body, capacity),
  };
  const npcPicks = makeDynamic(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), capacity); npcPicks.castShadow = false; npcPicks.userData.kind = 'citizen';
  const npcColors = ['#d18a42', '#438e8c', '#b9b9a1', '#7e6985', '#ae6547', '#597b9b', '#9caa73', '#c8a16d'], skinColors = ['#c69773', '#835d42', '#dda98a', '#a87955', '#e0b99d', '#6d4938'];
  const lastPoses = new Map();
  const smokeGeometry = new THREE.BufferGeometry(), smokePositions = new Float32Array(24 * 3);
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
  const smoke = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({ color: '#b1b5a4', size: .65, transparent: true, opacity: .2, depthWrite: false, sizeAttenuation: true })); smoke.frustumCulled = false; scene.add(smoke);
  let powerBuilding = null;
  const selectionBox = new THREE.Box3Helper(new THREE.Box3(), '#dca15a'); scene.add(selectionBox); selectionBox.visible = false;
  const selectionRing = new THREE.Mesh(new THREE.RingGeometry(.47, .56, 40), new THREE.MeshBasicMaterial({ color: '#ffbd70', side: THREE.DoubleSide, depthWrite: false })); selectionRing.rotation.x = -Math.PI / 2; selectionRing.visible = false; scene.add(selectionRing);
  const routeMaterial = new THREE.MeshBasicMaterial({ color: '#80d1c6', transparent: true, opacity: .82 }), routeGroup = new THREE.Group(); scene.add(routeGroup);
  const routeFlows = makeDynamic(boxGeometry, new THREE.MeshBasicMaterial({ color: '#5eaaa6', transparent: true, opacity: .65 }), 1024); routeFlows.castShadow = false;
  let state = null, nextState = null, currentLayer = 'city', selection = null, playing = false, speed = 1, visualAlpha = 0;
  let appearanceKey = '', routeKey = '', frame = 0, disposed = false, lastTime = performance.now(), contextLostMessage = null;
  let viewportWidth = 0, viewportHeight = 0;
  let fpsFrames = 0, fpsStart = lastTime, measuringFps = false;
  renderer.domElement.dataset.fps = '0.0';
  renderer.domElement.dataset.simulationTick = '0.000';
  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight); camera.aspect = width / height;
    camera.zoom = cameraMode === 'street' ? 1 : Math.min(1, camera.aspect / 1.18); camera.updateProjectionMatrix();
    if (width !== viewportWidth || height !== viewportHeight) { renderer.setSize(width, height, false); viewportWidth = width; viewportHeight = height; }
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  function updateAppearance() {
    if (!state) return;
    const night = clamp((Math.cos((state.clock ?? 48) / 144 * Math.PI * 2) + .15) * 1.2, 0, 1), stamp = `${currentLayer}:${Math.round(night * 12)}`;
    if (stamp === appearanceKey) return; appearanceKey = stamp;
    const effects = state.effects; bridgeBarriers.visible = Boolean(effects.bridgeClosed); hospitalExpansion.visible = Boolean(effects.hospital); parkExpansion.visible = Boolean(effects.park);
    windows.material.color.set(night > .3 ? '#ffbd78' : '#537e83');
    lamps.forEach((lamp, index) => lampMesh.setColorAt(index, color.set(effects.blackout && lamp.east ? '#263d3b' : '#ffc17a'))); lampMesh.instanceColor.needsUpdate = true;
    hemisphere.intensity = 1.85 - night * .7; sun.intensity = 2.65 - night * 2.25; sun.color.set(night > .6 ? '#ffa273' : '#ffca91'); fill.intensity = .55 + night * .25;
    const background = new THREE.Color('#344751').lerp(new THREE.Color('#122533'), night); scene.background.copy(background); scene.fog.color.copy(background);
    renderer.toneMappingExposure = 1.08 + night * .17; waterMaterial.color.set(night > .5 ? '#234e57' : '#3c7773');
  }
  function updateSelection() {
    selectionBox.visible = false; selectionRing.visible = false; let chosen = null;
    if (selection?.kind === 'building') {
      const b = buildingInfo.find(item => item.id === selection.id);
      if (b) {
        selectionBox.box.min.set(b.worldX - b.width / 2 - .15, .12, b.worldZ - b.depth / 2 - .15); selectionBox.box.max.set(b.worldX + b.width / 2 + .15, b.height + 1.8, b.worldZ + b.depth / 2 + .15); selectionBox.visible = true;
      }
    } else if (selection?.kind === 'citizen') { chosen = state?.citizens.find(person => person.id === selection.id); selectionRing.visible = Boolean(chosen); }
    const path = chosen?.route || [], stamp = `${entityKey(selection)}:${path.map(p => `${p.x},${p.z}`).join(';')}`;
    if (routeKey === stamp) return; routeKey = stamp; routeGroup.clear();
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = worldX(b.x) - worldX(a.x), dz = worldZ(b.z) - worldZ(a.z), length = Math.hypot(dx, dz); if (!length) continue;
      const segment = new THREE.Mesh(boxGeometry, routeMaterial); segment.position.set((worldX(a.x) + worldX(b.x)) / 2, .21, (worldZ(a.z) + worldZ(b.z)) / 2); segment.scale.set(length, .025, .13); segment.rotation.y = -Math.atan2(dz, dx); routeGroup.add(segment);
    }
  }
  function update(snapshot, options = {}) {
    if (disposed) return;
    const sameSnapshot = state === snapshot;
    state = snapshot; nextState = options.nextState || snapshot; currentLayer = options.layer || 'city'; selection = options.selected || null;
    playing = Boolean(options.playing); speed = Number.isFinite(options.speed) ? options.speed : 1;
    const alpha = clamp(Number(options.alpha) || 0, 0, 1);
    visualAlpha = sameSnapshot && alpha > 0 ? Math.max(visualAlpha, alpha) : alpha;
    syncArchitecture(); updateAppearance(); updateSelection(); routeFlows.count = 0;
    if (currentLayer === 'routes') {
      const segments = new Map();
      for (const person of state.citizens) for (let i = 1; i < person.route.length; i++) {
        const a = person.route[i - 1], b = person.route[i], id = [`${a.x},${a.z}`, `${b.x},${b.z}`].sort().join('|');
        if (segments.has(id)) segments.get(id).traffic++; else segments.set(id, { a, b, traffic: 1 });
      }
      for (const { a, b, traffic } of segments.values()) {
        if (routeFlows.count >= 1024) break;
        const dx = worldX(b.x) - worldX(a.x), dz = worldZ(b.z) - worldZ(a.z), length = Math.hypot(dx, dz); if (!length) continue;
        position.set((worldX(a.x) + worldX(b.x)) / 2, .2, (worldZ(a.z) + worldZ(b.z)) / 2); scale.set(length, .02, .06 + Math.min(6, traffic) * .025); quaternion.setFromAxisAngle(yAxis, -Math.atan2(dz, dx)); matrix.compose(position, quaternion, scale); routeFlows.setMatrixAt(routeFlows.count++, matrix);
      }
      routeFlows.instanceMatrix.needsUpdate = true;
    }
  }
  let personSize = 1;
  function putPart(mesh, index, px, py, pz, sx, sy, sz, heading = 0, lean = 0, tint = null) {
    position.set(px, py * personSize, pz); scale.set(sx * personSize, sy * personSize, sz * personSize); euler.set(lean, heading, 0, 'YXZ'); quaternion.setFromEuler(euler); matrix.compose(position, quaternion, scale); mesh.setMatrixAt(index, matrix); if (tint) mesh.setColorAt(index, color.set(tint));
  }
  function limb(mesh, index, px, py, pz, side, yaw, angle, arm, tint) {
    const length = arm ? .29 : .32; limbPosition.set(side * (arm ? .175 : .08), -length / 2 * Math.cos(angle), -length / 2 * Math.sin(angle));
    personRotation.setFromAxisAngle(yAxis, yaw); limbPosition.applyQuaternion(personRotation); position.set(px + limbPosition.x * personSize, (py + limbPosition.y) * personSize, pz + limbPosition.z * personSize);
    euler.set(angle, yaw, 0, 'YXZ'); limbRotation.setFromEuler(euler); scale.set((arm ? .07 : .075) * personSize, length * personSize, (arm ? .075 : .1) * personSize); matrix.compose(position, limbRotation, scale); mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, color.set(tint));
  }
  function animatePeople() {
    lastPoses.clear();
    const people = state.citizens, nextPeople = nextState?.citizens || people, count = Math.min(capacity, people.length);
    for (const mesh of [npc.torso, npc.head, npc.hips, npc.hats, npc.props, npcPicks]) mesh.count = count; npc.arms.count = npc.legs.count = count * 2;
    for (let i = 0; i < count; i++) {
      const person = people[i], next = nextPeople[i]?.id === person.id ? nextPeople[i] : person, pose = sampleNpcPose(person, next, visualAlpha, state.tick), yaw = pose.heading;
      const { x: offsetX, z: offsetZ } = npcDisplayOffset(i % 49);
      const px = worldX(pose.x) + offsetX, pz = worldZ(pose.z) + offsetZ, bob = pose.bodyBob || 0;
      let tint = npcColors[i % npcColors.length]; if (currentLayer === 'wellbeing') tint = person.wellbeing < 55 ? '#d3764f' : person.wellbeing < 75 ? '#d3b05b' : '#68b7a0';
      personSize = person.age < 12 ? .6 + person.age / 40 : 1;
      const skin = skinColors[i % skinColors.length];
      putPart(npc.torso, i, px, .64 + bob, pz, .23, .32, .16, yaw, 0, tint); putPart(npc.hips, i, px, .43 + bob, pz, .22, .12, .15, yaw, 0, '#283b3d'); putPart(npc.head, i, px, .92 + bob, pz, .105, .12, .105, yaw, 0, skin);
      const work = pose.activity === 'working' ? -.85 + pose.workMotion * .35 : pose.activity === 'eating' ? -1.45 + pose.workMotion * .25 : pose.activity === 'socializing' ? -.3 + Math.sin(state.tick + i) * .25 : 0;
      for (const side of [-1, 1]) { const j = i * 2 + Number(side > 0); limb(npc.arms, j, px, .78 + bob, pz, side, yaw, work || side * pose.armSwing, true, tint); limb(npc.legs, j, px, .45 + bob, pz, side, yaw, side * pose.legSwing, false, '#27383b'); }
      const hat = /Builder|Mason|Craftsperson/.test(person.role); putPart(npc.hats, i, px, hat ? 1.01 + bob : .95, pz, hat ? .12 : 0, hat ? .055 : 0, hat ? .12 : 0, yaw, 0, '#d5a557');
      const carries = pose.activity === 'working' || pose.activity === 'eating', propX = px + Math.sin(yaw) * .23, propZ = pz + Math.cos(yaw) * .23;
      putPart(npc.props, i, propX, .66 + bob + (pose.workMotion || 0) * .025, propZ, carries ? .2 : 0, carries ? .055 : 0, carries ? .13 : 0, yaw, -.12, pose.activity === 'eating' ? '#d9b982' : '#648a89');
      putPart(npcPicks, i, px, .59, pz, .18, .55, .18); lastPoses.set(person.id, { x: px, z: pz, heading: yaw });
      if (selection?.kind === 'citizen' && selection.id === person.id) selectionRing.position.set(px, .22, pz);
    }
    for (const mesh of [...Object.values(npc), npcPicks]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    if (followId && !people.some(p => p.id === followId)) { followId = null; onFollowChange?.(null); }
    const followed = followId && lastPoses.get(followId);
    if (followed) positionFollowCamera(followed);
  }
  function positionFollowCamera(pose) {
    controls.target.set(pose.x, .65, pose.z);
    camera.position.set(pose.x + Math.sin(pose.heading) * 6.2, 3.15, pose.z + Math.cos(pose.heading) * 6.2);
  }
  function animateEnvironment(tick) {
    const t = reducedMotion ? 0 : tick;
    ripples.forEach((ripple, i) => {
      position.set(ripple.x + Math.sin(t * .03 + i) * .06, ripple.y, ((ripple.z + t * .15 + 80) % 160) - 80); scale.set(ripple.sx, ripple.sy, ripple.sz); matrix.compose(position, quaternion.identity(), scale); rippleMesh.setMatrixAt(i, matrix);
    }); rippleMesh.instanceMatrix.needsUpdate = true;
    treeEntries.forEach((entry, i) => {
      position.set(entry.x + Math.sin(t * .08 + i) * .035, entry.y, entry.z + Math.cos(t * .06 + i) * .025); scale.set(entry.sx, entry.sy, entry.sz); quaternion.setFromAxisAngle(yAxis, Math.sin(t * .015 + i) * .04); matrix.compose(position, quaternion, scale); trees.setMatrixAt(i, matrix);
      // Cut away foreground foliage so the street camera can see its subject.
      if (cameraMode === 'street' && camera.position.y < 8 && blocksStreetView(entry, camera.position, controls.target)) { scale.setScalar(0); matrix.compose(position, quaternion, scale); trees.setMatrixAt(i, matrix); }
    }); trees.instanceMatrix.needsUpdate = true;
    pools.count = 0;
    lamps.forEach(lamp => {
      if (state.effects.blackout && lamp.east) return;
      position.set(lamp.x, .19, lamp.z); scale.set(1.7, 1, 1.7); matrix.compose(position, quaternion.identity(), scale); pools.setMatrixAt(pools.count++, matrix);
    }); pools.instanceMatrix.needsUpdate = true;
    smoke.visible = Boolean(powerBuilding);
    if (!powerBuilding) return;
    for (let i = 0; i < 24; i++) {
      const progress = ((t * .035 + i / 24) % 1 + 1) % 1; smokePositions[i * 3] = powerBuilding.worldX + Math.sin(progress * 3 + i) * .45 + progress * 2;
      smokePositions[i * 3 + 1] = powerBuilding.height + 2 + progress * 5; smokePositions[i * 3 + 2] = powerBuilding.worldZ - 1.7 + Math.cos(progress * 5 + i) * .35;
    } smoke.geometry.attributes.position.needsUpdate = true;
  }
  function animate(time) {
    if (disposed) return; frame = requestAnimationFrame(animate);
    const delta = clamp((time - lastTime) / 1000, 0, .12); lastTime = time;
    if (document.hidden || contextLostMessage || !container.clientWidth || !container.clientHeight) {
      fpsFrames = 0; measuringFps = false;
      return;
    }
    if (!measuringFps) { fpsStart = time; fpsFrames = 0; measuringFps = true; }
    if (playing) visualAlpha = clamp(visualAlpha + delta * speed * 2, 0, 1);
    if (state) { const tick = state.tick + visualAlpha; animatePeople(); animateEnvironment(tick); }
    if (cinematic && interactive && !reducedMotion) { const offset = camera.position.clone().sub(controls.target); offset.applyAxisAngle(yAxis, delta * .025); camera.position.copy(controls.target).add(offset); }
    controls.update(); renderer.render(scene, camera);
    fpsFrames++;
    if (time - fpsStart >= 1000) {
      renderer.domElement.dataset.fps = (fpsFrames * 1000 / (time - fpsStart)).toFixed(1);
      renderer.domElement.dataset.simulationTick = ((state?.tick || 0) + visualAlpha).toFixed(3);
      fpsFrames = 0; fpsStart = time;
    }
  }
  frame = requestAnimationFrame(animate);

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), activePointers = new Set(); let pointerDown = null;
  const down = event => {
    activePointers.add(event.pointerId); pointerDown = event.button === 0 && activePointers.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  };
  const up = event => {
    activePointers.delete(event.pointerId); const start = pointerDown; pointerDown = null;
    if (!interactive || !start || start.id !== event.pointerId || event.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([npcPicks, ...buildingMeshes], false);
    if (!hits.length) { onSelect?.(null); return; }
    const hit = hits[0], item = hit.object.userData.kind === 'citizen' ? state?.citizens[hit.instanceId] : hit.object.userData.entries[hit.instanceId];
    if (item) onSelect?.({ kind: hit.object.userData.kind, id: item.id });
  };
  const cancel = event => { activePointers.delete(event.pointerId); pointerDown = null; };
  const contextLost = event => {
    event.preventDefault(); if (contextLostMessage || disposed) return;
    contextLostMessage = document.createElement('div'); contextLostMessage.setAttribute('role', 'alert');
    contextLostMessage.style.cssText = 'position:absolute;inset:20%;display:grid;place-content:center;background:#142224f2;border:1px solid #a8794f;padding:24px;color:#efc99c;font:14px system-ui;z-index:3;text-align:center;';
    contextLostMessage.textContent = 'The graphics device interrupted the 3D view. The settlement is still being saved. Reload to restore the view.'; container.append(contextLostMessage);
  };
  renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', cancel); renderer.domElement.addEventListener('webglcontextlost', contextLost);

  function resetView() {
    cameraMode = 'orbit'; if (followId) onFollowChange?.(null); followId = null;
    const places = state?.buildings || [];
    const cx = places.length ? places.reduce((s, b) => s + worldX(b.x), 0) / places.length : 0;
    const cz = places.length ? places.reduce((s, b) => s + worldZ(b.z), 0) / places.length : 0;
    const extent = Math.max(30, ...places.map(b => Math.hypot(worldX(b.x) - cx, worldZ(b.z) - cz) * 2));
    controls.target.set(cx, 1.5, cz); camera.position.set(cx + extent * .78, extent * .85, cz + extent * .94); resize(); controls.update();
  }
  function getView() { return { position: camera.position.toArray(), target: controls.target.toArray(), mode: cameraMode }; }
  function setView(view) {
    if (disposed || !view || ![view.position, view.target].every(values => Array.isArray(values) && values.length === 3 && values.every(Number.isFinite))) return;
    applyingView = true;
    try { cameraMode = ['orbit', 'street', 'top'].includes(view.mode) ? view.mode : 'orbit'; camera.position.fromArray(view.position); controls.target.fromArray(view.target); resize(); controls.update(); }
    finally { applyingView = false; }
  }
  function focus(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const target = new THREE.Vector3(worldX(point.x) + .7, .7, worldZ(point.z) + .7), offset = camera.position.clone().sub(controls.target);
    offset.setLength(cameraMode === 'street' ? 6.5 : Math.min(29, offset.length())); controls.target.copy(target); camera.position.copy(target).add(offset); controls.update();
  }
  function setCameraMode(mode) {
    if (!['orbit', 'street', 'top'].includes(mode)) return; cameraMode = mode; cinematic = false;
    const person = selection?.kind === 'citizen' && state?.citizens.find(p => p.id === selection.id);
    const building = selection?.kind === 'building' && state?.buildings.find(b => b.id === selection.id);
    const point = person || building?.entrance;
    if (mode === 'top') { resetView(); cameraMode = 'top'; }
    else if (point) controls.target.set(worldX(point.x) + .7, .7, worldZ(point.z) + .7);
    else if (mode === 'street') controls.target.set(worldX(3) + .7, .7, worldZ(3) + .7);
    const offset = mode === 'top' ? new THREE.Vector3(.1, Math.max(45, camera.position.distanceTo(controls.target)), .1) : mode === 'street' ? new THREE.Vector3(0, 2.4, 6.2) : new THREE.Vector3(51, 43, 56);
    camera.position.copy(controls.target).add(offset); resize(); controls.update();
  }
  function setFollow(id) {
    followId = typeof id === 'string' && state?.citizens.some(p => p.id === id) ? id : null; cinematic = false;
    if (followId) {
      const index = state.citizens.findIndex(p => p.id === followId), person = state.citizens[index], offset = npcDisplayOffset(index % 49);
      const pose = sampleNpcPose(person, nextState?.citizens[index], visualAlpha, state.tick);
      cameraMode = 'street'; positionFollowCamera({ x: worldX(pose.x) + offset.x, z: worldZ(pose.z) + offset.z, heading: pose.heading }); resize(); controls.update();
    }
    onFollowChange?.(followId);
  }
  function setCinematic(value) { cinematic = Boolean(value) && !reducedMotion; if (cinematic) { if (followId) onFollowChange?.(null); followId = null; } }
  function dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer.disconnect();
    renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('pointercancel', cancel); renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    controls.removeEventListener('change', viewChanged); controls.removeEventListener('start', manualView); controls.dispose();
    const geometries = new Set([boxGeometry]), allMaterials = new Set([...Object.values(materials), waterMaterial]);
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) for (const mat of Array.isArray(object.material) ? object.material : [object.material]) allMaterials.add(mat); });
    geometries.forEach(geometry => geometry.dispose()); allMaterials.forEach(mat => mat.dispose()); textures.forEach(map => map.dispose()); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); contextLostMessage?.remove();
  }
  return { update, resize, resetView, getView, setView, focus, setCameraMode, setFollow, setCinematic, dispose };
}
