// Renderer, lighting, post stack, camera fit and the effects wiring. Gameplay lives in
// collision.js; this file is the part that decides how the game looks.
import * as THREE from "three";
import { FIELD, BRICK, PADDLE, BALL, PLANE_Y, CAMERA, LIGHT, COLORS, POINTS_PER_BRICK } from "./config.js";
import { buildWorld } from "./entities.js";
import { glowTexture, skyTexture } from "../../shared/textures.js";
import { stepBall } from "./collision.js";
import { createInput } from "./input.js";
import { createSparks, createShatter, createRings, createImpactLight } from "../../shared/effects.js";
import { crtKey } from "../../shared/crt.js";
import { createPost, setupEnvironment } from "../../shared/post.js";
import { createAudio, audioKey } from "../../shared/audio.js";
import { ui } from "./ui.js";

const STATE = { START: "start", PLAY: "play", LOST_BALL: "lost", OVER: "over", WIN: "win" };
const paddleHalf = PADDLE.w / 2;
const maxOffset = FIELD.width / 2 - paddleHalf;

export function createGame(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = skyTexture("#16273f", "#04060b");
  scene.fog = new THREE.Fog(COLORS.fog, 26, 54);

  // image-based lighting: gives the metal and chrome something to reflect
  setupEnvironment(renderer, scene, { intensity: LIGHT.env });

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 140);

  const key = new THREE.DirectionalLight(0xf2f6ff, LIGHT.intensity);
  key.position.set(...LIGHT.position);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -14;
  key.shadow.camera.far = 44;
  key.shadow.bias = -0.0009;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(LIGHT.rimColor, LIGHT.rimIntensity);
  rim.position.set(...LIGHT.rim);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x91a8c8, 0x0a0f18, LIGHT.ambient));

  // the ball carries a small light so the neon follows it
  const ballLight = new THREE.PointLight(COLORS.ball, 6, 6, 2);
  scene.add(ballLight);

  const world = buildWorld(scene);
  world.floor.receiveShadow = true;
  for (const b of world.bricks) b.mesh.castShadow = true;

  const glow = glowTexture();
  const sparks = createSparks(scene, { texture: glow, count: 700 });
  const shards = createShatter(scene, {
    count: 240,
    geometry: new THREE.BoxGeometry(BRICK.w * 0.34, BRICK.h * 0.8, BRICK.d * 0.34),
  });
  const rings = createRings(scene, { slots: 10 });
  const impact = createImpactLight(scene, { distance: 8 });

  // Render → Bloom → CRT (barrel inflate, scanlines, phosphor mask, tube edge) → Output
  const post = createPost(renderer, scene, camera, {
    exposure: 0.98,
    bloom: { strength: 0.5, radius: 0.45, threshold: 0.92, scale: 0.5 },
    crt: { look: "arcade" },
  });
  const audio = createAudio({ master: 0.3, delayMix: 0.16 });
  const sfx = audio.sfx;
  let musicOn = false;
  const MUSIC = {
    bpm: 138,
    bass: [0, null, 0, null, 0, null, 12, null, 7, null, 0, null, 3, null, 5, null],
    lead: [12, null, null, 15, null, null, 19, null, 24, null, 19, null, 15, null, 12, null],
  };
  function musicStart() {
    if (musicOn) return;
    musicOn = true;
    audio.startMusic(MUSIC);
  }
  window.addEventListener("keydown", (e) => {
    if (crtKey(e.code, post.crt)) { sfx.select(); e.preventDefault(); return; }
    if (audioKey(e.code, audio)) e.preventDefault();
  });

  const input = createInput();
  const clock = new THREE.Clock();
  const ballStart = new THREE.Vector3(0, PLANE_Y, FIELD.depth / 2 - 1.4);

  // ---- camera: fixed pitch, distance fitted so the whole field fits the viewport
  const camDir = new THREE.Vector3(0, Math.sin(CAMERA.pitch), Math.cos(CAMERA.pitch)).normalize();
  const camTarget = new THREE.Vector3(...CAMERA.target);
  const corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 1.4]) {
    corners.push(new THREE.Vector3(sx * (FIELD.width / 2 + 0.5), y, sz * (FIELD.depth / 2 + 0.5)));
  }
  let camDist = 26;
  function fitCamera() {
    const v = new THREE.Vector3();
    for (let iter = 0; iter < 10; iter++) {
      camera.position.copy(camTarget).addScaledVector(camDir, camDist);
      camera.lookAt(camTarget);
      camera.updateMatrixWorld(true);
      let need = 0;
      for (const c of corners) {
        v.copy(c).project(camera);
        need = Math.max(need, Math.abs(v.x), Math.abs(v.y) * 1.05);
      }
      const want = need * CAMERA.margin;
      if (Math.abs(want - 1) < 0.004) break;
      camDist *= want;
    }
  }

  let shake = 0;
  let state = STATE.START;
  let pending = false;

  function onAction() {
    if (state === STATE.START || state === STATE.OVER || state === STATE.WIN) {
      reset();
      state = STATE.PLAY;
      setMessage("", "Move with the arrows");
      sfx.start();
      musicStart();
    } else if (state === STATE.LOST_BALL) {
      serve();
      sfx.coin();
    }
  }

  canvas.addEventListener("pointerdown", () => { pending = true; });

  function reset() {
    ui.score = 0;
    ui.lives = 3;
    for (const b of world.bricks) {
      b.alive = true;
      b.mesh.visible = true;
      b.cap.visible = true;
    }
    for (const e of [sparks, shards, rings, impact]) e.clear();
    ui.bricksLeft = world.bricks.length;
    ui.sync();
    serve();
  }

  function serve() {
    world.ball.position.copy(ballStart);
    world.ball.velocity = new THREE.Vector3(THREE.MathUtils.randFloat(-0.45, 0.45), 0, -1)
      .normalize().multiplyScalar(BALL.speed);
    state = STATE.PLAY;
  }

  function setMessage(text, hint) {
    ui.message = text;
    ui.hint = hint;
    ui.set("message", text);
    ui.set("hint", hint);
  }

  function loseBall() {
    ui.loseLife();
    sfx.die();
    const p = world.ball.position;
    sparks.spawn(new THREE.Vector3(p.x, 0.1, FIELD.depth / 2 - 0.2),
      { n: 34, speed: 5, size: 0.55, life: 0.7, color: COLORS.fail, up: 0.9 });
    rings.burst(new THREE.Vector3(p.x, 0.05, FIELD.depth / 2 - 0.3), { color: COLORS.fail, from: 0.6, to: 5, dur: 0.6 });
    impact.flash(new THREE.Vector3(p.x, 0.1, FIELD.depth / 2 - 0.3), { color: COLORS.fail, power: 30 });
    shake = 0.5;
    if (ui.lives <= 0) {
      sfx.gameOver();
      audio.stopMusic();
      musicOn = false;
      state = STATE.OVER;
      setMessage("Game over", "Space to restart");
    } else {
      state = STATE.LOST_BALL;
      setMessage(`Ball lost — ${ui.lives} lives left`, "Space to serve");
    }
    world.ball.velocity.set(0, 0, 0);
    world.ball.position.y = PLANE_Y;
  }

  function hitBrick(brick) {
    brick.alive = false;
    brick.mesh.visible = false;
    brick.cap.visible = false;
    ui.bricksLeft -= 1;
    ui.set("bricks", ui.bricksLeft);
    ui.addScore(POINTS_PER_BRICK);
    sfx.brick(ui.score);
    const color = COLORS.brick[brick.row];
    const p = brick.center;
    shards.burst(p, { n: 12, color, speed: 4.2, scale: 1 });
    sparks.spawn(p, { n: 22, speed: 4.4, size: 0.42, life: 0.45, color, up: 0.8 });
    rings.burst(new THREE.Vector3(p.x, 0.04, p.z), { color, from: 0.4, to: 2.6, dur: 0.4 });
    impact.flash(p, { color, power: 22, dur: 0.3 });
    flash();
    shake = Math.max(shake, 0.12);
    if (ui.bricksLeft <= 0) {
      sfx.win();
      audio.stopMusic();
      musicOn = false;
      state = STATE.WIN;
      setMessage(`You win — score ${ui.score}`, "Space to play again");
    }
  }

  // short emissive flash on the ball when something is hit
  const flashMat = world.ball.material;
  let flashAmount = 0;
  function flash() { flashAmount = 0.7; }

  function movePaddle(dt) {
    const axis = input.axis();
    const target = world.paddle.position.x + axis * 9 * dt;
    const nx = THREE.MathUtils.clamp(target, -maxOffset, maxOffset);
    const lean = THREE.MathUtils.clamp((nx - world.paddle.position.x) * 0.5, -0.16, 0.16);
    world.paddle.position.x = nx;
    world.paddle.rotation.z = THREE.MathUtils.lerp(world.paddle.rotation.z, -lean, Math.min(1, dt * 12));
  }

  const focus = new THREE.Vector3();
  const shakeVec = new THREE.Vector3();
  function updateCamera(dt, elapsed) {
    const ball = world.ball;
    focus.set(ball.position.x * 0.16, 0.25, THREE.MathUtils.clamp(ball.position.z * 0.35, -3.5, 3.5) - 1.4);
    camTarget.lerp(focus, Math.min(1, dt * 2.2));
    camera.position.copy(camTarget).addScaledVector(camDir, camDist);
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 1.6);
      const a = shake * shake * 0.9;
      shakeVec.set(Math.sin(elapsed * 61) * a, Math.sin(elapsed * 47) * a * 0.6, Math.cos(elapsed * 53) * a);
      camera.position.add(shakeVec);
    }
    camera.lookAt(camTarget);
  }

  const trail = [];
  function updateTrail(dt, elapsed) {
    if (trail.length === 0) for (const d of world.dots) trail.push(world.ball.position.clone());
    for (let i = trail.length - 1; i > 0; i--) trail[i].copy(trail[i - 1]);
    trail[0].copy(world.ball.position);
    const playing = state === STATE.PLAY;
    for (let i = 0; i < world.dots.length; i++) {
      const d = world.dots[i];
      const p = trail[i];
      d.position.set(p.x, Math.max(0.05, p.y), p.z);
      d.quaternion.copy(camera.quaternion);
      const s = d.userData.size * (playing ? d.userData.base : 0);
      d.scale.setScalar(s);
      d.material.opacity = playing ? 0.42 * d.userData.base : 0;
    }
    world.halo.quaternion.copy(camera.quaternion);
    world.halo.position.copy(world.ball.position);
    world.halo.material.opacity = 0.25 + (playing ? 0.2 + 0.08 * Math.sin(elapsed * 6) : 0);
    ballLight.position.copy(world.ball.position);
    ballLight.intensity = playing ? 5 + flashAmount * 22 : 1.5;
  }

  function step() {
    const dt = Math.min(0.033, clock.getDelta());
    const elapsed = clock.elapsedTime;
    if (pending) { pending = false; onAction(); }
    if (input.consumeAction()) onAction();

    if (state === STATE.PLAY) {
      movePaddle(dt);
      const hit = stepBall(world.ball, world.bricks, world.paddle, dt);
      if (hit.brick) hitBrick(hit.brick);
      if (hit.paddle) {
        const p = world.ball.position;
        sparks.spawn(new THREE.Vector3(p.x, 0.12, world.paddle.position.z - PADDLE.d / 2),
          { n: 14, speed: 3.2, size: 0.34, life: 0.35, color: COLORS.paddle, up: 0.7 });
        rings.burst(new THREE.Vector3(p.x, 0.04, world.paddle.position.z - PADDLE.d / 2),
          { color: COLORS.paddle, from: 0.3, to: 1.9, dur: 0.35 });
        impact.flash(new THREE.Vector3(p.x, 0.1, p.z), { color: COLORS.paddle, power: 18, dur: 0.25 });
        sfx.bounce(world.ball.velocity.length() / BALL.speed);
      }
      if (hit.wall) {
        const p = world.ball.position;
        sparks.spawn(p, { n: 8, speed: 2.4, size: 0.28, life: 0.25, color: COLORS.trim, up: 0.6 });
        sfx.wall(0.6);
      }
      if (hit.brick || hit.paddle || hit.wall) flash();
      if (hit.lost) loseBall();
    } else if (state === STATE.LOST_BALL) {
      movePaddle(dt);
    }

    sparks.update(dt);
    shards.update(dt);
    rings.update(dt);
    impact.update(dt);
    updateTrail(dt, elapsed);
    updateCamera(dt, elapsed);

    if (flashAmount > 0) {
      flashAmount = Math.max(0, flashAmount - dt * 2.5);
      flashMat.emissive.setHex(0xffffff).multiplyScalar(flashAmount);
      flashMat.emissiveIntensity = 1 + flashAmount * 4;
    }
    post.update(elapsed);
    world.paddleEdge.material.color.setHex(flashAmount > 0.2 ? 0xffffff : COLORS.paddle);
  }

  function render() {
    post.render();
  }

  function resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
    fitCamera();
  }
  window.addEventListener("resize", resize);

  setMessage("3D Breakout", "Space to start \u00b7 C toggles the CRT");
  ui.bricksLeft = world.bricks.length;
  ui.sync();
  resize();

  return { step, render, get state() { return state; } };
}
