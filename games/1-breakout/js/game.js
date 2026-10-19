import * as THREE from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FIELD, PADDLE, BALL, PLANE_Y, CAMERA, LIGHT, POINTS_PER_BRICK } from "./config.js";
import { buildWorld } from "./entities.js";
import { stepBall } from "./collision.js";
import { createInput } from "./input.js";
import { ui } from "./ui.js";

const STATE = { START: "start", PLAY: "play", LOST_BALL: "lost", OVER: "over", WIN: "win" };
const paddleHalf = PADDLE.w / 2;
const maxOffset = FIELD.width / 2 - paddleHalf;

export function createGame(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);
  scene.fog = new THREE.Fog(0x0b0e14, 24, 46);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(...CAMERA.position);
  camera.lookAt(...CAMERA.lookAt);

  // one directional light + ambient
  const key = new THREE.DirectionalLight(0xf2f6ff, LIGHT.intensity);
  key.position.set(...LIGHT.position);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0008;
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x8fa3bf, LIGHT.ambient));

  const world = buildWorld(scene);
  world.floor.receiveShadow = true;
  world.backWall.castShadow = true;
  world.leftWall.castShadow = true;
  world.rightWall.castShadow = true;
  world.paddle.castShadow = true;
  world.ball.castShadow = true;
  for (const b of world.bricks) { b.mesh.castShadow = true; }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const input = createInput();
  const clock = new THREE.Clock();
  const ballStart = new THREE.Vector3(0, PLANE_Y, FIELD.depth / 2 - 1.4);
  const camTarget = new THREE.Vector3();

  let state = STATE.START;
  let pending = false;

  function onAction() {
    if (state === STATE.START || state === STATE.OVER || state === STATE.WIN) {
      reset();
      state = STATE.PLAY;
      setMessage("Break them all", "Space restarts");
    } else if (state === STATE.LOST_BALL) {
      serve();
    }
  }

  canvas.addEventListener("pointerdown", () => { pending = true; });

  function reset() {
    ui.score = 0;
    ui.lives = 3;
    for (const b of world.bricks) {
      b.alive = true;
      b.mesh.visible = true;
      b.outline.visible = true;
    }
    ui.bricksLeft = world.bricks.length;
    ui.sync();
    serve();
  }

  function serve() {
    world.ball.position.copy(ballStart);
    const dir = new THREE.Vector3(THREE.MathUtils.randFloat(-0.45, 0.45), 0, -1).normalize().multiplyScalar(BALL.speed);
    world.ball.velocity = dir;
    state = STATE.PLAY;
    setMessage("Break them all", "Arrow keys / A-D move the paddle");
  }

  function setMessage(text, hint) {
    ui.message = text;
    ui.hint = hint;
    ui.set("message", text);
    ui.set("hint", hint);
  }

  function loseBall() {
    ui.loseLife();
    if (ui.lives <= 0) {
      state = STATE.OVER;
      setMessage("Game over", "Space to restart");
    } else {
      state = STATE.LOST_BALL;
      setMessage(`Ball lost — ${ui.lives} lives left`, "Space to serve");
    }
    world.ball.velocity.set(0, 0, 0);
    // let the ball rest on the floor where it fell
    world.ball.position.y = PLANE_Y;
  }

  function hitBrick(brick) {
    brick.alive = false;
    brick.mesh.visible = false;
    brick.outline.visible = false;
    ui.bricksLeft -= 1;
    ui.set("bricks", ui.bricksLeft);
    ui.addScore(POINTS_PER_BRICK);
    flash();
    if (ui.bricksLeft <= 0) {
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
    world.paddle.position.x = THREE.MathUtils.clamp(target, -maxOffset, maxOffset);
  }

  function followCamera(dt) {
    const z = THREE.MathUtils.clamp(world.ball.position.z, -FIELD.depth / 2, FIELD.depth / 2);
    const focus = new THREE.Vector3(0, 0.4, z * 0.6 - 1);
    camTarget.lerp(focus, Math.min(1, dt * 2.5));
    camera.position.set(world.ball.position.x * 0.25, 14, FIELD.depth / 2 + 1);
    camera.lookAt(camTarget);
  }

  function step() {
    const dt = Math.min(0.033, clock.getDelta());
    if (pending) { pending = false; onAction(); }
    if (input.consumeAction()) onAction();

    if (state === STATE.PLAY) {
      movePaddle(dt);
      const hit = stepBall(world.ball, world.bricks, world.paddle, dt);
      if (hit.brick) hitBrick(hit.brick);
      if (hit.brick || hit.paddle || hit.wall) flash();
      if (hit.lost) loseBall();
    } else if (state === STATE.LOST_BALL) {
      movePaddle(dt);
    }

    updateTrail(dt);
    followCamera(dt);

    if (flashAmount > 0) {
      flashAmount = Math.max(0, flashAmount - dt * 2.5);
      flashMat.emissiveIntensity = 1 + flashAmount * 6;
    }
  }

  const trail = [];
  function updateTrail(dt) {
    if (trail.length === 0) for (const d of world.dots) trail.push(world.ball.position.clone());
    for (let i = trail.length - 1; i > 0; i--) trail[i].copy(trail[i - 1]);
    trail[0].copy(world.ball.position);
    for (let i = 0; i < world.dots.length; i++) {
      const p = trail[i];
      world.dots[i].position.set(p.x, Math.max(0.05, p.y), p.z);
      world.dots[i].visible = state === STATE.PLAY;
    }
  }

  function render() {
    composer.render();
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloom.setSize(window.innerWidth, window.innerHeight);
  });

  setMessage("3D Breakout", "Space to start");
  ui.bricksLeft = world.bricks.length;
  ui.sync();

  return { step, render, get state() { return state; } };
}
