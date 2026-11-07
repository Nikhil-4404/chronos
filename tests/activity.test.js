import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleNpcPose, npcDisplayOffset, npcVisualSeed, blocksStreetView, renderFraction, updateRenderSample, smoothHeading, crossingHeight, npcGroundHeight, riverCrew } from '../src/activity.js';
import { createTimeline, getState } from '../src/simulation.js';

test('resident appearance and street placement survive removal and reordering of other people', () => {
  const before=Array.from({length:20},(_,i)=>`resident-${i+1}`);
  const after=before.filter(id=>!['resident-2','resident-7','resident-12'].includes(id)).reverse();
  const original=new Map(before.map(id=>[id,{offset:npcDisplayOffset(id),style:npcVisualSeed(id)}]));
  for(const id of after)assert.deepEqual({offset:npcDisplayOffset(id),style:npcVisualSeed(id)},original.get(id));
  const p={id:'resident-8',x:1,z:2,status:'Walking'};
  assert.equal(sampleNpcPose(p,{...p,id:'resident-9',x:9},.8).x,1,'a different future resident must never move this one');
});

test('walking follows the street corner rather than cutting diagonally through a building', () => {
  const p={id:'resident-3',x:.9,z:0,status:'Walking',route:[{x:.9,z:0},{x:1,z:0},{x:1,z:1}]};
  const next={...p,x:1,z:.1};
  const first=sampleNpcPose(p,next,.25,1),second=sampleNpcPose(p,next,.75,1);
  assert.ok(Math.abs(first.x-.95)<1e-10);assert.equal(first.z,0);
  assert.equal(second.x,1);assert.ok(Math.abs(second.z-.05)<1e-10);
  assert.equal(first.heading,Math.PI/2);assert.equal(second.heading,0);
});

test('render time uses a single monotonic sample anchor and clamps late frames', () => {
  assert.equal(renderFraction(1000,.2,1100,500),.4);
  assert.equal(renderFraction(1000,.2,900,500),.2);
  assert.equal(renderFraction(1000,.2,2500,500),1);
  assert.equal(renderFraction(1000,.2,2500,500,false),.2);
});

test('the first authoritative same-tick packet replaces a static preview without UI rewinds', () => {
  const initial={tick:18,seed:731,alpha:0,sampledAt:1000};
  const preview=updateRenderSample(null,initial,1000);
  const repaint=updateRenderSample(preview,initial,1200);
  assert.equal(repaint,preview);assert.equal(renderFraction(repaint.sampledAt,repaint.alpha,1200),.4);
  const authoritative=updateRenderSample(repaint,{...initial,alpha:.7,sampledAt:1300},1350);
  assert.notEqual(authoritative,preview);assert.ok(Math.abs(renderFraction(authoritative.sampledAt,authoritative.alpha,1350)-.8)<1e-12);
  const clicked=updateRenderSample(authoritative,{...initial,alpha:.1,sampledAt:1300},1400);
  assert.equal(clicked,authoritative);assert.ok(Math.abs(renderFraction(clicked.sampledAt,clicked.alpha,1400)-.9)<1e-12);
  assert.equal(updateRenderSample(clicked,initial,1400),clicked,'an older same-tick packet cannot rewind time');
  const advanced=updateRenderSample(clicked,{...initial,tick:19,alpha:.05,sampledAt:1500},1500);
  assert.equal(advanced.tick,19);assert.equal(renderFraction(advanced.sampledAt,advanced.alpha,1510),.07);
});

test('facing turns take the short arc and gait stays continuous at snapshot boundaries', () => {
  const heading=smoothHeading(Math.PI-.1,-Math.PI+.1,.02);
  assert.ok(heading>Math.PI-.1&&heading<Math.PI+.1);
  const once=smoothHeading(0,1,.1),twice=smoothHeading(smoothHeading(0,1,.05),1,.05);
  assert.ok(Math.abs(once-twice)<1e-12);
  const p={id:'resident-5',x:0,z:0,status:'Walking',walked:1},next={...p,x:.2,walked:1.2},third={...next,x:.4,walked:1.4};
  assert.equal(sampleNpcPose(p,next,1,2).stride,sampleNpcPose(next,third,0,3).stride);
});

test('raised river crossings have continuous ramps and leave ordinary streets on the ground', () => {
  assert.equal(crossingHeight(0,-16),2.445);assert.equal(crossingHeight(8.3,16),2.445);
  assert.ok(Math.abs(crossingHeight(11.3,-16)-1.2875)<1e-10);assert.equal(crossingHeight(13.3,-16),0);
  assert.equal(crossingHeight(0,0),0);
  for(const size of [.6,1])for(const x of [0,8.3,11.3])assert.ok(Math.abs(npcGroundHeight(crossingHeight(x,-16),size)+.13*size-crossingHeight(x,-16))<1e-10,'feet meet the modeled deck and ramp surface at every scale');
  assert.ok(Math.abs(crossingHeight(-8,-19.6)-1.2875)<1e-10,'bank-side walkers use the actual side access ramp');
  assert.ok(Math.abs(crossingHeight(-8,-17.6)-2.445)<1e-10,'bank ramp meets the deck continuously');
});

test('boarding forecasts hide walkers before a sailing pose enters the river, including rescue craft',()=>{
  const loading={id:'resident-1',mode:'barge',job:{kind:'haul',stage:'load'}},sailing={...loading,job:{kind:'haul',stage:'river'}};
  assert.equal(riverCrew(loading,sailing,0),false);
  assert.equal(riverCrew(loading,sailing,.1),true);
  assert.equal(riverCrew(sailing,{...loading,job:{kind:'haul',stage:'unload'}},1),true,'disembarkation waits for the authoritative onshore snapshot');
  const walking={...loading,job:{kind:'haul',stage:'recover'}},rescue={...loading,job:{kind:'haul',stage:'recover-river'}};
  assert.equal(riverCrew(walking,walking,.8),false,'a stranded load in the river does not put its approaching worker aboard');
  assert.equal(riverCrew(walking,rescue,.1),true);
  assert.equal(riverCrew(rescue,rescue,.5),true);
  assert.equal(riverCrew(loading,{...sailing,id:'resident-2'},.5),false);
});

test('remaining snapshot routes with inherited route indexes stay on bridge corners',()=>{
  const p={id:'resident-3',x:4.35,z:1.99,status:'Walking',routeIndex:5,route:[{x:4.35,z:1.99},{x:4.35,z:2},{x:6,z:2}]},next={...p,x:4.4,z:2};
  for(let i=0;i<=20;i++) {
    const pose=sampleNpcPose(p,next,i/20,1);
    assert.ok(pose.x>=4.35&&pose.x<=4.4&&pose.z>=1.99&&pose.z<=2);
    if(pose.x>4.39375)assert.equal(pose.z,2,'the visible channel crossing stays over the bridge');
  }
});

test('colony occupations, meals, socializing and journeys choose their actual activity poses', () => {
  const p = { id: 'resident-18', x: 2, z: 4 };
  for (const status of ['Building', 'Retrofitting a building', 'Salvaging materials', 'Loading cargo', 'Unloading cargo', 'Growing food', 'Gathering timber', 'Quarrying stone', 'Crafting tools', 'Hauling materials', 'Caring for neighbors','Teaching children','Sharing knowledge','Trading at market','Milling provisions','Managing food stores','Inspecting building safety','Supplying clean water','Welcoming neighbors']) {
    assert.equal(sampleNpcPose({ ...p, status }, p, 0, 10).activity, 'working');
  }
  assert.equal(sampleNpcPose({ ...p, status: 'Having lunch' }, p).activity, 'eating');
  assert.equal(sampleNpcPose({ ...p, status: 'Socializing' }, p).activity, 'socializing');
  assert.equal(sampleNpcPose({ ...p, status: 'Walking · building' }, { ...p, x: 2.1 }, .5).activity, 'walking');
  assert.equal(sampleNpcPose({ ...p, status: 'Resting between projects' }, p).activity, 'resting');
});

test('street camera cuts away only foliage between the camera and its subject', () => {
  const camera = { x: 0, z: 6 }, subject = { x: 0, z: 0 }, tree = { x: .5, z: 3, sx: 1, sz: 1 };
  assert.equal(blocksStreetView(tree, camera, subject), true);
  assert.equal(blocksStreetView({ ...tree, x: 3 }, camera, subject), false);
  assert.equal(blocksStreetView({ ...tree, z: 9 }, camera, subject), false);
  assert.equal(blocksStreetView(tree, camera, camera), false);
});

test('all 48 residents have distinct display positions inside the street footprint', () => {
  const offsets = Array.from({ length: 48 }, (_, index) => npcDisplayOffset(index));
  assert.equal(new Set(offsets.map(p => `${p.x},${p.z}`)).size, 48);
  for (const point of offsets) assert.ok(Math.abs(point.x) < 1.1 && Math.abs(point.z) < 1.1);
  for (let i = 0; i < offsets.length; i++) for (let j = i + 1; j < offsets.length; j++) {
    assert.ok(Math.hypot(offsets[i].x - offsets[j].x, offsets[i].z - offsets[j].z) >= 0.29);
  }
});

test('NPC positions interpolate and clamp without changing simulation snapshots', () => {
  const person = Object.freeze({ id: 'citizen-1', x: 2, z: 3, status: 'Commuting to work' });
  const next = Object.freeze({ ...person, x: 3, z: 3 });
  assert.equal(sampleNpcPose(person, next, -2, 12).x, 2);
  assert.equal(sampleNpcPose(person, next, 2, 12).x, 3);
  assert.equal(sampleNpcPose(person, next, 0.25, 12).x, 2.25);
  assert.equal(sampleNpcPose(person, next, 0.25, 12).z, 3);
  assert.equal(sampleNpcPose(person, next, 0.25, 12).heading, Math.PI / 2);
  assert.equal(sampleNpcPose(person, next, Infinity, 12).x, 3);
  assert.deepEqual(person, { id: 'citizen-1', x: 2, z: 3, status: 'Commuting to work' });
});

test('walking has opposed limbs, arrival stops the gait and frozen time repeats exactly', () => {
  const person = { id: 'citizen-8', x: 1, z: 2, status: 'Heading home' };
  const next = { ...person, z: 2.4, status: 'Resting at home' };
  const pose = sampleNpcPose(person, next, 0.4, 510);
  assert.equal(pose.activity, 'walking');
  assert.ok(pose.moving);
  assert.ok(pose.armSwing * pose.legSwing <= 0);
  assert.ok(pose.bodyBob >= 0 && pose.bodyBob <= 0.025);
  assert.deepEqual(sampleNpcPose(person, next, 0.4, 510), pose);
  assert.notEqual(sampleNpcPose(person, next, 0.7, 510).legSwing, pose.legSwing);
  const arrival = sampleNpcPose(person, next, 1, 510);
  assert.equal(arrival.activity, 'resting');
  assert.equal(arrival.legSwing, 0);
});

test('stationary work, lunch, outage and rest have distinct task poses', () => {
  const person = { id: 'citizen-4', x: 6, z: 3, status: 'At work' };
  const work = sampleNpcPose(person, person, 0.2, 60);
  assert.equal(work.activity, 'working');
  assert.equal(work.moving, false);
  assert.equal(work.legSwing, 0);
  assert.ok(work.workMotion >= 0 && work.workMotion <= 1);
  assert.notEqual(sampleNpcPose(person, person, 0.7, 60).workMotion, work.workMotion);
  for (const status of ['Having lunch', 'Lunch without power']) {
    assert.equal(sampleNpcPose({ ...person, status }, null, 0.2, 240).activity, 'eating');
  }
  const outage = sampleNpcPose({ ...person, status: 'Work interrupted by outage' }, null, 0.2, 240);
  assert.equal(outage.activity, 'interrupted');
  assert.equal(outage.workMotion, 0);
  for (const status of ['Resting at home', 'Resting in the gardens']) {
    assert.equal(sampleNpcPose({ ...person, status }, null, 0.2, 650).activity, 'resting');
  }
});

test('missing next snapshots and non-finite optional values remain finite and stationary', () => {
  const person = { id: 'citizen-2', x: 3, z: 5, status: 'Walking to market', route: [{ x: 3, z: 5 }, { x: 3, z: 4 }] };
  const pose = sampleNpcPose(person, undefined, 0.3, 230);
  assert.equal(pose.x, 3);
  assert.equal(pose.z, 5);
  assert.equal(pose.moving, false);
  assert.equal(pose.heading, Math.PI);
  for (const args of [[undefined, undefined, NaN, Infinity], [{ x: NaN, z: Infinity }, { x: Infinity, z: NaN }, undefined, NaN]]) {
    for (const value of Object.values(sampleNpcPose(...args))) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value));
    }
  }
});

test('real seeded NPC snapshots sample continuously and deterministically across daily activities', () => {
  const world = createTimeline();
  for (const tick of [0, 20, 60, 240, 540, 650, 720]) {
    const state = getState(world, 'origin', tick);
    const next = getState(world, 'origin', Math.min(720, tick + 1));
    for (const [index, person] of state.citizens.entries()) {
      const pose = sampleNpcPose(person, next.citizens[index], 0.5, tick);
      assert.deepEqual(sampleNpcPose(person, next.citizens[index], 0.5, tick), pose);
      assert.ok(pose.x >= 0 && pose.x <= 10);
      assert.ok(pose.z >= 0 && pose.z <= 8);
      for (const value of Object.values(pose)) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value));
      }
    }
  }
});
