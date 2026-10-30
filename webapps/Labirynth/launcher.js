import { getSeed, setSeed, normalizeSeed, isValidSeed, randomSeed } from './maze.js';

const $ = id => document.getElementById(id);
const seedInput = $('seed');
const msg = $('msg');
const DEFAULT_MSG = msg.textContent;

seedInput.value = getSeed();

function current() {
  const s = normalizeSeed(seedInput.value);
  if (!isValidSeed(s)) {
    msg.textContent = 'Seed must be exactly 6 letters or digits.';
    msg.style.color = 'var(--red)';
    return null;
  }
  msg.textContent = DEFAULT_MSG;
  msg.style.color = '';
  setSeed(s);
  return s;
}

for (const id of ['mapLink', 'gameLink']) {
  $(id).addEventListener('click', e => {
    const s = current();
    if (!s) { e.preventDefault(); seedInput.focus(); return; }
    e.currentTarget.href = e.currentTarget.getAttribute('href').split('?')[0] + '?seed=' + s;
  });
}
seedInput.addEventListener('input', () => { seedInput.value = normalizeSeed(seedInput.value); });
$('random').addEventListener('click', () => { seedInput.value = randomSeed(); current(); });
