// Video-call behaviour: what she does with her body while the conversation runs.
//
//   base layer   (full body, loops)  idle_calm, now and then idle_shift for one pass
//   gesture layer (upper body only)  one clip at a time, faded in/out so it never pops
//
// The native app tells it the call phase (idle / listening / thinking / speaking) and, when a reply carries one, an
// emotion. The phase picks gestures on a loose, randomised schedule (never the same one twice in a row); an emotion
// interrupts with a matching reaction. Gaze and the hand-held camera run independently of this.
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (x) => x * x * (3 - 2 * x);

// Clip lengths in seconds (PINOC text-to-motion, 2026-10-04).
export const CALL_CLIPS = { idle_calm: 8, idle_shift: 8, listen_nod: 5, listen_tilt: 4, talk_beats: 6, talk_soft: 6,
  laugh_soft: 4, shy_hair: 4, think: 5, hand_heart: 4, shrug: 3, sigh_sad: 4 };

// Peak weight per clip: listening nods/tilts should stay modest next to the head turns the gaze layer adds.
const GAIN = { listen_nod: 0.75, listen_tilt: 0.75, sigh_sad: 0.9 };

// emotion -> reaction clip (+ the speaking tone that follows it)
const REACTIONS = {
  happy: { clip: 'laugh_soft', tone: 'beats' }, laugh: { clip: 'laugh_soft', tone: 'beats' },
  sad: { clip: 'sigh_sad', tone: 'soft', then: 'hand_heart' }, warm: { clip: 'hand_heart', tone: 'soft' },
  shy: { clip: 'shy_hair', tone: 'soft' }, think: { clip: 'think', tone: 'beats' }, doubt: { clip: 'shrug', tone: 'beats' },
};

export class CallBehavior {
  /** `host`: { getCharacter, playBase(name), settle(), loadClips(), gaze } */
  constructor(host) {
    Object.assign(this, { host, active: false, t: 0, phase: 'idle', tone: 'beats', cur: null, last: null, lock: false });
    this.timers = { listen: 0, talk: 0, idle: 0, base: 0 };
  }

  async enter() {
    await this.host.loadClips();
    if (this.entered === false) return;
    this.active = true; this.t = 0; this.cur = null; this.phase = 'idle';
    this.host.playBase('idle_calm'); this.baseName = 'idle_calm';
    this.timers.base = rand(14, 24); this.timers.idle = rand(8, 14);
    if (this.wantPhase) this.setPhase(this.wantPhase);   // the call may have moved on while the clips were loading
  }

  leave() {
    this.entered = false; this.active = false;
    this.stopGesture();
    this.host.settle();
  }
  begin() { this.entered = true; return this.enter(); }

  /** A full-body gesture (wave, cheer…) is playing; leave the body alone until it ends. */
  setLocked(on) { this.lock = on; if (on) this.stopGesture(); }

  setPhase(phase) {
    this.wantPhase = phase;
    if (!this.active || phase === this.phase) return;
    this.phase = phase;
    const { timers } = this;
    if (phase === 'listening') timers.listen = rand(2.5, 4.5);
    if (phase === 'speaking') timers.talk = 0.3;
    if (phase === 'thinking') {
      this.host.gaze?.glance('up');
      if (!this.perform(Math.random() < 0.7 ? 'think' : 'listen_tilt')) this.timers.listen = 0.5;
    }
    if (phase === 'idle') timers.idle = rand(5, 9);
  }

  /** An emotion from the reply: react now (interrupting a lesser gesture) and shape how she speaks next. */
  react(emotion) {
    const r = REACTIONS[emotion];
    if (!this.active || !r) return;
    this.tone = r.tone;
    this.pendingThen = r.then || null;
    this.perform(r.clip, true);
  }

  perform(name, force = false) {
    const c = this.host.getCharacter();
    if (!this.active || !c || this.lock || !(name in CALL_CLIPS)) return false;
    if (this.cur && !force) return false;
    c.playLayer('g', name, { region: 'upperBody', loop: false, weight: this.cur ? 1 : 0, crossfade: this.cur ? 0.25 : 0 });
    this.cur = { name, t: this.cur ? 0.3 : 0, len: CALL_CLIPS[name] };
    this.last = name;
    return true;
  }

  stopGesture() {
    if (!this.cur) return;
    try { this.host.getCharacter()?.stopLayer('g', 0); } catch {}
    this.cur = null;
  }

  pick(options) {
    const fresh = options.filter(([n]) => n !== this.last);
    const list = fresh.length ? fresh : options;
    let r = Math.random() * list.reduce((s, [, w]) => s + w, 0);
    for (const [n, w] of list) { if ((r -= w) <= 0) return n; }
    return list[0][0];
  }

  tick(dt) {
    if (!this.active || document.hidden) return;
    this.t += dt;
    const c = this.host.getCharacter(); if (!c) return;
    const { timers } = this;

    // gesture envelope: ease in over 0.3 s, ease out over the last 0.5 s
    if (this.cur) {
      const g = this.cur; g.t += dt;
      const w = Math.min(1, g.t / 0.3) * Math.max(0, Math.min(1, (g.len - g.t) / 0.5));
      c.setLayerWeight('g', ease(w) * (GAIN[g.name] ?? 1));
      if (g.t >= g.len) {
        this.stopGesture();
        if (this.pendingThen) { const n = this.pendingThen; this.pendingThen = null; this.perform(n); }
      }
    }
    for (const k in timers) timers[k] -= dt;

    if (!this.cur && !this.lock) {
      if (this.phase === 'listening' && timers.listen <= 0) {
        this.perform(this.pick([['listen_nod', 0.55], ['listen_tilt', 0.45]])); timers.listen = rand(4, 7);
      } else if (this.phase === 'speaking' && timers.talk <= 0) {
        const soft = this.tone === 'soft';
        this.perform(this.pick(soft ? [['talk_soft', 0.75], ['talk_beats', 0.25]] : [['talk_beats', 0.7], ['talk_soft', 0.3]]));
        timers.talk = rand(4.5, 7);
      } else if ((this.phase === 'idle' || this.phase === 'connecting') && timers.idle <= 0) {
        this.perform(this.pick([['shy_hair', 0.35], ['shrug', 0.25], ['listen_tilt', 0.4]])); timers.idle = rand(9, 16);
      }
    }

    // every so often the base posture shifts for one pass, then settles back
    if (timers.base <= 0 && !this.lock) {
      this.baseName = this.baseName === 'idle_shift' ? 'idle_calm' : 'idle_shift';
      const char = this.host.getCharacter();
      char.crossfadeTo(this.baseName, { duration: 0.8, loop: true });
      timers.base = this.baseName === 'idle_shift' ? CALL_CLIPS.idle_shift : rand(14, 26);
    }
  }
}
