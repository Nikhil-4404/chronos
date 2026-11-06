import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LIMITS } from './colony.js';
import { environmentAt } from './environment.js';
import { buildingForm } from './architecture.js';
import { sampleNpcPose, npcDisplayOffset, npcVisualSeed, blocksStreetView, renderFraction, updateRenderSample, smoothHeading, crossingHeight } from './activity.js';

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
  scene.fog = new THREE.FogExp2('#344751', .0038);
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
  function cameraBounds(mode) {
    controls.maxPolarAngle=mode==='sky'?Math.PI-.05:1.48;
    controls.minDistance=mode==='sky'?12:4;
    camera.fov=mode==='sky'?60:43;
  }
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
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 1, far: 350 });
  sun.shadow.bias = -.0003;
  sun.shadow.normalBias = .06;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#6bb6c4', .65);
  fill.position.set(45, 15, 40);
  scene.add(fill);

  const textures = new Set();
  const skyCenter = new THREE.Vector3();
  const moonCanvas = document.createElement('canvas'); moonCanvas.width = moonCanvas.height = 96;
  const moonContext = moonCanvas.getContext('2d'), moonMap = new THREE.CanvasTexture(moonCanvas);
  moonMap.colorSpace = THREE.SRGBColorSpace; textures.add(moonMap);
  const moonDisc = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: moonMap, transparent: true, depthWrite: false, fog: false }));
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), new THREE.MeshBasicMaterial({ color: '#ffe3a0', depthWrite: false, fog: false }));
  moonDisc.renderOrder = sunDisc.renderOrder = -100; scene.add(moonDisc, sunDisc);
  const haloCanvas = document.createElement('canvas'); haloCanvas.width = haloCanvas.height = 64;
  const haloContext = haloCanvas.getContext('2d'), haloGradient = haloContext.createRadialGradient(32,32,3,32,32,32);
  haloGradient.addColorStop(0, '#ffcf8ca0'); haloGradient.addColorStop(.3, '#ffc77a45'); haloGradient.addColorStop(1, '#ffc77a00'); haloContext.fillStyle = haloGradient; haloContext.fillRect(0,0,64,64);
  const haloMap = new THREE.CanvasTexture(haloCanvas); textures.add(haloMap);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); sunHalo.scale.set(30,30,1); sunHalo.renderOrder = -99; scene.add(sunHalo);
  let moonPhaseStamp = -1;
  function paintMoon(phase) {
    const stamp = Math.floor(phase * 256); if (stamp === moonPhaseStamp) return; moonPhaseStamp = stamp;
    const pixels = moonContext.createImageData(96,96), angle = phase * Math.PI * 2;
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const nx = (x-47.5)/46, ny = (y-47.5)/46, radius = nx*nx+ny*ny, index = (y*96+x)*4;
      if (radius > 1) continue;
      const surface = Math.sqrt(1-radius), lit = Math.max(0,nx*Math.sin(angle)-surface*Math.cos(angle));
      const craters = .81 + seeded(x*7+y*19)*.12 + Math.sin(nx*19+ny*11)*.04;
      const value = (20+lit*230)*craters; pixels.data[index]=value*.94; pixels.data[index+1]=value*.98; pixels.data[index+2]=value; pixels.data[index+3]=Math.min(255,surface*1600);
    }
    moonContext.putImageData(pixels,0,0); moonMap.needsUpdate = true;
  }
  const starPositions = new Float32Array(500*3);
  for (let i=0;i<500;i++) { const theta = seeded(i+80)*Math.PI*2, y=.12+seeded(i+912)*.88, r=Math.sqrt(1-y*y); starPositions.set([Math.cos(theta)*r*440,y*440,Math.sin(theta)*r*440],i*3); }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
  const stars = new THREE.Points(starGeometry,new THREE.PointsMaterial({color:'#d9e2cf',size:.65,transparent:true,opacity:0,depthWrite:false,fog:false})); stars.renderOrder=-98; scene.add(stars);
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
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400); scene.add(mesh); return mesh;
  }

  // Terrain continues to the horizon; the playable streets are not a floating display slab.
  const ground = cube(0, -.17, 0, 1200, .25, 1200, materials.ground);
  ground.material.map = maps.grass.clone(); ground.material.map.repeat.set(270, 270); textures.add(ground.material.map);

  const waterMaterial = new THREE.MeshPhysicalMaterial({ color: '#2c6869', roughness: .33, metalness: .2, clearcoat: .8 });
  const riverWater = cube(0, -.025, 0, 9.7, .06, 1200, waterMaterial);
  const riverIce = cube(0, .02, 0, 9.65, .04, 1200, plain('#b3d0cb', { roughness:.35,transparent:true,opacity:0 })); riverIce.visible=false;
  const ripples = Array.from({ length: 105 }, (_, i) => ({ x: -4.3 + seeded(i + 10) * 8.6, y: .02, z: -80 + seeded(i + 200) * 160, sx: .035, sy: .008, sz: .7 + seeded(i) * 2.2 }));
  const rippleMesh = instances(boxGeometry, new THREE.MeshBasicMaterial({ color: '#a7c4b0', transparent: true, opacity: .18 }), ripples);
  const riverBanks = [];
  for (const x of [-5.05, 5.05]) {
    cube(x, .08, 0, .38, .35, 1200, materials.stone); cube(x + Math.sign(x) * .8, .08, 0, 1.2, .16, 220, materials.paving);
    for (let z = -38; z <= 38; z += 4) riverBanks.push({ x, y: .65, z, sx: .06, sy: 1.1, sz: .06 });
    riverBanks.push({ x, y: 1.05, z: 0, sx: .06, sy: .06, sz: 78 });
  }
  instances(boxGeometry, materials.rail, riverBanks);
  const bridgeBarriers = new THREE.Group(); scene.add(bridgeBarriers);
  for (const z of [2, 6]) {
    cube(0, 2.28, worldZ(z), 16.6, .27, 3.2, materials.stone, true); cube(0, 2.43, worldZ(z), 16.5, .03, 2.12, materials.road);
    for (const side of [-1,1]) { const ramp=cube(side*10,1.24,worldZ(z),4.5,.22,3.2,materials.stone,true); ramp.rotation.z=-side*Math.atan2(2.1,4); }
    const bridgeArch = new THREE.TorusGeometry(1,.09,6,30,Math.PI);
    for (const side of [-1.45, 1.45]) {
      cube(0, 3.14, worldZ(z) + side, 16.8, .08, .08, materials.rail); cube(0, 2.72, worldZ(z) + side, 16.8, .05, .07, materials.rail);
      for (let x = -8; x <= 8; x += 1.1) cube(x, 2.78, worldZ(z) + side, .065, 1, .065, materials.rail);
      const arch = new THREE.Mesh(bridgeArch,materials.stone); arch.position.set(0,.15,worldZ(z)+side); arch.scale.set(8,1.8,2.5); arch.castShadow=true; scene.add(arch);
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
  // Bounds include level-five scaffolding/additions (wood) and all 25 crops per farm.
  const partBudgets=[8,8,8,8,36,28,12,16];
  const architecture = [materials.brick, materials.plaster, materials.steel, materials.roof, materials.rust, materials.grass, materials.stone, materials.rail].map((m,i) => makeDynamic(boxGeometry, m, LIMITS.buildings*partBudgets[i]));
  // Two care-house wings: 96 windows; converted rooms add at most 40 more.
  const windows = makeDynamic(boxGeometry, materials.warmWindow, LIMITS.buildings * 136);
  renderer.domElement.dataset.windowCapacity=String(windows.instanceMatrix.count);
  const roadMesh = makeDynamic(boxGeometry, materials.road, 3000); roadMesh.castShadow = false;
  const roofPeaks = makeDynamic(new THREE.ConeGeometry(1, 1, 4), materials.rust, LIMITS.buildings * 4);
  const gableShape=new THREE.Shape();gableShape.moveTo(-.5,0);gableShape.lineTo(.5,0);gableShape.lineTo(0,.65);gableShape.closePath();
  const gableGeometry=new THREE.ExtrudeGeometry(gableShape,{depth:1,bevelEnabled:false});gableGeometry.translate(0,0,-.5);
  const gables=makeDynamic(gableGeometry,materials.rust,LIMITS.buildings*4);
  const arches=makeDynamic(new THREE.TorusGeometry(1,.12,6,16,Math.PI),materials.body,LIMITS.buildings*8);
  const columns=makeDynamic(new THREE.CylinderGeometry(1,1,1,10),materials.body,LIMITS.buildings*8);
  const domes=makeDynamic(new THREE.SphereGeometry(1,12,8,0,Math.PI*2,0,Math.PI/2),materials.steel,LIMITS.buildings);
  const buildingPicks = makeDynamic(boxGeometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), LIMITS.buildings);
  buildingPicks.userData.kind = 'building'; buildingPicks.userData.entries = [];
  const buildingMeshes = [buildingPicks];
  const clearedTrees=new Set();
  let architectureStamp = '';
  function syncArchitecture() {
    const stamp = state.buildings.map(b => `${b.id}:${Math.floor(b.progress*20)}:${b.level||1}:${b.state||'Active'}:${Math.floor((b.condition??100)/10)}:${b.additions?.join(',')||''}:${b.project?.type||''}:${Math.floor((b.project?.progress||0)*20)}`).join('|');
    if (stamp === architectureStamp) return; architectureStamp = stamp;
    const meshes=[...architecture,windows,roofPeaks,gables,arches,columns,domes,roadMesh,buildingPicks];
    for (const mesh of meshes) mesh.count = 0;
    buildingInfo.length=0;buildingPicks.userData.entries=[];
    const palettes=['#c4a37b','#b3795d','#b9bea6','#7e9c91','#778f9a','#b49b73'];
    const roads=new Set();let clipped=0;
    function part(mesh,x,y,z,sx,sy,sz,tint=null,yaw=0) {
      if(mesh.count>=mesh.instanceMatrix.count){clipped++;return;}
      position.set(x,y,z);scale.set(sx,sy,sz);quaternion.setFromAxisAngle(yAxis,yaw);matrix.compose(position,quaternion,scale);
      mesh.setMatrixAt(mesh.count,matrix);if(tint)mesh.setColorAt(mesh.count,color.set(tint));mesh.count++;
    }
    function scaffold(x,z,width,depth,height) {
      for(const dx of [-width/2-.4,width/2+.4])for(const dz of [-depth/2-.4,depth/2+.4])part(architecture[7],x+dx,height/2,z+dz,.075,height,.075,'#b49b73');
      for(let y=1;y<height;y+=1.5)for(const dz of [-depth/2-.4,depth/2+.4])part(architecture[4],x,y,z+dz,width+.9,.075,.075,'#c3a373');
    }
    function roof(x,y,z,width,depth,style,tint='#8a624b') {
      if(style==='gable')part(gables,x,y,z,width+.15,1.7,depth+.2,tint);
      else part(architecture[3],x,y+.14,z,width+.15,.22,depth+.15,'#74847b');
    }
    function facade(x,z,width,depth,height,active=true) {
      const rows=Math.max(1,Math.floor(height/1.25)),cols=Math.max(2,Math.floor(width/1.25));
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)for(const side of [-1,1]) {
        const offset=(col-(cols-1)/2)*1.13;
        part(windows,x+offset,1+row*1.25,z+side*(depth/2+.035),.46,.62,.035,active?'#ffffff':'#16251f');
      }
      for(let row=0;row<rows;row++)for(const side of [-1,1])part(windows,x+side*(width/2+.035),1+row*1.25,z,.035,.62,.5,active?'#ffffff':'#16251f');
    }
    for(const b of state.buildings) {
      const x=worldX(b.x),z=worldZ(b.z),form=buildingForm(b),v=form.variant;
      const {width,depth,height}=form,progress=b.progress,ready=progress>=1,project=b.project;
      const derelict=b.state==='Derelict',active=b.state!=='Vacant'&&!derelict;
      color.set(palettes[v]);if(derelict)color.lerp(new THREE.Color('#555c53'),.6);else if(!active)color.multiplyScalar(.8);
      const tint='#'+color.getHexString(),material=architecture[b.kind==='workshop'?2:v%3];
      buildingInfo.push({...b,height,width,depth,baseColor:tint,worldX:x,worldZ:z});
      buildingPicks.userData.entries.push({id:b.id});part(buildingPicks,x,height/2,z,width,height+1.6,depth);
      part(architecture[6],x,.13,z,6.2,.2,6.2,ready?'#8b9180':'#ad9e80');
      for(const [axis,line,other]of[['x',b.entrance.x,b.entrance.z],['x',b.entrance.x+1,b.entrance.z],['z',b.entrance.z,b.entrance.x],['z',b.entrance.z+1,b.entrance.x]]) {
        const key=`${axis}:${line}:${other}`;if(roads.has(key))continue;roads.add(key);
        part(roadMesh,axis==='x'?worldX(line):worldX(other+.5),.08,axis==='z'?worldZ(line):worldZ(other+.5),axis==='x'?1.9:8,.1,axis==='z'?1.9:8);
      }
      if(!ready||project) {
        scaffold(x,z,width,depth,height+(project?.type==='expand'?2.2:.9));
        for(let i=0;i<4;i++)part(architecture[4],x-width/2+.3+i*.33,.35,z-depth/2+.5,.25,.4,1.2,'#a67f53');
      }
      if(form.footprint==='dock') {
        const side=b.entrance.x<5?1:-1;
        const builtLength=Math.max(.15,4.5*progress);
        part(architecture[4],x+side*(builtLength-4.5)/2,.35,z,builtLength,.22,4.1,'#b3966b');
        for(const dx of [-1.8,1.8])for(const dz of [-1.7,1.7])part(columns,x+dx,-.1,z+dz,.12,1.2,.12,'#6b6248');
        if(progress>.65) {part(architecture[4],x-side*.8,2.4,z,.22,4.2,.22,'#a68959');part(architecture[4],x+side*.3,4.2,z,3.2,.2,.25,'#c3a46c');}
        part(architecture[7],x-side*1.3,.85,z-1.7,1.3,1.05,.8,'#738a7e');
        for(const dz of [-1.6,1.6])part(architecture[7],x,.7,z+dz,4.4,.08,.08,'#7e8b77');
        continue;
      }
      if(['field','woodland','quarry','garden'].includes(form.footprint)&&ready) {
        if(form.footprint==='field') {
          for(let row=0;row<5;row++) {
            part(architecture[4],x-2+row,.27,z,.65,.15,5,'#65503c');
            for(let col=0;col<5;col++)part(architecture[5],x-2+row,.5+(v%2)*.2,z-2+col,.4,.5,.45,v%2?'#b1ad61':'#719253');
          }
          part(architecture[4],x+1.8,.85,z-1.9,1.2,1.2,1.3,'#957552');roof(x+1.8,1.5,z-1.9,1.3,1.4,'gable');
        }
        if(form.footprint==='garden') {
          part(architecture[5],x,.26,z,5.8,.13,5.8,'#56855c');part(architecture[6],x,.4,z,1.2,.4,1.2,'#a3c6bd');
          for(const side of [-1.9,1.9])part(architecture[4],x+side,.5,z+1.9,1.5,.2,.6,'#b28d61');
          for(const dx of [-1,1])for(const dz of [-1,1])part(columns,x+dx,.95,z+dz,.07,1.5,.07,'#9b9272');roof(x,1.7,z,2.5,2.5,'gable');
        }
        if(form.footprint==='woodland')for(const dx of [-1.5,1.4])for(const dz of [-1.6,1.2]) {
          part(architecture[4],x+dx,1,z+dz,.2,2,.2,'#776047');part(roofPeaks,x+dx,2.3,z+dz,1.3,3.1,1.3,'#638354');
        }
        if(form.footprint==='quarry')for(let i=0;i<7;i++)part(architecture[6],x-2+(i%3)*1.3,.5+(i%2)*.3,z-1.5+Math.floor(i/3)*1.2,1.1,1+(i%2)*.5,1,'#a9b0a1');
        continue;
      }
      const wallHeight=Math.max(.12,height*progress),roofReady=progress>.85&&!(b.additions||[]).includes('salvaged-roof')&&!(project?.type==='salvage'&&project.progress>.12);
      if(form.footprint==='courtyard') {
        for(const side of [-1,1]) {
          part(material,x+side*width*.34,wallHeight/2+.2,z,width*.3,wallHeight,depth,tint);
          if(roofReady)roof(x+side*width*.34,height+.2,z,width*.3,depth,form.roof==='dome'?'flat':form.roof);
          if(ready)facade(x+side*width*.34,z,width*.3,depth,height,active);
        }
        part(material,x,wallHeight/2+.2,z-depth*.36,width*.4,wallHeight,depth*.28,tint);
        if(roofReady)roof(x,height+.2,z-depth*.36,width*.4,depth*.28,'flat');
        part(architecture[5],x,.3,z+.3,width*.32,.14,depth*.6,'#7b946c');
        if(b.kind==='hospital'&&roofReady) {
          for(const side of [-1,1])part(arches,x+side*1.6,1.1,z+depth/2+.04,.65,1,1,'#c4c4a7');
          part(columns,x,height+.1,z-depth*.35,1,1.1,1,'#bbc1a9');part(domes,x,height+.65,z-depth*.35,1.15,1.2,1.15,'#729b91');
        }
      } else if(form.footprint==='L'||form.footprint==='hall') {
        part(material,x-width*.18,wallHeight/2+.2,z,width*.64,wallHeight,depth,tint);
        part(material,x+width*.31,wallHeight/2+.2,z-depth*.27,width*.36,wallHeight,depth*.46,tint);
        if(roofReady) {roof(x-width*.18,height+.2,z,width*.64,depth,form.roof);roof(x+width*.31,height+.2,z-depth*.27,width*.36,depth*.46,form.roof);}
        if(ready) {facade(x-width*.18,z,width*.64,depth,height,active);facade(x+width*.31,z-depth*.27,width*.36,depth*.46,height,active);}
        part(architecture[4],x+width*.28,.65,z+depth*.22,width*.35,.8,depth*.33,'#9b815b');
      } else if(form.footprint==='market') {
        part(material,x,wallHeight/2+.2,z-depth*.25,width,wallHeight,depth*.48,tint);
        if(roofReady)roof(x,height+.2,z-depth*.25,width,depth*.48,'gable');
        if(ready)for(let stall=0;stall<3;stall++) {
          const sx=x-1.8+stall*1.8;part(architecture[4],sx,.85,z+1.2,1.5,1.1,.75,'#ad8958');
          part(architecture[3],sx,2.1,z+1.1,1.65,.16,1.5,['#a8b283','#c29f70','#82a79d'][stall]);
          for(const side of [-.65,.65])part(columns,sx+side,1.4,z+1.65,.045,2.5,.045,'#99895e');
        }
      } else {
        part(material,x,wallHeight/2+.2,z,width,wallHeight,depth,tint);
        if(roofReady)roof(x,height+.2,z,width,depth,form.roof);
        if(ready)facade(x,z,width,depth,height,active);
      }
      if(!ready)continue;
      part(architecture[4],x,.85,z+depth/2+.035,.7,1.4,.06,derelict?'#7c7156':'#40594d');
      if(form.footprint==='gallery') {
        for(const side of [-1,1])part(columns,x+side*width*.4,height/2,z+depth/2+.55,.07,height,.07,'#a49472');
        part(architecture[4],x,height*.55,z+depth/2+.55,width+.2,.14,1.1,'#b39b73');
        for(let col=0;col<7;col++)part(architecture[7],x-width/2+col*width/6,height*.55+.5,z+depth/2+1,.04,.9,.04,'#c3b997');
      }
      if(form.footprint==='tower') {
        for(const side of [-1,1])part(architecture[6],x+side*width*.45,height+.6,z,width*.12,1.1,depth,'#acb49c');
        part(architecture[6],x,height+.6,z-depth*.45,width,1.1,depth*.12,'#acb49c');
      }
      if(b.kind==='workshop') {part(architecture[6],x-width*.3,height+.8,z-depth*.2,.55,1.8,.55,'#8e9989');part(architecture[2],x-width*.18,height+.45,z,width*.45,.15,depth*.6,'#557c7c');}
      if((b.additions||[]).includes('shopfront')) {
        part(architecture[4],x,1.8,z+depth/2+.6,width*.82,.15,1.2,'#be9a69');part(architecture[4],x,.65,z+depth/2+.6,width*.8,.65,.65,'#9f7d50');
      }
      if((b.additions||[]).includes('courtyard-shed')) {part(architecture[4],x+width*.3,.9,z-depth*.2,1.5,1.5,2,'#aa8c60');roof(x+width*.3,1.7,z-depth*.2,1.6,2.1,'flat');}
      if((b.additions||[]).includes('converted-home')) {part(architecture[1],x,height*.3,z+depth*.25,width*.7,height*.6,.2,'#b5b499');facade(x,z+depth*.22,width*.7,depth*.1,height*.6,active);}
      if(project?.type==='expand') {
        const rise=1.6*project.progress;part(material,x,height+.2+rise/2,z,width*.72,Math.max(.03,rise),depth*.72,tint);
      }
      if(derelict)for(const side of [-1,1])part(architecture[4],x+side,1.5,z+depth/2+.08,.75,.12,.08,'#8d7855');
      if((b.inventory?.wood||0)>4)for(let i=0;i<3;i++)part(architecture[4],x+width*.35,.35+i*.12,z+depth*.32,.9,.13,.7,'#bb9b6c');
    }
    skyCenter.set(buildingInfo.reduce((sum,b)=>sum+b.worldX,0)/Math.max(1,buildingInfo.length),0,buildingInfo.reduce((sum,b)=>sum+b.worldZ,0)/Math.max(1,buildingInfo.length));
    clearedTrees.clear();
    treeEntries.forEach((entry,i)=>{if(buildingInfo.some(b=>Math.abs(b.worldX-entry.x)<b.width/2+.6&&Math.abs(b.worldZ-entry.z)<b.depth/2+.6))clearedTrees.add(i);});
    trunkEntries.forEach((entry,i)=>{position.set(entry.x,entry.y,entry.z);scale.set(entry.sx,entry.sy,entry.sz);if(clearedTrees.has(i))scale.setScalar(0);matrix.compose(position,quaternion.identity(),scale);naturalTrunks.setMatrixAt(i,matrix);});naturalTrunks.instanceMatrix.needsUpdate=true;
    powerBuilding=buildingInfo.find(b=>b.kind==='workshop'&&b.progress===1&&b.state!=='Derelict');
    for(const mesh of meshes) {mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    renderer.domElement.dataset.geometryClipped=String(clipped);renderer.domElement.dataset.windowInstances=String(windows.count);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 27; i++) {
    const z = -37 + i * 2.8; if (Math.abs(z - worldZ(2)) > 2 && Math.abs(z - worldZ(6)) > 2) addTree(side * 6.4, z, .9 + seeded(i + 83) * .4);
  }
  for (let i = 0; i < 35; i++) { const side = i % 2 ? -1 : 1; addTree(side * (46 + seeded(i + 1) * 18), -48 + seeded(i + 16) * 96, 1.3 + seeded(i) * .8); }
  const naturalTrunks=instances(new THREE.CylinderGeometry(1, 1, 1, 6), materials.trunk, trunkEntries, true);
  const trees = instances(new THREE.IcosahedronGeometry(1, 1), materials.tree, treeEntries, true);
  for (const x of [1, 3, 7, 9]) for (const z of [1, 3, 5, 7]) {
    const px = worldX(x) + 1.3, pz = worldZ(z) + 1.3; cube(px, 1.55, pz, .08, 2.9, .08, materials.rail); cube(px - .32, 2.95, pz, .72, .07, .07, materials.rail);
    lamps.push({ x: px - .6, y: 2.91, z: pz, sx: .3, sy: .08, sz: .2, east: x > 5 });
  }
  const lampMesh = instances(boxGeometry, materials.warmWindow, lamps);
  const weatherPositions = new Float32Array(360*3);
  const weatherGeometry = new THREE.BufferGeometry(); weatherGeometry.setAttribute('position',new THREE.BufferAttribute(weatherPositions,3));
  const precipitation = new THREE.Points(weatherGeometry,new THREE.PointsMaterial({color:'#c6e0e1',size:.12,transparent:true,opacity:.4,depthWrite:false})); precipitation.frustumCulled=false; scene.add(precipitation);
  // Clouds stay above the city camera's full orbit envelope, including the high overview.
  const cloudEntries = Array.from({length:30},(_,i)=>({x:(seeded(i+700)-.5)*360,y:560+seeded(i+705)*80,z:(seeded(i+710)-.5)*360,sx:12+seeded(i+720)*16,sy:2+seeded(i+730)*3,sz:6+seeded(i+740)*8}));
  const clouds = instances(new THREE.IcosahedronGeometry(1,2),new THREE.MeshBasicMaterial({color:'#bdc9c3',transparent:true,opacity:0,depthWrite:false,fog:false}),cloudEntries); clouds.castShadow=false;
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
  const headings = new Map();
  const carts = makeDynamic(boxGeometry,materials.body,LIMITS.shipments), cartWheels = makeDynamic(new THREE.CylinderGeometry(1,1,1,10).rotateZ(Math.PI/2),materials.dark,LIMITS.shipments*4);
  const barges = makeDynamic(boxGeometry,materials.body,LIMITS.shipments), bargeRims = makeDynamic(boxGeometry,materials.body,LIMITS.shipments*4), freight = makeDynamic(boxGeometry,materials.body,LIMITS.shipments*6);
  const dockHooks=makeDynamic(boxGeometry,materials.rail,LIMITS.buildings), dockLoads=makeDynamic(boxGeometry,materials.body,LIMITS.buildings);
  const smokeGeometry = new THREE.BufferGeometry(), smokePositions = new Float32Array(24 * 3);
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
  const smoke = new THREE.Points(smokeGeometry, new THREE.PointsMaterial({ color: '#b1b5a4', size: .65, transparent: true, opacity: .2, depthWrite: false, sizeAttenuation: true })); smoke.frustumCulled = false; scene.add(smoke);
  let powerBuilding = null;
  const selectionBox = new THREE.Box3Helper(new THREE.Box3(), '#dca15a'); scene.add(selectionBox); selectionBox.visible = false;
  const selectionRing = new THREE.Mesh(new THREE.RingGeometry(.47, .56, 40), new THREE.MeshBasicMaterial({ color: '#ffbd70', side: THREE.DoubleSide, depthWrite: false })); selectionRing.rotation.x = -Math.PI / 2; selectionRing.visible = false; scene.add(selectionRing);
  const routeMaterial = new THREE.MeshBasicMaterial({ color: '#80d1c6', transparent: true, opacity: .82 }), routeGroup = new THREE.Group(); scene.add(routeGroup);
  const routeFlows = makeDynamic(boxGeometry, new THREE.MeshBasicMaterial({ color: '#5eaaa6', transparent: true, opacity: .65 }), 1024); routeFlows.castShadow = false;
  let state = null, nextState = null, nextPeople = new Map(), nextShipments = new Map(), carrierShipments = new Map(), currentLayer = 'city', selection = null, playing = false, speed = 1, visualAlpha = 0;
  let renderSample=null, tickDurationMs=500, renderDelta=1/60;
  let routeKey = '', frame = 0, disposed = false, lastTime = performance.now(), contextLostMessage = null;
  let viewportWidth = 0, viewportHeight = 0;
  let fpsFrames = 0, fpsStart = lastTime, measuringFps = false;
  const frameTimes=[];
  renderer.domElement.dataset.fps = '0.0';
  renderer.domElement.dataset.simulationTick = '0.000';
  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight); camera.aspect = width / height;
    camera.zoom = cameraMode === 'street'||cameraMode==='sky' ? 1 : Math.min(1, camera.aspect / 1.18); camera.updateProjectionMatrix();
    if (width !== viewportWidth || height !== viewportHeight) { renderer.setSize(width, height, false); viewportWidth = width; viewportHeight = height; }
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  function updateAppearance(env = environmentAt(state?.tick || 0,state?.seed ?? 731)) {
    if (!state) return;
    const day=env.sun.daylight, night=1-day;
    const effects = state.effects; bridgeBarriers.visible = Boolean(effects.bridgeClosed); hospitalExpansion.visible = Boolean(effects.hospital); parkExpansion.visible = Boolean(effects.park);
    windows.material.color.set(night > .3 ? '#ffbd78' : '#537e83');
    lamps.forEach((lamp, index) => lampMesh.setColorAt(index, color.set(effects.blackout && lamp.east ? '#263d3b' : '#ffc17a'))); lampMesh.instanceColor.needsUpdate = true;
    const sunDirection=new THREE.Vector3(env.sun.direction.x,env.sun.direction.y,env.sun.direction.z), moonDirection=new THREE.Vector3(env.moon.direction.x,env.moon.direction.y,env.moon.direction.z);
    sun.position.copy(skyCenter).addScaledVector(sunDirection,140); sun.target.position.copy(skyCenter); sun.target.updateMatrixWorld();
    sun.intensity=Math.max(0,Math.sin(env.sun.elevation))*3.1*(1-env.cloud*.6); sun.castShadow=env.sun.elevation>.025; sun.color.set(env.sun.elevation<.2?'#ffb16b':'#ffe1b6');
    fill.position.copy(skyCenter).addScaledVector(moonDirection,95); fill.intensity=.25+night*env.moon.illumination*.38; hemisphere.intensity=.92+day*1.15-env.cloud*.22;
    const background=new THREE.Color('#607f88').lerp(new THREE.Color('#172d3d'),night).lerp(new THREE.Color('#6c7f80'),env.cloud*.3); scene.background.copy(background); scene.fog.color.copy(background);
    // Keep the growing city's overview readable while retaining street-level weather haze.
    scene.fog.density=(.0038+env.precipitation*.003)*Math.min(1,100/Math.max(100,camera.position.distanceTo(controls.target)));
    renderer.toneMappingExposure=1.13+night*.18; waterMaterial.color.set(night>.5?'#254b57':'#477d79'); waterMaterial.roughness=.3+env.rain*.3;
    sunDisc.position.copy(camera.position).addScaledVector(sunDirection,410); sunDisc.lookAt(camera.position); sunHalo.position.copy(sunDisc.position); sunDisc.visible=sunHalo.visible=env.sun.elevation>-.02; sunHalo.material.opacity=(1-env.cloud*.85)*day;
    sunDisc.material.color.set(env.sun.elevation<.16?'#ffc27d':'#fff0c7');
    moonDisc.position.copy(camera.position).addScaledVector(moonDirection,405); moonDisc.lookAt(camera.position); moonDisc.visible=env.moon.elevation>-.02; moonDisc.material.opacity=(1-env.cloud*.8)*(.45+night*.55); paintMoon(env.moon.phase);
    stars.position.copy(camera.position); stars.material.opacity=night*night*(1-env.cloud)*.75;
    const frost=clamp((2-env.temperature)/14,0,1)*.7;
    materials.ground.color.set('#465b45').lerp(new THREE.Color('#b9c7bc'),frost); materials.grass.color.set('#4f7653').lerp(new THREE.Color('#b5c5b5'),frost*.8); materials.roof.color.set('#566c66').lerp(new THREE.Color('#b8c9c2'),frost*.8); materials.road.roughness=.88-env.mud*.45;
    riverWater.position.y=(env.river.level-.5)*.7-.025; riverIce.position.y=riverWater.position.y+.05; riverIce.visible=env.river.ice>.05; riverIce.material.opacity=env.river.ice*.92; rippleMesh.visible=env.river.ice<.65;
    clouds.material.opacity=env.cloud*.4; clouds.material.color.set(day>.4?'#cad4ca':'#556d78');
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
    state = snapshot; nextState = options.nextState || snapshot; currentLayer = options.layer || 'city'; selection = options.selected || null;
    playing = Boolean(options.playing); speed = Number.isFinite(options.speed) ? options.speed : 1;
    const alpha = clamp(Number(options.alpha) || 0, 0, 1);
    tickDurationMs=Number.isFinite(options.tickDurationMs)?Math.max(1,options.tickDurationMs):500/Math.max(.01,speed);
    renderSample=updateRenderSample(renderSample,{tick:snapshot.tick,seed:snapshot.seed,alpha,sampledAt:options.sampledAt},performance.now());
    nextPeople=new Map((nextState.citizens||[]).map(p=>[p.id,p])); nextShipments=new Map((nextState.shipments||[]).map(s=>[s.id,s])); carrierShipments=new Map((state.shipments||[]).map(s=>[s.carrierId,s]));
    const living=new Set(state.citizens.map(p=>p.id)); for(const id of headings.keys()) if(!living.has(id)) headings.delete(id);
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
  let personSize = 1, personGround = 0;
  function putPart(mesh, index, px, py, pz, sx, sy, sz, heading = 0, lean = 0, tint = null) {
    position.set(px, py * personSize + personGround, pz); scale.set(sx * personSize, sy * personSize, sz * personSize); euler.set(lean, heading, 0, 'YXZ'); quaternion.setFromEuler(euler); matrix.compose(position, quaternion, scale); mesh.setMatrixAt(index, matrix); if (tint) mesh.setColorAt(index, color.set(tint));
  }
  function limb(mesh, index, px, py, pz, side, yaw, angle, arm, tint) {
    const length = arm ? .29 : .32; limbPosition.set(side * (arm ? .175 : .08), -length / 2 * Math.cos(angle), -length / 2 * Math.sin(angle));
    personRotation.setFromAxisAngle(yAxis, yaw); limbPosition.applyQuaternion(personRotation); position.set(px + limbPosition.x * personSize, (py + limbPosition.y) * personSize + personGround, pz + limbPosition.z * personSize);
    euler.set(angle, yaw, 0, 'YXZ'); limbRotation.setFromEuler(euler); scale.set((arm ? .07 : .075) * personSize, length * personSize, (arm ? .075 : .1) * personSize); matrix.compose(position, limbRotation, scale); mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, color.set(tint));
  }
  function animatePeople() {
    lastPoses.clear();
    const people = state.citizens, count = Math.min(capacity, people.length);
    for (const mesh of [npc.torso, npc.head, npc.hips, npc.hats, npc.props, npcPicks]) mesh.count = count; npc.arms.count = npc.legs.count = count * 2;
    for (let i = 0; i < count; i++) {
      const person = people[i], next = nextPeople.get(person.id) || person, pose = sampleNpcPose(person, next, visualAlpha, state.tick), identity=npcVisualSeed(person.id), shipment=carrierShipments.get(person.id);
      const previousYaw=headings.get(person.id), desiredYaw=pose.moving||person.route?.length>1?pose.heading:(previousYaw??pose.heading);
      const yaw=previousYaw===undefined?desiredYaw:smoothHeading(previousYaw,desiredYaw,renderDelta); headings.set(person.id,yaw);
      const { x: offsetX, z: offsetZ } = npcDisplayOffset(person.id);
      const px = worldX(pose.x) + (shipment?.onRiver?0:offsetX), pz = worldZ(pose.z) + (shipment?.onRiver?0:offsetZ), bob = pose.bodyBob || 0;
      let tint = npcColors[identity % npcColors.length]; if (currentLayer === 'wellbeing') tint = person.wellbeing < 55 ? '#d3764f' : person.wellbeing < 75 ? '#d3b05b' : '#68b7a0';
      personSize = shipment?.onRiver?0:person.age < 12 ? .6 + person.age / 40 : 1; personGround=crossingHeight(px,pz);
      const skin = skinColors[identity % skinColors.length];
      putPart(npc.torso, i, px, .64 + bob, pz, .23, .32, .16, yaw, 0, tint); putPart(npc.hips, i, px, .43 + bob, pz, .22, .12, .15, yaw, 0, '#283b3d'); putPart(npc.head, i, px, .92 + bob, pz, .105, .12, .105, yaw, 0, skin);
      const work = pose.activity === 'working' ? -.85 + pose.workMotion * .35 : pose.activity === 'eating' ? -1.45 + pose.workMotion * .25 : pose.activity === 'socializing' ? -.3 + Math.sin(state.tick+visualAlpha + identity) * .25 : 0;
      for (const side of [-1, 1]) { const j = i * 2 + Number(side > 0); limb(npc.arms, j, px, .78 + bob, pz, side, yaw, work || side * pose.armSwing, true, tint); limb(npc.legs, j, px, .45 + bob, pz, side, yaw, side * pose.legSwing, false, '#27383b'); }
      const hat = /Builder|Mason|Craftsperson/.test(person.role); putPart(npc.hats, i, px, hat ? 1.01 + bob : .95, pz, hat ? .12 : 0, hat ? .055 : 0, hat ? .12 : 0, yaw, 0, '#d5a557');
      const loaded=Boolean(person.cargo?.amount>0&&person.mode!=='cart'&&!shipment?.onRiver), carries = loaded||pose.activity === 'working' || pose.activity === 'eating', propX = px + Math.sin(yaw) * .23, propZ = pz + Math.cos(yaw) * .23;
      putPart(npc.props, i, propX, .66 + bob + (pose.workMotion || 0) * .025, propZ, carries ? (loaded ? .3 : .2) : 0, carries ? (loaded ? .25 : .055) : 0, carries ? (loaded ? .3 : .13) : 0, yaw, -.12, loaded?'#b28b55':pose.activity === 'eating' ? '#d9b982' : '#648a89');
      if(shipment?.onRiver) { personSize=1; personGround=0; putPart(npcPicks,i,px,.65,pz,1,.7,2.7,yaw); }
      else putPart(npcPicks, i, px, .59, pz, .18, .55, .18);
      lastPoses.set(person.id, { x: px, z: pz, heading: yaw, ground:personGround });
      if (selection?.kind === 'citizen' && selection.id === person.id) selectionRing.position.set(px, .22+personGround, pz);
    }
    for (const mesh of [...Object.values(npc), npcPicks]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    if (followId && !people.some(p => p.id === followId)) { followId = null; onFollowChange?.(null); }
    const followed = followId && lastPoses.get(followId);
    if (followed) positionFollowCamera(followed);
  }
  function positionFollowCamera(pose, snap=false) {
    const amount=snap||reducedMotion?1:1-Math.exp(-renderDelta*9), ground=pose.ground||0;
    controls.target.lerp(new THREE.Vector3(pose.x,.65+ground,pose.z),amount);
    camera.position.lerp(new THREE.Vector3(pose.x + Math.sin(pose.heading) * 6.2,3.15+ground,pose.z + Math.cos(pose.heading) * 6.2),amount);
  }
  function animateCargo() {
    for(const mesh of [carts,cartWheels,barges,bargeRims,freight,dockHooks,dockLoads]) mesh.count=0;
    function put(mesh,x,y,z,sx,sy,sz,tint,yaw=0) {
      if(mesh.count>=mesh.instanceMatrix.count) return;
      position.set(x,y,z);scale.set(sx,sy,sz);quaternion.setFromAxisAngle(yAxis,yaw);matrix.compose(position,quaternion,scale);mesh.setMatrixAt(mesh.count,matrix);
      if(tint)mesh.setColorAt(mesh.count,color.set(tint));mesh.count++;
    }
    const riverY=riverWater.position.y;
    for(const shipment of state.shipments||[]) {
      const next=nextShipments.get(shipment.id), pose=lastPoses.get(shipment.carrierId);
      if(shipment.mode==='barge'&&shipment.onRiver) {
        const x=worldX(shipment.x+(next?.onRiver?(next.x-shipment.x)*visualAlpha:0)), z=worldZ(shipment.z+(next?.onRiver?(next.z-shipment.z)*visualAlpha:0));
        const yaw=next?.onRiver&&Math.hypot(next.x-shipment.x,next.z-shipment.z)>.00001?Math.atan2(next.x-shipment.x,next.z-shipment.z):(pose?.heading||0);
        put(barges,x,riverY+.32,z,2.15,.42,5.1,'#795b3e',yaw);
        for(const side of [-1,1]) {
          put(bargeRims,x+Math.cos(yaw)*side,riverY+.68,z-Math.sin(yaw)*side,.14,.4,5.2,'#a68357',yaw);
          put(bargeRims,x+Math.sin(yaw)*side*2.5,riverY+.67,z+Math.cos(yaw)*side*2.5,2.1,.4,.16,'#9d784f',yaw);
        }
        const crateCount=shipment.loaded?Math.min(6,Math.max(1,Math.ceil(shipment.amount/4))):0;
        for(let c=0;c<crateCount;c++) {
          const localX=(c%2-.5)*.75,localZ=(Math.floor(c/2)-1)*1.1;
          put(freight,x+localX*Math.cos(yaw)+localZ*Math.sin(yaw),riverY+.9,z-localX*Math.sin(yaw)+localZ*Math.cos(yaw),.65,.6,.8,shipment.resource==='stone'?'#969d91':'#bb965e',yaw);
        }
      } else if(shipment.mode==='cart'&&pose) {
        const yaw=pose.heading,x=pose.x-Math.sin(yaw)*.75,z=pose.z-Math.cos(yaw)*.75,y=pose.ground||0;
        put(carts,x,y+.55,z,.8,.2,1.05,'#a17c51',yaw);
        for(const side of [-1,1]) for(const end of [-1,1]) put(cartWheels,x+Math.cos(yaw)*side*.47+Math.sin(yaw)*end*.36,y+.32,z-Math.sin(yaw)*side*.47+Math.cos(yaw)*end*.36,.11,.29,.29,null,yaw);
        if(shipment.loaded) put(freight,x,y+.88,z,.7,.45,.8,shipment.resource==='stone'?'#9d9f90':'#bf995d',yaw);
      }
    }
    for(const dock of state.docks||[]) {
      const b=state.buildings.find(place=>place.id===dock.buildingId);if(!b)continue;
      const active=(state.shipments||[]).find(s=>['loading','unloading'].includes(s.state)&&(s.sourceId===b.id||s.destinationId===b.id));
      const x=worldX(b.x),z=worldZ(b.z),side=b.entrance.x<5?1:-1,drop=active?2.2+Math.sin((state.tick+visualAlpha)*1.6)*.65:1.2;
      put(dockHooks,x+side*1.2,4.1-drop/2,z,.035,drop,.035,null);
      if(active?.loaded)put(dockLoads,x+side*1.2,4.1-drop-.2,z,.5,.45,.55,'#b58e58');
    }
    for(const mesh of [carts,cartWheels,barges,bargeRims,freight,dockHooks,dockLoads]) {mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
  function animateEnvironment(tick) {
    const t = reducedMotion ? 0 : tick;
    const env=environmentAt(tick,state.seed??731); updateAppearance(env);
    precipitation.visible=!reducedMotion&&env.precipitation>.06; precipitation.material.size=env.snow>.2 ? .18 : .08;precipitation.material.opacity=env.precipitation*.65;
    if(precipitation.visible) {
      const fall=env.snow>.2 ? .35 : 3;
      for(let i=0;i<360;i++) {weatherPositions[i*3]=camera.position.x+(seeded(i+91)-.5)*85+Math.sin(t*.01+i)*env.wind.speed*.15;weatherPositions[i*3+1]=((seeded(i+120)*42-t*fall)%42+42)%42;weatherPositions[i*3+2]=camera.position.z+(seeded(i+150)-.5)*85;}
      weatherGeometry.attributes.position.needsUpdate=true;
    }
    cloudEntries.forEach((entry,i)=>{position.set(((entry.x+Math.cos(env.wind.direction)*t*.025+200)%400+400)%400-200,entry.y,((entry.z+Math.sin(env.wind.direction)*t*.025+200)%400+400)%400-200);scale.set(entry.sx,entry.sy,entry.sz);matrix.compose(position,quaternion.identity(),scale);clouds.setMatrixAt(i,matrix);});clouds.instanceMatrix.needsUpdate=true;
    ripples.forEach((ripple, i) => {
      position.set(ripple.x + Math.sin(t * .03 + i) * .06, ripple.y, ((ripple.z + t * .15 + 80) % 160) - 80); scale.set(ripple.sx, ripple.sy, ripple.sz); matrix.compose(position, quaternion.identity(), scale); rippleMesh.setMatrixAt(i, matrix);
    }); rippleMesh.instanceMatrix.needsUpdate = true;
    treeEntries.forEach((entry, i) => {
      position.set(entry.x + Math.sin(t * .08 + i) * .035, entry.y, entry.z + Math.cos(t * .06 + i) * .025); scale.set(entry.sx, entry.sy, entry.sz); quaternion.setFromAxisAngle(yAxis, Math.sin(t * .015 + i) * .04); matrix.compose(position, quaternion, scale); trees.setMatrixAt(i, matrix);
      // Cut away foreground foliage so the street camera can see its subject.
      if (clearedTrees.has(i) || cameraMode === 'street' && camera.position.y < 8 && blocksStreetView(entry, camera.position, controls.target)) { scale.setScalar(0); matrix.compose(position, quaternion, scale); trees.setMatrixAt(i, matrix); }
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
    const elapsedMs=Math.max(0,time-lastTime),delta = clamp(elapsedMs / 1000, 0, .12); lastTime = time; renderDelta=delta;
    if (document.hidden || contextLostMessage || !container.clientWidth || !container.clientHeight) {
      fpsFrames = 0; measuringFps = false;frameTimes.length=0;
      return;
    }
    if (measuringFps) {frameTimes.push(elapsedMs);if(frameTimes.length>240)frameTimes.shift();}
    else { fpsStart = time; fpsFrames = 0; measuringFps = true; }
    visualAlpha=renderFraction(renderSample?.sampledAt??time,renderSample?.alpha??0,time,tickDurationMs,playing);
    if (state) { const tick = state.tick + visualAlpha; animatePeople(); animateCargo(); animateEnvironment(tick); }
    if (cinematic && interactive && !reducedMotion) { const offset = camera.position.clone().sub(controls.target); offset.applyAxisAngle(yAxis, delta * .025); camera.position.copy(controls.target).add(offset); }
    controls.update(); if(cameraMode==='sky')camera.position.y=Math.max(1.2,camera.position.y); renderer.render(scene, camera);
    fpsFrames++;
    if (time - fpsStart >= 1000) {
      renderer.domElement.dataset.fps = (fpsFrames * 1000 / (time - fpsStart)).toFixed(1);
      renderer.domElement.dataset.simulationTick = ((state?.tick || 0) + visualAlpha).toFixed(3);
      const sorted=[...frameTimes].sort((a,b)=>a-b);
      renderer.domElement.dataset.frameP95Ms=(sorted[Math.floor((sorted.length-1)*.95)]||0).toFixed(2);
      renderer.domElement.dataset.frameP99Ms=(sorted[Math.floor((sorted.length-1)*.99)]||0).toFixed(2);
      renderer.domElement.dataset.slowFrames=String(frameTimes.filter(ms=>ms>50).length);
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
    cameraMode = 'orbit'; cameraBounds('orbit'); if (followId) onFollowChange?.(null); followId = null;
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
    try { cameraMode = ['orbit', 'street', 'top','sky'].includes(view.mode) ? view.mode : 'orbit'; cameraBounds(cameraMode); camera.position.fromArray(view.position); controls.target.fromArray(view.target); resize(); controls.update(); }
    finally { applyingView = false; }
  }
  function focus(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const target = new THREE.Vector3(worldX(point.x) + .7, .7, worldZ(point.z) + .7), offset = camera.position.clone().sub(controls.target);
    if(cameraMode==='sky')offset.set(17,12,19);
    offset.setLength(cameraMode === 'street' ? 6.5 : Math.min(29, offset.length())); controls.target.copy(target); camera.position.copy(target).add(offset); controls.update();
  }
  function setCameraMode(mode) {
    if (!['orbit', 'street', 'top','sky'].includes(mode)) return; cameraMode = mode; cameraBounds(mode); cinematic = false;
    if(mode==='sky') {
      if(followId)onFollowChange?.(null);followId=null;
      const env=environmentAt((state?.tick||0)+visualAlpha,state?.seed??731);
      const body=env.sun.elevation>0?env.sun:env.moon.elevation>0?env.moon:null;
      const direction=body?new THREE.Vector3(body.direction.x,body.direction.y,body.direction.z):new THREE.Vector3(.3,.25,-.9).normalize();
      const horizontal=new THREE.Vector3(direction.x,0,direction.z).normalize();
      const radius=Math.max(30,...(state?.buildings||[]).map(b=>Math.hypot(worldX(b.x)-skyCenter.x,worldZ(b.z)-skyCenter.z)))+16;
      camera.position.copy(skyCenter).addScaledVector(horizontal,-radius);camera.position.y=3.2;
      controls.target.copy(camera.position).addScaledVector(direction,80);resize();controls.update();return;
    }
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
      const person = state.citizens.find(p => p.id === followId), offset = npcDisplayOffset(person.id);
      const pose = sampleNpcPose(person, nextPeople.get(person.id), visualAlpha, state.tick),x=worldX(pose.x)+offset.x,z=worldZ(pose.z)+offset.z;
      cameraMode = 'street'; cameraBounds('street'); positionFollowCamera({ x,z, heading:pose.heading,ground:crossingHeight(x,z) },true); resize(); controls.update();
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
