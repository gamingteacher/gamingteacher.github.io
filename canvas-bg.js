/**
 * canvas-bg.js — 1-bit "flyover" background
 * Slightly isometric top-down view of background.png. Every black pixel is
 * drawn as a small raised block (light gray, with side faces and a soft drop
 * shadow) standing on a #f2f2f2 floor. The camera drifts, rotates and zooms
 * slowly over the mirror-tiled artwork.
 *
 * Speed can be changed at runtime:  setFlyoverSpeed(0.5)  // 0 = paused, 1 = default
 */
(function () {
  const scriptSrc = document.currentScript && document.currentScript.src;
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  /* ── Tunables ───────────────────────────────── */
  const BG        = '#f2f2f2';            // floor colour
  const TOP_COL   = '#dedede';            // top face of a block (light gray)
  const SIDE_COL  = '#cccccc';            // darkest part of the side faces
  const SHADOW    = 'rgba(0,0,0,0.10)';   // drop shadow
  const ZOOM      = 16;                   // screen px per texel (bigger = closer)
  const TILT      = 0.40;                 // vertical squash: 1 = top-down, lower = more isometric
  const HEIGHT    = 0.55;                 // block height in texels (screen px = HEIGHT * zoom)
  const LAYERS    = 3;                    // slices used to build the extruded sides
  const GAP       = 0.06;                 // gap between neighbouring blocks (texels)
  const SHADOW_BLUR = 0.25;               // shadow blur radius (texels)
  const SHADOW_DX = 0.2, SHADOW_DY = 0.2; // shadow offset (texels)
  let   speed     = 0.2;                    // animation speed multiplier

  window.setFlyoverSpeed = function (v) { speed = Math.max(0, Number(v) || 0); };

  let tex = null, TW = 0, TH = 0;         // 1-bit mask of the artwork
  let W = 0, H = 0, dpr = 1;
  let raf = 0, last = 0, t = 0;

  /* ── Load image and convert to 1-bit mask ───── */
  const img = new Image();
  img.onload = function () {
    TW = img.naturalWidth; TH = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = TW; c.height = TH;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, TW, TH).data;
    tex = new Uint8Array(TW * TH);
    for (let i = 0; i < tex.length; i++) {
      const lum = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
      tex[i] = px[i * 4 + 3] > 127 && lum < 128 ? 1 : 0;
    }
    start();
  };
  img.src = scriptSrc ? new URL('background.png', scriptSrc).href : 'background.png';

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  /* Mirror-wrap an integer into [0, n) for seamless tiling */
  function mirror(v, n) {
    const p = ((v % (2 * n)) + 2 * n) % (2 * n);
    return p < n ? p : 2 * n - 1 - p;
  }

  function mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = s => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  const LAYER_COLS = [];
  for (let i = 0; i <= LAYERS; i++) LAYER_COLS.push(mix(SIDE_COL, TOP_COL, i / LAYERS));

  /* ── Render one frame ───────────────────────── */
  function draw() {
    // Camera: slow drift, gentle rotation sweep and breathing zoom
    const rot  = Math.sin(t * 0.00006) * 0.45 + t * 0.00001;
    const zoom = ZOOM * (1 + 0.12 * Math.sin(t * 0.00009));
    const camX = TW * 0.5 + Math.cos(t * 0.00004) * TW * 0.35 + t * 0.003;
    const camY = TH * 0.5 + Math.sin(t * 0.00005) * TH * 0.35 + t * 0.005;
    const cos = Math.cos(rot), sin = Math.sin(rot);

    // world(texel) -> screen matrix (rotate, scale, squash vertically)
    const a = zoom * cos, b = zoom * TILT * sin;
    const c = -zoom * sin, d = zoom * TILT * cos;
    const e = W / 2 - (a * camX + c * camY);
    const f = H / 2 - (b * camX + d * camY);

    // Visible texel bounds: inverse-map the screen corners (with padding)
    const pad = 3 + HEIGHT * 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const rx = (sx - W / 2) / zoom, ry = (sy - H / 2) / (zoom * TILT);
      const wx = camX + rx * cos + ry * sin;
      const wy = camY - rx * sin + ry * cos;
      x0 = Math.min(x0, wx); x1 = Math.max(x1, wx);
      y0 = Math.min(y0, wy); y1 = Math.max(y1, wy);
    }
    x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad);
    x1 = Math.ceil(x1 + pad);  y1 = Math.ceil(y1 + pad);

    // Collect ink cells once per frame
    const cells = [];
    for (let y = y0; y <= y1; y++) {
      const ty = mirror(y, TH) * TW;
      for (let x = x0; x <= x1; x++) {
        if (tex[ty + mirror(x, TW)]) cells.push(x, y);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const size = 1 - GAP * 2;
    // Fills all cells with the matrix, lifted `lift` screen px, shifted (ox, oy) texels
    function pass(color, lift, ox, oy, blur) {
      ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, e * dpr, (f - lift) * dpr);
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < cells.length; i += 2) {
        ctx.rect(cells[i] + GAP + ox, cells[i + 1] + GAP + oy, size, size);
      }
      ctx.filter = blur ? `blur(${(blur * zoom * dpr).toFixed(1)}px)` : 'none';
      ctx.fill();
      ctx.filter = 'none';
    }

    pass(SHADOW, 0, SHADOW_DX, SHADOW_DY, SHADOW_BLUR);               // drop shadow on the floor
    const hpx = HEIGHT * zoom;
    for (let i = 0; i <= LAYERS; i++) {                     // extruded sides -> top face
      pass(LAYER_COLS[i], hpx * i / LAYERS, 0, 0);
    }
  }

  /* ── Loop ───────────────────────────────────── */
  function frame(now) {
    t += Math.min(now - last, 50) * speed; // clamp so tab switches don't jump
    last = now;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    resize();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { if (tex) resize(); });
  document.addEventListener('visibilitychange', () => {
    if (!tex) return;
    cancelAnimationFrame(raf);
    if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
})();
