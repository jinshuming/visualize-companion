// Gaze for video calls: she looks at the camera, glances away (down, up, to the side) and comes back, the way a person
// does on a call. The eyes lead each glance with a quick saccade and the head follows slowly. Driven by rotating the
// neck/head and FACIAL_*_EyeParallel bones on top of the playing clip, via the engine's post-clamp hook (the same hook point
// the blink experiments used).
import * as pc from 'playcanvas';

// Which local axis of each bone yaws / pitches it, signed so + yaw = her left and + pitch = up. Bone frames are
// MetaHuman's, so these were measured on Chloe (2026-10-04): head z/y, eye y/x.
const AXES = { head: { yaw: 'z', pitch: 'y', ySign: -1, pSign: 1 }, eye: { yaw: 'y', pitch: 'x', ySign: 1, pSign: -1 } };
const UNIT = { x: new pc.Vec3(1, 0, 0), y: new pc.Vec3(0, 1, 0), z: new pc.Vec3(0, 0, 1) };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Where she may look (degrees of gaze; + yaw = her left, + pitch = up). Mostly small: people glance, they don't stare off.
const AWAY = [
  () => ({ yaw: rand(14, 22), pitch: rand(-3, 3) }), () => ({ yaw: -rand(14, 22), pitch: rand(-3, 3) }),
  () => ({ yaw: rand(8, 16), pitch: -rand(8, 14) }), () => ({ yaw: -rand(8, 16), pitch: -rand(8, 14) }),   // down at the side: phone, desk
  () => ({ yaw: rand(-10, 10), pitch: rand(8, 13) }),                                                       // up: thinking
];

export class Gaze {
  constructor(scene, getCharacter) {
    Object.assign(this, { scene, getCharacter, weight: 0, active: false, hooked: null, axes: structuredClone(AXES) });
    this.head = { yaw: 0, pitch: 0 }; this.eye = { yaw: 0, pitch: 0 };   // current
    this.goal = { yaw: 0, pitch: 0 }; this.jitter = { yaw: 0, pitch: 0 };
    this.state = 'camera'; this.until = 1.5; this.t = 0; this.nextJitter = 0.5;
  }

  setActive(on) { this.active = on; if (on) { this.state = 'camera'; this.goal = { yaw: 0, pitch: 0 }; this.until = this.t + rand(1.2, 2.5); } }

  /** One-off glance, e.g. 'up' while she thinks. */
  glance(kind) {
    if (!this.active) return;
    this.state = 'away'; this.until = this.t + rand(1.0, 1.6);
    this.goal = kind === 'up' ? { yaw: rand(-10, 10), pitch: rand(10, 14) } : pick(AWAY)();
  }

  /** Hook the character's armature once; the hook reads this object's current angles every frame. */
  attach() {
    const character = this.getCharacter(), arm = character?.armature || character?._armature;
    if (!arm || this.hooked === arm) return;
    this.hooked = arm;
    const names = this.scene.skeletonLibrary.boneNames441;
    const find = (n) => names.indexOf(n);
    this.bones = { neck1: find('neck_01'), neck2: find('neck_02'), head: find('head'), eyeL: find('FACIAL_L_EyeParallel'), eyeR: find('FACIAL_R_EyeParallel') };
    const orig = arm._applyRigPostClamps.bind(arm), q = new pc.Quat(), q2 = new pc.Quat();
    const rot = (pose, bi, ax, yaw, pitch) => {
      if (bi < 0) return;
      q.setFromAxisAngle(UNIT[ax.yaw], yaw * ax.ySign); q2.setFromAxisAngle(UNIT[ax.pitch], pitch * ax.pSign);
      pose.rotations[bi].mul(q).mul(q2);
    };
    arm._applyRigPostClamps = (...a) => {
      orig(...a);
      const w = this.weight; if (w < 0.002) return;
      const pose = arm._currentPose, b = this.bones, h = this.head, e = this.eye;
      // head turn shared along the spine of the neck: 25 % / 25 % / 50 %
      rot(pose, b.neck1, this.axes.head, h.yaw * 0.25 * w, h.pitch * 0.25 * w);
      rot(pose, b.neck2, this.axes.head, h.yaw * 0.25 * w, h.pitch * 0.25 * w);
      rot(pose, b.head, this.axes.head, h.yaw * 0.5 * w, h.pitch * 0.5 * w);
      rot(pose, b.eyeL, this.axes.eye, e.yaw * w, e.pitch * w);
      rot(pose, b.eyeR, this.axes.eye, e.yaw * w, e.pitch * w);
    };
  }

  tick(dt) {
    if (!this.getCharacter() || document.hidden) return;
    this.t += dt;
    this.weight += ((this.active ? 1 : 0) - this.weight) * (1 - Math.exp(-dt * 2.5));
    if (this.weight < 0.002 && !this.active) return;
    this.attach();

    if (this.active && this.t >= this.until) {
      if (this.state === 'camera') { this.state = 'away'; this.goal = pick(AWAY)(); this.until = this.t + rand(0.7, 2.0); }
      else { this.state = 'camera'; this.goal = { yaw: 0, pitch: 0 }; this.until = this.t + rand(1.8, 4.5); }
    }
    // micro-saccades: tiny eye twitches while holding a look
    if (this.t >= this.nextJitter) { this.jitter = { yaw: rand(-1.6, 1.6), pitch: rand(-1.2, 1.2) }; this.nextJitter = this.t + rand(0.35, 1.2); }

    const gaze = { yaw: this.goal.yaw + this.jitter.yaw, pitch: this.goal.pitch + this.jitter.pitch };
    const kHead = 1 - Math.exp(-dt * 3.2), kEye = 1 - Math.exp(-dt * 22);
    // the head takes ~55 % of the angle, the eyes make up whatever the head hasn't reached yet
    for (const ax of ['yaw', 'pitch']) {
      this.head[ax] += (gaze[ax] * 0.55 - this.head[ax]) * kHead;
      const eyeGoal = Math.max(-25, Math.min(25, gaze[ax] - this.head[ax]));
      this.eye[ax] += (eyeGoal - this.eye[ax]) * kEye;
    }
  }
}
