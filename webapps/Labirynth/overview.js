import { generateLevel, renderGrid, getSeed, setSeed, normalizeSeed, isValidSeed, randomSeed } from './maze.js';

const $ = id => document.getElementById(id);

function show(seed) {
  const level = generateLevel(seed);
  setSeed(level.seed);
  $('seed').value = level.seed;
  $('seedLabel').textContent = level.seed;
  $('pathLen').textContent = level.pathLength;
  $('msg').textContent = '';
  renderGrid($('map'), level);
}

function load() {
  const s = normalizeSeed($('seed').value);
  if (!isValidSeed(s)) { $('msg').textContent = 'Seed must be exactly 6 letters or digits.'; return; }
  show(s);
}

$('load').addEventListener('click', load);
$('seed').addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
$('random').addEventListener('click', () => show(randomSeed()));
show(getSeed());
