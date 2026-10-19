import * as THREE from "three";
import { FIELD, ROWS, COLS, BRICK, PADDLE, BALL, PLANE_Y, COLORS } from "./config.js";

export function buildWorld(scene) {
  const halfW = FIELD.width / 2;
  const halfD = FIELD.depth / 2;
  const t = FIELD.wall;
  const wallMat = new THREE.MeshStandardMaterial({
    color: COLORS.wall,
    roughness: 0.7,
    metalness: 0.15,
  });

  const addBox = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };

  const floor = addBox(FIELD.width, t, FIELD.depth, 0, -t / 2, 0, new THREE.MeshStandardMaterial({
    color: COLORS.floor,
    roughness: 0.85,
  }));

  const backWall = addBox(FIELD.width + 2 * t, 3, t, 0, 1.5, -halfD - t / 2, wallMat);
  const leftWall = addBox(t, 3, FIELD.depth + t, -halfW - t / 2, 1.5, 0, wallMat);
  const rightWall = addBox(t, 3, FIELD.depth + t, halfW + t / 2, 1.5, 0, wallMat);

  const grid = new THREE.Group();
  scene.add(grid);
  const bricks = [];
  const brickMats = COLORS.brick.map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.25 })
  );

  const startX = -((COLS - 1) * (BRICK.w + BRICK.gap)) / 2;
  const startZ = -halfD + 1.6;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(BRICK.w, BRICK.h, BRICK.d), brickMats[r]);
      mesh.position.set(startX + c * (BRICK.w + BRICK.gap), BRICK.h / 2, startZ + r * (BRICK.d + BRICK.gap));
      mesh.userData.outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 0.6 })
      );
      mesh.userData.outline.position.copy(mesh.position);
      grid.add(mesh, mesh.userData.outline);
      bricks.push({
        mesh,
        outline: mesh.userData.outline,
        row: r,
        alive: true,
        center: mesh.position.clone(),
        half: new THREE.Vector3(BRICK.w / 2, BRICK.h / 2, BRICK.d / 2),
      });
    }
  }

  const paddleMat = new THREE.MeshStandardMaterial({
    color: COLORS.paddle,
    roughness: 0.3,
    metalness: 0.4,
    emissive: 0x0f3f3a,
  });
  const paddle = new THREE.Mesh(new THREE.BoxGeometry(PADDLE.w, PADDLE.h, PADDLE.d), paddleMat);
  paddle.position.set(0, PADDLE.h / 2, halfD - 0.8);
  scene.add(paddle);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.r, 24, 16),
    new THREE.MeshStandardMaterial({
      color: COLORS.ball,
      roughness: 0.25,
      metalness: 0.3,
      emissive: 0x1a2430,
    })
  );
  ball.position.set(0, PLANE_Y, halfD - 1.4);
  ball.velocity = new THREE.Vector3(0, 0, 0);
  scene.add(ball);

  const trail = new THREE.Group();
  scene.add(trail);
  const dots = [];
  for (let i = 0; i < 14; i++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: COLORS.ball, transparent: true, opacity: 1 - i / 14 })
    );
    trail.add(dot);
    dots.push(dot);
  }

  return { floor, backWall, leftWall, rightWall, grid, bricks, paddle, ball, dots, bricksLeft: bricks.length };
}
