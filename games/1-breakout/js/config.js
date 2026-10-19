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
  floor: 0x16202e,
  gridGlow: 0x2f7fbf,
  brick: [0xff5d5d, 0xffa14f, 0xffe066, 0x5ad19a, 0x56b8ff, 0xb98cff],
  paddle: 0x7ee8fa,
  ball: 0xf2f7ff,
  wall: 0x1d2836,
  trim: 0x35e0ff,
  fail: 0xff4d5e,
};

export const LIGHT = {
  position: [7, 14, 9],
  intensity: 2.3,
  ambient: 0.4,
  rim: [-9, 6, -12],
  rimColor: 0x4f92d6,
  rimIntensity: 1.4,
  env: 0.6,
};

// The camera keeps a fixed pitch and is fitted to the field box for the current
// viewport, so the whole playfield is always on screen at any aspect ratio.
export const CAMERA = {
  fov: 46,
  pitch: 62 * Math.PI / 180,
  target: [0, 0.25, -0.6],
  margin: 1.03,
};

export const PLANE_Y = BRICK.h / 2;   // the ball plays at the brick layer

export const POINTS_PER_BRICK = 7;
