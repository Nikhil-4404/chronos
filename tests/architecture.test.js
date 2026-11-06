import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingForm } from '../src/architecture.js';

test('housing variants change footprint, roof and proportion while additions raise the same form', () => {
  const forms=Array.from({length:6},(_,variant)=>buildingForm({kind:'home',variant,level:1}));
  assert.equal(new Set(forms.map(f=>f.label)).size,6);
  assert.ok(new Set(forms.map(f=>f.footprint)).size>=4);
  const a=buildingForm({kind:'home',variant:3,level:1}), b=buildingForm({kind:'home',variant:3,level:3});
  assert.equal(a.footprint,b.footprint);assert.equal(a.width,b.width);assert.equal(a.depth,b.depth);
  assert.equal(b.height-a.height,3.2);
});
test('places have type-specific forms and corrupted optional geometry inputs stay finite', () => {
  for(const kind of ['farm','forestry','quarry','park','shop','workshop','hospital','dock']) {
    const form=buildingForm({kind,variant:2,level:2});assert.ok(form.width>0&&form.depth>0&&form.height>0);
  }
  for(const form of [buildingForm(),buildingForm({kind:'home',variant:NaN,level:Infinity}),buildingForm({kind:'home',variant:Infinity})]) {
    assert.ok(Object.values(form).filter(v=>typeof v==='number').every(Number.isFinite));
  }
});
test('conversion preserves the original building shell and changes its use label', () => {
  const workshop=buildingForm({kind:'workshop',originalKind:'workshop',variant:2,level:2});
  const homes=buildingForm({kind:'home',originalKind:'workshop',variant:2,level:2});
  assert.equal(workshop.footprint,homes.footprint);assert.equal(workshop.width,homes.width);assert.equal(workshop.height,homes.height);
  assert.match(homes.label,/Converted .*housing/);
});
