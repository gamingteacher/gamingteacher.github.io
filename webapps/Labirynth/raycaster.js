// Wolfenstein-style raycaster. Walls are drawn via DDA; only sprites passed in are drawn
// (the game passes treasure + exit, so keys and traps stay invisible).
const FOV = Math.PI / 3;
const MOVE_TIME = 0.28; // seconds per square
const TURN_TIME = 0.22; // seconds per 90° turn
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const TEX = 64;
const MAX_RENDER_W = 640; // internal resolution; the canvas is upscaled with pixelated scaling
const TEXTURE_FILES = { wall: 'textures/BrickWall.png', floor: 'textures/Floor.png', ceiling: 'textures/Ceiling.png' };

function hslToRgb(h, s, l) {
  const k = n => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// Three distinct random hues, different on every level load (not tied to the seed).
function randomPalette() {
  const base = Math.random();
  const hues = [base, (base + 1 / 3 + Math.random() * 0.1) % 1, (base + 2 / 3 - Math.random() * 0.1) % 1]
    .sort(() => Math.random() - 0.5);
  return {
    wall: hslToRgb(hues[0], 0.6, 0.62),
    floor: hslToRgb(hues[1], 0.5, 0.58),
    ceiling: hslToRgb(hues[2], 0.5, 0.58),
  };
}

function loadGreyTextures() {
  return Promise.all(Object.entries(TEXTURE_FILES).map(([key, file]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = TEX;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, TEX, TEX);
      const px = cx.getImageData(0, 0, TEX, TEX).data;
      const grey = new Uint8Array(TEX * TEX);
      for (let i = 0; i < grey.length; i++) grey[i] = px[i * 4]; // greyscale: R == G == B
      resolve([key, grey]);
    };
    img.onerror = () => reject(new Error('Could not load ' + file));
    img.src = new URL(file, import.meta.url).href;
  }))).then(Object.fromEntries);
}

const texturesReady = loadGreyTextures();

export class Raycaster {
  constructor(canvas, level) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.grey = null;
    this.tinted = null;
    this.setLevel(level);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    texturesReady.then(t => { this.grey = t; this.applyPalette(); });
  }

  // Multiplies the greyscale textures by a fresh random color per surface.
  applyPalette() {
    this.palette = randomPalette();
    if (!this.grey) return;
    this.tinted = {};
    for (const key of Object.keys(this.grey)) {
      const g = this.grey[key], [r, gr, b] = this.palette[key];
      const out = new Uint8Array(TEX * TEX * 3);
      for (let i = 0; i < g.length; i++) {
        const v = g[i] / 255;
        out[i * 3] = r * v; out[i * 3 + 1] = gr * v; out[i * 3 + 2] = b * v;
      }
      this.tinted[key] = out;
    }
  }

  setLevel(level) {
    this.level = level;
    this.grid = level.grid;
    this.gx = level.start.x;
    this.gy = level.start.y;
    this.dir = 0; // 0=E 1=S 2=W 3=N
    // face an open direction at spawn
    for (let i = 0; i < 4; i++) {
      if (this.grid[this.gy + DIRS[i][1]][this.gx + DIRS[i][0]] === 0) { this.dir = i; break; }
    }
    this.x = this.gx + 0.5;
    this.y = this.gy + 0.5;
    this.angle = this.dir * Math.PI / 2;
    this.anim = null;
    this.applyPalette();
  }

  get busy() { return !!this.anim; }

  // step: +1 forward, -1 backward. Returns false if blocked by a wall.
  move(step) {
    if (this.anim) return false;
    const [dx, dy] = DIRS[this.dir];
    const nx = this.gx + dx * step, ny = this.gy + dy * step;
    if (this.grid[ny]?.[nx] !== 0) return false;
    this.anim = { type: 'move', t: 0, fx: this.x, fy: this.y, tx: nx + 0.5, ty: ny + 0.5, nx, ny };
    return true;
  }

  // d: +1 right (clockwise), -1 left
  turn(d) {
    if (this.anim) return false;
    this.anim = { type: 'turn', t: 0, from: this.angle, to: this.angle + d * Math.PI / 2 };
    this.dir = (this.dir + d + 4) % 4;
    return true;
  }

  resize() {
    const w = Math.min(MAX_RENDER_W, window.innerWidth);
    this.canvas.width = Math.max(2, Math.round(w / 2) * 2);
    this.canvas.height = Math.max(2, Math.round(w * window.innerHeight / window.innerWidth / 2) * 2);
    this.zbuf = new Float32Array(this.canvas.width);
    this.frame = this.ctx.createImageData(this.canvas.width, this.canvas.height);
  }

  get cell() { return { x: this.gx, y: this.gy }; }

  // Advances the current step/turn animation; returns true when a move just finished.
  update(dt) {
    const a = this.anim;
    if (!a) return false;
    a.t = Math.min(1, a.t + dt / (a.type === 'move' ? MOVE_TIME : TURN_TIME));
    const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
    if (a.type === 'move') {
      this.x = a.fx + (a.tx - a.fx) * e;
      this.y = a.fy + (a.ty - a.fy) * e;
    } else {
      this.angle = a.from + (a.to - a.from) * e;
    }
    if (a.t < 1) return false;
    if (a.type === 'move') { this.gx = a.nx; this.gy = a.ny; this.x = a.tx; this.y = a.ty; }
    else this.angle = this.dir * Math.PI / 2;
    this.anim = null;
    return a.type === 'move';
  }

  facingCell() {
    return { x: this.gx + DIRS[this.dir][0], y: this.gy + DIRS[this.dir][1] };
  }

  render(sprites) {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const data = this.frame.data;
    const tex = this.tinted;
    const planeLen = Math.tan(FOV / 2);
    const dirX = Math.cos(this.angle), dirY = Math.sin(this.angle);
    const plX = -dirY * planeLen, plY = dirX * planeLen;
    const half = H / 2;

    // floor and ceiling, one row at a time
    for (let y = Math.floor(half) + 1; y < H; y++) {
      const rowDist = half / (y - half);
      const shade = Math.max(0.2, 1 - rowDist / 10);
      let fx = this.x + rowDist * (dirX - plX);
      let fy = this.y + rowDist * (dirY - plY);
      const stepX = rowDist * 2 * plX / W, stepY = rowDist * 2 * plY / W;
      const fi = y * W * 4, ci = (H - y - 1) * W * 4;
      for (let x = 0; x < W; x++, fx += stepX, fy += stepY) {
        const tx = (((fx - Math.floor(fx)) * TEX) | 0) & (TEX - 1);
        const ty = (((fy - Math.floor(fy)) * TEX) | 0) & (TEX - 1);
        const ti = (ty * TEX + tx) * 3;
        const o = x * 4;
        if (tex) {
          data[fi + o] = tex.floor[ti] * shade; data[fi + o + 1] = tex.floor[ti + 1] * shade; data[fi + o + 2] = tex.floor[ti + 2] * shade;
          data[ci + o] = tex.ceiling[ti] * shade; data[ci + o + 1] = tex.ceiling[ti + 1] * shade; data[ci + o + 2] = tex.ceiling[ti + 2] * shade;
        } else {
          const v = 70 * shade;
          data[fi + o] = data[fi + o + 1] = data[fi + o + 2] = v;
          data[ci + o] = data[ci + o + 1] = data[ci + o + 2] = v * 0.7;
        }
        data[fi + o + 3] = 255; data[ci + o + 3] = 255;
      }
    }
    // horizon row
    for (let x = 0; x < W; x++) {
      const o = (Math.floor(half) * W + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 20; data[o + 3] = 255;
    }

    // walls
    for (let col = 0; col < W; col++) {
      const camX = 2 * col / W - 1;
      const rdx = dirX + plX * camX, rdy = dirY + plY * camX;
      let mx = Math.floor(this.x), my = Math.floor(this.y);
      const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
      const sx = rdx < 0 ? -1 : 1, sy = rdy < 0 ? -1 : 1;
      let sdx = (rdx < 0 ? this.x - mx : mx + 1 - this.x) * ddx;
      let sdy = (rdy < 0 ? this.y - my : my + 1 - this.y) * ddy;
      let side = 0, hit = false;
      for (let i = 0; i < 64 && !hit; i++) {
        if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
        if (this.grid[my]?.[mx] !== 0) hit = true;
      }
      const dist = Math.max(0.01, side === 0 ? sdx - ddx : sdy - ddy);
      this.zbuf[col] = dist;
      const lineH = H / dist;
      const top = (H - lineH) / 2;
      const wallX = side === 0 ? this.y + dist * rdy : this.x + dist * rdx;
      let tx = Math.floor((wallX - Math.floor(wallX)) * TEX);
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = TEX - 1 - tx;
      const shade = Math.max(0.25, 1 - dist / 12) * (side ? 0.75 : 1);
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(H - 1, Math.floor(top + lineH));
      const texStep = TEX / lineH;
      let texPos = (y0 - top) * texStep;
      for (let y = y0; y <= y1; y++, texPos += texStep) {
        const ty = Math.min(TEX - 1, texPos | 0);
        const o = (y * W + col) * 4;
        if (tex) {
          const ti = (ty * TEX + tx) * 3;
          data[o] = tex.wall[ti] * shade; data[o + 1] = tex.wall[ti + 1] * shade; data[o + 2] = tex.wall[ti + 2] * shade;
        } else {
          data[o] = 217 * shade; data[o + 1] = 76 * shade; data[o + 2] = 80 * shade;
        }
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(this.frame, 0, 0);

    // sprites, far to near
    const inv = 1 / (plX * dirY - dirX * plY);
    const list = sprites.map(s => {
      const dx = s.x + 0.5 - this.x, dy = s.y + 0.5 - this.y;
      return { ...s, dx, dy, d2: dx * dx + dy * dy };
    }).sort((a, b) => b.d2 - a.d2);
    const t = performance.now() / 1000;
    for (const s of list) {
      const tx = inv * (dirY * s.dx - dirX * s.dy);
      const ty = inv * (-plY * s.dx + plX * s.dy);
      if (ty <= 0.1) continue;
      const screenX = (W / 2) * (1 + tx / ty);
      const size = Math.abs(H / ty);
      const bob = s.type === 'treasure' ? Math.sin(t * 3 + s.x) * size * 0.03 : 0;
      const yMid = H / 2 + size * 0.2 + bob;
      const w = size * (s.type === 'exit' ? 0.7 : 0.4);
      const h = size * (s.type === 'exit' ? 0.9 : 0.4);
      const x0 = Math.floor(screenX - w / 2), x1 = Math.floor(screenX + w / 2);
      for (let c = Math.max(0, x0); c < Math.min(W, x1); c++) {
        if (ty >= this.zbuf[c]) continue;
        const u = (c - x0) / w;
        this.drawSpriteColumn(s.type, c, yMid, h, u);
      }
    }
  }

  drawSpriteColumn(type, c, yMid, h, u) {
    const ctx = this.ctx;
    if (type === 'exit') {
      const edge = u < 0.08 || u > 0.92;
      ctx.fillStyle = edge ? '#1d8a3a' : 'rgba(42,189,81,0.85)';
      ctx.fillRect(c, yMid - h / 2, 1, h);
    } else { // treasure: diamond
      const half = (0.5 - Math.abs(u - 0.5)) * h;
      ctx.fillStyle = u < 0.5 ? '#F5C542' : '#d9a62a';
      ctx.fillRect(c, yMid - half, 1, half * 2);
    }
  }
}
