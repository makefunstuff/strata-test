// Cloth for experiment 3: a Verlet mass-spring grid, torn by stretching and by the cut tool.
//  - position-Verlet integration (stable at large steps),
//  - structural + shear + bend constraints, Gauss-Seidel, stiffness carried by the iteration count,
//  - wind: low-frequency gusts along the wind vector plus aerodynamic normal pressure per particle,
//    which is what makes a flag snap and flutter,
//  - a constraint snaps when it stretches past tearMul; the quads that lost an edge stop being
//    drawn, so the tear grows with a ragged edge for free.
import * as THREE from "three";

const idx = (x, y, cols) => y * cols + x;
const clampi = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Cloth {
  constructor({ w = 7, h = 5, segX = 56, segY = 40, origin = [0, 0, 0], mode = "top" } = {}) {
    this.w = w; this.h = h;
    this.segX = Math.max(4, Math.round(segX));
    this.segY = Math.max(4, Math.round(segY));
    this.cols = this.segX + 1; this.rows = this.segY + 1;
    this.n = this.cols * this.rows;
    this.sx = w / this.segX; this.sy = h / this.segY;
    this.pos = new Float32Array(this.n * 3);
    this.prev = new Float32Array(this.n * 3);
    this.pinned = new Uint8Array(this.n);
    this.pinPos = new Float32Array(this.n * 3);
    this.dead = new Uint8Array(this.n);
    this.grab = -1;
    this.grabTo = new THREE.Vector3();
    this.grabOffset = new THREE.Vector3();
    this.grabK = 0.6;
    this.torn = 0; this.quadsAlive = this.segX * this.segY;

    const [ox, oy, oz] = origin;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const k = idx(x, y, this.cols) * 3;
        this.pos[k] = ox + (x / this.segX) * w - w / 2;
        this.pos[k + 1] = oy + this.h - (y / this.segY) * this.h;
        this.pos[k + 2] = oz;
      }
    }
    this.prev.set(this.pos);

    // constraints, flat [a, b, rest, kind, a, b, rest, kind, …]; kind 0 structural, 1 shear, 2 bend
    this.cons = [];
    this.consAlive = [];
    const add = (a, b, kind) => {
      const rest = Math.hypot(
        this.pos[a * 3] - this.pos[b * 3], this.pos[a * 3 + 1] - this.pos[b * 3 + 1], this.pos[a * 3 + 2] - this.pos[b * 3 + 2]);
      this.cons.push(a, b, rest, kind);
      this.consAlive.push(1);
    };
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = idx(x, y, this.cols);
        if (x + 1 < this.cols) add(i, i + 1, 0);
        if (y + 1 < this.rows) add(i, i + this.cols, 0);
        if (x + 1 < this.cols && y + 1 < this.rows) { add(i, i + this.cols + 1, 1); add(i + 1, i + this.cols, 1); }
        if (x + 2 < this.cols) add(i, i + 2, 2);
        if (y + 2 < this.rows) add(i, i + 2 * this.cols, 2);
      }
    }
    this.consAlive = new Uint8Array(this.consAlive);
    // sustained-overload tearing: a constraint keeps a strain memory, so a transient buckle does not
    // rip the sheet, while a real yank that keeps the weave stretched past its limit tears in a step
    this.strain = new Float32Array(this.consAlive.length);

    // which constraint is each quad edge, so a torn edge retires the quad
    const cols = this.cols;
    this.hEdge = new Int32Array(this.segX * this.rows).fill(-1);
    this.vEdge = new Int32Array(cols * this.segY).fill(-1);
    for (let c = 0; c < this.cons.length; c += 4) {
      if (this.cons[c + 3] !== 0) continue;
      const a = this.cons[c], b = this.cons[c + 1];
      const x = a % cols, y = (a - x) / cols;
      if (b === a + 1) this.hEdge[y * this.segX + x] = c / 4;
      else if (b === a + cols) this.vEdge[y * cols + x] = c / 4;
    }

    this.pin(mode);
    this.buildGeometry();
  }

  buildGeometry() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    const cols = this.cols, rows = this.rows;
    const uvs = new Float32Array(this.n * 2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = idx(x, y, cols);
      uvs[i * 2] = x / this.segX;
      uvs[i * 2 + 1] = 1 - y / this.segY;
    }
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.index = new Uint32Array(this.segX * this.segY * 6);
    this.geometry.setIndex(new THREE.BufferAttribute(this.index, 1));
    this.rebuild();
  }

  pin(mode = this.mode) {
    this.mode = mode;
    this.pinned.fill(0);
    const cols = this.cols, rows = this.rows;
    const set = (x, y) => {
      const i = idx(clampi(x, 0, cols - 1), clampi(y, 0, rows - 1), cols);
      this.pinned[i] = 1;
      this.pinPos.set(this.pos.slice(i * 3, i * 3 + 3), i * 3);
    };
    // a rail-sewn edge is pinned at every particle: pinning every other one loads each edge with a
    // whole column of sheet and the weave stretches until it rips itself off the rail
    if (mode === "top") { for (let x = 0; x < cols; x++) set(x, 0); }
    else if (mode === "corners") { set(0, 0); set(cols - 1, 0); }
    else if (mode === "flag") { for (let y = 0; y < rows; y++) set(0, y); }
    else if (mode === "center") { set(cols >> 1, 0); }
    else if (mode === "banner") {
      for (let x = 0; x < cols; x += 4) set(x, 0);
      set(cols - 1, 0);
      for (let y = 0; y < rows; y += 8) { set(0, y); set(cols - 1, y); }
    }
  }

  /** the cut tool: kill the particles in a disc and every constraint touching them */
  cut(p, r = 0.28) {
    let cut = 0;
    const r2 = r * r;
    for (let i = 0; i < this.n; i++) {
      if (this.dead[i]) continue;
      const dx = this.pos[i * 3] - p.x, dy = this.pos[i * 3 + 1] - p.y, dz = this.pos[i * 3 + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      this.pinned[i] = 0;
      this.dead[i] = 1;
      cut++;
    }
    if (!cut) return 0;
    const C = this.cons;
    for (let c = 0; c < C.length; c += 4) {
      if (!this.consAlive[c / 4]) continue;
      if (this.dead[C[c]] || this.dead[C[c + 1]]) { this.consAlive[c / 4] = 0; }
    }
    this.rebuild();
    return cut;
  }

  /** one fixed Verlet step; the grab spring is applied after the constraint pass */
  step(dt, { gravity = -13, wind = 5, windDir = [0.2, 0.08, 1], gust = 0, damping = 0.985, iterations = 4, tearMul = 2.4, tearEnergy = 0.9, time = 0, flutter = 1 } = {}) {
    const dt2 = dt * dt;
    const { pos, prev, n, pinned, dead } = this;
    const cols = this.cols, rows = this.rows;
    const [wx, wy, wz] = windDir;
    const wl = Math.hypot(wx, wy, wz) || 1;
    const nx = wx / wl, ny = wy / wl, nz = wz / wl;
    const wmag = wind * (1 + gust * 1.8);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = idx(x, y, cols);
        if (pinned[i] || dead[i]) continue;
        const k = i * 3;
        const px = pos[k], py = pos[k + 1], pz = pos[k + 2];
        const vx = (px - prev[k]) * damping;
        const vy = (py - prev[k + 1]) * damping;
        const vz = (pz - prev[k + 2]) * damping;

        // aerodynamics: gusts along the wind, plus pressure along the local surface normal,
        // which is what makes a flag snap and ripple instead of blowing flat
        const iL = idx(clampi(x - 1, 0, cols - 1), y, cols) * 3;
        const iR = idx(clampi(x + 1, 0, cols - 1), y, cols) * 3;
        const iU = idx(x, clampi(y - 1, 0, rows - 1), cols) * 3;
        const iD = idx(x, clampi(y + 1, 0, rows - 1), cols) * 3;
        const tx = pos[iR] - pos[iL], ty = pos[iR + 1] - pos[iL + 1], tz = pos[iR + 2] - pos[iL + 2];
        const bx = pos[iD] - pos[iU], by = pos[iD + 1] - pos[iU + 1], bz = pos[iD + 2] - pos[iU + 2];
        let Nx = ty * bz - tz * by, Ny = tz * bx - tx * bz, Nz = tx * by - ty * bx;
        const nl = Math.hypot(Nx, Ny, Nz) || 1;
        Nx /= nl; Ny /= nl; Nz /= nl;
        const s = Math.sin(px * 0.8 + time * 1.9) * Math.cos(py * 1.1 - time * 1.3) + 0.5 * Math.sin(pz * 1.5 + time * 2.6);
        const g = wmag * (0.5 + 0.5 * s);
        const press = (Nx * nx + Ny * ny + Nz * nz) * wmag * 0.62 * flutter;
        const ax = nx * g + Nx * press;
        const ay = ny * g + gravity + Ny * press;
        const az = nz * g + Nz * press;

        prev[k] = px; prev[k + 1] = py; prev[k + 2] = pz;
        pos[k] = px + vx + ax * dt2;
        pos[k + 1] = py + vy + ay * dt2;
        pos[k + 2] = pz + vz + az * dt2;
      }
    }

    const C = this.cons, alive = this.consAlive;
    const lim = tearMul, energy = tearEnergy;
    let tore = 0;
    for (let it = 0; it < iterations; it++) {
      const check = it === iterations - 1;   // after the solve: the stretch the weave really carries
      for (let c = 0; c < C.length; c += 4) {
        const ci = c >> 2;
        if (!alive[ci]) continue;
        const a = C[c] * 3, b = C[c + 1] * 3, rest = C[c + 2], kind = C[c + 3];
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-7) continue;
        if (check && kind !== 2 && !(pinned[a] || pinned[b])) {
          const excess = d / rest - lim;
          this.strain[ci] = excess > 0 ? this.strain[ci] * 0.86 + excess : this.strain[ci] * 0.8;
          if (this.strain[ci] > energy) { alive[ci] = 0; tore++; continue; }
        } else if (check) this.strain[ci] *= 0.8;
        const stiff = kind === 2 ? 0.55 : 1;
        const diff = ((d - rest) / d) * 0.5 * stiff;
        const ox = dx * diff, oy = dy * diff, oz = dz * diff;
        const wa = pinned[a] || dead[a] ? 0 : 1, wb = pinned[b] || dead[b] ? 0 : 1;
        if (wa && wb) {
          pos[a] += ox; pos[a + 1] += oy; pos[a + 2] += oz;
          pos[b] -= ox; pos[b + 1] -= oy; pos[b + 2] -= oz;
        } else if (wa) { pos[a] += ox * 2; pos[a + 1] += oy * 2; pos[a + 2] += oz * 2; }
        else if (wb) { pos[b] -= ox * 2; pos[b + 1] -= oy * 2; pos[b + 2] -= oz * 2; }
      }
    }
    for (let i = 0; i < n; i++) {
      if (!pinned[i]) continue;
      const k = i * 3;
      pos[k] = this.pinPos[k]; pos[k + 1] = this.pinPos[k + 1]; pos[k + 2] = this.pinPos[k + 2];
    }
    if (this.grab >= 0 && !dead[this.grab]) {
      const k = this.grab * 3;
      pos[k] += (this.grabTo.x - pos[k]) * this.grabK;
      pos[k + 1] += (this.grabTo.y - pos[k + 1]) * this.grabK;
      pos[k + 2] += (this.grabTo.z - pos[k + 2]) * this.grabK;
    }
    if (tore) this.rebuild();
    return tore;
  }

  /** pack the quads that still have all four edges into the index buffer */
  rebuild() {
    const { segX, segY, cols, cons, consAlive, hEdge, vEdge, index } = this;
    let w = 0, aliveQuads = 0;
    for (let y = 0; y < segY; y++) {
      for (let x = 0; x < segX; x++) {
        const a = idx(x, y, cols), b = a + 1, c = a + cols, d = a + cols + 1;
        const he0 = hEdge[y * segX + x], he1 = hEdge[(y + 1) * segX + x];
        const ve0 = vEdge[y * cols + x], ve1 = vEdge[y * cols + x + 1];
        const ok = (he0 >= 0 && consAlive[he0]) && (he1 >= 0 && consAlive[he1]) &&
          (ve0 >= 0 && consAlive[ve0]) && (ve1 >= 0 && consAlive[ve1]) &&
          !this.dead[a] && !this.dead[b] && !this.dead[c] && !this.dead[d];
        if (!ok) continue;
        index[w++] = a; index[w++] = c; index[w++] = b;
        index[w++] = b; index[w++] = c; index[w++] = d;
        aliveQuads++;
      }
    }
    for (let i = w; i < index.length; i++) index[i] = 0;
    this.geometry.index.needsUpdate = true;
    this.geometry.setDrawRange(0, w);
    let torn = 0;
    for (let i = 0; i < consAlive.length; i++) if (!consAlive[i]) torn++;
    this.torn = torn;
    this.quadsAlive = aliveQuads;
  }

  syncGeometry() {
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    if (this.geometry.attributes.normal) this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  grabAt(point, radius = 0.7) {
    let best = -1, bd = radius * radius;
    for (let i = 0; i < this.n; i++) {
      if (this.dead[i]) continue;
      const dx = this.pos[i * 3] - point.x, dy = this.pos[i * 3 + 1] - point.y, dz = this.pos[i * 3 + 2] - point.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    this.grab = best;
    this.grabTo.copy(point);
    this.grabOffset = best >= 0 ? new THREE.Vector3(this.pos[best * 3], this.pos[best * 3 + 1], this.pos[best * 3 + 2]).sub(point) : new THREE.Vector3();
    return best;
  }
  moveGrabTo(point) { if (this.grab >= 0) this.grabTo.copy(point).add(this.grabOffset); }
  release() { this.grab = -1; }
  get grabbed() { return this.grab; }
  get particles() { return this.n; }
  get constraints() { return this.cons.length / 4; }
  get aliveParticles() { let c = 0; for (let i = 0; i < this.n; i++) if (!this.dead[i]) c++; return c; }
}
