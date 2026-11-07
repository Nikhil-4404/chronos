import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingForm } from '../src/architecture.js';

test('housing variants keep distinct low-rise footprints through additions', () => {
  const forms=Array.from({length:6},(_,variant)=>buildingForm({kind:'home',variant,level:1}));
  assert.equal(new Set(forms.map(f=>f.label)).size,6);
  assert.ok(new Set(forms.map(f=>f.footprint)).size>=4);
  const a=buildingForm({kind:'home',variant:3,level:1}), b=buildingForm({kind:'home',variant:3,level:3});
  assert.equal(a.footprint,b.footprint);assert.equal(a.width,b.width);assert.equal(a.depth,b.depth);
  assert.ok(Math.abs(b.height-a.height-1.3)<1e-9);
  for(let variant=0;variant<6;variant++) {
    const mature=buildingForm({kind:'home',variant,level:5});
    assert.ok(mature.height<=5 && mature.floors<=3,'usable-space additions do not turn every home into a high-rise');
  }
});
test('places have type-specific forms and corrupted optional geometry inputs stay finite', () => {
  for(const kind of ['farm','forestry','quarry','park','shop','workshop','hospital','dock','school','library','council','market','mill','granary','firestation','waterworks','inn']) {
    const form=buildingForm({kind,variant:2,level:2});assert.ok(form.width>0&&form.depth>0&&form.height>0);
  }
  for(const form of [buildingForm(),buildingForm({kind:'home',variant:NaN,level:Infinity}),buildingForm({kind:'home',variant:Infinity})]) {
    assert.ok(Object.values(form).filter(v=>typeof v==='number').every(Number.isFinite));
  }
});

test('major civic and economic uses have distinguishable silhouettes rather than a common cuboid',()=>{
  const kinds=['school','library','council','market','mill','granary','firestation','waterworks','inn'];
  const forms=kinds.map(kind=>buildingForm({kind,variant:1,level:2}));
  assert.equal(new Set(forms.map(f=>f.footprint)).size,kinds.length);
  assert.equal(new Set(forms.map(f=>f.label)).size,kinds.length);
  assert.ok(forms.every(f=>f.maxHeight>=f.height&&f.maxHeight<11));
  assert.equal(buildingForm({kind:'mill'}).roof,'conical');
  assert.equal(buildingForm({kind:'library'}).roof,'dome');
});
test('conversion preserves the original building shell and changes its use label', () => {
  const workshop=buildingForm({kind:'workshop',originalKind:'workshop',variant:2,level:2});
  const homes=buildingForm({kind:'home',originalKind:'workshop',variant:2,level:2});
  assert.equal(workshop.footprint,homes.footprint);assert.equal(workshop.width,homes.width);assert.equal(workshop.height,homes.height);
  assert.match(homes.label,/Converted .*housing/);
});
