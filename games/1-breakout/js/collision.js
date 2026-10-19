import * as THREE from "three";
import { FIELD, BRICK, PADDLE, BALL } from "./config.js";

const halfW = FIELD.width / 2;
const halfD = FIELD.depth / 2;

/**
 * The ball plays on the field plane (its height is fixed at the brick layer).
 * One swept step: move the ball, then resolve hits against bricks, the side
 * walls, the far ("top") wall and the paddle.
 *
 * Returns { brick, paddle, wall, lost } - `lost` means it fell past the paddle.
 */
export function stepBall(ball, bricks, paddle, dt) {
  const hit = { brick: null, paddle: false, wall: false, lost: false };

  const pos = ball.position;
  const vel = ball.velocity;
  const r = BALL.r;
  const maxMove = Math.max(Math.abs(vel.x) * dt, Math.abs(vel.z) * dt);
  const steps = Math.max(1, Math.ceil(maxMove / (r * 0.5)));
  const inv = dt / steps;

  for (let s = 0; s < steps; s++) {
    pos.x += vel.x * inv;
    pos.z += vel.z * inv;

    // side walls
    if (pos.x < -halfW + r) {
      pos.x = -halfW + r;
      vel.x = Math.abs(vel.x);
      hit.wall = true;
    } else if (pos.x > halfW - r) {
      pos.x = halfW - r;
      vel.x = -Math.abs(vel.x);
      hit.wall = true;
    }

    // top (far) wall
    if (pos.z < -halfD + r) {
      pos.z = -halfD + r;
      vel.z = Math.abs(vel.z);
      hit.wall = true;
    }

    // bricks
    for (const b of bricks) {
      if (!b.alive) continue;
      const dx = pos.x - b.center.x;
      const dz = pos.z - b.center.z;
      if (Math.abs(dx) > b.half.x + r || Math.abs(dz) > b.half.z + r) continue;

      hit.brick = b;
      if (Math.abs(dx) > Math.abs(dz) * (b.half.x / b.half.z)) {
        // bounced off a left/right face
        vel.x = dx > 0 ? Math.abs(vel.x) : -Math.abs(vel.x);
        pos.x = b.center.x + (dx > 0 ? b.half.x + r : -b.half.x - r);
      } else {
        // bounced off the front/back face
        vel.z = dz > 0 ? Math.abs(vel.z) : -Math.abs(vel.z);
        pos.z = b.center.z + (dz > 0 ? b.half.z + r : -b.half.z - r);
      }
      break;
    }

    // paddle: the bounce angle depends on where the ball hits it
    if (vel.z > 0 && pos.z >= paddle.position.z - PADDLE.d / 2 - r && pos.z <= paddle.position.z + PADDLE.d / 2) {
      const dx = pos.x - paddle.position.x;
      if (Math.abs(dx) <= PADDLE.w / 2 + r) {
        hit.paddle = true;
        const off = THREE.MathUtils.clamp(dx / (PADDLE.w / 2), -1, 1);   // hit offset -> bounce angle
        const speed = clampSpeed(Math.hypot(vel.x, vel.z));
        const angle = off * 0.8;
        vel.x = Math.sin(angle) * speed;
        vel.z = -Math.cos(angle) * speed;
        pos.z = paddle.position.z - PADDLE.d / 2 - r;
        break;
      }
    }

    // past the paddle: a lost ball
    if (pos.z > halfD) {
      hit.lost = true;
      break;
    }
  }

  // never let the ball travel almost parallel to the paddle line
  const speed = clampSpeed(Math.hypot(vel.x, vel.z));
  if (Math.abs(vel.z) < speed * 0.3) {
    const sign = vel.z > 0 ? 1 : -1;
    vel.z = sign * speed * 0.3;
    const rest = Math.sqrt(Math.max(0, speed * speed - vel.z * vel.z));
    vel.x = (vel.x < 0 ? -1 : 1) * Math.min(Math.abs(vel.x), rest);
  }

  return hit;
}

function clampSpeed(s) {
  return Math.min(BALL.maxBounce, Math.max(BALL.speed, s));
}
