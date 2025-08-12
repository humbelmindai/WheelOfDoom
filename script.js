// Wheel of Doom — Vanilla JS
// Mobile-friendly spinner with synthesized audio and canvas rendering

const DEFAULT_TASKS = [
  { icon: '🛌', label: 'Jammy Time (PJs all day!)', type: 'silly' },
  { icon: '🧸', label: 'Toy Tidy (5 mins)', type: 'chore' },
  { icon: '💃', label: 'Dance Party (60 sec)', type: 'silly' },
  { icon: '🪥', label: 'Brush Teeth Now', type: 'chore' },
  { icon: '🧹', label: 'Pick Up 10 Items', type: 'chore' },
  { icon: '🎤', label: 'Sing a Silly Song', type: 'silly' },
  { icon: '📚', label: 'Homework (10 mins)', type: 'chore' },
  { icon: '💛', label: 'Compliment Someone', type: 'kind' },
  { icon: '🤸‍♀️', label: 'Stretch Break (1 min)', type: 'silly' },
  { icon: '📖', label: 'Read (15 mins)', type: 'chore' },
  { icon: '❓', label: 'Mystery Task', type: 'silly' },
  { icon: '🎁', label: 'Free Spin!', type: 'free' },
];

// DOM
const canvas = document.getElementById('wheelCanvas');
const spinBtn = document.getElementById('spinBtn');
const resultEl = document.getElementById('result');
const muteBtn = document.getElementById('muteBtn');
const prizeOverlay = document.getElementById('prizeOverlay');
const prizeText = document.getElementById('prizeText');
const prizeCloseBtn = document.getElementById('prizeCloseBtn');
const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas.getContext('2d');
// Customizer DOM
const customizeBtn = document.getElementById('customizeBtn');
const editorOverlay = document.getElementById('editorOverlay');
const editorCloseBtn = document.getElementById('editorCloseBtn');
const editorList = document.getElementById('editorList');
const addItemBtn = document.getElementById('addItemBtn');
const resetBtn = document.getElementById('resetBtn');
const saveBtn = document.getElementById('saveBtn');

// Canvas setup with HiDPI support
const ctx = canvas.getContext('2d');
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWheel();
}
window.addEventListener('resize', resizeCanvas, { passive: true });

// State
let tasks = loadTasks();
let isSpinning = false;
let currentRotation = 0; // radians
let selectedIndex = -1;

// Colors per slice
const SLICE_COLORS = [
  '#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#bdb2ff', '#f72585',
  '#ff9e00', '#8ac926', '#00bbf9', '#aaccff', '#ff6392', '#38b000',
];

// Audio
class SoundEngine {
  constructor() {
    this.enabled = true;
    this.AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = null; // lazily created upon first user interaction
    this.master = null;
  }

  ensure() {
    if (!this.enabled) return false;
    if (!this.ctx) {
      if (!this.AudioCtx) return false;
      this.ctx = new this.AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setEnabled(flag) {
    this.enabled = flag;
  }

  // short tick sound for each segment pass
  tick() {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // cheerful chord for result
  chime() {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.03;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35 + i * 0.02);
      osc.connect(gain).connect(this.master);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  }

  // silly wah-wah for chores
  wahWah() {
    if (!this.ensure()) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.4);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.55);
  }
}

const sounds = new SoundEngine();

// Simple confetti
const confetti = [];
function initConfetti() {
  confetti.length = 0;
  const count = 150;
  const { width, height } = confettiCanvas;
  for (let i = 0; i < count; i++) {
    confetti.push({
      x: Math.random() * width,
      y: -Math.random() * 60,
      r: 4 + Math.random() * 6,
      c: SLICE_COLORS[i % SLICE_COLORS.length],
      s: 1 + Math.random() * 2.5,
      a: Math.random() * Math.PI * 2,
      v: Math.random() * 0.05 + 0.01,
    });
  }
}

let confettiAnimation = null;
function drawConfetti() {
  const { width, height } = confettiCanvas;
  confettiCtx.clearRect(0, 0, width, height);
  confetti.forEach(p => {
    p.y += p.s;
    p.x += Math.sin(p.a) * 0.6;
    p.a += p.v;
    if (p.y > height + 10) p.y = -10;
    confettiCtx.fillStyle = p.c;
    confettiCtx.beginPath();
    confettiCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    confettiCtx.fill();
  });
  confettiAnimation = requestAnimationFrame(drawConfetti);
}

// Drawing wheel
function drawWheel() {
  const { width, height } = canvas;
  const w = width / dpr;
  const h = height / dpr;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.42;

  ctx.clearRect(0, 0, w, h);

  // outer rim
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(currentRotation);

  const sliceAngle = (Math.PI * 2) / tasks.length;

  // slices
  for (let i = 0; i < tasks.length; i++) {
    const start = i * sliceAngle;
    const end = start + sliceAngle;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length];
    ctx.globalAlpha = 0.95;
    ctx.fill();
  }

  // separators
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < tasks.length; i++) {
    const a = i * sliceAngle;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    ctx.stroke();
  }

  // icons (emoji) instead of text
  ctx.fillStyle = '#0b1020';
  ctx.font = '32px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < tasks.length; i++) {
    const mid = i * sliceAngle + sliceAngle / 2;
    const r = radius * 0.65;
    const x = Math.cos(mid) * r;
    const y = Math.sin(mid) * r;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(mid);
    const icon = tasks[i].icon || '🎯';
    ctx.fillText(icon, 0, 0);
    ctx.restore();
  }

  // center cap
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, radius * 0.18);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(1, '#ddd');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.restore();

  // pointer glow
  ctx.save();
  ctx.translate(cx, cy - radius - 12);
  ctx.fillStyle = 'rgba(255,77,109,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' ';
    const metrics = ctx.measureText(test);
    if (metrics.width > maxWidth && i > 0) {
      lines.push(line.trim());
      line = words[i] + ' ';
    } else {
      line = test;
    }
  }
  lines.push(line.trim());
  const total = lines.length * lineHeight;
  let yy = y - total / 2 + lineHeight / 2;
  lines.forEach((ln) => {
    ctx.fillText(ln, x, yy);
    yy += lineHeight;
  });
}

// Spin logic
function spin() {
  if (isSpinning) return;
  isSpinning = true;
  spinBtn.disabled = true;

  // Choose a random index fairly
  selectedIndex = Math.floor(Math.random() * tasks.length);

  const sliceAngle = (Math.PI * 2) / tasks.length;
  const targetAngleForIndex = (index) => {
    const sliceCenter = index * sliceAngle + sliceAngle / 2; // when at 0 angle (pointing right)
    // We want sliceCenter to end up at -Math.PI/2 (top, pointer)
    // so rotation should be: desiredRotation = -Math.PI/2 - sliceCenter
    return -Math.PI / 2 - sliceCenter;
  };

  const current = normalizeAngle(currentRotation);
  const targetBase = targetAngleForIndex(selectedIndex);
  const fullTurns = 5 + Math.random() * 3; // 5-8 turns
  let target = targetBase + fullTurns * Math.PI * 2;

  // Animate with easing
  const duration = 4300 + Math.random() * 900; // 4.3 - 5.2s
  const start = performance.now();
  const startAngle = current;
  let prevBoundary = boundaryIndexAtAngle(startAngle, sliceAngle);

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = cubicBezier(0.12, 0.82, 0.08, 0.99, t); // easeOut-ish
    currentRotation = startAngle + (target - startAngle) * eased;
    drawWheel();

    // play tick when crossing segment boundaries while spinning fast
    const idx = boundaryIndexAtAngle(currentRotation, sliceAngle);
    if (idx !== prevBoundary) {
      prevBoundary = idx;
      sounds.tick();
      if (navigator.vibrate) navigator.vibrate(6);
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      // finalize
      currentRotation = normalizeAngle(currentRotation);
      const finalIndex = selectedIndex;
      const picked = tasks[finalIndex];
      announceResult(picked);
      showPrize(picked);
      spinBtn.disabled = false;
      isSpinning = false;
    }
  }
  requestAnimationFrame(frame);
}

function boundaryIndexAtAngle(angle, sliceAngle) {
  const normalized = normalizeAngle(angle + Math.PI / 2); // align so index 0 is at top
  return Math.floor(normalized / sliceAngle);
}

function normalizeAngle(radians) {
  let a = radians % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a;
}

function cubicBezier(p0, p1, p2, p3, t) {
  // classic cubic bezier y given t, with fixed x mapped as t for simplicity
  // Here we use an easeOut-like curve; parameters are chosen experimentally
  const u = 1 - t;
  return u * u * u * 0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * 1;
}

function announceResult(picked) {
  const tag = picked.type;
  const isChore = tag === 'chore';
  const isFree = tag === 'free';
  resultEl.textContent = isFree ? 'Free Spin! Go again 🎉' : picked.label + ' 🎯';
  if (isFree) sounds.chime();
  else if (isChore) sounds.wahWah();
  else sounds.chime();
}

function showPrize(picked) {
  prizeText.textContent = picked.type === 'free' ? 'Free Spin! Go again 🎉' : picked.label;
  prizeOverlay.classList.add('show');
  prizeOverlay.setAttribute('aria-hidden', 'false');
  // prepare confetti canvas size
  confettiCanvas.width = Math.floor(window.innerWidth * dpr);
  confettiCanvas.height = Math.floor(window.innerHeight * dpr);
  confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  initConfetti();
  drawConfetti();
  if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
}

function hidePrize() {
  prizeOverlay.classList.remove('show');
  prizeOverlay.setAttribute('aria-hidden', 'true');
  if (confettiAnimation) cancelAnimationFrame(confettiAnimation);
  confettiAnimation = null;
  // make sure user can spin again
  isSpinning = false;
  spinBtn.disabled = false;
}

// UI events
spinBtn.addEventListener('click', () => {
  sounds.ensure();
  spin();
});

muteBtn.addEventListener('click', () => {
  const pressed = muteBtn.getAttribute('aria-pressed') === 'true';
  const next = !pressed;
  muteBtn.setAttribute('aria-pressed', String(next));
  muteBtn.textContent = next ? '🔊' : '🔇';
  sounds.setEnabled(next);
});

prizeCloseBtn.addEventListener('click', () => {
  hidePrize();
  // start a new spin shortly after the overlay closes
  setTimeout(() => {
    spin();
  }, 250);
});

prizeOverlay.addEventListener('click', (e) => {
  if (e.target === prizeOverlay) {
    hidePrize();
    setTimeout(() => { spin(); }, 250);
  }
});

// Kick things off
resizeCanvas();
drawWheel();


// ============ Customizer ============
function loadTasks() {
  try {
    const raw = localStorage.getItem('wheelOfDoom.tasks');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 4) return parsed;
    }
  } catch {}
  return [...DEFAULT_TASKS];
}

function saveTasks(list) {
  localStorage.setItem('wheelOfDoom.tasks', JSON.stringify(list));
}

function openEditor() {
  editorList.innerHTML = '';
  tasks.forEach((t, idx) => editorList.appendChild(renderRow(t, idx)));
  editorOverlay.classList.add('show');
  editorOverlay.setAttribute('aria-hidden', 'false');
}

function closeEditor() {
  editorOverlay.classList.remove('show');
  editorOverlay.setAttribute('aria-hidden', 'true');
}

function renderRow(task, index) {
  const row = document.createElement('div');
  row.className = 'editor-row';
  row.dataset.index = String(index);

  const icon = document.createElement('input');
  icon.className = 'mini';
  icon.maxLength = 3;
  icon.value = task.icon || '';
  icon.placeholder = '🎯';

  const label = document.createElement('input');
  label.value = task.label || '';
  label.placeholder = 'Description (shown after spin)';

  const select = document.createElement('select');
  ;['silly','chore','kind','free'].forEach((v)=>{
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    if (task.type === v) opt.selected = true;
    select.appendChild(opt);
  });

  const del = document.createElement('button');
  del.className = 'btn btn-ghost';
  del.textContent = '🗑';
  del.addEventListener('click', () => {
    tasks.splice(index, 1);
    row.remove();
  });

  row.append(icon, label, select, del);

  // bind updates
  icon.addEventListener('input', () => { task.icon = icon.value.trim() || '🎯'; });
  label.addEventListener('input', () => { task.label = label.value; });
  select.addEventListener('change', () => { task.type = select.value; });

  return row;
}

customizeBtn.addEventListener('click', openEditor);
editorCloseBtn.addEventListener('click', closeEditor);
editorOverlay.addEventListener('click', (e)=>{ if (e.target === editorOverlay) closeEditor(); });

addItemBtn.addEventListener('click', () => {
  const item = { icon: '✨', label: 'New consequence', type: 'silly' };
  tasks.push(item);
  editorList.appendChild(renderRow(item, tasks.length - 1));
});

resetBtn.addEventListener('click', () => {
  tasks = [...DEFAULT_TASKS];
  openEditor();
});

saveBtn.addEventListener('click', () => {
  tasks = tasks.filter(t => (t.icon && t.label)).slice(0, 20);
  if (tasks.length < 4) {
    alert('Please keep at least 4 consequences.');
    return;
  }
  saveTasks(tasks);
  closeEditor();
  drawWheel();
});

