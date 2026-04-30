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
const addOverlay  = $('add-overlay');
const gauntletGif = $('gauntlet-gif');
const flashLayer  = $('flash-overlay');
const winnerFrame = $('winner-image-frame');
const durationSlider = $('duration');
const durationValue  = $('duration-value');
const canvas      = $('particle-canvas');
const ctx         = canvas.getContext('2d', { alpha: true });

const STORAGE_KEY = 'thesnap.textarea';
const DURATION_KEY = 'thesnap.duration';

/* ───────── Duration slider ───────── */
const storedDur = parseFloat(localStorage.getItem(DURATION_KEY));
if (!isNaN(storedDur) && storedDur >= 2 && storedDur <= 14) {
  durationSlider.value = storedDur;
}
function updateDurationLabel() {
  const v = parseFloat(durationSlider.value);
  durationValue.textContent = `${v.toFixed(1)}s`;
}
updateDurationLabel();
durationSlider.addEventListener('input', () => {
  updateDurationLabel();
  try { localStorage.setItem(DURATION_KEY, durationSlider.value); } catch (_) {}
});

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
  const next = [];
  for (const n of parsed) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(n);
    if (next.length >= 60) break; // sanity cap
  }

  // TODO: gauntlet summon animation is temporarily disabled — needs debugging.
  // To re-enable, restore the hasNewArrivals check + summonGauntlet() branch.
  names = next;
  render();
}

function clearAll() {
  // Clear only the active roster — leave the textarea (and its persisted copy) intact.
  names = [];
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

  const windowMs = parseFloat(durationSlider.value) * 1000;
  chips.forEach((chip, i) => {
    if (i === survivorIdx) return;
    const startDelay = Math.random() * windowMs;
    setTimeout(() => disintegrate(chip), startDelay);
  });

  // Wait for the full disintegration window + particle tail
  await sleep(windowMs + 800);
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

/* ───────── Gauntlet summoning (on add) ───────── */
// thanos-last-stone.gif is ~5040ms long. We want the dramatic build-up to play out
// across most of its runtime, with lightning sustained throughout, and the roster
// appearing on the climactic beat near the end.
const SUMMON_TOTAL_MS    = 4800;
const SUMMON_PEAK_MS     = 3400; // when chips render behind the overlay
const SUMMON_WAVES_MS    = [0, 1500, 2900]; // lightning storm waves

function summonGauntlet(onPeak) {
  // Reset gif playback so it always starts from frame 0
  const src = gauntletGif.getAttribute('src');
  gauntletGif.setAttribute('src', '');
  void gauntletGif.offsetWidth;
  gauntletGif.setAttribute('src', src);

  addOverlay.classList.remove('hidden');

  // Layered lightning storms across the full overlay window
  SUMMON_WAVES_MS.forEach(t => setTimeout(runLightningStorm, t));

  // Update the roster on the climactic beat
  setTimeout(() => { try { onPeak && onPeak(); } catch (_) {} }, SUMMON_PEAK_MS);
  setTimeout(() => addOverlay.classList.add('hidden'), SUMMON_TOTAL_MS);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function runLightningStorm() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'lightning-storm');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const N = 14;
  for (let i = 0; i < N; i++) {
    const bolt = createLightningBolt(W, H, i, N);
    svg.appendChild(bolt);
  }
  document.body.appendChild(svg);
  setTimeout(() => svg.remove(), 1900);
}

function createLightningBolt(W, H, index, total) {
  const g = document.createElementNS(SVG_NS, 'g');

  const fromLeft = Math.random() < 0.5;
  const startX = fromLeft ? -80 : W + 80;
  const endX   = fromLeft ?  W + 80 : -80;
  const startY = Math.random() * H;
  const endY   = startY + (Math.random() - 0.5) * H * 0.55;

  const segments = 22 + Math.floor(Math.random() * 10);
  const points = [];
  const dx = endX - startX;
  const dy = endY - startY;
  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    const x = startX + dx * t + (Math.random() - 0.5) * 28;
    const y = startY + dy * t + (Math.random() - 0.5) * 80;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const main = document.createElementNS(SVG_NS, 'polyline');
  main.setAttribute('points', points.join(' '));
  main.setAttribute('class', index % 3 === 0 ? 'lightning-bolt thick' : 'lightning-bolt');
  const delay = (index / total) * 650 + Math.random() * 220;
  main.style.animationDelay = `${delay}ms`;
  g.appendChild(main);

  // Optional branch off a midpoint
  if (Math.random() < 0.55) {
    const branchStart = Math.floor(segments * (0.35 + Math.random() * 0.4));
    const [bx0Str, by0Str] = points[branchStart].split(',');
    const bx0 = parseFloat(bx0Str);
    const by0 = parseFloat(by0Str);
    const branchPts = [`${bx0.toFixed(1)},${by0.toFixed(1)}`];
    const bsteps = 6 + Math.floor(Math.random() * 5);
    const dirX = (fromLeft ? 1 : -1) * (60 + Math.random() * 120);
    const dirY = (Math.random() - 0.5) * 220;
    for (let s = 1; s <= bsteps; s++) {
      const t = s / bsteps;
      const x = bx0 + dirX * t + (Math.random() - 0.5) * 22;
      const y = by0 + dirY * t + (Math.random() - 0.5) * 28;
      branchPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const branch = document.createElementNS(SVG_NS, 'polyline');
    branch.setAttribute('points', branchPts.join(' '));
    branch.setAttribute('class', 'lightning-bolt');
    branch.style.animationDelay = `${delay + 80}ms`;
    g.appendChild(branch);
  }

  return g;
}

/* ───────── Initial render ───────── */
render();
