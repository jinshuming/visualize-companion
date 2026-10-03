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
  // lavender: the default studio. Every theme is a low-chroma pastel; no vivid colour anywhere.
  { name: 'lavender', wallTop: '#D4D1DD', wallMid: '#F1F0F6', wallLow: '#B9B2BE', floor: '#E9E6EE', floorEdge: '#B4AEB8',
    skyTop: '#B8D4F2', skyLow: '#E4EEF9', frame: '#F6F5FA', panel: '#C5BFCE', chair: '#EEECF2', clear: '#C9C4D0' },
  { name: 'peach', wallTop: '#E6CFCB', wallMid: '#F8E8DF', wallLow: '#CDB3B4', floor: '#F1E1DA', floorEdge: '#C4AEB0',
    skyTop: '#F5C9B6', skyLow: '#FBE6D2', frame: '#FFF6EF', panel: '#DCC3C0', chair: '#FBEDE6', clear: '#DDC8C4' },
  { name: 'dusk', wallTop: '#B9BCD8', wallMid: '#DCDDEE', wallLow: '#9EA1BF', floor: '#D3D4E6', floorEdge: '#9A9DBB',
    skyTop: '#A5AEDA', skyLow: '#D6DAF2', frame: '#EEF0FA', panel: '#AEB1CF', chair: '#E6E7F4', clear: '#B4B7D2' },
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
  // used only when capturing picker thumbnails
  thumb: { dist: 4.9, ty: 0.95, shift: 0, yaw: 0, pitch: 0 },
};
// Per-style framing overrides (realistic faces are smaller than chibi heads, so push in and aim higher).
const PROFILES = {
  chibi: { call: { dist: 2.8, ty: 1.38 } },
  realistic: { call: { dist: 2.2, ty: 1.53 } },
};
function setProfile(name) {
  Object.assign(MODES.call, (PROFILES[name] || PROFILES.chibi).call);
  if (mode === 'call') Object.assign(tgt, MODES.call);
}
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

async function load(id, profile = 'chibi') {
  setProfile(profile);
  mark('charLoadStart:' + id);
  post({ type: 'loading', id });
  const next = await Character.loadVsplat(scene, `${BASE}characters/${id}.vsplat`, { name: id });
  if (character) { try { character.destroy?.(); } catch {} }
  character = next;
  playClip('idle', true);
  resetBlink();
  mark('charLoaded:' + id);
  post({ type: 'loaded', id });
}

// Real clip lengths (s): wave 1.67, nod 3.67 (the head dips at ~3.2-3.6 s), clap 1.17, cheer 2.50.
// A gesture must run its full length or the nod is cut off before it reaches its peak.
const CLIP_MS = { wave: 1800, nod: 3800, clap: 2400, cheer: 2600 };

// Play a one-shot gesture, then settle back into idle.
function gesture(name, ms = CLIP_MS[name] ?? 2400) {
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
  app.on('update', blinkTick);
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

// Thumbnail capture: hide the room, freeze the animation, pick a flat clear colour.
// Two captures on black and white let the host recover true alpha.
function thumbPrep(dist, ty) {
  room.enabled = false;
  app.timeScale = 0;
  MODES.thumb.dist = dist; MODES.thumb.ty = ty;
  setMode('thumb', true);
}
function setClear(hex) { scene.cameraEntity.camera.clearColor = new pc.Color().fromString(hex); }

// ---------------------------------------------------------------------------
// Procedural facial layer. The engine evaluates the clip, then calls armature._applyRigPostClamps
// right before skinning; wrapping it lets us nudge facial bones on top of any animation.
// ---------------------------------------------------------------------------
const FACE = { mode: 'off', axis: 'x', amount: 0, closure: 0, upper: [], lower: [], eyes: [] };

function indexBones(re) {
  const names = scene.skeletonLibrary.boneNames441;
  return names.map((n, i) => [n, i]).filter(([n]) => re.test(n)).map(([, i]) => i);
}

function installFaceLayer() {
  const arm = character.armature || character._armature;
  if (arm.__faceLayer) return { upper: FACE.upper.length, lower: FACE.lower.length, eyes: FACE.eyes.length };
  arm.__faceLayer = true;
  FACE.upper = indexBones(/^FACIAL_[LR]_EyelidUpper[AB]\d?$/);
  FACE.lower = indexBones(/^FACIAL_[LR]_EyelidLower[AB]\d?$/);
  FACE.eyes = indexBones(/^FACIAL_[LR]_EyeParallel$/);
  const orig = arm._applyRigPostClamps.bind(arm);
  const q = new pc.Quat();
  const AX = { x: new pc.Vec3(1, 0, 0), y: new pc.Vec3(0, 1, 0), z: new pc.Vec3(0, 0, 1) };
  arm._applyRigPostClamps = function (...a) {
    orig(...a);
    if (FACE.mode === 'off' || FACE.closure <= 0) return;
    const pose = arm._currentPose, k = FACE.closure;
    if (FACE.mode === 'rot') {
      for (const bi of FACE.upper) { q.setFromAxisAngle(AX[FACE.axis], FACE.amount * k); pose.rotations[bi].mul(q); }
      for (const bi of FACE.lower) { q.setFromAxisAngle(AX[FACE.axis], -FACE.amount * 0.6 * k); pose.rotations[bi].mul(q); }
    } else if (FACE.mode === 'scale') {
      for (const bi of FACE.eyes) pose.scales[bi][FACE.axis] = 1 + (FACE.amount - 1) * k;
    }
  };
  return { upper: FACE.upper.length, lower: FACE.lower.length, eyes: FACE.eyes.length };
}

function faceExperiment(mode, axis, amount) {
  const info = installFaceLayer();
  Object.assign(FACE, { mode, axis, amount, closure: 1 });
  return info;
}

// ---------------------------------------------------------------------------
// Blinking by recolouring. The eyes are Gaussians skinned to FACIAL_*_EyeParallel; the lids are too sparse to
// cover them by moving eyelid bones. Instead, ease the eyeball splats toward the local skin colour and darken a
// thin line where the lash line would be, then restore. Works for realistic and chibi characters alike.
// ---------------------------------------------------------------------------
const BLINK = { ready: false, closure: 0, idx: null, base: null, skin: null, lash: null, isLine: null, el: null, res: null };
const SH_C0 = 0.28209479177387814;

function setupBlink() {
  const sp = character.splat, el = sp.splatData.elements[0];
  const get = (n) => { const p = el.properties.find((q) => q.name === n); return p.storage || p.data || p.array; };
  const X = get('x'), Y = get('y'), Z = get('z'), F0 = get('f_dc_0'), F1 = get('f_dc_1'), F2 = get('f_dc_2');
  const bn = scene.skeletonLibrary.boneNames441, sw = sp.splatWeights, N = el.count;
  // Splats whose EyeParallel influence is substantial, per side.
  const sides = { L: [], R: [] };
  for (let i = 0; i < N; i++) {
    let wl = 0, wr = 0;
    for (let k = 0; k < 4; k++) {
      const n = bn[sw.indices[i * 4 + k]], w = sw.weights[i * 4 + k];
      if (n === 'FACIAL_L_EyeParallel') wl += w; else if (n === 'FACIAL_R_EyeParallel') wr += w;
    }
    if (wl > 0.35) sides.L.push(i); else if (wr > 0.35) sides.R.push(i);
  }
  const rgb = (i) => [0.5 + SH_C0 * F0[i], 0.5 + SH_C0 * F1[i], 0.5 + SH_C0 * F2[i]];
  const pct = (arr, p) => { const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))]; };
  const idx = [], h = [], skin = [], base = [];
  for (const side of ['L', 'R']) {
    const eye = sides[side]; if (eye.length < 20) continue;
    const ys = eye.map((i) => Y[i]), xs = eye.map((i) => X[i]);
    const y0 = pct(ys, 0.06), y1 = pct(ys, 0.94), x0 = pct(xs, 0.04), x1 = pct(xs, 0.96);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, zRef = Z[eye[Math.floor(eye.length / 2)]];
    // Local skin colour: median of nearby non-eye, mid-to-light splats.
    const isEye = new Set(eye), ch = [[], [], []];
    for (let i = 0; i < N; i++) {
      if (isEye.has(i)) continue;
      if (Math.abs(X[i] - cx) < (x1 - x0) * 1.1 && Math.abs(Y[i] - cy) < (y1 - y0) * 1.6 && Math.abs(Z[i] - zRef) < 0.06) {
        const c = rgb(i), lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        if (lum > 0.45 && lum < 0.97 && c[0] >= c[2]) { ch[0].push(c[0]); ch[1].push(c[1]); ch[2].push(c[2]); }
      }
    }
    const med = (a) => { a = Float32Array.from(a).sort(); return a.length ? a[Math.floor(a.length / 2)] : 0.8; };
    const sk = [med(ch[0]), med(ch[1]), med(ch[2])];
    for (const i of eye) {
      if (Y[i] < y0 - (y1 - y0) * 0.1 || Y[i] > y1 + (y1 - y0) * 0.1) continue; // drop outliers (under-eye shadow etc.)
      idx.push(i); h.push(Math.max(0, Math.min(1, (Y[i] - y0) / (y1 - y0)))); base.push(...rgb(i)); skin.push(...sk);
    }
  }
  BLINK.idx = Int32Array.from(idx); BLINK.base = Float32Array.from(base); BLINK.skin = Float32Array.from(skin);
  BLINK.h = Float32Array.from(h); BLINK.lash = [0.22, 0.14, 0.12];
  BLINK.F = [F0, F1, F2]; BLINK.el = sp.splatData; BLINK.res = sp.asset?.resource || null; BLINK.ready = true; BLINK.closure = 0;
  // Own copy of the whole colour texture (RGBA half floats) so each blink frame is a memcpy plus ~1k texel writes.
  const O = get('opacity'), f2h = pc.FloatPacking.float2Half;
  BLINK.full = new Uint16Array(N * 4);
  for (let i = 0; i < N; i++) {
    BLINK.full[i * 4] = f2h(F0[i] * SH_C0 + 0.5); BLINK.full[i * 4 + 1] = f2h(F1[i] * SH_C0 + 0.5);
    BLINK.full[i * 4 + 2] = f2h(F2[i] * SH_C0 + 0.5); BLINK.full[i * 4 + 3] = f2h(1 / (1 + Math.exp(-O[i])));
  }
  BLINK.fastOK = undefined;
  return { eyeSplats: idx.length, hasUpdate: !!(BLINK.res && BLINK.res.updateColorData) };
}

// The upper lid sweeps down: splats above `edge` are lid (skin colour); a thin dark lash line rides the edge.
// Fast path: write only the eye texels into the colour texture (full updateColorData rewrites all ~47k splats).
const BLINK_COST = { n: 0, ms: 0 };
function applyBlink(c) {
  if (!BLINK.ready || !BLINK.res) return;
  const t0 = performance.now();
  BLINK.closure = c;
  const [F0, F1, F2] = BLINK.F, n = BLINK.idx.length, edge = 1 - c * 1.1;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let j = 0; j < n; j++) {
    const i = BLINK.idx[j], hj = BLINK.h[j];
    const cover = c <= 0 ? 0 : sm(edge - 0.04, edge + 0.04, hj);
    const line = c <= 0 ? 0 : Math.max(0, 1 - Math.abs(hj - (edge - 0.02)) / 0.13) * Math.min(1, c * 2.2);
    let r = BLINK.base[j * 3], g = BLINK.base[j * 3 + 1], b = BLINK.base[j * 3 + 2];
    r += (BLINK.skin[j * 3] - r) * cover; g += (BLINK.skin[j * 3 + 1] - g) * cover; b += (BLINK.skin[j * 3 + 2] - b) * cover;
    r += (BLINK.lash[0] - r) * line; g += (BLINK.lash[1] - g) * line; b += (BLINK.lash[2] - b) * line;
    F0[i] = (r - 0.5) / SH_C0; F1[i] = (g - 0.5) / SH_C0; F2[i] = (b - 0.5) / SH_C0;
  }
  let fast = false;
  const tex = BLINK.res.streams?.getTexture?.('splatColor');
  if (tex && BLINK.fastOK !== false) {
    const h = pc.FloatPacking.float2Half, full = BLINK.full;
    for (let j = 0; j < n; j++) {
      const i = BLINK.idx[j];
      full[i * 4] = h(F0[i] * SH_C0 + 0.5); full[i * 4 + 1] = h(F1[i] * SH_C0 + 0.5); full[i * 4 + 2] = h(F2[i] * SH_C0 + 0.5);
    }
    const data = tex.lock();
    if (data && data.length >= full.length && data instanceof Uint16Array) { data.set(full); fast = true; }
    else if (BLINK.fastOK === undefined) { BLINK.fastOK = false; post({ type: 'log', message: 'blink fast path unavailable' }); }
    tex.unlock();
    if (fast && BLINK.fastOK === undefined) { BLINK.fastOK = true; post({ type: 'log', message: 'blink fast path on' }); }
  }
  if (!fast) BLINK.res.updateColorData(BLINK.el);
  BLINK_COST.n++; BLINK_COST.ms += performance.now() - t0;
}

// Human-like blink scheduler: ~15 blinks/min with natural jitter, occasional double blinks.
// A blink is fast: close ~75 ms, hold ~35 ms, open ~140 ms (opening is slower than closing).
const BL = { enabled: true, t: 0, next: 2.0, phase: 'idle', p: 0, last: 0, second: false };
const easeIn = (x) => x * x, easeOut = (x) => 1 - (1 - x) * (1 - x);
function scheduleBlink(delay) { BL.next = BL.t + (delay ?? 2.0 + Math.random() * 4.5); }

function resetBlink() { BLINK.ready = false; BL.phase = 'idle'; BL.last = 0; BL.second = false; scheduleBlink(1.8); }

function blinkTick(dt) {
  if (!BL.enabled || !character || document.hidden) return;
  BL.t += dt;
  if (!BLINK.ready) {
    if (BL.t < BL.next) return;
    try {
      const info = setupBlink();
      post({ type: 'log', message: 'blink ready ' + JSON.stringify({ ...info, lods: character.splats?.length }) });
    } catch (e) { BL.enabled = false; post({ type: 'log', message: 'blink setup failed: ' + e }); return; }
    scheduleBlink(0.4);
  }
  let c = BL.last;
  if (BL.phase === 'idle') {
    if (BL.t < BL.next) return;
    BL.phase = 'close'; BL.p = 0;
  }
  if (BL.phase === 'close') { BL.p += dt / 0.075; c = easeIn(Math.min(1, BL.p)); if (BL.p >= 1) { BL.phase = 'hold'; BL.p = 0; } }
  else if (BL.phase === 'hold') { BL.p += dt / 0.035; c = 1; if (BL.p >= 1) { BL.phase = 'open'; BL.p = 0; } }
  else if (BL.phase === 'open') {
    BL.p += dt / 0.14; c = 1 - easeOut(Math.min(1, BL.p));
    if (BL.p >= 1) {
      c = 0; BL.phase = 'idle';
      if (BLINK_COST.n) post({ type: 'log', message: `blink cost ${(BLINK_COST.ms / BLINK_COST.n).toFixed(2)} ms/frame over ${BLINK_COST.n} frames` });
      if (!BL.second && Math.random() < 0.12) { BL.second = true; scheduleBlink(0.14 + Math.random() * 0.1); }
      else { BL.second = false; scheduleBlink(); }
    }
  }
  if (Math.abs(c - BL.last) > 0.004 || c === 0 && BL.last !== 0) { applyBlink(c); BL.last = c; }
}

function setBlinking(on) { BL.enabled = !!on; if (!on && BLINK.ready) { applyBlink(0); BL.last = 0; BL.phase = 'idle'; } }

function blinkExperiment(closure) {
  const info = BLINK.ready ? { reused: true } : setupBlink();
  applyBlink(closure);
  post({ type: 'log', message: 'blink ' + JSON.stringify(info) });
  return info;
}

window.stage = {
  setBlinking,
  blinkExperiment,
  faceExperiment,
  thumbPrep, setClear,
  setDebug,
  runProbe, setPixelRatio, sampleFrames,
  load, gesture, setMode, orbit, zoom, resetOrbit, setTheme,
  nextTheme: () => setTheme(themeIndex + 1),
  get scene() { return scene; }, get character() { return character; },
  get cam() { return { cur, tgt }; },
};
init().catch((e) => post({ type: 'error', message: String(e?.stack || e) }));
