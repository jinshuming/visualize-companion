import * as pc from 'playcanvas';
import { Scene, Character, Animation } from '@viggle/splat-engine';

const post = (m) => window.webkit?.messageHandlers?.stage?.postMessage(m);
const BASE = location.origin + '/';
const MOTIONS = ['idle', 'wave', 'nod', 'clap', 'cheer'];
const rad = (d) => (d * Math.PI) / 180;

const T0 = performance.now();
const marks = {};
const mark = (k) => { marks[k] = Math.round(performance.now() - T0); };

let scene, app, character;

// ---------------------------------------------------------------------------
// Backend selection. Splats live in rgba32float textures sampled with a filtering sampler,
// which WebGPU only allows when the adapter has `float32-filterable`. iPhones (and some
// Android GPUs) expose WebGPU without it, so the character silently fails to draw while the
// rest of the scene looks fine. Ask the adapter; never sniff the UA alone. iOS WebKit never
// qualifies, so it short-circuits to WebGL2.
// ---------------------------------------------------------------------------
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const probe = { hasNavGpu: !!navigator.gpu, float32Filterable: false, chose: 'webgl' };

async function webgpuCanDrawSplats() {
  if (isIOS || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter?.features.has('float32-filterable');
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Room themes. The default is Replika's lavender-grey studio with a sky window.
// Colours were sampled from reference screenshots.
// ---------------------------------------------------------------------------
const THEMES = [
  { name: 'lavender', wallTop: '#D4D1DD', wallMid: '#F1F0F6', wallLow: '#B9B2BE', floor: '#E9E6EE', floorEdge: '#B4AEB8',
    skyTop: '#84C5FF', skyLow: '#C6D9FA', frame: '#F6F5FA', panel: '#C5BFCE', chair: '#EEECF2', clear: '#C9C4D0' },
  { name: 'sunset', wallTop: '#E3B8B8', wallMid: '#FBE4D6', wallLow: '#C79AA2', floor: '#F2D9CF', floorEdge: '#BE949C',
    skyTop: '#FF9E7A', skyLow: '#FFD9A8', frame: '#FFF3EA', panel: '#E0B4B2', chair: '#FBEDE6', clear: '#DDB3AE' },
  { name: 'night', wallTop: '#2B2C55', wallMid: '#4A4C86', wallLow: '#23244A', floor: '#3A3B72', floorEdge: '#1E1F44',
    skyTop: '#0E1235', skyLow: '#3D4A9C', frame: '#8E91C8', panel: '#33346A', chair: '#9C9FD0', clear: '#2F3060' },
];

const ROOM = 5.5; // half extent of the room; the orbit camera stays inside it

function gradientTexture(stops, w = 4, h = 256, radial = false) {
  const c = document.createElement('canvas');
  c.width = radial ? 256 : w; c.height = radial ? 256 : h;
  const g = c.getContext('2d');
  const grad = radial
    ? g.createRadialGradient(128, 128, 0, 128, 128, 128)
    : g.createLinearGradient(0, 0, 0, c.height);
  stops.forEach(([t, col]) => grad.addColorStop(t, col));
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  const tex = new pc.Texture(app.graphicsDevice, {
    width: c.width, height: c.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: false, srgb: true,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  tex.setSource(c);
  return tex;
}

function unlit(map, { double = false } = {}) {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(0, 0, 0);
  m.emissive = new pc.Color(1, 1, 1);
  m.emissiveMap = map;
  m.useLighting = false;
  if (double) m.cull = pc.CULLFACE_NONE;
  m.update();
  return m;
}

// Flat colour, no lighting. (Lit meshes next to the splat character made the engine drop the
// upper half of the character, so the whole set is built from unlit materials.)
function flat(hex) {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(0, 0, 0);
  m.emissive = new pc.Color().fromString(hex);
  m.useLighting = false;
  m.update();
  return m;
}

function lit(hex, { gloss = 0.35 } = {}) {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color().fromString(hex);
  m.metalness = 0; m.gloss = gloss; m.useMetalness = true;
  m.update();
  return m;
}

function prim(type, material, { pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], parent } = {}) {
  const e = new pc.Entity();
  e.addComponent('render', { type, material, castShadows: false, receiveShadows: false });
  e.setLocalPosition(...pos); e.setLocalScale(...scale); e.setLocalEulerAngles(...rot);
  (parent || room).addChild(e);
  return e;
}

let room;
let themeMaterials = [];

function buildRoom(theme) {
  room?.destroy();
  room = new pc.Entity('room');
  app.root.addChild(room);
  const T = theme;

  const wallTex = gradientTexture([[0, T.wallTop], [0.55, T.wallMid], [1, T.wallLow]]);
  const wall = unlit(wallTex, { double: true });
  const H = 3.6;
  // four walls (planes face +Y, so tilt 90° about X/Z; double-sided so the facing doesn't matter)
  prim('plane', wall, { pos: [0, H / 2, ROOM], scale: [ROOM * 2, 1, H], rot: [90, 0, 0] });
  prim('plane', wall, { pos: [0, H / 2, -ROOM], scale: [ROOM * 2, 1, H], rot: [90, 0, 0] });
  prim('plane', wall, { pos: [ROOM, H / 2, 0], scale: [H, 1, ROOM * 2], rot: [0, 0, 90] });
  prim('plane', wall, { pos: [-ROOM, H / 2, 0], scale: [H, 1, ROOM * 2], rot: [0, 0, 90] });
  // floor with a soft pool of light under the character
  const floorTex = gradientTexture([[0, T.floor], [0.55, T.floor], [1, T.floorEdge]], 0, 0, true);
  prim('plane', unlit(floorTex), { pos: [0, 0, 0], scale: [ROOM * 2, 1, ROOM * 2] });
  // ceiling
  prim('plane', unlit(gradientTexture([[0, T.wallTop], [1, T.wallTop]], 2, 2), { double: true }), { pos: [0, H, 0], scale: [ROOM * 2, 1, ROOM * 2] });

  // free-standing window wall behind the character (z>0), with a rounded sky opening
  const frame = flat(T.frame);
  const skyTex = gradientTexture([[0, T.skyTop], [1, T.skyLow]]);
  const sky = unlit(skyTex);
  const panel = new pc.Entity('window'); room.addChild(panel);
  panel.setLocalPosition(-0.2, 0, 2.7);
  prim('box', flat(T.panel), { parent: panel, pos: [0, 1.5, 0.08], scale: [3.2, 3.0, 0.12] });
  prim('plane', sky, { parent: panel, pos: [-0.5, 1.55, -0.001], scale: [1.15, 1, 2.3], rot: [-90, 0, 0] });
  prim('plane', sky, { parent: panel, pos: [-0.5, 1.55, 0.171], scale: [1.15, 1, 2.3], rot: [90, 0, 0] });
  // pill-shaped window frame ring
  prim('box', frame, { parent: panel, pos: [-0.5, 2.78, 0], scale: [1.35, 0.14, 0.2] });
  prim('box', frame, { parent: panel, pos: [-0.5, 0.32, 0], scale: [1.35, 0.14, 0.2] });
  prim('box', frame, { parent: panel, pos: [-1.1, 1.55, 0], scale: [0.14, 2.46, 0.2] });
  prim('box', frame, { parent: panel, pos: [0.1, 1.55, 0], scale: [0.14, 2.46, 0.2] });

  // egg-shaped lounge chair
  const chair = lit(T.chair, { gloss: 0.45 });
  const c = new pc.Entity('chair'); room.addChild(c);
  c.setLocalPosition(-1.7, 0, 1.55); c.setLocalEulerAngles(0, 200, 0);
  prim('sphere', chair, { parent: c, pos: [0, 0.42, 0], scale: [0.95, 0.28, 0.9] });          // seat cushion
  prim('sphere', chair, { parent: c, pos: [0, 0.72, 0.38], scale: [0.95, 0.9, 0.3] });         // back shell
  [[-0.32, -0.3], [0.32, -0.3], [-0.32, 0.3], [0.32, 0.3]].forEach(([x, z]) =>
    prim('cylinder', lit('#9A98A3', { gloss: 0.7 }), { parent: c, pos: [x, 0.14, z], scale: [0.035, 0.28, 0.035] }));

  // soft key light for the lit props
  const sun = new pc.Entity('sun');
  sun.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.97, 1), intensity: 1.1 });
  sun.setEulerAngles(50, -30, 0);
  room.addChild(sun);

  const rgb = new pc.Color().fromString(T.clear);
  scene.cameraEntity.camera.clearColor = rgb;
}

// ---------------------------------------------------------------------------
// Camera rig. Spherical orbit around a target, with presets that glide.
// Portrait phone, vertical fov 28°: visible height ≈ 0.4986 × distance.
// ---------------------------------------------------------------------------
const MODES = {
  // full body in the room, user can orbit 360°
  space: { dist: 4.9, ty: 0.95, shift: 0, yaw: 16, pitch: 4 },
  // bust on the left third, messages on the right (Replika chat)
  chat: { dist: 4.4, ty: 1.0, shift: 0.27, yaw: 0, pitch: 3 },
  // face close-up for voice calls
  call: { dist: 2.8, ty: 1.38, shift: 0, yaw: 0, pitch: 1 },
};
const cur = { ...MODES.chat }, tgt = { ...MODES.chat };
let mode = 'chat';

function applyCamera() {
  const Y = rad(cur.yaw), P = rad(cur.pitch);
  const fwd = [-Math.sin(Y) * Math.cos(P), -Math.sin(P), Math.cos(Y) * Math.cos(P)];
  const right = [-Math.cos(Y), 0, -Math.sin(Y)];
  const t = [right[0] * cur.shift, cur.ty, right[2] * cur.shift];
  const cam = scene.cameraEntity;
  cam.setPosition(t[0] - fwd[0] * cur.dist, t[1] - fwd[1] * cur.dist, t[2] - fwd[2] * cur.dist);
  cam.lookAt(t[0], t[1], t[2]);
}

function tick(dt) {
  const k = 1 - Math.exp(-dt * 5.5);
  const dy = ((tgt.yaw - cur.yaw + 540) % 360) - 180;
  cur.yaw += dy * k;
  for (const key of ['dist', 'ty', 'shift', 'pitch']) cur[key] += (tgt[key] - cur[key]) * k;
  applyCamera();
}

function setMode(name, instant = false) {
  if (!MODES[name]) return;
  mode = name;
  Object.assign(tgt, MODES[name]);
  if (instant) { Object.assign(cur, MODES[name]); applyCamera(); }
}

// Orbit in the user's space view only; elsewhere the framing is authored.
function orbit(dYaw, dPitch) {
  if (mode !== 'space') return;
  tgt.yaw += dYaw;
  tgt.pitch = Math.max(-8, Math.min(30, tgt.pitch + dPitch));
  cur.yaw = tgt.yaw; cur.pitch = tgt.pitch; // follow the finger 1:1
}
function zoom(factor) {
  if (mode !== 'space') return;
  tgt.dist = Math.max(1.8, Math.min(5.2, tgt.dist / factor));
  cur.dist = tgt.dist;
}
function resetOrbit() { if (mode === 'space') Object.assign(tgt, MODES.space); }

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------
// Some library clips bake a root yaw into the pelvis, so they face away from camera.
// Counter-rotate the entity per clip; transitions are hard cuts because a crossfade
// would blend the pelvis yaw while the entity yaw snaps.
const CLIP_YAW = { idle: 0, wave: 0, clap: 0, nod: 235, cheer: -20 };

function playClip(name, loop) {
  character.setRotation(0, CLIP_YAW[name] ?? 0, 0);
  character.playAnimation(name, { loop });
}

async function load(id) {
  mark('charLoadStart:' + id);
  post({ type: 'loading', id });
  const next = await Character.loadVsplat(scene, `${BASE}characters/${id}.vsplat`, { name: id });
  if (character) { try { character.destroy?.(); } catch {} }
  character = next;
  playClip('idle', true);
  mark('charLoaded:' + id);
  post({ type: 'loaded', id });
}

// Play a one-shot gesture, then settle back into idle.
function gesture(name, ms = 2400) {
  if (!character) return;
  playClip(name, name === 'clap' || name === 'cheer');
  clearTimeout(gesture.t);
  gesture.t = setTimeout(() => playClip('idle', true), ms);
}

let themeIndex = 0;
function setTheme(i) {
  themeIndex = ((i % THEMES.length) + THEMES.length) % THEMES.length;
  buildRoom(THEMES[themeIndex]);
  post({ type: 'theme', index: themeIndex, name: THEMES[themeIndex].name });
}

async function init() {
  const canvas = document.getElementById('canvas');
  probe.float32Filterable = await webgpuCanDrawSplats();
  probe.chose = probe.float32Filterable ? 'auto' : 'webgl';
  scene = await Scene.create(canvas, {
    // Force WebGL2 unless WebGPU can really draw splats. Don't pass `gsplatRenderer`:
    // naming one bypasses the engine's safety net for the backend that was picked.
    ...(probe.float32Filterable ? {} : { backend: 'webgl' }),
    fov: 28,
    depth: true, // room meshes and the splat character must depth-sort against each other
    bgColor: { r: 0.79, g: 0.77, b: 0.82, a: 1 },
    cameraPosition: { x: 0, y: 1.2, z: -3.3 },
    cameraTarget: { x: 0, y: 1.1, z: 0 },
    ambientLight: 0.8,
  });
  app = scene.app;
  mark('sceneCreated');
  buildRoom(THEMES[0]);
  mark('roomBuilt');
  setMode('chat', true);
  app.on('update', tick);
  setPixelRatio(RATIOS[0]);
  scene.start();
  startAdaptiveQuality();
  await Promise.all(MOTIONS.map((m) => Animation.loadGlb(scene, `${BASE}motions/${m}.glb`, m)));
  mark('motionsLoaded');
  post({ type: 'ready' });
}


// ---------------------------------------------------------------------------
// Performance probe (used by the `-perfProbe` debug launch argument)
// ---------------------------------------------------------------------------
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];

/** Sample real presented frames for `ms`, calling `each()` once per frame. */
function sampleFrames(ms, each) {
  return new Promise((resolve) => {
    const dts = [];
    const start = performance.now();
    let prev = start;
    const step = (now) => {
      dts.push(now - prev); prev = now;
      each?.();
      if (now - start < ms) return requestAnimationFrame(step);
      const sorted = [...dts.slice(1)].sort((a, b) => a - b); // drop the first, it spans the setup
      const sum = sorted.reduce((x, y) => x + y, 0);
      resolve({
        frames: sorted.length,
        fps: +(sorted.length / (sum / 1000)).toFixed(1),
        avgMs: +(sum / sorted.length).toFixed(1),
        p50Ms: +pct(sorted, 50).toFixed(1),
        p95Ms: +pct(sorted, 95).toFixed(1),
        p99Ms: +pct(sorted, 99).toFixed(1),
        maxMs: +sorted[sorted.length - 1].toFixed(1),
        jank33: sorted.filter((d) => d > 33.4).length,
      });
    };
    requestAnimationFrame(step);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function deviceInfo() {
  const dev = app.graphicsDevice, c = document.getElementById('canvas');
  const gl = dev.gl;
  let gpu = '';
  try { const x = gl?.getExtension('WEBGL_debug_renderer_info'); gpu = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : ''; } catch {}
  return {
    backend: dev.deviceType, gpu, dpr: window.devicePixelRatio, maxPixelRatio: dev.maxPixelRatio,
    css: [innerWidth, innerHeight], canvasPx: [c.width, c.height],
    megapixels: +((c.width * c.height) / 1e6).toFixed(2),
  };
}

/** Render-resolution scale. The engine defaults to 1×; 2× is much sharper on 3× phones. */
function setPixelRatio(r) {
  const dev = app.graphicsDevice;
  dev.maxPixelRatio = r;
  dev.resizeCanvas(innerWidth, innerHeight);
  return deviceInfo().canvasPx;
}

// Adaptive resolution: start at 2× (sharp on 3× phones) and step down if frames run long.
// Never steps back up, so a hot device doesn't oscillate.
const RATIOS = [2, 1.5, 1];
let ratioIndex = 0;
function startAdaptiveQuality() {
  let acc = 0, n = 0;
  app.on('update', (dt) => {
    if (document.hidden || mode === undefined) return;
    acc += dt; n++;
    if (acc < 2.5) return;
    const avgMs = (acc / n) * 1000;
    acc = 0; n = 0;
    if (avgMs > 22 && ratioIndex < RATIOS.length - 1) {
      ratioIndex++;
      setPixelRatio(RATIOS[ratioIndex]);
      post({ type: 'quality', ratio: RATIOS[ratioIndex], avgMs: Math.round(avgMs) });
    }
  });
}

async function runProbe() {
  ratioIndex = RATIOS.length - 1; // freeze adaptation while measuring
  const out = { marks: { ...marks }, info: deviceInfo(), scenarios: {} };
  setTheme(0);
  setMode('chat', true); await wait(1200);
  out.scenarios.chatIdle = await sampleFrames(4000);
  gesture('cheer', 3500); await wait(300);
  out.scenarios.chatGesture = await sampleFrames(3000);
  await wait(1500);
  setMode('space'); await wait(1500);
  out.scenarios.spaceIdle = await sampleFrames(4000);
  out.scenarios.spaceOrbit = await sampleFrames(4000, () => orbit(2.2, 0));
  setMode('call'); await wait(1500);
  out.scenarios.callIdle = await sampleFrames(4000);

  // Resolution trade-off: the heaviest view (full-body orbit) and the call close-up at 1×/2×/3×.
  out.quality = {};
  for (const r of [1, 2, 3]) {
    const px = setPixelRatio(r); await wait(600);
    setMode('space', true); await wait(500);
    const orbitS = await sampleFrames(3000, () => orbit(2.2, 0));
    setMode('call', true); await wait(500);
    const callS = await sampleFrames(3000);
    out.quality[r + 'x'] = { canvasPx: px, megapixels: +((px[0] * px[1]) / 1e6).toFixed(2), spaceOrbit: orbitS, call: callS };
  }
  setPixelRatio(RATIOS[0]); ratioIndex = 0;
  setMode('chat'); await wait(500);
  out.info.after = deviceInfo();
  return out;
}

// ---------------------------------------------------------------------------
// On-screen diagnostics (a phone has no console). Toggle with stage.setDebug(true).
// ---------------------------------------------------------------------------
let badge, badgeTimer;
function setDebug(on) {
  if (!on) { badge?.remove(); badge = null; cancelAnimationFrame(badgeTimer); return; }
  if (badge) return;
  badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;right:0;top:44%;z-index:99999;pointer-events:none;padding:6px 8px;margin:4px;background:rgba(0,0,0,.72);color:#0f0;border-radius:6px;font:600 10px/1.45 ui-monospace,Menlo,monospace;white-space:pre';
  document.body.appendChild(badge);
  let frames = 0, last = performance.now();
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      const d = deviceInfo();
      badge.textContent =
        `fps       ${Math.round((frames * 1000) / (now - last))}\n` +
        `backend   ${d.backend}  (chose ${probe.chose})\n` +
        `nav.gpu   ${probe.hasNavGpu}  f32filterable ${probe.float32Filterable}\n` +
        `gpu       ${d.gpu || '?'}\n` +
        `canvas    ${d.canvasPx.join('x')}  dpr ${d.dpr}  ratio ${RATIOS[ratioIndex]}\n` +
        `marks     ${JSON.stringify(marks)}`;
      frames = 0; last = now;
    }
    badgeTimer = requestAnimationFrame(tick);
  };
  tick();
}

window.stage = {
  setDebug,
  runProbe, setPixelRatio, sampleFrames,
  load, gesture, setMode, orbit, zoom, resetOrbit, setTheme,
  nextTheme: () => setTheme(themeIndex + 1),
  get scene() { return scene; }, get character() { return character; },
  get cam() { return { cur, tgt }; },
};
init().catch((e) => post({ type: 'error', message: String(e?.stack || e) }));
