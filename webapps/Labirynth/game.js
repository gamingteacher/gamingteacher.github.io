import { generateLevel, getSeed, setSeed, normalizeSeed, isValidSeed, randomSeed } from './maze.js';
import { Raycaster } from './raycaster.js';

const $ = id => document.getElementById(id);
const SCORE_KEY = 'gt_scores';
const MAX_HEALTH = 100;
const TRAP_DAMAGE = 25;

let level, rc, state, input = { forward: 0, turn: 0 };
const held = new Set();
const queue = []; // taps made while a move is animating
const enqueue = (axis, v) => { if (queue.length < 2) queue.push([axis, v]); };
const same = (a, b) => a.x === b.x && a.y === b.y;
const at = (list, c) => list.findIndex(i => same(i, c));

function newGame(seed) {
  level = generateLevel(seed);
  setSeed(level.seed);
  $('seed').value = level.seed;
  const url = new URL(location.href);
  url.searchParams.set('seed', level.seed);
  history.replaceState(null, '', url);
  queue.length = 0;
  state = {
    keys: [...level.keys], treasures: [...level.treasures], traps: [...level.traps],
    keyCount: 0, treasureCount: 0, health: MAX_HEALTH, started: null, finished: false, elapsed: 0,
  };
  if (rc) rc.setLevel(level); else rc = new Raycaster($('view'), level);
  updateHud();
  $('winModal').classList.remove('open');
}

function updateHud() {
  $('keys').textContent = state.keyCount;
  $('healthFill').style.width = state.health + '%';
  $('healthText').textContent = state.health;
  $('treasures').textContent = state.treasureCount;
  $('treasuresTotal').textContent = level.treasures.length;
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1500);
}

// Timer starts on the first button press / key
function startTimer() {
  if (!state.started && !state.finished) state.started = performance.now();
}
const currentTime = () => state.finished ? state.elapsed
  : state.started ? (performance.now() - state.started) / 1000 : 0;

function action() {
  startTimer();
  if (state.finished) return;
  const c = rc.cell;
  const ki = at(state.keys, c);
  const ti = at(state.treasures, c);
  if (ki >= 0) { state.keys.splice(ki, 1); state.keyCount++; toast('Key collected'); }
  else if (ti >= 0) {
    if (state.keyCount > 0) { state.keyCount--; state.treasures.splice(ti, 1); state.treasureCount++; toast('Treasure collected (key used)'); }
    else toast('You need a key to open this treasure');
  }
  else {
    const f = rc.facingCell();
    const tr = f ? at(state.traps, f) : -1;
    if (tr >= 0) { state.traps.splice(tr, 1); toast('Trap disabled'); }
    else toast('Nothing to do here');
  }
  updateHud();
}

function checkCell() {
  const c = rc.cell;
  const tr = at(state.traps, c);
  if (tr >= 0) {
    state.traps.splice(tr, 1);
    state.health = Math.max(0, state.health - TRAP_DAMAGE);
    updateHud();
    if (state.health === 0) {
      state.health = MAX_HEALTH;
      rc.setLevel(level);
      updateHud();
      toast('Out of health! Back to the start');
    } else toast(`Trap! -${TRAP_DAMAGE} health`);
  }
  if (!state.finished && same(c, level.exit)) win();
}

// ---- scoreboard ----
function loadScores() {
  try { return JSON.parse(localStorage.getItem(SCORE_KEY)) || []; } catch { return []; }
}
const fmt = t => t.toFixed(2) + 's';

function fillScores(tbody, mineId) {
  const top = loadScores().sort((a, b) => a.time - b.time).slice(0, 5);
  tbody.innerHTML = '';
  if (!top.length) { tbody.innerHTML = '<tr><td colspan="3">No runs yet</td></tr>'; return; }
  top.forEach((s, i) => {
    const tr = document.createElement('tr');
    if (s.id === mineId) tr.className = 'mine';
    tr.innerHTML = `<td>${i + 1}</td><td>${s.seed}</td><td>${fmt(s.time)}</td>`;
    tbody.appendChild(tr);
  });
}

function win() {
  state.elapsed = currentTime();
  state.finished = true;
  const run = { id: Date.now() + '-' + Math.random().toString(36).slice(2), seed: level.seed, time: state.elapsed, date: new Date().toISOString() };
  const all = loadScores(); all.push(run);
  all.sort((a, b) => a.time - b.time);
  localStorage.setItem(SCORE_KEY, JSON.stringify(all.slice(0, 50)));
  // current run is always shown above the board, even if it is not in the fastest 5
  $('winTime').textContent = fmt(run.time);
  fillScores($('winScores'), run.id);
  $('winModal').classList.add('open');
}

// ---- input ----
const KEYMAP = {
  w: ['forward', 1], arrowup: ['forward', 1], s: ['forward', -1], arrowdown: ['forward', -1],
  a: ['turn', -1], arrowleft: ['turn', -1], d: ['turn', 1], arrowright: ['turn', 1],
};
const DIRMAP = { up: ['forward', 1], down: ['forward', -1], left: ['turn', -1], right: ['turn', 1] };

const isTyping = () => document.activeElement === $('seed');

window.addEventListener('keydown', e => {
  if (isTyping()) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'enter' || k === 'f') {
    e.preventDefault();
    if (!e.repeat) { flash($('action')); action(); }
    return;
  }
  if (KEYMAP[k]) {
    e.preventDefault();
    startTimer();
    if (!e.repeat) enqueue(...KEYMAP[k]);
    held.add(k);
    recompute2();
  }
});
window.addEventListener('keyup', e => { held.delete(e.key.toLowerCase()); recompute2(); });

const pad = new Set();
const DIR_BTN = {};
document.querySelectorAll('.dpad button').forEach(b => { DIR_BTN[b.dataset.dir] = b; });
const KEY_DIR = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
const flash = (el, ms = 150) => { el.classList.add('active'); setTimeout(() => el.classList.remove('active'), ms); };
function syncPad() {
  const on = new Set([...pad, ...[...held].map(k => KEY_DIR[k])]);
  for (const [d, b] of Object.entries(DIR_BTN)) b.classList.toggle('active', on.has(d));
}

function recompute2() {
  syncPad();
  input = { forward: 0, turn: 0 };
  for (const k of held) if (KEYMAP[k]) input[KEYMAP[k][0]] += KEYMAP[k][1];
  for (const d of pad) input[DIRMAP[d][0]] += DIRMAP[d][1];
}
document.querySelectorAll('.dpad button').forEach(b => {
  const d = b.dataset.dir;
  const down = e => { e.preventDefault(); startTimer(); enqueue(...DIRMAP[d]); pad.add(d); recompute2(); };
  const up = () => { pad.delete(d); recompute2(); };
  b.addEventListener('pointerdown', down);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, up));
});
$('action').addEventListener('click', action);

// ---- UI wiring ----
function loadSeed() {
  const s = normalizeSeed($('seed').value);
  if (!isValidSeed(s)) { toast('Seed must be 6 letters/digits'); return; }
  $('seed').blur();
  newGame(s);
}
$('load').addEventListener('click', loadSeed);
$('seed').addEventListener('keydown', e => { if (e.key === 'Enter') loadSeed(); });
$('openScores').addEventListener('click', () => { fillScores($('scores'), null); $('scoreModal').classList.add('open'); });
$('closeScores').addEventListener('click', () => $('scoreModal').classList.remove('open'));
$('again').addEventListener('click', () => newGame(level.seed));
$('newSeed').addEventListener('click', () => newGame(randomSeed()));

// ---- main loop ----
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.finished) {
    if (rc.update(dt)) checkCell();
    // one square or one 90° turn per step; holding a key repeats
    if (!rc.busy && !state.finished) {
      const next = queue.shift();
      if (next) { if (next[0] === 'turn') rc.turn(next[1]); else rc.move(next[1]); }
      else if (input.turn) rc.turn(Math.sign(input.turn));
      else if (input.forward) rc.move(Math.sign(input.forward));
    }
  }
  rc.render([
    ...state.treasures.map(t => ({ ...t, type: 'treasure' })),
    { ...level.exit, type: 'exit' },
  ]);
  $('timer').textContent = Math.floor(currentTime());
  requestAnimationFrame(frame);
}

newGame(getSeed());
requestAnimationFrame(frame);
