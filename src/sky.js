import * as THREE from 'three';

const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const hash = n => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
const fract = n => n - Math.floor(n);
const seasons = {
  Spring: { ground: '#658451', grass: '#82a759', foliage: '#91b65f' },
  Summer: { ground: '#647b43', grass: '#6f9949', foliage: '#608f42' },
  Autumn: { ground: '#8b784a', grass: '#a08b53', foliage: '#cc8146' },
  Winter: { ground: '#b8c7bd', grass: '#c4d0c4', foliage: '#82978c' },
};

export function skyPresentation(env) {
  const day = clamp(env.sun.daylight), night = 1 - day;
  const body = source => ({ ...source.direction, azimuth: source.azimuth, elevation: source.elevation, visible: source.direction.y > 0 });
  const sun = body(env.sun), moon = body(env.moon);
  // Daytime Moons exist; the requested game presentation reserves its Moon for dusk and night.
  moon.opacity = clamp((.35 - day) / .35) * (1 - env.cloud * .7);
  moon.visible &&= moon.opacity > .01 && env.moon.illumination > .006;
  return { day, night, ...seasons[env.season], frost: clamp((2 - env.temperature) / 12), wetness: clamp(env.mud * .65 + env.rain * .35),
    stars: night * night * (1 - env.cloud * .8), sun, moon };
}

export function rainSample(index, tick, wind, height = 55) {
  const seed = hash(index + 91), cycle = fract(hash(index + 120) + tick * (.033 + seed * .025)), drift = wind.speed * .8 * cycle;
  return { x: Math.cos(wind.direction) * drift + Math.sin(tick * .07 + seed * 20) * .12,
    y: (1 - cycle) * height, z: Math.sin(wind.direction) * drift, cycle, size: 1.8 + seed * 2.2 };
}

const skyVertex = `varying vec2 vUv;varying vec3 vDirection;
void main(){vUv=uv;vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const skyFragment = `
varying vec2 vUv;varying vec3 vDirection;
uniform float daylight,cloud,time,wind,rain,flash,moonPhase,moonOpacity;
uniform vec3 zenith,horizon,groundHaze,sunDirection,moonDirection;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
void main(){
  vec3 direction=normalize(vDirection);float height=clamp(direction.y,0.,1.);
  vec3 base=mix(horizon,zenith,sqrt(height));
  base=mix(groundHaze,base,smoothstep(-.03,.045,direction.y));
  float above=smoothstep(0.,.009,direction.y);
  vec2 grid=vUv*vec2(210.,115.);vec2 cell=floor(grid),offset=fract(grid)-.5;
  float star=(1.-smoothstep(.02,.12,length(offset)))*step(.966,hash(cell));
  base+=vec3(.73,.85,1.)*star*(.8+.2*sin(time*.045+hash(cell)*30.))*pow(1.-daylight,2.)*(1.-cloud*.85)*above;
  float sunAngle=acos(clamp(dot(direction,sunDirection),-1.,1.));
  float solarDisc=1.-smoothstep(.0125,.0135,sunAngle),glow=exp(-sunAngle*sunAngle/.0008)*.16;
  vec3 sunColor=mix(vec3(1.,.44,.14),vec3(1.,.95,.74),smoothstep(0.,.22,sunDirection.y));
  base=mix(base,sunColor,solarDisc*above*step(0.,sunDirection.y));
  base+=sunColor*glow*above*step(0.,sunDirection.y)*(1.-cloud*.8);
  vec3 moonRight=normalize(cross(vec3(0.,1.,0.),moonDirection)),moonUp=cross(moonDirection,moonRight);
  vec2 lunar=vec2(dot(direction,moonRight),dot(direction,moonUp))/.012;
  float radius=dot(lunar,lunar),edge=1.-smoothstep(.97,1.,radius),angle=moonPhase*6.2831853;
  float lit=step(0.,lunar.x*sin(angle)-sqrt(max(0.,1.-radius))*cos(angle));
  float albedo=.59+.18*noise(lunar*19.)+.09*noise(lunar*7.);
  vec3 moonColor=vec3(.91,.94,1.)*albedo;
  float lunarMask=edge*moonOpacity*above*step(0.,moonDirection.y)*step(.99,dot(direction,moonDirection))*(.025+lit*.975);
  base=mix(base,moonColor,lunarMask);
  vec2 uv=vUv*vec2(6.,3.)+vec2(cos(wind),sin(wind))*(time*.0009);
  float field=noise(uv*3.)*.55+noise(uv*6.4)*.3+noise(uv*13.)*.15;
  float cover=smoothstep(.78-cloud*.52,.96-cloud*.45,field)*cloud*above;
  base=mix(base,mix(vec3(.12,.16,.23),vec3(.82,.88,.91),daylight)*(1.-rain*.36),cover*.88);
  gl_FragColor=vec4(base+flash,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const dropVertex = `attribute float seed;attribute float alpha;varying float vAlpha;uniform float kind;
void main(){vec4 p=modelViewMatrix*vec4(position,1.);vAlpha=alpha;
gl_PointSize=clamp((kind<.5?2.+seed*2.5:kind<1.5?3.+seed*3.:1.5+seed*2.)*clamp(70./max(1.,-p.z),.6,1.7),1.,kind<.5?5.5:7.);
gl_Position=projectionMatrix*p;}`;
const dropFragment = `varying float vAlpha;uniform vec3 tint;uniform float kind;uniform vec2 direction;
void main(){vec2 p=gl_PointCoord-.5;float shape;
if(kind<.5){float along=dot(p,direction),across=dot(p,vec2(-direction.y,direction.x));shape=exp(-across*across*75.-along*along*9.)*(.65+along*.5);}
else{shape=exp(-dot(p,p)*(kind<1.5?18.:28.));}
float a=shape*vAlpha;if(a<.012)discard;gl_FragColor=vec4(tint,a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export function createLivingSky(scene, camera, { reducedMotion = false } = {}) {
  const uniforms = { daylight: { value: 1 }, cloud: { value: 0 }, time: { value: 0 }, wind: { value: 0 }, rain: { value: 0 }, flash: { value: 0 },
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, groundHaze: { value: new THREE.Color() }, sunDirection: { value: new THREE.Vector3() }, moonDirection: { value: new THREE.Vector3() }, moonPhase: { value: 0 }, moonOpacity: { value: 0 } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false, fog: false });
  // Celestial discs are part of the distant background; terrain and buildings always occlude them.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), material); dome.renderOrder = -1000; dome.frustumCulled = false; scene.add(dome);
  const count = 2200, impactCount = 144, ringCount = 96;
  function particles(length, kind) {
    const geometry = new THREE.BufferGeometry(), positions = new Float32Array(length * 3), seeds = new Float32Array(length), alpha = new Float32Array(length);
    for (let i = 0; i < length; i++) seeds[i] = hash(i + 91);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1)); geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    const uniforms = { kind: { value: kind }, tint: { value: new THREE.Color() }, direction: { value: new THREE.Vector2(0, -1) } };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: dropVertex, fragmentShader: dropFragment, transparent: true, depthWrite: false, fog: false });
    const mesh = new THREE.Points(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 10; scene.add(mesh);
    return { mesh, geometry, positions, seeds, alpha, uniforms };
  }
  const drops = particles(count, 0), snow = particles(1000, 1), splash = particles(impactCount * 3, 2), spray = particles(impactCount, 2);
  const ringGeometry = new THREE.RingGeometry(.82, 1, 24), ringAlpha = new Float32Array(ringCount);
  ringGeometry.setAttribute('alpha', new THREE.InstancedBufferAttribute(ringAlpha, 1));
  const ringMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: `attribute float alpha;varying float vAlpha;void main(){vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float vAlpha;void main(){gl_FragColor=vec4(.44,.57,.64,vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }` });
  const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, ringCount); rings.frustumCulled = false; rings.renderOrder = 5; scene.add(rings);
  const forward = new THREE.Vector3(), volume = new THREE.Vector3(), velocity = new THREE.Vector3(), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const dayZenith = new THREE.Color('#2f80b7'), nightZenith = new THREE.Color('#030817'), dayHorizon = new THREE.Color('#c4e3e5'), nightHorizon = new THREE.Color('#192d4a'), dusk = new THREE.Color('#ed9c68');
  function update(env, { tick = 0, mode = 'orbit', target, surfaceAt } = {}) {
    const presentation = skyPresentation(env), { day } = presentation, overview = mode === 'orbit' || mode === 'top';
    const time = reducedMotion ? 0 : tick, twilight = (1 - Math.abs(day * 2 - 1)) * (1 - env.cloud * .65);
    uniforms.daylight.value = day; uniforms.cloud.value = env.cloud; uniforms.time.value = time; uniforms.wind.value = env.wind.direction; uniforms.rain.value = env.rain;
    uniforms.zenith.value.copy(nightZenith).lerp(dayZenith, day).multiplyScalar(1 - env.precipitation * .22);
    uniforms.horizon.value.copy(nightHorizon).lerp(dayHorizon, day).lerp(dusk, twilight * .7);
    uniforms.groundHaze.value.set(presentation.ground).multiplyScalar(.35 + day * .65).lerp(uniforms.horizon.value, .25);
    uniforms.sunDirection.value.set(env.sun.direction.x, env.sun.direction.y, env.sun.direction.z); uniforms.moonDirection.value.set(env.moon.direction.x, env.moon.direction.y, env.moon.direction.z);
    uniforms.moonPhase.value = env.moon.phase; uniforms.moonOpacity.value = presentation.moon.visible ? presentation.moon.opacity : 0;
    uniforms.flash.value = !reducedMotion && env.rain > .65 && Math.sin(time * .51 + env.day * 2) > .997 ? .24 : 0;
    dome.position.copy(camera.position); camera.getWorldDirection(forward);
    const distance = target ? camera.position.distanceTo(target) : 80, span = overview ? clamp(distance * .6, 55, 140) : 55;
    volume.copy(camera.position).addScaledVector(forward, overview ? Math.min(distance * .42, 90) : 25);
    const height = clamp(camera.position.y + 18, 42, 90), wx = Math.cos(env.wind.direction), wz = Math.sin(env.wind.direction);
    velocity.set(wx * env.wind.speed * .3, -10, wz * env.wind.speed * .3).transformDirection(camera.matrixWorldInverse);
    drops.uniforms.direction.value.set(velocity.x, -velocity.y).normalize();
    drops.uniforms.tint.value.set(day > .5 ? '#8ba3b1' : '#8194aa'); snow.uniforms.tint.value.set('#e4edf4'); splash.uniforms.tint.value.set('#9dabb1'); spray.uniforms.tint.value.set('#9bafb9');
    drops.mesh.visible = env.rain > .03; snow.mesh.visible = env.snow > .025; splash.mesh.visible = spray.mesh.visible = rings.visible = env.rain > .055;
    drops.geometry.setDrawRange(0, Math.ceil(count * env.rain)); snow.geometry.setDrawRange(0, Math.ceil(1000 * env.snow));
    const surface = (x, z) => surfaceAt ? surfaceAt(x, z) : Math.abs(x) < 4.85 ? env.river.frozen ? null : (env.river.level - .5) * .7 + .02 : .16;
    for (const system of [drops, snow]) if (system.mesh.visible) {
      const isSnow = system === snow;
      for (let i = 0; i < system.seeds.length; i++) {
        const fall = rainSample(i, isSnow ? time * .12 : time, env.wind, height), seed = system.seeds[i], index = i * 3;
        system.positions[index] = volume.x + (seed - .5) * span + fall.x + (isSnow ? Math.sin(time * .025 + i) : 0);
        system.positions[index + 1] = fall.y; system.positions[index + 2] = volume.z + (hash(i + 150) - .5) * span + fall.z;
        system.alpha[i] = isSnow ? .65 : .13 + seed * .25;
      }
      system.geometry.attributes.position.needsUpdate = true; system.geometry.attributes.alpha.needsUpdate = true;
    }
    if (splash.mesh.visible) {
      rings.count = 0;
      for (let i = 0; i < impactCount; i++) {
        const x = volume.x + (hash(i + 809) - .5) * span, z = volume.z + (hash(i + 989) - .5) * span, ground = surface(x, z), age = fract(time * .09 + hash(i + 770));
        const active = ground !== null && ground !== undefined && i / impactCount < env.rain;
        for (let particle = 0; particle < 3; particle++) {
          const index = (i * 3 + particle) * 3, angle = hash(i * 7 + particle) * Math.PI * 2;
          splash.positions[index] = x + Math.cos(angle) * age * .35 + wx * age * .08; splash.positions[index + 1] = (ground ?? 0) + .02 + Math.sin(age * Math.PI) * (.12 + hash(i + particle) * .14); splash.positions[index + 2] = z + Math.sin(angle) * age * .35;
          splash.alpha[i * 3 + particle] = active ? (1 - age) * .3 : 0;
        }
        spray.positions[i * 3] = x + wx * age * .4; spray.positions[i * 3 + 1] = (ground ?? 0) + .03 + age * .2; spray.positions[i * 3 + 2] = z + wz * age * .4; spray.alpha[i] = active ? (1 - age) * env.rain * .12 : 0;
        if (active && i < ringCount) {
          position.set(x, ground + .018, z); scale.setScalar(.06 + age * .42); matrix.compose(position, rotation, scale); rings.setMatrixAt(rings.count, matrix);
          ringAlpha[rings.count++] = env.rain * (1 - age) * .2;
        }
      }
      for (const system of [splash, spray]) { system.geometry.attributes.position.needsUpdate = true; system.geometry.attributes.alpha.needsUpdate = true; }
      rings.instanceMatrix.needsUpdate = true; ringGeometry.attributes.alpha.needsUpdate = true;
    }
    return { ...presentation, skyColor: uniforms.horizon.value.getStyle(), fogColor: uniforms.groundHaze.value.getStyle(), flash: uniforms.flash.value };
  }
  function dispose() {
    for (const mesh of [dome, drops.mesh, snow.mesh, splash.mesh, spray.mesh, rings]) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  }
  return { update, dispose };
}
