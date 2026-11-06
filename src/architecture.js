const homes = [
  ['Gabled cottage', 'rectangle', 'gable', 4.1, 3.8, 2.6],
  ['Merchant house with side wing', 'L', 'gable', 5.3, 4.8, 3.1],
  ['Terraced town house', 'rectangle', 'gable', 3.7, 5.5, 4.2],
  ['Courtyard tenement', 'courtyard', 'flat', 5.8, 5.6, 3.2],
  ['Timber gallery house', 'gallery', 'gable', 5.5, 4.6, 3.8],
  ['Tower house', 'tower', 'flat', 3.9, 3.9, 5.2],
];

export function buildingForm(building) {
  const variantValue=Number(building?.variant);
  const variant = Math.max(0, Math.floor(Number.isFinite(variantValue)?variantValue:0)) % homes.length;
  const level = Math.max(1, Math.min(5, Math.floor(Number(building?.level) || 1)));
  const kind = building?.originalKind || building?.kind;
  let form = kind === 'home' ? homes[variant] : ({
    farm: ['Cultivated rows and field shed', 'field', 'none', 5.8, 5.8, .4],
    forestry: ['Woodland allotment', 'woodland', 'none', 5.8, 5.8, .4],
    quarry: ['Open stone yard', 'quarry', 'none', 5.8, 5.8, .4],
    park: ['Garden with a gathering pavilion', 'garden', 'none', 5.8, 5.8, .4],
    shop: ['Open market and covered stores', 'market', 'gable', 5.7, 4.4, 2.8],
    workshop: ['Workshop hall with service wing', 'hall', 'gable', 5.8, 5.1, 3.9],
    hospital: ['Arched care courtyard', 'courtyard', 'dome', 5.8, 5.6, 4.1],
    dock: ['River pier and loading crane', 'dock', 'none', 5.4, 4.8, 4.8],
  })[kind];
  form ||= ['Settlement hall', 'rectangle', 'gable', 5, 4.8, 3.4];
  const [label, footprint, roof, width, depth, baseHeight] = form;
  const height = baseHeight + (['field', 'woodland', 'quarry', 'garden', 'dock'].includes(footprint) ? 0 : (level - 1) * 1.6);
  return { label:building?.kind==='home'&&kind!=='home'?`Converted ${label.toLowerCase()} housing`:label, footprint, roof, width, depth, height, level, variant };
}
