document.addEventListener('DOMContentLoaded', () => {
  loadPublications();
});

async function loadPublications() {
  try {
    const res = await fetch('publications.md', { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao carregar publications.md');
    const text = await res.text();
    const pubs = parsePublicationsMarkdown(text);
    renderPublications(pubs);
  } catch (err) {
    console.error(err);
    const grid = document.getElementById('pub-grid');
    if (grid) {
      grid.innerHTML = '<p class="text-red">Erro ao carregar publicações.</p>';
    }
  }
}

function parsePublicationsMarkdown(text) {
  const blocks = text.trim().split(/\r?\n\s*\r?\n+/); // split by blank lines
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
        reference: entry.reference || ''
      });
    }
  }
  return pubs;
}

function renderPublications(pubs) {
  const grid = document.getElementById('pub-grid');
  const details = document.getElementById('pub-details');
  if (!grid || !details) return;

  grid.innerHTML = '';
  details.innerHTML = '';

  pubs.forEach((pub) => {
    const card = document.createElement('div');
    card.className = 'publication-card cursor-pointer bg-white/80 border border-white rounded-lg p-4 transition-all hover:border-red focus:outline-none focus:ring-2 focus:ring-red/50';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const cover = document.createElement('div');
    cover.className = 'aspect-[2/3] mb-2 flex items-center justify-center bg-white rounded shadow-xl overflow-hidden';

    if (pub.coverImage) {
      const img = document.createElement('img');
      img.src = pub.coverImage;
      img.alt = pub.shortTitle || pub.fullTitle || 'Capa';
      img.className = 'w-full h-full object-cover';
      cover.appendChild(img);
    } else if (pub.shortTitle) {
      const p = document.createElement('p');
      p.className = 'text-center text-grey font-bold text-sm px-2';
      p.textContent = pub.shortTitle;
      cover.appendChild(p);
    } else {
      const p = document.createElement('p');
      p.className = 'text-center text-grey/70 text-sm';
      p.textContent = 'Sem capa';
      cover.appendChild(p);
    }

    const meta = document.createElement('p');
    meta.className = 'text-xs text-right text-grey font-bold';
    meta.textContent = [pub.authors, pub.year].filter(Boolean).join(', ');

    card.appendChild(cover);
    card.appendChild(meta);

    const open = () => showDetails(pub, details);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });

    grid.appendChild(card);
  });
}

function showDetails(pub, container) {
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'mt-6 p-6 bg-white border-l-4 border-red rounded-lg shadow-lg animate-fadeIn relative';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'absolute right-4 top-3 text-red hover:text-grey';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => container.innerHTML = '');

  const h3 = document.createElement('h3');
  h3.className = 'text-xl font-bold mb-2 underline';

  if (pub.link) {
    const a = document.createElement('a');
    a.href = pub.link;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = pub.fullTitle || pub.shortTitle || 'Publicação';
    h3.appendChild(a);
  } else {
    h3.textContent = pub.fullTitle || pub.shortTitle || 'Publicação';
  }

  const ref = document.createElement('p');
  ref.className = 'text-sm';
  ref.textContent = pub.reference || '';

  panel.appendChild(closeBtn);
  panel.appendChild(h3);
  panel.appendChild(ref);
  container.appendChild(panel);

  // scroll into view smoothly
  setTimeout(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
}
