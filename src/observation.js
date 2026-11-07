export const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fact = (name, value) => `<div><dt>${escapeText(name)}</dt><dd>${escapeText(value)}</dd></div>`;
function decisionMarkup(snapshot, decision) {
  const d = decision, place = snapshot.buildings.find(b => b.id === d.targetId);
  return `<article class="decision-note"><span class="eyebrow">DAY ${Math.floor(d.tick / 144) + 1} · ${escapeText(d.status)}</span><b>${escapeText(d.action)}${place ? ` · ${escapeText(place.label)}` : ''}</b><p>${escapeText(d.reason || d.context)}</p>${d.status === 'evaluated' && Number.isFinite(d.reward) ? `<small>Measured reward ${d.reward.toFixed(3)}</small>` : '<small>Awaiting a measured outcome</small>'}${place ? `<button class="text-button" data-place="${escapeText(place.id)}">Inspect this project ↗</button>` : ''}</article>`;
}

export function mindMarkup(snapshot) {
  const dev = snapshot.development || {}, learning = snapshot.learning || {}, city = learning.city || {};
  const footprint = dev.footprint, districts = dev.districtDetails || [];
  const activeDistricts = districts.filter(d => d.places > 0);
  const span = footprint ? `${Math.round(footprint.maxX - footprint.minX + 1)} × ${Math.round(footprint.maxZ - footprint.minZ + 1)} blocks` : 'Founding settlement';
  const contexts = city.contexts || [], decisions = city.recent || [];
  return {
    footprint: `<dl class="facts">${fact('City span', span)}${fact('Neighborhoods', districts.length ? activeDistricts.length : dev.districts || 0)}${fact('Places', snapshot.buildings.length)}${Number.isFinite(dev.serviceCoverage) ? fact('Service types built', `${Math.round(dev.serviceCoverage * 9)} / 9`) : ''}</dl>`,
    districts: activeDistricts.map(d => `<article class="district-note"><b>${escapeText(d.name)}</b><p>Population ${escapeText(d.population)} · ${escapeText(d.places)} places</p><small>${escapeText(Array.isArray(d.services) ? d.services.join(' · ') || 'Services not built here yet' : d.services || 'Homes and working land')}</small></article>`).join(''),
    city: `<dl class="facts">${fact('Policy', learning.policy || 'Contextual bandit')}${fact('Outcomes evaluated', city.observations || 0)}${fact('Watching outcomes', typeof city.pending === 'number' ? city.pending : city.pending?.length || 0)}</dl>${contexts.length ? `<dl class="facts">${contexts.map(c => fact(`${c.context} / ${c.action}`, `${c.samples} outcomes · value ${Number(c.value).toFixed(3)}`)).join('')}</dl>` : '<p class="muted">Development outcomes need time to mature. Values appear after completed work is evaluated.</p>'}`,
    decisions: decisions.length ? [...decisions].sort((a, b) => b.tick - a.tick).map(d => decisionMarkup(snapshot, d)).join('') : '<p class="muted">The first development decision will appear here as the city begins work.</p>',
    transport: `<dl class="facts">${fact('Completed training journeys', learning.deliveries || 0)}${(learning.contexts || []).filter(c => c.samples > 0).map(c => fact(`${c.context} / ${c.mode}`, `${c.samples} trips · ${(c.meanDuration * 10).toFixed(0)} min · value ${c.value.toFixed(3)}`)).join('')}</dl><p class="muted">Values are learned estimates, not a promise that every choice succeeds.</p>`,
  };
}
