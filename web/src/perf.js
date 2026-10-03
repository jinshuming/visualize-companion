// Render resolution, adaptive quality, the `-perfProbe` frame-rate probe and the on-screen diagnostics badge.
// A phone has no console, so numbers are drawn on the page (Settings › Show render diagnostics).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];

// Start at 2× (sharp on 3× phones) and step down if frames run long. Never steps back up, so a hot device doesn't oscillate.
const RATIOS = [2, 1.5, 1];

export class Perf {
  /** `ctx`: { app, post, marks, backend: { chose, hasNavGpu, float32Filterable }, drive: { setTheme, setMode, orbit, gesture } } */
  constructor(ctx) {
    this.ctx = ctx;
    this.ratioIndex = 0;
    this.setPixelRatio(RATIOS[0]);
    this.watchFrameTime();
  }

  deviceInfo() {
    const dev = this.ctx.app.graphicsDevice, c = document.getElementById('canvas'), gl = dev.gl;
    let gpu = '';
    try { const x = gl?.getExtension('WEBGL_debug_renderer_info'); gpu = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : ''; } catch {}
    return {
      backend: dev.deviceType, gpu, dpr: window.devicePixelRatio, maxPixelRatio: dev.maxPixelRatio,
      css: [innerWidth, innerHeight], canvasPx: [c.width, c.height],
      megapixels: +((c.width * c.height) / 1e6).toFixed(2),
    };
  }

  /** Render-resolution scale. The engine defaults to 1×; 2× is much sharper on 3× phones. */
  setPixelRatio(r) {
    const dev = this.ctx.app.graphicsDevice;
    dev.maxPixelRatio = r;
    dev.resizeCanvas(innerWidth, innerHeight);
    return this.deviceInfo().canvasPx;
  }

  watchFrameTime() {
    let acc = 0, n = 0;
    this.ctx.app.on('update', (dt) => {
      if (document.hidden) return;
      acc += dt; n++;
      if (acc < 2.5) return;
      const avgMs = (acc / n) * 1000;
      acc = 0; n = 0;
      if (avgMs > 22 && this.ratioIndex < RATIOS.length - 1) {
        this.setPixelRatio(RATIOS[++this.ratioIndex]);
        this.ctx.post({ type: 'quality', ratio: RATIOS[this.ratioIndex], avgMs: Math.round(avgMs) });
      }
    });
  }

  /** Sample real presented frames for `ms`, calling `each()` once per frame. */
  sampleFrames(ms, each) {
    return new Promise((resolve) => {
      const dts = [], start = performance.now();
      let prev = start;
      const step = (now) => {
        dts.push(now - prev); prev = now;
        each?.();
        if (now - start < ms) return requestAnimationFrame(step);
        const sorted = dts.slice(1).sort((a, b) => a - b); // drop the first, it spans the setup
        const sum = sorted.reduce((x, y) => x + y, 0);
        resolve({
          frames: sorted.length,
          fps: +(sorted.length / (sum / 1000)).toFixed(1),
          avgMs: +(sum / sorted.length).toFixed(1),
          p50Ms: +pct(sorted, 50).toFixed(1), p95Ms: +pct(sorted, 95).toFixed(1), p99Ms: +pct(sorted, 99).toFixed(1),
          maxMs: +sorted[sorted.length - 1].toFixed(1),
          jank33: sorted.filter((d) => d > 33.4).length,
        });
      };
      requestAnimationFrame(step);
    });
  }

  async runProbe() {
    const { setTheme, setMode, orbit, gesture } = this.ctx.drive, sample = (ms, each) => this.sampleFrames(ms, each);
    this.ratioIndex = RATIOS.length - 1; // freeze adaptation while measuring
    const out = { marks: { ...this.ctx.marks }, info: this.deviceInfo(), scenarios: {} };
    setTheme(0);
    setMode('chat', true); await wait(1200);
    out.scenarios.chatIdle = await sample(4000);
    gesture('cheer', 3500); await wait(300);
    out.scenarios.chatGesture = await sample(3000);
    await wait(1500);
    setMode('space'); await wait(1500);
    out.scenarios.spaceIdle = await sample(4000);
    out.scenarios.spaceOrbit = await sample(4000, () => orbit(2.2, 0));
    setMode('call'); await wait(1500);
    out.scenarios.callIdle = await sample(4000);

    // Resolution trade-off: the heaviest view (full-body orbit) and the call close-up at 1×/2×/3×.
    out.quality = {};
    for (const r of [1, 2, 3]) {
      const px = this.setPixelRatio(r); await wait(600);
      setMode('space', true); await wait(500);
      const spaceOrbit = await sample(3000, () => orbit(2.2, 0));
      setMode('call', true); await wait(500);
      const call = await sample(3000);
      out.quality[r + 'x'] = { canvasPx: px, megapixels: +((px[0] * px[1]) / 1e6).toFixed(2), spaceOrbit, call };
    }
    this.setPixelRatio(RATIOS[0]); this.ratioIndex = 0;
    setMode('chat'); await wait(500);
    out.info.after = this.deviceInfo();
    return out;
  }

  setBadge(on) {
    if (!on) { this.badge?.remove(); this.badge = null; cancelAnimationFrame(this.badgeTimer); return; }
    if (this.badge) return;
    const badge = this.badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;right:0;top:44%;z-index:99999;pointer-events:none;padding:6px 8px;margin:4px;background:rgba(0,0,0,.72);color:#0f0;border-radius:6px;font:600 10px/1.45 ui-monospace,Menlo,monospace;white-space:pre';
    document.body.appendChild(badge);
    const { backend, marks } = this.ctx;
    let frames = 0, last = performance.now();
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        const d = this.deviceInfo();
        badge.textContent =
          `fps       ${Math.round((frames * 1000) / (now - last))}\n` +
          `backend   ${d.backend}  (chose ${backend.chose})\n` +
          `nav.gpu   ${backend.hasNavGpu}  f32filterable ${backend.float32Filterable}\n` +
          `gpu       ${d.gpu || '?'}\n` +
          `canvas    ${d.canvasPx.join('x')}  dpr ${d.dpr}  ratio ${RATIOS[this.ratioIndex]}\n` +
          `marks     ${JSON.stringify(marks)}`;
        frames = 0; last = now;
      }
      this.badgeTimer = requestAnimationFrame(loop);
    };
    loop();
  }
}
