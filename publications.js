/* =============================================
   PUBLICATIONS — Coverflow Edition
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  loadPublications();
});

/* ── UI strings ─────────────────────────────── */
const IS_EN = document.documentElement.lang.toLowerCase().startsWith('en');
const T = IS_EN
  ? { loadError: 'Error loading publications.', prev: 'Previous publication', next: 'Next publication',
      list: '☰ List', closeList: '✕ Close list', untitled: 'Untitled', pub: 'Publication' }
  : { loadError: 'Erro ao carregar publicações.', prev: 'Publicação anterior', next: 'Próxima publicação',
      list: '☰ Lista', closeList: '✕ Fechar lista', untitled: 'Sem título', pub: 'Publicação' };

/* ── State ──────────────────────────────────── */
let PUB_DATA = [];
let activeIdx = 0;
let listOpen = false;

/* ── Bootstrap ──────────────────────────────── */
async function loadPublications() {
  try {
    const res = await fetch('publications.md', { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao carregar publications.md');
    const text = await res.text();
    PUB_DATA = parsePublicationsMarkdown(text);
    buildCoverflowShell();
    renderCoverflow();
    showDetails(activeIdx);
  } catch (err) {
    console.error(err);
    const grid = document.getElementById('pub-grid');
    if (grid) grid.innerHTML = `<p style="color:var(--red)">${T.loadError}</p>`;
  }
}

/* ── Parser (unchanged) ─────────────────────── */
function parsePublicationsMarkdown(text) {
  const blocks = text.trim().split(/\r?\n\s*\r?\n+/);
  const pubs = [];
  let id = 1;
  for (const block of blocks) {
    const entry = {};
    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([a-zA-Z]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2].trim();
      if (/^\(nenhum\)/i.test(value) || /^\(nenhuma\)/i.test(value)) value = '';
      entry[key] = value;
    }
    if (Object.keys(entry).length) {
      entry.id = id++;
      pubs.push({
        id: entry.id,
        coverImage: entry.coverImage || '',
        shortTitle: entry.shortTitle || '',
        authors: entry.authors || '',
        year: entry.year || '',
        fullTitle: entry.fullTitle || '',
        link: entry.link || '',
        reference: entry.reference || '',
      });
    }
  }
  return pubs;
}

/* ── Build static shell once ────────────────── */
function buildCoverflowShell() {
  const grid = document.getElementById('pub-grid');
  if (!grid) return;

  grid.innerHTML = '';
  grid.className = 'cf-root';

  /* ---- Coverflow wrapper ---- */
  const cfWrap = document.createElement('div');
  cfWrap.className = 'cf-wrap';

  /* Arrow left */
  const btnL = document.createElement('button');
  btnL.className = 'cf-arrow cf-arrow--left';
  btnL.id = 'cf-prev';
  btnL.setAttribute('aria-label', T.prev);
  btnL.innerHTML = '&#8249;';
  btnL.addEventListener('click', () => navigate(-1));

  /* Track (the 3-D stage) */
  const track = document.createElement('div');
  track.className = 'cf-track';
  track.id = 'cf-track';

  /* Arrow right */
  const btnR = document.createElement('button');
  btnR.className = 'cf-arrow cf-arrow--right';
  btnR.id = 'cf-next';
  btnR.setAttribute('aria-label', T.next);
  btnR.innerHTML = '&#8250;';
  btnR.addEventListener('click', () => navigate(1));

  cfWrap.appendChild(btnL);
  cfWrap.appendChild(track);
  cfWrap.appendChild(btnR);

  /* ---- Controls row (dots + toggle) ---- */
  const controls = document.createElement('div');
  controls.className = 'cf-controls';

  const dots = document.createElement('div');
  dots.className = 'cf-dots';
  dots.id = 'cf-dots';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'cf-list-toggle';
  toggleBtn.id = 'cf-list-toggle';
  toggleBtn.textContent = T.list;
  toggleBtn.setAttribute('aria-pressed', 'false');
  toggleBtn.addEventListener('click', toggleList);

  controls.appendChild(dots);
  controls.appendChild(toggleBtn);

  /* ---- Scrollable list (hidden by default) ---- */
  const listWrap = document.createElement('div');
  listWrap.className = 'cf-list-wrap';
  listWrap.id = 'cf-list-wrap';
  listWrap.setAttribute('aria-hidden', 'true');

  const listEl = document.createElement('ul');
  listEl.className = 'cf-list';
  listEl.id = 'cf-list';

  PUB_DATA.forEach((pub, i) => {
    const li = document.createElement('li');
    li.className = 'cf-list-item';
    li.setAttribute('tabindex', '0');
    li.dataset.idx = i;

    const spanAuthors = document.createElement('span');
    spanAuthors.className = 'cf-li-authors';
    spanAuthors.textContent = pub.authors || '—';

    const spanTitle = document.createElement('span');
    spanTitle.className = 'cf-li-title';
    spanTitle.textContent = pub.fullTitle || pub.shortTitle || T.untitled;

    const spanYear = document.createElement('span');
    spanYear.className = 'cf-li-year';
    spanYear.textContent = pub.year || '';

    li.appendChild(spanAuthors);
    li.appendChild(spanTitle);
    li.appendChild(spanYear);

    li.addEventListener('click', () => goTo(i));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(i); } });

    listEl.appendChild(li);
  });

  listWrap.appendChild(listEl);

  /* ---- Detail panel placeholder ---- */
  const details = document.getElementById('pub-details');
  if (details) details.className = 'cf-detail-area';

  /* ---- Assemble ---- */
  grid.appendChild(cfWrap);
  grid.appendChild(controls);
  grid.appendChild(listWrap);

  /* ---- Keyboard nav on the whole root ---- */
  grid.setAttribute('tabindex', '-1');
  grid.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
  });

  /* ---- Touch/swipe support ---- */
  let touchStartX = 0;
  cfWrap.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  cfWrap.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) navigate(dx < 0 ? 1 : -1);
  });
}

/* ── Render cards into track ────────────────── */
function renderCoverflow() {
  const track = document.getElementById('cf-track');
  const dots = document.getElementById('cf-dots');
  if (!track || !dots) return;

  track.innerHTML = '';
  dots.innerHTML = '';

  const total = PUB_DATA.length;

  PUB_DATA.forEach((pub, i) => {
    /* ---- Card ---- */
    const card = document.createElement('div');
    card.className = 'cf-card';
    card.dataset.idx = i;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', i === activeIdx ? '0' : '-1');
    card.setAttribute('aria-label', pub.fullTitle || pub.shortTitle || T.pub);

    /* Cover face */
    const face = document.createElement('div');
    face.className = 'cf-card-face';

    if (pub.coverImage) {
      const img = document.createElement('img');
      img.src = pub.coverImage;
      img.alt = pub.shortTitle || pub.fullTitle || 'Capa';
      img.draggable = false;
      face.appendChild(img);
    } else {
      face.classList.add('cf-card-face--text');

      const txt = document.createElement('div');
      txt.className = 'cf-card-text';
      txt.textContent = pub.shortTitle || pub.fullTitle || T.untitled;

      const badge = document.createElement('div');
      badge.className = 'cf-card-badge';
      badge.textContent = [pub.authors, pub.year].filter(Boolean).join(' · ');

      face.appendChild(txt);
      face.appendChild(badge);
    }

    /* Reflection */
    const refl = document.createElement('div');
    refl.className = 'cf-card-refl';

    card.appendChild(face);
    card.appendChild(refl);

    card.addEventListener('click', () => goTo(i));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(i); }
    });

    track.appendChild(card);

    /* ---- Dot ---- */
    const dot = document.createElement('button');
    dot.className = 'cf-dot' + (i === activeIdx ? ' active' : '');
    dot.setAttribute('aria-label', `${T.pub} ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dots.appendChild(dot);
  });

  applyPositions();
}

/* ── Position all cards based on activeIdx ──── */
function applyPositions(scrollList = false) {
  const track = document.getElementById('cf-track');
  const dots = document.getElementById('cf-dots');
  if (!track) return;

  const cards = Array.from(track.querySelectorAll('.cf-card'));
  const dotEls = dots ? Array.from(dots.querySelectorAll('.cf-dot')) : [];
  const listItems = Array.from(document.querySelectorAll('#cf-list .cf-list-item'));

  const SPREAD = 200;   /* px between off-center cards          */
  const ROT_Y = 42;    /* degrees rotation for side cards      */
  const SCALE_C = 1.0;   /* center card scale                    */
  const SCALE_1 = 0.75;  /* ±1 cards                             */
  const SCALE_N = 0.58;  /* further cards                        */
  const BLUR_1 = 0;     /* px blur for ±1                       */
  const BLUR_N = 1;     /* px blur for further                  */

  cards.forEach((card, i) => {
    const offset = i - activeIdx;
    const absOff = Math.abs(offset);
    const sign = Math.sign(offset) || 1;

    let tx, tz, ry, scale, blur, zIdx, opacity;

    if (offset === 0) {
      tx = 0; tz = 0; ry = 0; scale = SCALE_C; blur = 0; zIdx = 10; opacity = 1;
    } else if (absOff === 1) {
      tx = sign * SPREAD; tz = -120; ry = -sign * ROT_Y; scale = SCALE_1; blur = BLUR_1; zIdx = 8; opacity = 0.92;
    } else if (absOff === 2) {
      tx = sign * (SPREAD * 1.7); tz = -220; ry = -sign * (ROT_Y * 1.2); scale = SCALE_N; blur = BLUR_N; zIdx = 6; opacity = 0.7;
    } else {
      tx = sign * (SPREAD * 2.1); tz = -320; ry = -sign * (ROT_Y * 1.4); scale = SCALE_N * 0.85; blur = BLUR_N * 2; zIdx = 4; opacity = 0;
    }

    card.style.transform = `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${scale})`;
    card.style.filter = blur > 0 ? `blur(${blur}px)` : '';
    card.style.zIndex = zIdx;
    card.style.opacity = opacity;
    card.classList.toggle('cf-card--active', offset === 0);
    card.setAttribute('tabindex', offset === 0 ? '0' : '-1');
  });

  dotEls.forEach((d, i) => d.classList.toggle('active', i === activeIdx));

  listItems.forEach((li, i) => {
    li.classList.toggle('cf-list-item--active', i === activeIdx);
    if (scrollList && i === activeIdx) {
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  /* Update arrow disabled state */
  const prevBtn = document.getElementById('cf-prev');
  const nextBtn = document.getElementById('cf-next');
  if (prevBtn) prevBtn.disabled = activeIdx === 0;
  if (nextBtn) nextBtn.disabled = activeIdx === PUB_DATA.length - 1;
}

/* ── Navigation helpers ─────────────────────── */
function navigate(dir) {
  const next = activeIdx + dir;
  if (next < 0 || next >= PUB_DATA.length) return;
  goTo(next);
}

function goTo(idx) {
  if (idx === activeIdx && document.getElementById('cf-track')?.querySelector('.cf-card--active')) {
    return; /* already there */
  }
  activeIdx = idx;
  applyPositions(true);
  showDetails(activeIdx);
}

/* ── Toggle list view ───────────────────────── */
function toggleList() {
  listOpen = !listOpen;
  const wrap = document.getElementById('cf-list-wrap');
  const btn = document.getElementById('cf-list-toggle');
  if (!wrap || !btn) return;

  wrap.classList.toggle('open', listOpen);
  wrap.setAttribute('aria-hidden', String(!listOpen));
  btn.setAttribute('aria-pressed', String(listOpen));
  btn.classList.toggle('active', listOpen);
  btn.textContent = listOpen ? T.closeList : T.list;

  /* Scroll active item into view when opening */
  if (listOpen) {
    const active = wrap.querySelector('.cf-list-item--active');
    if (active) setTimeout(() => active.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  }
}

/* ── Detail panel ───────────────────────────── */
function showDetails(idx) {
  const container = document.getElementById('pub-details');
  if (!container) return;
  const pub = PUB_DATA[idx];
  if (!pub) return;

  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'cf-detail-panel';

  /* Title (possibly linked) */
  const h3 = document.createElement('h3');
  h3.className = 'cf-detail-title';
  if (pub.link) {
    const a = document.createElement('a');
    a.href = pub.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = pub.fullTitle || pub.shortTitle || T.pub;
    h3.appendChild(a);
  } else {
    h3.textContent = pub.fullTitle || pub.shortTitle || T.pub;
  }

  /* Reference */
  const ref = document.createElement('p');
  ref.className = 'cf-detail-ref';
  ref.textContent = pub.reference || '';

  panel.appendChild(h3);
  if (pub.reference) panel.appendChild(ref);
  container.appendChild(panel);
}
