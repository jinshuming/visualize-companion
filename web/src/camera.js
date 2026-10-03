// Camera rig: a spherical orbit around a target, with presets that glide.
// Portrait phone, vertical fov 28°: visible height ≈ 0.4986 × distance.
const rad = (d) => (d * Math.PI) / 180;

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
// Per-style call framing (realistic faces are smaller than chibi heads, so push in and aim higher).
const CALL_FRAMING = { chibi: { dist: 2.8, ty: 1.38 }, realistic: { dist: 2.2, ty: 1.53 } };

const cur = { ...MODES.chat }, tgt = { ...MODES.chat };
let mode = 'chat';
let cameraEntity;

export const currentMode = () => mode;

export function initCamera(scene) {
  cameraEntity = scene.cameraEntity;
  setMode('chat', true);
}

function apply() {
  const Y = rad(cur.yaw), P = rad(cur.pitch);
  const fwd = [-Math.sin(Y) * Math.cos(P), -Math.sin(P), Math.cos(Y) * Math.cos(P)];
  const right = [-Math.cos(Y), 0, -Math.sin(Y)];
  const t = [right[0] * cur.shift, cur.ty, right[2] * cur.shift];
  cameraEntity.setPosition(t[0] - fwd[0] * cur.dist, t[1] - fwd[1] * cur.dist, t[2] - fwd[2] * cur.dist);
  cameraEntity.lookAt(t[0], t[1], t[2]);
}

/** Per-frame glide toward the target preset. */
export function cameraTick(dt) {
  const k = 1 - Math.exp(-dt * 5.5);
  const dy = ((tgt.yaw - cur.yaw + 540) % 360) - 180;
  cur.yaw += dy * k;
  for (const key of ['dist', 'ty', 'shift', 'pitch']) cur[key] += (tgt[key] - cur[key]) * k;
  apply();
}

export function setMode(name, instant = false) {
  if (!MODES[name]) return;
  mode = name;
  Object.assign(tgt, MODES[name]);
  if (instant) { Object.assign(cur, MODES[name]); apply(); }
}

export function setProfile(style) {
  Object.assign(MODES.call, CALL_FRAMING[style] || CALL_FRAMING.chibi);
  if (mode === 'call') Object.assign(tgt, MODES.call);
}

// The user orbits only in the space view; elsewhere the framing is authored.
export function orbit(dYaw, dPitch) {
  if (mode !== 'space') return;
  tgt.yaw += dYaw;
  tgt.pitch = Math.max(-8, Math.min(30, tgt.pitch + dPitch));
  cur.yaw = tgt.yaw; cur.pitch = tgt.pitch; // follow the finger 1:1
}

export function zoom(factor) {
  if (mode !== 'space') return;
  tgt.dist = Math.max(1.8, Math.min(5.2, tgt.dist / factor));
  cur.dist = tgt.dist;
}

export function resetOrbit() { if (mode === 'space') Object.assign(tgt, MODES.space); }

export function frameThumb(dist, ty) {
  MODES.thumb.dist = dist; MODES.thumb.ty = ty;
  setMode('thumb', true);
}
