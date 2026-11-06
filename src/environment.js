// Fictional temperate climate: 144 ticks/day, 192 days/year and a 29.53-day lunar cycle.
// Orbital positions, weather and river states are deterministic approximations, not forecasts.
export const CALENDAR = Object.freeze({ ticksPerDay: 144, daysPerYear: 192, daysPerSeason: 48, lunarDays: 29.53059 });
const TAU = Math.PI * 2;
const LATITUDE = 47 * Math.PI / 180;
const TILT = 23.44 * Math.PI / 180;
const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
const riverAnchors = new Map();
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const mix = (a, b, amount) => a + (b - a) * amount;
const wrap = (n, period) => ((n % period) + period) % period;
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };

function hash(day, seed, channel) {
  let n = (Math.imul(day | 0, 374761393) ^ seed ^ Math.imul(channel, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise(time, seed, channel) {
  const whole = Math.floor(time);
  return mix(hash(whole, seed, channel), hash(whole + 1, seed, channel), smooth(time - whole));
}

function atmosphere(day, seed) {
  const annual = TAU * wrap(day, CALENDAR.daysPerYear) / CALENDAR.daysPerYear;
  const wetness = noise(day / 3, seed, 17);
  const cloud = clamp(wetness * 1.2 - .04);
  const precipitation = smooth((wetness - .48) / .44);
  const anomaly = (noise(day / 5, seed, 41) - .5) * 8;
  return { cloud, precipitation, meanTemperature: 9 + 16 * Math.sin(annual - .38) + anomaly };
}

function riverAnchor(day, seed) {
  const key = `${seed}:${day}`;
  if (riverAnchors.has(key)) return riverAnchors.get(key);
  let cold = 0, warmth = 0, rain = 0, weight = 0;
  for (let ago = 0; ago < 8; ago++) {
    const sample = atmosphere(day - ago, seed), w = 8 - ago;
    cold += Math.max(0, -sample.meanTemperature) * w;
    warmth += Math.max(0, sample.meanTemperature - 1) * w;
    rain += sample.precipitation * w;
    weight += w;
  }
  const springMelt = Math.max(0, Math.cos(TAU * (wrap(day, CALENDAR.daysPerYear) - 17) / CALENDAR.daysPerYear)) ** 8;
  const ice = clamp((cold / weight - warmth / weight * .7 - .6) / 7);
  const level = clamp(.32 + rain / weight * .27 + springMelt * .25 - warmth / weight * .002, .15, .95);
  const result = { ice, level };
  if (riverAnchors.size >= 64) riverAnchors.delete(riverAnchors.keys().next().value);
  riverAnchors.set(key, result);
  return result;
}

function celestial(declination, hourAngle) {
  const cosD = Math.cos(declination), sinD = Math.sin(declination), cosH = Math.cos(hourAngle);
  const direction = {
    x: -cosD * Math.sin(hourAngle),
    y: Math.sin(LATITUDE) * sinD + Math.cos(LATITUDE) * cosD * cosH,
    z: Math.cos(LATITUDE) * sinD - Math.sin(LATITUDE) * cosD * cosH,
  };
  return { direction, elevation: Math.asin(clamp(direction.y, -1, 1)), azimuth: wrap(Math.atan2(direction.x, direction.z), TAU) };
}

/**
 * tick may be fractional. Directions are unit vectors in a y-up world (+x east, +z north).
 * Temperature is °C; wind speed is fictional m/s and direction is radians.
 * Rain/snow/cloud/mud/ice/daylight are 0..1. River load classes are game rules, not ice-safety advice.
 */
export function environmentAt(tick, seed = 731) {
  if (typeof tick !== 'number' || !Number.isFinite(tick) || tick < 0 || tick > 1e10) throw new RangeError('Environment time must be a finite nonnegative tick up to 10000000000.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new RangeError('Environment seed must be an unsigned 32-bit integer.');
  const day = tick / CALENDAR.ticksPerDay, wholeDay = Math.floor(day), fraction = day - wholeDay;
  const annualDay = wrap(day, CALENDAR.daysPerYear), annual = TAU * annualDay / CALENDAR.daysPerYear;
  const sky = atmosphere(day, seed);
  const temperature = sky.meanTemperature + Math.cos(TAU * (fraction - .6)) * (4 - sky.cloud * 2.2);
  const snowShare = 1 - smooth((temperature + 1) / 3);
  const snow = sky.precipitation * snowShare, rain = sky.precipitation * (1 - snowShare);
  const sun = celestial(TILT * Math.sin(annual), TAU * (fraction - .5));
  sun.daylight = smooth((sun.direction.y + .1) / .38);
  const phase = wrap(day / CALENDAR.lunarDays + .13, 1);
  const moonLongitude = annual + phase * TAU;
  const moonDeclination = Math.asin(Math.sin(TILT) * Math.sin(moonLongitude)) + .055 * Math.sin(phase * TAU + 1.3);
  const moon = celestial(moonDeclination, TAU * (fraction - .5 - phase));
  moon.phase = phase; moon.illumination = (1 - Math.cos(phase * TAU)) / 2;
  const a = riverAnchor(wholeDay, seed), b = riverAnchor(wholeDay + 1, seed), time = smooth(fraction);
  const ice = mix(a.ice, b.ice, time), level = mix(a.level, b.level, time);
  const groundWet = noise((day - .8) / 3, seed, 17);
  const mud = clamp((groundWet - .3) * .9 + rain * .45) * smooth((temperature + 2) / 6);
  const frozen = ice >= .35;
  const loadSafe = ice >= .85 && temperature < 1 ? 'cart' : ice >= .65 && temperature < 2 ? 'foot' : 'none';
  const weather = snow > .08 ? 'Snow' : rain > .08 ? 'Rain' : sky.cloud > .65 ? 'Cloudy' : temperature > 25 && sky.precipitation < .03 ? 'Dry' : 'Clear';
  return {
    day: wholeDay + 1, dayOfYear: Math.floor(annualDay) + 1, year: Math.floor(day / CALENDAR.daysPerYear) + 1,
    season: seasons[Math.floor(annualDay / CALENDAR.daysPerSeason)], weather,
    sun, moon, temperature, precipitation: sky.precipitation, rain, snow, cloud: sky.cloud, mud,
    wind: { speed: 1.5 + noise(day / 2, seed, 73) * 6 + sky.precipitation * 3, direction: wrap(noise(day / 7, seed, 89) * TAU + Math.sin(day * .15) * .2, TAU) },
    river: { level, ice, frozen, loadSafe },
  };
}
