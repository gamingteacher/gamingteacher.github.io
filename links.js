document.addEventListener('DOMContentLoaded', () => {
  loadLinks();
});

async function loadLinks() {
  try {
    const res = await fetch('links.md', { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao carregar links.md');
    const text = await res.text();
    const items = parseLinksMarkdown(text);
    renderLinks(items);
  } catch (err) {
    console.error(err);
    const grid = document.getElementById('link-grid');
    if (grid) grid.innerHTML = '<p class="text-red">Erro ao carregar links.</p>';
  }
}

function parseLinksMarkdown(text) {
  const blocks = text.trim().split(/\r?\n\s*\r?\n+/); // split by blank lines
  const items = [];
  for (const block of blocks) {
    const entry = {};
    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([a-zA-Z]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].trim();
      entry[key] = value;
    }
    if (entry.title || entry.link) items.push(entry);
  }
  return items;
}

function renderLinks(items) {
  const grid = document.getElementById('link-grid');
  if (!grid) return;
  grid.innerHTML = '';

  items.forEach((it) => {
    const card = document.createElement('div');
    card.className = 'bg-grey/5 p-6 rounded-lg shadow-md border border-grey/10 hover:border-red transition-colors';

    const h3 = document.createElement('h3');
    h3.className = 'text-xl font-bold mb-2 text-red flex items-center gap-2';
    h3.textContent = it.title || 'Recurso';

    const p = document.createElement('p');
    p.className = 'text-sm mb-4';
    p.textContent = it.description || '';

    const a = document.createElement('a');
    a.href = it.link || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'inline-flex items-center gap-2 text-green hover:underline';

    // favicon
    const fav = document.createElement('img');
    fav.width = 16; fav.height = 16;
    fav.className = 'w-4 h-4 rounded-sm';
    const { faviconUrl, domain } = faviconFromUrl(it.link || '');
    fav.src = faviconUrl;
    fav.alt = domain ? `Favicon ${domain}` : 'Favicon';

    const span = document.createElement('span');
    span.textContent = 'Acessar →';

    a.appendChild(fav);
    a.appendChild(span);

    card.appendChild(h3);
    card.appendChild(p);
    card.appendChild(a);

    grid.appendChild(card);
  });
}

function faviconFromUrl(url) {
  try {
    const u = new URL(url);
    const domain = u.hostname;
    // Google favicon service
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    return { faviconUrl, domain };
  } catch {
    return { faviconUrl: 'https://www.google.com/s2/favicons?domain=example.com&sz=32', domain: '' };
  }
}
