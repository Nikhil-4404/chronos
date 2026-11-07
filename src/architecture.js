const homes = [
  ['Whitewashed garden cottage', 'cottage', 'gable', 4.1, 3.8, 2.0],
  ['Merchant house with side wing', 'L', 'gable', 5.3, 4.8, 2.8],
  ['Stepped terrace houses', 'terrace', 'gable', 5.8, 5.2, 3.0],
  ['Open courtyard residences', 'courtyard', 'hip', 5.8, 5.6, 2.7],
  ['Timber gallery house', 'gallery', 'gable', 5.5, 4.6, 3.0],
  ['Garden villa with a belvedere', 'villa', 'hip', 5.4, 5.3, 2.5],
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
    shop: ['Twin-roof river warehouse', 'warehouse', 'gable', 5.7, 5.2, 2.8],
    workshop: ['Sawtooth workshop and chimney yard', 'hall', 'gable', 5.8, 5.1, 3.1],
    hospital: ['Arched care courtyard', 'courtyard', 'dome', 5.8, 5.6, 4.1],
    dock: ['River pier and loading crane', 'dock', 'none', 5.4, 4.8, 4.8],
    school: ['School cloister and play court', 'school', 'hip', 5.8, 5.6, 2.8],
    library: ['Domed library and columned reading hall', 'library', 'dome', 5.8, 5.6, 3.8],
    council: ['Council hall and clock tower', 'civic', 'hip', 5.7, 5.3, 3.7],
    market: ['Covered market square and striped stalls', 'market', 'gable', 5.9, 5.7, 2.3],
    mill: ['Windmill and milling yard', 'mill', 'conical', 5.4, 5.3, 4.0],
    granary: ['Raised granary and round silos', 'granary', 'gable', 5.7, 5.2, 3.0],
    firestation: ['Fire house and hose-drying bell tower', 'fire', 'gable', 5.6, 5.2, 2.8],
    waterworks: ['Reservoir and elevated water tower', 'water', 'none', 5.8, 5.6, 3.0],
    inn: ['Coaching inn and sheltered courtyard', 'inn', 'gable', 5.8, 5.5, 3.2],
  })[kind];
  form ||= ['Settlement hall', 'rectangle', 'gable', 5, 4.8, 3.4];
  const [label, footprint, roof, width, depth, baseHeight] = form;
  const height = baseHeight + (['field', 'woodland', 'quarry', 'garden', 'dock','mill','water'].includes(footprint) ? 0 : Math.min(2, (level - 1) * .65));
  const maxHeight=height+({civic:4.3,library:2.4,fire:3.1,mill:1.5,water:2.4,villa:2.6}[footprint]||1.5);
  return { label:building?.kind==='home'&&kind!=='home'?`Converted ${label.toLowerCase()} housing`:label, footprint, roof, width, depth, height, maxHeight, floors:Math.max(1,Math.round(height/1.8)), level, variant };
}
