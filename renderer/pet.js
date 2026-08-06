// ============================================================
// pet.js —— 桌宠行为：散步、拖拽、说话气泡、待办提醒、番茄钟、整点报时
// ============================================================

const W = 220;
const H = 280;
const LS_KEY = 'pet.settings';

// 渲染层错误转发到主进程控制台，便于排查
window.addEventListener('error', (e) => {
  petAPI.log('渲染层错误:', e.message, 'at', e.filename, e.lineno);
});

// ---------- 设置与持久化 ----------
const DEFAULTS = window.PET_DEFAULTS;

function loadSettings() {
  const base = JSON.parse(JSON.stringify(DEFAULTS));
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return Object.assign(base, saved, {
      pomodoro: Object.assign({}, base.pomodoro, saved.pomodoro || {}),
      pomo: Object.assign({}, base.pomo, saved.pomo || {}),
      ai: Object.assign({}, base.ai, saved.ai || {})
    });
  } catch (e) {
    return base;
  }
}
let S = loadSettings();

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
  petAPI.notifyStateChanged();   // 广播给面板/聊天窗口同步
}

// ---------- 画布 ----------
const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');
const DPR = window.devicePixelRatio || 1;
canvas.width = W * DPR;
canvas.height = H * DPR;

// 图片形象：加载 assets 里的图片，缩放一次缓存到离屏 canvas，之后每帧只做一次 blit
const petImage = new Image();
petImage.ok = false;
petImage.version = -1;
const imgCache = document.createElement('canvas');
let imgCacheReady = false;

function buildImageCache() {
  const iw = petImage.naturalWidth;
  const ih = petImage.naturalHeight;
  if (!iw || !ih) return;
  const s = Math.min(W / iw, H / ih);
  imgCache.width = Math.max(1, Math.round(iw * s));
  imgCache.height = Math.max(1, Math.round(ih * s));
  imgCache.getContext('2d').drawImage(petImage, 0, 0, imgCache.width, imgCache.height);
  imgCacheReady = true;
}

function reloadPetImage() {
  const v = S.imageVersion || 0;
  if (v === petImage.version && petImage.ok) return; // 图片没变，不重复加载
  petImage.version = v;
  petImage.ok = false;
  imgCacheReady = false;
  petImage.src = '../assets/' + (S.imageFile || 'pet-image.jpg') + '?v=' + v;
}
petImage.onload = () => { petImage.ok = true; buildImageCache(); };
petImage.onerror = () => {
  petImage.ok = false;
  petAPI.log('图片形象加载失败:', S.imageFile);
};

// ---------- 桌宠运行时状态 ----------
const pet = {
  walking: false, target: { x: 0, y: 0 },
  dragging: false, dragPointer: -1, dragOffset: { x: 0, y: 0 }, moved: 0,
  lastPos: { x: 0, y: 0 },
  arriveAt: 0,
  sleeping: false, idleMs: 0, wasSleeping: false,
  lastDoneMap: null,          // 记录上一次的已完成待办集合，用于识别"新完成"
  workArea: { x: 0, y: 0, width: 800, height: 600 },
  nextBlinkAt: 0,
  lastChimeHour: new Date().getHours(),
  lastSpeakAt: 0
};

// ---------- 提示音（Web Audio，无需音频文件） ----------
function beep(freq = 880, dur = 0.12, vol = 0.15) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ac.destination);
    const t0 = ac.currentTime;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur);
    osc.onended = () => { try { ac.close(); } catch (e) {} };
  } catch (e) {}
}

// ---------- 说话气泡 ----------
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
let sayTimer = null;
let typeTimer = null;

function say(text, dur) {
  if (!text) return;
  clearTimeout(sayTimer);
  clearInterval(typeTimer);
  bubbleText.textContent = '';
  bubble.classList.remove('hidden');
  let i = 0;
  typeTimer = setInterval(() => {
    i++;
    bubbleText.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(typeTimer);
      sayTimer = setTimeout(() => bubble.classList.add('hidden'), dur || 3500);
    }
  }, 26);
}

function hideBubble() {
  clearTimeout(sayTimer);
  clearInterval(typeTimer);
  bubble.classList.add('hidden');
}

// 按当前装扮切换语音包（蕾米埃尔用她的专属台词）
function applyVoice() {
  const preset = Character.getPreset(S.preset);
  const voice = preset && preset.voice && window.VOICES && window.VOICES[preset.voice] ? preset.voice : 'default';
  window.LINES = window.VOICES[voice];
}

// ---------- 台词（语料库在 lines.js） ----------
function greetingPeriod() {
  const h = new Date().getHours();
  if (h < 6) return 'night';
  if (h < 9) return 'morning';
  if (h < 12) return 'day';
  if (h < 14) return 'noon';
  if (h < 18) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

function pickGreeting() {
  return Lines.pick('greeting_' + greetingPeriod());
}

// 空闲闲聊：按时段和概率混合多种风格，不再老重复
function pickIdleLine() {
  const h = new Date().getHours();
  if (h >= 23 || h < 6) {
    return Math.random() < 0.5 ? Lines.pick('sleepy') : Lines.pick('chat');
  }
  const r = Math.random();
  if (r < 0.3) return Lines.pick('chat');
  if (r < 0.45) return Lines.pick('encourage');
  if (r < 0.6) return Lines.pick('health');
  if (r < 0.75) return Lines.pick('work');
  if (r < 0.9) return Lines.pick('affection');
  return Lines.pick('playful');
}

function pickClickLine() {
  const r = Math.random();
  if (r < 0.25) return pickGreeting();
  if (r < 0.65) return Lines.pick('chat');
  return Lines.pick('playful');
}

// ---------- 散步（窗口移动） ----------
async function startWalk() {
  try {
    if (!S.wander) return;
    if (pet.dragging || pet.sleeping || pet.walking) return; // 防止 getPos 等待期间重复触发
    const [px, py] = await petAPI.getPos();
    pet.lastPos = { x: px, y: py };
    const wa = pet.workArea;
    pet.target = {
      x: wa.x + 10 + Math.random() * Math.max(20, wa.width - W - 20),
      y: wa.y + 10 + Math.random() * Math.max(20, wa.height - H - 20)
    };
    pet.walking = true;
  } catch (e) {}
}

function updateWander(dt, t) {
  if (!S.wander) { pet.walking = false; return; }
  if (pet.dragging || pet.sleeping) return;
  if (!pet.walking) {
    if (t - pet.arriveAt > 6 + Math.random() * 10) startWalk();
    return;
  }
  const dx = pet.target.x - pet.lastPos.x;
  const dy = pet.target.y - pet.lastPos.y;
  const dist = Math.hypot(dx, dy);
  const step = 55 * S.wanderSpeed * dt;
  if (dist <= step || dist < 2) {
    pet.lastPos = { x: pet.target.x, y: pet.target.y };
    petAPI.move(pet.target.x, pet.target.y);
    pet.walking = false;
    pet.arriveAt = t;
  } else {
    pet.lastPos.x += (dx / dist) * step;
    pet.lastPos.y += (dy / dist) * step;
    petAPI.move(pet.lastPos.x, pet.lastPos.y);
  }
}

// ---------- 拖拽（用绝对屏幕坐标计算，避免反馈环） ----------
function bindPointer() {
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pet.dragPointer = e.pointerId;
    pet.dragOffset = { x: e.clientX, y: e.clientY };
    pet.moved = 0;
    pet.dragging = false;
    wake();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pet.dragPointer) return;
    const dx = e.clientX - pet.dragOffset.x;
    const dy = e.clientY - pet.dragOffset.y;
    pet.moved = Math.max(pet.moved, Math.hypot(dx, dy));
    if (pet.moved > 6) {
      pet.dragging = true;
      document.body.classList.add('dragging');
      petAPI.move(window.screenX + e.clientX - pet.dragOffset.x, window.screenY + e.clientY - pet.dragOffset.y);
    }
  });

  const endPointer = (e) => {
    if (e.pointerId !== pet.dragPointer) return;
    const wasDragging = pet.dragging;
    pet.dragPointer = -1;
    pet.dragging = false;
    document.body.classList.remove('dragging');
    if (wasDragging) {
      if (Math.random() < 0.3) say(Lines.pick('drag'));
    } else if (pet.wasSleeping) {
      say(Lines.pick('wake'));
    } else {
      say(pickClickLine());
    }
    pet.wasSleeping = false;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
}

// ---------- 右键菜单 ----------
function bindMenu() {
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    petAPI.showMenu(e.clientX + window.screenX, e.clientY + window.screenY);
  });
  petAPI.onMenuAction((id, val) => {
    if (id === 'panel') {
      petAPI.openPanel();
    } else if (id === 'say') {
      wake();
      say(pickIdleLine());
    } else if (id === 'chat') {
      petAPI.openChat();
    } else if (id === 'chime') {
      S.chime = !!val;
      save();
      petAPI.syncMenuChecks(S.chime, S.pin);
      if (S.chime) say('好哦，整点会提醒你啦 ⏰');
    } else if (id === 'pin') {
      S.pin = !!val;
      save();
      petAPI.setPin(S.pin);
    }
  });
  petAPI.onSync(() => {
    S = loadSettings();
    applyVoice();       // 按装扮切换语音
    reloadPetImage();   // 换图后重新加载
    petAPI.setPin(S.pin);
    petAPI.syncMenuChecks(S.chime, S.pin);
    updatePomoBadge();
  });
}

// ---------- 打盹 / 醒来 ----------
function wake() {
  if (pet.sleeping) { pet.sleeping = false; pet.wasSleeping = true; }
  pet.idleMs = 0;
}

function updateSleep(dt) {
  if (pet.dragging || pet.walking) { pet.idleMs = 0; return; }
  pet.idleMs += dt * 1000;
  if (pet.idleMs > 90000 && !pet.sleeping) {
    pet.sleeping = true;
    hideBubble();
  }
}

// ---------- 每 1 秒的例行检查 ----------
function tick() {
  checkHourlyChime();
  checkTodoReminders();
  checkTodoPraise();
  checkPomodoro();
  updatePomoBadge();
  checkIdleSpeech();
}

// 识别"新完成"的待办，表扬一下
function checkTodoPraise() {
  const nowDone = new Set();
  for (const t of S.todos) if (t.done) nowDone.add(t.id);
  if (!pet.lastDoneMap) { pet.lastDoneMap = nowDone; return; }
  const pending = S.todos.filter((x) => !x.done).length;
  for (const id of nowDone) {
    if (!pet.lastDoneMap.has(id)) {
      const todo = S.todos.find((x) => x.id === id);
      if (todo) say(Lines.pick('todo_done', { text: todo.text, todo_count: pending }), 4000);
    }
  }
  pet.lastDoneMap = nowDone;
}

function checkHourlyChime() {
  const now = new Date();
  if (!S.chime) return;
  if (now.getMinutes() === 0 && now.getHours() !== pet.lastChimeHour) {
    pet.lastChimeHour = now.getHours();
    say(Lines.render(window.LINES.chime, { h: now.getHours() }), 4000);
    beep(880, 0.15);
    setTimeout(() => beep(660, 0.2, 0.12), 180);
  }
}

function checkTodoReminders() {
  const now = Date.now();
  let changed = false;
  for (const todo of S.todos) {
    if (todo.done || todo.notified || !todo.remindAt) continue;
    if (now >= todo.remindAt) {
      todo.notified = true;
      changed = true;
      const line = Lines.pick('todo_reminder', { text: todo.text });
      say(line, 4500);
      petAPI.notify('桌宠提醒', line);
      petAPI.notifyChat(line);   // 推送到聊天窗口，成为对话上下文
      beep(1046, 0.15);
      setTimeout(() => beep(1318, 0.2, 0.12), 180);
    }
  }
  if (changed) save();
}

function checkPomodoro() {
  const pm = S.pomo;
  if (!pm.running || pm.paused) return;
  const now = Date.now();
  if (now < pm.endAt) return;
  if (pm.phase === 'work') {
    const line = Lines.pick('pomo_work_end');
    say(line, 4500);
    petAPI.notify('番茄钟', line);
    petAPI.notifyChat(line);   // 推送到聊天窗口
    pm.phase = 'break';
    pm.endAt = now + S.pomodoro.breakMin * 60000;
  } else {
    const line = Lines.pick('pomo_break_end');
    say(line, 4500);
    petAPI.notify('番茄钟', line);
    petAPI.notifyChat(line);   // 推送到聊天窗口
    pm.phase = 'work';
    pm.endAt = now + S.pomodoro.workMin * 60000;
  }
  beep(1046, 0.15);
  setTimeout(() => beep(1318, 0.15, 0.12), 200);
  setTimeout(() => beep(1568, 0.25, 0.12), 400);
  save();
}

function updatePomoBadge() {
  const badge = document.getElementById('pomo-badge');
  const pm = S.pomo;
  if (!pm.running) { badge.classList.add('hidden'); return; }
  let secs;
  if (pm.paused) secs = Math.max(0, Math.round(pm.remaining / 1000));
  else secs = Math.max(0, Math.round((pm.endAt - Date.now()) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  badge.textContent = `${pm.phase === 'work' ? '工作' : '休息'} ${mm}:${ss}`;
  badge.classList.remove('hidden');
}

// ---------- 眨眼 ----------
const blink = { state: 'open', start: 0 };

function computeEyeOpen(t) {
  if (blink.state === 'open') return 1;
  const k = (t - blink.start) / 0.26;
  if (k >= 1) { blink.state = 'open'; return 1; }
  return Math.max(0.02, k < 0.4 ? 1 - k / 0.4 : (k - 0.4) / 0.6);
}

function scheduleBlink(t) {
  if (blink.state === 'open' && t >= pet.nextBlinkAt) {
    blink.state = 'closing';
    blink.start = t;
    pet.nextBlinkAt = t + 2.5 + Math.random() * 3;
  }
}

// ---------- 空闲说话（并入 1s tick，不再占用每帧） ----------
function checkIdleSpeech() {
  if (pet.sleeping || pet.dragging || pet.walking) return;
  const interval = Math.max(15, S.speechFreq) * 1000;
  const now = performance.now();
  if (now - pet.lastSpeakAt > interval * (0.7 + Math.random() * 0.6)) {
    pet.lastSpeakAt = now;
    say(pickIdleLine());
  }
}

// ---------- 主循环（按状态自动降帧率，省 CPU） ----------
let lastT = performance.now() / 1000;
let lastDrawAt = 0;

// 需要的帧率：移动/拖拽时才全速，打盹几乎静止
function targetFps() {
  if (pet.walking || pet.dragging) return 60;
  if (pet.sleeping) return 6;
  return 15;
}

function buildPose(t) {
  return {
    bob: Math.sin(t * 2.2) * (pet.walking ? 3.5 : 2.5),
    walking: pet.walking,
    eyeOpen: pet.sleeping ? 0 : computeEyeOpen(t),
    sleeping: pet.sleeping,
    tailPhase: t * 3
  };
}

function frame(ts) {
  const t = ts / 1000;
  const dt = Math.min(0.1, t - lastT);
  lastT = t;

  // 未到渲染间隔就跳过本帧（逻辑都基于 dt/t，降帧不影响正确性）
  if (ts - lastDrawAt < 1000 / targetFps() - 1) {
    requestAnimationFrame(frame);
    return;
  }
  lastDrawAt = ts;

  scheduleBlink(t);
  updateWander(dt, t);
  updateSleep(dt);

  draw(t);

  requestAnimationFrame(frame);
}

// ---------- 绘制 ----------
function draw(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // 图片形象模式
  if (S.appearance === 'image' && petImage.ok) {
    drawImageMode(t);
    return;
  }

  // 卡通角色模式（默认）
  const preset = Character.getPreset(S.preset);
  Character.draw(ctx, W, H, t, buildPose(t), {
    kind: preset.kind,
    palette: preset.palette,
    scale: S.scale
  });
}

// 图片形象：把缓存好的图片 blit 到窗口居中显示；打盹时叠一个 Zzz
function drawImageMode(t) {
  if (!imgCacheReady) return;
  const dx = Math.round((W - imgCache.width) / 2);
  const dy = Math.round((H - imgCache.height) / 2);
  ctx.drawImage(imgCache, dx, dy);

  if (pet.sleeping) {
    const cycle = (t * 14) % 42;
    const zy = 64 - cycle;
    const alpha = Math.max(0, 0.9 * (1 - cycle / 42));
    ctx.fillStyle = `rgba(80,90,110,${alpha.toFixed(2)})`;
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.fillText('z', W - 62, zy);
    ctx.fillText('Z', W - 46, zy - 8);
  }
}

// ---------- 启动 ----------
async function init() {
  try { pet.workArea = await petAPI.getWorkArea(); } catch (e) {}
  try {
    const [px, py] = await petAPI.getPos();
    pet.lastPos = { x: px, y: py };
  } catch (e) { pet.lastPos = { x: 0, y: 0 }; }
  pet.arriveAt = performance.now() / 1000 + 4;
  pet.lastSpeakAt = performance.now() + 12000;
  pet.nextBlinkAt = performance.now() / 1000 + 1.5 + Math.random() * 2;

  petAPI.setPin(S.pin);
  petAPI.syncMenuChecks(S.chime, S.pin);
  applyVoice();

  bindPointer();
  bindMenu();

  // 情绪徽标：聊天窗口把回复情绪发来，桌宠短暂显示 emoji
  const MOOD_EMOJI = { 开心: '😄', 平静: '😊', 困: '😪', 难过: '😢', 惊讶: '😲', 戏谑: '😏' };
  const moodBadge = document.getElementById('mood-badge');
  let moodTimer = null;
  petAPI.onMood((emotion) => {
    const em = MOOD_EMOJI[emotion];
    if (!em) return;
    moodBadge.textContent = em;
    moodBadge.classList.remove('hidden');
    moodBadge.style.animation = 'none';
    void moodBadge.offsetWidth;   // 重启动画
    moodBadge.style.animation = '';
    clearTimeout(moodTimer);
    moodTimer = setTimeout(() => moodBadge.classList.add('hidden'), 3000);
  });

  reloadPetImage();

  // 开场白跟随当前语音
  const intro = window.LINES === window.VOICES.remiel
    ? `我是${S.name}。这个夜晚，请多关照。`
    : `你好呀，我是${S.name}！`;
  setTimeout(() => say(intro, 4000), 1500);

  // 自检：统计画布非透明像素，确认角色已绘制出来
  setTimeout(() => {
    const data = ctx.getImageData(0, 0, W, H).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 10) n++;
    petAPI.log(`自检: 画布非透明像素 = ${n}`);
  }, 2000);

  setInterval(tick, 1000);
  requestAnimationFrame(frame);
}

init();
