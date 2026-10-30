// Deterministic labyrinth generation from a 6-character seed.
export const SIZE = 21; // odd: walls on even indices, cells on odd indices
export const TRAPS = 4;
export const PAIRS = 3; // keys == treasures
export const SEED_KEY = 'gt_seed';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function normalizeSeed(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
export function isValidSeed(s) { return /^[A-Z0-9]{6}$/.test(s); }
export function randomSeed() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

// Shared seed between pages: ?seed= wins, then localStorage, then a random one.
export function getSeed() {
  const q = normalizeSeed(new URLSearchParams(location.search).get('seed'));
  if (isValidSeed(q)) { localStorage.setItem(SEED_KEY, q); return q; }
  const stored = normalizeSeed(localStorage.getItem(SEED_KEY));
  if (isValidSeed(stored)) return stored;
  const r = randomSeed();
  localStorage.setItem(SEED_KEY, r);
  return r;
}
export function setSeed(s) { localStorage.setItem(SEED_KEY, s); }

// xmur3 string hash -> 32-bit seed, mulberry32 PRNG
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
export function makeRng(seedStr) {
  let a = hashSeed(seedStr);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function bfs(grid, start) {
  const dist = grid.map(r => r.map(() => -1));
  dist[start.y][start.x] = 0;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const { x, y } = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (grid[ny][nx] === 0 && dist[ny][nx] < 0) {
        dist[ny][nx] = dist[y][x] + 1;
        q.push({ x: nx, y: ny });
      }
    }
  }
  return dist;
}

// 1 = wall, 0 = path
export function generateLevel(seedStr) {
  const seed = normalizeSeed(seedStr);
  if (!isValidSeed(seed)) throw new Error('Seed must be 6 letters/digits');
  const rng = makeRng(seed);
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(1));

  // Iterative DFS (recursive backtracker)
  const start = { x: 1, y: 1 };
  grid[1][1] = 0;
  const stack = [start];
  while (stack.length) {
    const { x, y } = stack[stack.length - 1];
    const options = shuffle([[2, 0], [-2, 0], [0, 2], [0, -2]], rng)
      .filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx > 0 && ny > 0 && nx < SIZE - 1 && ny < SIZE - 1 && grid[ny][nx] === 1;
      });
    if (!options.length) { stack.pop(); continue; }
    const [dx, dy] = options[0];
    grid[y + dy / 2][x + dx / 2] = 0;
    grid[y + dy][x + dx] = 0;
    stack.push({ x: x + dx, y: y + dy });
  }

  // Rooms (2x2 or 3x3 cells with a central pillar) carved by an independent PRNG,
  // so the main seed stream above is untouched. Only removes walls: connectivity is preserved.
  const rrng = makeRng(seed + ':rooms');
  const rooms = [];
  const cellsAcross = (SIZE - 1) / 2;
  for (let i = 0; i < 10 && rooms.length < 2; i++) {
    const n = rrng() < 0.65 ? 2 : 3;
    const span = 2 * n - 1;
    const x0 = 1 + 2 * Math.floor(rrng() * (cellsAcross - n + 1));
    const y0 = 1 + 2 * Math.floor(rrng() * (cellsAcross - n + 1));
    const x1 = x0 + span - 1, y1 = y0 + span - 1;
    const blocked = (x0 < 4 && y0 < 4) ||
      rooms.some(r => x0 <= r.x1 + 2 && x1 >= r.x0 - 2 && y0 <= r.y1 + 2 && y1 >= r.y0 - 2);
    if (blocked) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = 0;
    if (n === 3) grid[y0 + 2][x0 + 2] = 1;
    rooms.push({ x0, y0, x1, y1 });
  }

  // Exit: the farthest reachable cell from spawn, so it is always reachable and isolated from spawn.
  const dist = bfs(grid, start);
  let exit = start, best = 0;
  const free = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (grid[y][x] !== 0) continue;
    if (dist[y][x] > best) { best = dist[y][x]; exit = { x, y }; }
    free.push({ x, y });
  }

  // Remaining entities go on distinct cells that are not spawn/exit.
  const pool = shuffle(free.filter(c =>
    !(c.x === start.x && c.y === start.y) && !(c.x === exit.x && c.y === exit.y) &&
    dist[c.y][c.x] > 3), rng);
  const take = n => pool.splice(0, n);
  const keys = take(PAIRS);
  const treasures = take(PAIRS);
  const traps = take(TRAPS);

  return { seed, size: SIZE, grid, start: { ...start }, exit, keys, treasures, traps, rooms, pathLength: best };
}

// 2D rendering into a container
export function renderGrid(container, level) {
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${level.size}, 1fr)`;
  const marks = new Map();
  const mark = (list, type) => list.forEach(c => marks.set(c.x + ',' + c.y, type));
  mark(level.keys, 'key'); mark(level.treasures, 'treasure'); mark(level.traps, 'trap');
  marks.set(level.exit.x + ',' + level.exit.y, 'exit');
  marks.set(level.start.x + ',' + level.start.y, 'spawn');
  const frag = document.createDocumentFragment();
  for (let y = 0; y < level.size; y++) for (let x = 0; x < level.size; x++) {
    const d = document.createElement('div');
    d.className = 'cell' + (level.grid[y][x] ? ' wall' : '');
    const m = marks.get(x + ',' + y);
    if (m) d.dataset.e = m;
    frag.appendChild(d);
  }
  container.appendChild(frag);
}
