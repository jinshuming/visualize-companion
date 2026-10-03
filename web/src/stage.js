// The 3D stage hosted by the iOS app's WKWebView. This file only wires the pieces together:
//   room.js (set dressing) · camera.js (orbit rig) · blink.js (idle blinking) · perf.js (resolution + diagnostics)
// and owns the character and its clips. The native side talks to it through `window.stage`.
import * as pc from 'playcanvas';
import { Scene, Character, Animation } from '@viggle/splat-engine';
import { buildRoom, setRoomVisible, THEMES } from './room.js';
import { initCamera, cameraTick, setMode, setProfile, orbit, zoom, resetOrbit, frameThumb } from './camera.js';
import { Blinker } from './blink.js';
import { Gaze } from './gaze.js';
import { Perf } from './perf.js';

const post = (m) => window.webkit?.messageHandlers?.stage?.postMessage(m);
const BASE = location.origin + '/';
const MOTIONS = ['idle', 'wave', 'nod', 'clap', 'cheer'];

const T0 = performance.now();
const marks = {};
const mark = (k) => { marks[k] = Math.round(performance.now() - T0); };

let scene, app, character, blinker, gaze, perf;

// ---------------------------------------------------------------------------
// Backend selection. Splats live in rgba32float textures sampled with a filtering sampler,
// which WebGPU only allows when the adapter has `float32-filterable`. iPhones (and some
// Android GPUs) expose WebGPU without it, so the character silently fails to draw while the
// rest of the scene looks fine. Ask the adapter; never sniff the UA alone. iOS WebKit never
// qualifies, so it short-circuits to WebGL2.
// ---------------------------------------------------------------------------
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const backend = { hasNavGpu: !!navigator.gpu, float32Filterable: false, chose: 'webgl' };

async function webgpuCanDrawSplats() {
  if (isIOS || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter?.features.has('float32-filterable');
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Character and clips
// ---------------------------------------------------------------------------
// Some library clips bake a root yaw into the pelvis, so they face away from camera.
// Counter-rotate the entity per clip; transitions are hard cuts because a crossfade
// would blend the pelvis yaw while the entity yaw snaps.
const CLIP_YAW = { idle: 0, wave: 0, clap: 0, nod: 235, cheer: -20 };
// Real clip lengths (s): wave 1.67, nod 3.67 (the head dips at ~3.2-3.6 s), clap 1.17, cheer 2.50.
// A gesture must run its full length or the nod is cut off before it reaches its peak.
const CLIP_MS = { wave: 1800, nod: 3800, clap: 2400, cheer: 2600 };

function playClip(name, loop) {
  character.setRotation(0, CLIP_YAW[name] ?? 0, 0);
  character.playAnimation(name, { loop });
}

async function load(id, style = 'chibi') {
  setProfile(style);
  mark('charLoadStart:' + id);
  post({ type: 'loading', id });
  const next = await Character.loadVsplat(scene, `${BASE}characters/${id}.vsplat`, { name: id });
  if (character) { try { character.destroy?.(); } catch {} }
  character = next;
  playClip('idle', true);
  blinker.reset();
  mark('charLoaded:' + id);
  post({ type: 'loaded', id });
}

/** Play a one-shot gesture, then settle back into idle. */
function gesture(name, ms = CLIP_MS[name] ?? 2400) {
  if (!character) return;
  playClip(name, name === 'clap' || name === 'cheer');
  clearTimeout(gesture.t);
  gesture.t = setTimeout(() => playClip('idle', true), ms);
}

let themeIndex = 0;
function setTheme(i) {
  themeIndex = ((i % THEMES.length) + THEMES.length) % THEMES.length;
  buildRoom(scene, THEMES[themeIndex]);
  post({ type: 'theme', index: themeIndex, name: THEMES[themeIndex].name });
}

async function init() {
  backend.float32Filterable = await webgpuCanDrawSplats();
  backend.chose = backend.float32Filterable ? 'auto' : 'webgl';
  scene = await Scene.create(document.getElementById('canvas'), {
    // Force WebGL2 unless WebGPU can really draw splats. Don't pass `gsplatRenderer`:
    // naming one bypasses the engine's safety net for the backend that was picked.
    ...(backend.float32Filterable ? {} : { backend: 'webgl' }),
    fov: 28,
    depth: true, // room meshes and the splat character must depth-sort against each other
    bgColor: { r: 0.79, g: 0.77, b: 0.82, a: 1 },
    cameraPosition: { x: 0, y: 1.2, z: -3.3 },
    cameraTarget: { x: 0, y: 1.1, z: 0 },
    ambientLight: 0.8,
  });
  app = scene.app;
  mark('sceneCreated');
  buildRoom(scene, THEMES[0]);
  mark('roomBuilt');
  initCamera(scene);
  blinker = new Blinker(scene, post, () => character);
  gaze = new Gaze(scene, () => character);
  app.on('update', cameraTick);
  app.on('update', (dt) => { blinker.tick(dt); gaze.tick(dt); });
  perf = new Perf({ app, post, marks, backend, drive: { setTheme, setMode: setStageMode, orbit, gesture } });
  scene.start();
  await Promise.all(MOTIONS.map((m) => Animation.loadGlb(scene, `${BASE}motions/${m}.glb`, m)));
  mark('motionsLoaded');
  post({ type: 'ready' });
}

// Video calls get the lively behaviour (hand-held camera, wandering gaze); chat and space stay steady.
function setStageMode(name, instant) { setMode(name, instant); gaze?.setActive(name === 'call'); }

window.stage = {
  load, gesture, setMode: setStageMode, orbit, zoom, resetOrbit, setTheme,
  nextTheme: () => setTheme(themeIndex + 1),
  setBlinking: (on) => blinker?.setEnabled(on),
  setDebug: (on) => perf?.setBadge(on),
  runProbe: () => perf.runProbe(),
  // Thumbnail capture: hide the room, freeze the animation, pick a flat clear colour.
  // Two captures on black and white let the host recover true alpha.
  thumbPrep(dist, ty) { setRoomVisible(false); app.timeScale = 0; frameThumb(dist, ty); },
  setClear: (hex) => { scene.cameraEntity.camera.clearColor = new pc.Color().fromString(hex); },
};
init().catch((e) => post({ type: 'error', message: String(e?.stack || e) }));
