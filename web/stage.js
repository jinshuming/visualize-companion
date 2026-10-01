import * as pc from 'playcanvas';
import { Scene, Character, Animation } from '@viggle/splat-engine';

const post = (m) => window.webkit?.messageHandlers?.stage?.postMessage(m);
const BASE = location.origin + '/';
const MOTIONS = ['idle', 'wave', 'nod', 'clap', 'cheer'];
const rad = (d) => (d * Math.PI) / 180;

let scene, app, character;

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
  post({ type: 'loading', id });
  const next = await Character.loadVsplat(scene, `${BASE}characters/${id}.vsplat`, { name: id });
  if (character) { try { character.destroy?.(); } catch {} }
  character = next;
  playClip('idle', true);
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
  scene = await Scene.create(canvas, {
    fov: 28,
    depth: true, // room meshes and the splat character must depth-sort against each other
    bgColor: { r: 0.79, g: 0.77, b: 0.82, a: 1 },
    cameraPosition: { x: 0, y: 1.2, z: -3.3 },
    cameraTarget: { x: 0, y: 1.1, z: 0 },
    ambientLight: 0.8,
  });
  app = scene.app;
  buildRoom(THEMES[0]);
  setMode('chat', true);
  app.on('update', tick);
  scene.start();
  await Promise.all(MOTIONS.map((m) => Animation.loadGlb(scene, `${BASE}motions/${m}.glb`, m)));
  post({ type: 'ready' });
}

window.stage = {
  load, gesture, setMode, orbit, zoom, resetOrbit, setTheme,
  nextTheme: () => setTheme(themeIndex + 1),
  get scene() { return scene; }, get character() { return character; },
  get cam() { return { cur, tgt }; },
};
init().catch((e) => post({ type: 'error', message: String(e?.stack || e) }));
