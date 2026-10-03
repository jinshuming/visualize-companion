import * as pc from 'playcanvas';

// ---------------------------------------------------------------------------
// Room themes. The default is Replika's lavender-grey studio with a sky window.
// Colours were sampled from reference screenshots.
// ---------------------------------------------------------------------------
export const THEMES = [
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

let room, app;

export function buildRoom(scene, theme) {
  app = scene.app;
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

export const setRoomVisible = (v) => { if (room) room.enabled = v; };
