// Field layout. The field lies in the XZ plane (y is up):
// bricks on top, side walls, a back wall, an open front where the paddle sits.
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
  background: 0x0b0e14,
  floor: 0x141a24,
  brick: [0xff6b57, 0xffb86b, 0x4fd1c5, 0x6ea8fe, 0xc77dff, 0x9ae198],
  paddle: 0x4fd1c5,
  ball: 0xf2f7ff,
  wall: 0x1d2531,
};

export const LIGHT = {
  position: [7, 14, 9],
  intensity: 3.2,
  ambient: 0.7,
};

export const CAMERA = {
  fov: 50,
  // Looking down at the field at an angle.
  position: [0, 15, 15],
  lookAt: [0, 0, -3.5],
};

export const PLANE_Y = BRICK.h / 2;   // the ball plays at the brick layer

export const POINTS_PER_BRICK = 7;
