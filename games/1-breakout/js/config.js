// Field layout. The field lies in the XZ plane (y is up): bricks on top, side walls,
// a back wall, an open front where the paddle sits.
export const FIELD = {
  width: 14,
  depth: 18,
  wall: 0.4,
};

export const ROWS = 6;
export const COLS = 8;
export const BRICK = { w: 1.5, h: 0.4, d: 0.8, gap: 0.18 };

export const PADDLE = { w: 2.6, h: 0.4, d: 0.8, halfDepth: 2.2, travel: 5.2 };

export const BALL = { r: 0.28, speed: 8.2, maxBounce: 15 };

export const COLORS = {
  background: 0x070a12,
  fog: 0x0b1220,
  floor: 0x1c2a3c,
  gridGlow: 0x4aa8e8,
  // Deep, high-chroma neon. The first set was pastel (ff5d5d, ffe066 …): under the key light
  // and the environment every brick blew out to the same off-white and the stack read as one
  // pale slab. Saturated bases plus real emissive keep each row's colour at any brightness.
  brick: [0xff2f4f, 0xff8324, 0xffd21f, 0x18d67a, 0x1ea8ff, 0x9b5cff],
  paddle: 0x7ee8fa,
  ball: 0xf2f7ff,
  wall: 0x223245,
  trim: 0x35e0ff,
  fail: 0xff4d5e,
};

export const LIGHT = {
  position: [7, 14, 9],
  intensity: 1.9,
  ambient: 0.55,
  rim: [-9, 6, -12],
  rimColor: 0x4f92d6,
  rimIntensity: 1.9,
  env: 0.75,
};

// The camera keeps a fixed pitch and is fitted to the field box for the current
// viewport, so the whole playfield is always on screen at any aspect ratio.
// margin < 1: the field is fitted a touch tighter than the bounding box, so the tube is
// filled and the dead dark bands at the sides shrink.
export const CAMERA = {
  fov: 46,
  pitch: 64 * Math.PI / 180,
  // portrait: the same fit puts the camera so far back that the field is a stamp in the middle
  // of a foggy apron. A steeper pitch and a capped distance keep the playfield large.
  pitchPortrait: 70 * Math.PI / 180,
  distMax: { landscape: 27, portrait: 30 },
  target: [0, 0.25, -0.6],
  margin: 0.985,
  drift: 0.055,          // idle yaw (radians) so the attract screen breathes
};

export const PLANE_Y = BRICK.h / 2;   // the ball plays at the brick layer

export const POINTS_PER_BRICK = 7;
