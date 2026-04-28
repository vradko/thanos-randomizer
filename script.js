/* ====================================================================
   The Snap — Randomizer
   ==================================================================== */

const $ = (id) => document.getElementById(id);

const nameInput   = $('name-input');
const addBtn      = $('add-btn');
const clearAllBtn = $('clear-all-btn');
const namesGrid   = $('names-grid');
const snapBtn     = $('snap-btn');
const countLabel  = $('count');
const gifOverlay  = $('gif-overlay');
const snapGif     = $('snap-gif');
const flashLayer  = $('flash-overlay');
const winnerFrame = $('winner-image-frame');
const canvas      = $('particle-canvas');
const ctx         = canvas.getContext('2d', { alpha: true });

const STORAGE_KEY = 'thesnap.textarea';

/* ───────── Canvas sizing ───────── */
const DPR = Math.min(window.devicePixelRatio || 1, 2);
function resizeCanvas() {
  canvas.width  = window.innerWidth * DPR;
  canvas.height = window.innerHeight * DPR;
  canvas.style.width  = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

/* ───────── Names model ───────── */
let names = [];
let snapping = false;

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function render() {
  namesGrid.innerHTML = '';
  names.forEach((name, i) => {
    const chip = document.createElement('div');
    chip.className = 'name-chip';
    chip.dataset.index = i;
    chip.innerHTML =
      `<span class="label">${escapeHTML(name)}</span>` +
      `<span class="remove" data-i="${i}" title="Remove">×</span>`;
    namesGrid.appendChild(chip);
  });
  countLabel.textContent = names.length;
  snapBtn.disabled = names.length < 2 || snapping;
}

/* ───────── Textarea persistence ───────── */
function loadStoredText() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; }
  catch (_) { return ''; }
}
function saveStoredText(text) {
  try { localStorage.setItem(STORAGE_KEY, text); } catch (_) {}
}

nameInput.value = loadStoredText();
nameInput.addEventListener('input', () => saveStoredText(nameInput.value));

/* ───────── Add / Clear ───────── */
function parseTextarea() {
  return nameInput.value
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function addToRoster() {
  const parsed = parseTextarea();
  if (parsed.length === 0) {
    nameInput.focus();
    return;
  }
  // Replace the roster with whatever is in the textarea (deduped, preserves order).
  const seen = new Set();
  names = [];
  for (const n of parsed) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(n);
    if (names.length >= 60) break; // sanity cap
  }
  render();
}

function clearAll() {
  names = [];
  nameInput.value = '';
  saveStoredText('');
  render();
}

addBtn.addEventListener('click', addToRoster);
clearAllBtn.addEventListener('click', clearAll);

/* ───────── Removing a single chip ───────── */
namesGrid.addEventListener('click', e => {
  if (snapping) return;
  if (e.target.classList.contains('remove')) {
    const i = parseInt(e.target.dataset.i, 10);
    const removed = names.splice(i, 1)[0];

    // Also remove the matching line from the textarea so persistence stays in sync.
    const lines = nameInput.value.split(/\n/);
    const matchIdx = lines.findIndex(l => l.trim() === removed);
    if (matchIdx >= 0) {
      lines.splice(matchIdx, 1);
      nameInput.value = lines.join('\n');
      saveStoredText(nameInput.value);
    }
    render();
  }
});

/* ───────── The Snap orchestration ───────── */
snapBtn.addEventListener('click', startSnap);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startSnap() {
  if (names.length < 2 || snapping) return;
  snapping = true;
  snapBtn.disabled = true;

  const survivorIdx = Math.floor(Math.random() * names.length);

  // Open GIF overlay (force reset playback)
  gifOverlay.classList.remove('hidden');
  const src = snapGif.getAttribute('src');
  snapGif.setAttribute('src', '');
  void snapGif.offsetWidth;
  snapGif.setAttribute('src', src);

  // Subtle page shake midway
  setTimeout(() => document.body.classList.add('snapping'), 600);

  // GIF length is ~1.45s. Fire flash near the snap moment.
  await sleep(1250);
  triggerFlash();

  // Let the flash bloom, then close the GIF
  await sleep(220);
  gifOverlay.classList.add('hidden');

  // ── End of first GIF cycle ──
  // Within a 1.5s window, schedule each non-survivor's disintegration.
  const chips = [...namesGrid.querySelectorAll('.name-chip')];
  const survivorChip = chips[survivorIdx];

  chips.forEach((chip, i) => {
    if (i === survivorIdx) return;
    const startDelay = Math.random() * 1500;
    setTimeout(() => disintegrate(chip), startDelay);
  });

  // Wait for disintegration window + tail
  await sleep(1500 + 600);
  document.body.classList.remove('snapping');

  // Fade out the editing UI so the survivor stands alone on the cosmos.
  document.body.classList.add('snapped');

  // Survivor: glide up-of-centre, scale up
  flyToCenter(survivorChip);

  // After the glide settles, reveal the aftermath image and enable click-to-reset
  await sleep(1750);
  winnerFrame.classList.remove('hidden');
  void winnerFrame.offsetWidth;
  winnerFrame.classList.add('show');
  survivorChip.classList.add('clickable');

  // Click-to-restore: clicking the survivor or the image returns to the previous state
  const restore = () => {
    survivorChip.removeEventListener('click', restore);
    winnerFrame.removeEventListener('click', restore);
    resetAll();
  };
  survivorChip.addEventListener('click', restore);
  winnerFrame.addEventListener('click', restore);
}

function resetAll() {
  particles.length = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  winnerFrame.classList.remove('show');
  setTimeout(() => winnerFrame.classList.add('hidden'), 700);
  document.body.classList.remove('snapping', 'snapped');
  snapping = false;
  render();
}

/* ───────── Green flash ───────── */
function triggerFlash() {
  flashLayer.classList.remove('hidden', 'go');
  void flashLayer.offsetWidth;
  flashLayer.classList.add('go');
  setTimeout(() => {
    flashLayer.classList.remove('go');
    flashLayer.classList.add('hidden');
  }, 900);
}

/* ───────── Disintegration (canvas particles) ───────── */
const particles = [];
let rafRunning = false;
let lastT = 0;

function disintegrate(chip) {
  if (!chip || chip.dataset.dissolved) return;
  chip.dataset.dissolved = '1';

  const rect = chip.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);
  if (w === 0 || h === 0) return;

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const o = off.getContext('2d');

  // Chip background gradient
  const bg = o.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0,   'rgba(80, 28, 130, 0.55)');
  bg.addColorStop(0.5, 'rgba(35, 14, 65, 0.65)');
  bg.addColorStop(1,   'rgba(150, 30, 60, 0.55)');
  o.fillStyle = bg;
  roundRect(o, 0, 0, w, h, 8);
  o.fill();

  // Faint gold border
  o.strokeStyle = 'rgba(212, 175, 55, 0.65)';
  o.lineWidth = 1.5;
  roundRect(o, 0.75, 0.75, w - 1.5, h - 1.5, 8);
  o.stroke();

  // Text
  const labelEl = chip.querySelector('.label');
  const text = labelEl ? labelEl.textContent : '';
  const cs = getComputedStyle(labelEl || chip);
  const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  o.font = font;
  o.fillStyle = '#fffbe6';
  o.textAlign = 'center';
  o.textBaseline = 'middle';
  o.shadowColor = 'rgba(255, 215, 0, 0.6)';
  o.shadowBlur = 6;
  o.fillText(text, w / 2, h / 2 + 1);
  o.shadowBlur = 0;

  // Sample pixels and spawn particles
  const data = o.getImageData(0, 0, w, h).data;
  const step = w > 220 ? 4 : 3;
  const baseX = rect.left;
  const baseY = rect.top;

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const idx = (y * w + x) * 4;
      const a = data[idx + 3];
      if (a < 25) continue;

      // Sweep release: right-side particles release later, like the Marvel snap.
      const releaseDelay = (x / w) * 800 + Math.random() * 250;

      particles.push({
        x: baseX + x,
        y: baseY + y,
        vx: (Math.random() - 0.3) * 1.0,
        vy: -0.25 - Math.random() * 0.6,
        ax: 0.005 + Math.random() * 0.008,
        ay: -0.012 - Math.random() * 0.015,
        size: step + (Math.random() < 0.25 ? 1 : 0),
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        life: 1,
        decay: 0.006 + Math.random() * 0.012,
        delay: releaseDelay
      });
    }
  }

  chip.classList.add('dissolving');

  if (!rafRunning) {
    rafRunning = true;
    lastT = performance.now();
    requestAnimationFrame(loop);
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y,     x + w, y + h, r);
  c.arcTo(x + w, y + h, x,     y + h, r);
  c.arcTo(x,     y + h, x,     y,     r);
  c.arcTo(x,     y,     x + w, y,     r);
  c.closePath();
}

function loop(t) {
  const dt = Math.min(40, t - lastT);
  lastT = t;

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.globalCompositeOperation = 'lighter';

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    if (p.delay > 0) {
      p.delay -= dt;
      continue;
    }

    p.vx += p.ax;
    p.vy += p.ay;
    p.x  += p.vx;
    p.y  += p.vy;
    p.life -= p.decay;

    if (p.life <= 0 || p.y < -20) {
      particles.splice(i, 1);
      continue;
    }

    const r = Math.min(255, p.r * 0.6 + 180 * 0.4);
    const g = Math.min(255, p.g * 0.6 + 150 * 0.4);
    const b = Math.min(255, p.b * 0.6 + 90  * 0.4);
    const alpha = Math.min(1, p.life * 1.1);
    ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},${alpha})`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalCompositeOperation = 'source-over';

  if (particles.length > 0) {
    requestAnimationFrame(loop);
  } else {
    setTimeout(() => ctx.clearRect(0, 0, canvas.width, canvas.height), 400);
    rafRunning = false;
  }
}

/* ───────── Survivor — fly to upper centre, scale up ───────── */
function flyToCenter(chip) {
  if (!chip) return;
  const rect = chip.getBoundingClientRect();
  const startX = rect.left + rect.width / 2;
  const startY = rect.top  + rect.height / 2;
  const targetX = window.innerWidth / 2;
  const targetY = window.innerHeight * 0.28; // sit above centre to leave room for the image

  chip.classList.add('flying', 'survivor');
  chip.style.left = `${startX}px`;
  chip.style.top  = `${startY}px`;
  chip.style.transform = 'translate(-50%, -50%) scale(1)';
  void chip.offsetWidth;

  const targetScale = computeSurvivorScale(rect);
  chip.style.left = `${targetX}px`;
  chip.style.top  = `${targetY}px`;
  chip.style.transform = `translate(-50%, -50%) scale(${targetScale})`;
  chip.style.fontSize = '1.2rem';
  chip.style.padding = '1.1rem 2rem';
}

function computeSurvivorScale(rect) {
  // Smaller target so the aftermath image fits comfortably below.
  const targetW = window.innerWidth * 0.45;
  const targetH = window.innerHeight * 0.16;
  const scaleW = targetW / rect.width;
  const scaleH = targetH / rect.height;
  return Math.max(1.7, Math.min(scaleW, scaleH, 4.0));
}

/* ───────── Initial render ───────── */
render();
