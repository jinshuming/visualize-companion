import * as pc from 'playcanvas';

// Idle blinking by recolouring. The eyes are Gaussians skinned to FACIAL_*_EyeParallel; the lids are too sparse to
// cover them by moving eyelid bones (tested, see PRODUCT.md). Instead the eyeball splats ease toward the local skin
// colour under a thin lash line, then are restored. Works for realistic and chibi characters alike.
//
// Two parts: `buildEyes` finds the eye splats and their colours; `Blinker` schedules blinks and uploads colours.

const SH_C0 = 0.28209479177387814;
const float2Half = pc.FloatPacking.float2Half;
const percentile = (arr, p) => { const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))]; };
const median = (a) => { a = Float32Array.from(a).sort(); return a.length ? a[Math.floor(a.length / 2)] : 0.8; };
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function buildEyes(scene, character) {
  const sp = character.splat, el = sp.splatData.elements[0], N = el.count;
  const get = (n) => { const p = el.properties.find((q) => q.name === n); return p.storage || p.data || p.array; };
  const X = get('x'), Y = get('y'), Z = get('z'), DC = [get('f_dc_0'), get('f_dc_1'), get('f_dc_2')], O = get('opacity');
  const names = scene.skeletonLibrary.boneNames441, sw = sp.splatWeights;
  const rgb = (i) => DC.map((c) => 0.5 + SH_C0 * c[i]);

  // Splats whose EyeParallel influence is substantial, per side.
  const sides = { L: [], R: [] };
  for (let i = 0; i < N; i++) {
    let wl = 0, wr = 0;
    for (let k = 0; k < 4; k++) {
      const n = names[sw.indices[i * 4 + k]], w = sw.weights[i * 4 + k];
      if (n === 'FACIAL_L_EyeParallel') wl += w; else if (n === 'FACIAL_R_EyeParallel') wr += w;
    }
    if (wl > 0.35) sides.L.push(i); else if (wr > 0.35) sides.R.push(i);
  }

  const idx = [], height = [], base = [], skin = [];
  for (const eye of [sides.L, sides.R]) {
    if (eye.length < 20) continue;
    const y0 = percentile(eye.map((i) => Y[i]), 0.06), y1 = percentile(eye.map((i) => Y[i]), 0.94);
    const x0 = percentile(eye.map((i) => X[i]), 0.04), x1 = percentile(eye.map((i) => X[i]), 0.96);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, zRef = Z[eye[Math.floor(eye.length / 2)]];
    // Local skin colour: median of nearby non-eye, mid-to-light splats.
    const isEye = new Set(eye), ch = [[], [], []];
    for (let i = 0; i < N; i++) {
      if (isEye.has(i)) continue;
      if (Math.abs(X[i] - cx) < (x1 - x0) * 1.1 && Math.abs(Y[i] - cy) < (y1 - y0) * 1.6 && Math.abs(Z[i] - zRef) < 0.06) {
        const c = rgb(i), lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        if (lum > 0.45 && lum < 0.97 && c[0] >= c[2]) c.forEach((v, k) => ch[k].push(v));
      }
    }
    const sk = ch.map(median);
    for (const i of eye) {
      if (Y[i] < y0 - (y1 - y0) * 0.1 || Y[i] > y1 + (y1 - y0) * 0.1) continue; // drop outliers (under-eye shadow etc.)
      idx.push(i); height.push(Math.max(0, Math.min(1, (Y[i] - y0) / (y1 - y0)))); base.push(...rgb(i)); skin.push(...sk);
    }
  }

  // Own copy of the whole colour texture (RGBA half floats): each blink frame is a memcpy plus ~1k texel writes.
  const full = new Uint16Array(N * 4);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) full[i * 4 + k] = float2Half(DC[k][i] * SH_C0 + 0.5);
    full[i * 4 + 3] = float2Half(1 / (1 + Math.exp(-O[i])));
  }
  return {
    idx: Int32Array.from(idx), height: Float32Array.from(height), base: Float32Array.from(base), skin: Float32Array.from(skin),
    full, texture: sp.asset?.resource?.streams?.getTexture?.('splatColor'),
  };
}

const LASH = [0.22, 0.14, 0.12];

/** The upper lid sweeps down: splats above `edge` take the skin colour; a thin lash line rides the edge. */
function paintEyes(eyes, closure) {
  const { idx, height, base, skin, full } = eyes, edge = 1 - closure * 1.1;
  for (let j = 0; j < idx.length; j++) {
    const h = height[j];
    const cover = closure <= 0 ? 0 : smoothstep(edge - 0.04, edge + 0.04, h);
    const line = closure <= 0 ? 0 : Math.max(0, 1 - Math.abs(h - (edge - 0.02)) / 0.13) * Math.min(1, closure * 2.2);
    for (let k = 0; k < 3; k++) {
      let v = base[j * 3 + k];
      v += (skin[j * 3 + k] - v) * cover;
      v += (LASH[k] - v) * line;
      full[idx[j] * 4 + k] = float2Half(v);
    }
  }
}

const easeIn = (x) => x * x, easeOut = (x) => 1 - (1 - x) * (1 - x);

export class Blinker {
  constructor(scene, post, getCharacter) {
    Object.assign(this, { scene, post, getCharacter, enabled: true });
    this.reset();
  }

  /** Call after a (new) character loads: eyes are re-measured ~1.8 s later. */
  reset() {
    this.eyes = null; this.t = 0; this.phase = 'idle'; this.p = 0; this.last = 0; this.second = false;
    this.schedule(1.8);
  }

  schedule(delay) { this.next = this.t + (delay ?? 2.0 + Math.random() * 4.5); }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on && this.eyes) { this.upload(0); this.phase = 'idle'; }
  }

  disable(why) { this.enabled = false; this.post({ type: 'log', message: 'blink off: ' + why }); }

  upload(closure) {
    paintEyes(this.eyes, closure);
    const data = this.eyes.texture.lock();
    if (data instanceof Uint16Array && data.length >= this.eyes.full.length) data.set(this.eyes.full);
    else this.disable('colour texture is not a half-float buffer');
    this.eyes.texture.unlock();
    this.last = closure;
  }

  /** Human-like: ~15 blinks/min with natural jitter, occasional double blinks. Close ~75 ms, hold ~35 ms, open ~140 ms. */
  tick(dt) {
    const character = this.getCharacter();
    if (!this.enabled || !character || document.hidden) return;
    this.t += dt;
    if (!this.eyes) {
      if (this.t < this.next) return;
      try {
        this.eyes = buildEyes(this.scene, character);
        if (!this.eyes.texture || !this.eyes.idx.length) return this.disable('no eye splats or colour texture');
        this.post({ type: 'log', message: `blink ready, ${this.eyes.idx.length} eye splats` });
      } catch (e) { return this.disable('setup failed: ' + e); }
      this.schedule(0.4);
    }
    if (this.phase === 'idle') {
      if (this.t < this.next) return;
      this.phase = 'close'; this.p = 0;
    }
    let c = this.last;
    if (this.phase === 'close') { this.p += dt / 0.075; c = easeIn(Math.min(1, this.p)); if (this.p >= 1) { this.phase = 'hold'; this.p = 0; } }
    else if (this.phase === 'hold') { this.p += dt / 0.035; c = 1; if (this.p >= 1) { this.phase = 'open'; this.p = 0; } }
    else {
      this.p += dt / 0.14; c = 1 - easeOut(Math.min(1, this.p));
      if (this.p >= 1) {
        c = 0; this.phase = 'idle';
        if (!this.second && Math.random() < 0.12) { this.second = true; this.schedule(0.14 + Math.random() * 0.1); }
        else { this.second = false; this.schedule(); }
      }
    }
    if (Math.abs(c - this.last) > 0.004 || (c === 0 && this.last !== 0)) this.upload(c);
  }
}
