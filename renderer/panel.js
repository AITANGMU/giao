// ============================================================
// panel.js —— 面板：待办 / 番茄钟 / 设置（与桌宠共享 localStorage）
// ============================================================

const LS_KEY = 'pet.settings';

// 渲染层错误转发到主进程控制台，便于排查
window.addEventListener('error', (e) => {
  petAPI.log('面板渲染层错误:', e.message, 'at', e.filename, e.lineno);
});

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
      ai: Object.assign({}, base.ai, saved.ai || {}),
      affection: Object.assign({}, base.affection, saved.affection || {})
    });
  } catch (e) { return base; }
}

let S = loadSettings();

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
  petAPI.notifyStateChanged();   // 通知桌宠重新读取
}

// ---------- 提示音 ----------
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

// ---------- Tab 切换 ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tabpanel').forEach((p) => p.classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'kb') renderMemories();   // 每次进知识库页刷新
  });
});

// ---------- 待办 ----------
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');

function toLocalInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderTodos() {
  todoList.innerHTML = '';
  if (!S.todos.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '暂无待办 ~';
    todoList.appendChild(li);
    return;
  }
  for (const t of S.todos) {
    const li = document.createElement('li');
    if (t.done) li.classList.add('done');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!t.done;
    cb.addEventListener('change', () => {
      if (cb.checked) window.Affection.add(S, 2);   // 完成一件待办，好感度 +2
      t.done = cb.checked;
      save();
      renderTodos();
    });

    const span = document.createElement('span');
    span.className = 'text';
    span.textContent = t.text;

    const ri = document.createElement('input');
    ri.type = 'datetime-local';
    if (t.remindAt) ri.value = toLocalInput(t.remindAt);
    ri.title = '提醒时间';
    ri.addEventListener('change', () => {
      t.remindAt = ri.value ? new Date(ri.value).getTime() : 0;
      t.notified = false;
      save();
    });

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = '删除';
    del.addEventListener('click', () => {
      S.todos = S.todos.filter((x) => x.id !== t.id);
      save();
      renderTodos();
    });

    li.append(cb, span, ri, del);
    todoList.appendChild(li);
  }
}

document.getElementById('todo-add').addEventListener('click', addTodo);
todoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });

function addTodo() {
  const text = todoInput.value.trim();
  if (!text) return;
  S.todos.push({ id: Date.now() + Math.random(), text, done: false, remindAt: 0, notified: false });
  todoInput.value = '';
  save();
  renderTodos();
}

// ---------- 番茄钟 ----------
const statusEl = document.getElementById('pomo-status');
const timeEl = document.getElementById('pomo-time');
const workInput = document.getElementById('pomo-work');
const breakInput = document.getElementById('pomo-break');
const startBtn = document.getElementById('pomo-start');
const pauseBtn = document.getElementById('pomo-pause');
const resetBtn = document.getElementById('pomo-reset');

function fmt(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function refreshPomo() {
  // 正在编辑的输入框不要被每秒刷新覆盖
  if (document.activeElement !== workInput) workInput.value = S.pomodoro.workMin;
  if (document.activeElement !== breakInput) breakInput.value = S.pomodoro.breakMin;
  const pm = S.pomo;
  if (!pm.running) {
    statusEl.textContent = '未开始';
    timeEl.textContent = fmt(S.pomodoro.workMin * 60);
    startBtn.textContent = '开始';
    pauseBtn.disabled = true;
  } else {
    let secs;
    if (pm.paused) secs = Math.max(0, Math.round(pm.remaining / 1000));
    else secs = Math.max(0, Math.round((pm.endAt - Date.now()) / 1000));
    const phase = pm.phase === 'work' ? '工作中' : '休息中';
    statusEl.textContent = pm.paused ? phase + '（已暂停）' : phase;
    timeEl.textContent = fmt(secs);
    startBtn.textContent = pm.paused ? '继续' : '开始';
    pauseBtn.disabled = pm.paused;
  }
}

startBtn.addEventListener('click', () => {
  const wm = Math.max(1, parseInt(workInput.value, 10) || 25);
  const bm = Math.max(1, parseInt(breakInput.value, 10) || 5);
  S.pomodoro.workMin = wm;
  S.pomodoro.breakMin = bm;
  const pm = S.pomo;
  if (pm.paused) {
    pm.paused = false;
    pm.running = true;
    pm.endAt = Date.now() + pm.remaining;
  } else if (!pm.running) {
    pm.running = true;
    pm.paused = false;
    pm.endAt = Date.now() + (pm.phase === 'work' ? wm : bm) * 60000;
    pm.remaining = 0;
  }
  save();
  refreshPomo();
});

pauseBtn.addEventListener('click', () => {
  const pm = S.pomo;
  if (pm.running && !pm.paused) {
    pm.paused = true;
    pm.remaining = Math.max(0, pm.endAt - Date.now());
  }
  save();
  refreshPomo();
});

resetBtn.addEventListener('click', () => {
  Object.assign(S.pomo, { running: false, paused: false, phase: 'work', endAt: 0, remaining: 0 });
  save();
  refreshPomo();
});

// 时长输入失焦即提交，避免被每秒刷新覆盖（之前输入 45 会丢回 25）
workInput.addEventListener('change', () => { S.pomodoro.workMin = Math.max(1, parseInt(workInput.value, 10) || 25); save(); });
breakInput.addEventListener('change', () => { S.pomodoro.breakMin = Math.max(1, parseInt(breakInput.value, 10) || 5); save(); });

// ---------- 设置 ----------
const nameInput = document.getElementById('set-name');
nameInput.value = S.name;
nameInput.addEventListener('change', () => {
  const v = nameInput.value.trim();
  if (v) { S.name = v; save(); }
});

const scaleInput = document.getElementById('set-scale');
const wanderInput = document.getElementById('set-wander');
const wanderToggle = document.getElementById('set-wander-toggle');
const freqInput = document.getElementById('set-freq');
const chimeInput = document.getElementById('set-chime');
const pinInput = document.getElementById('set-pin');
const speakInput = document.getElementById('set-speak');

scaleInput.value = S.scale;
wanderInput.value = S.wanderSpeed;
wanderToggle.checked = S.wander;
freqInput.value = S.speechFreq;
chimeInput.checked = S.chime;
pinInput.checked = S.pin;
speakInput.checked = S.speak;

scaleInput.addEventListener('input', () => { S.scale = parseFloat(scaleInput.value); save(); });
wanderInput.addEventListener('input', () => { S.wanderSpeed = parseFloat(wanderInput.value); save(); });
wanderToggle.addEventListener('change', () => { S.wander = wanderToggle.checked; save(); });
freqInput.addEventListener('input', () => { S.speechFreq = parseInt(freqInput.value, 10); save(); });
chimeInput.addEventListener('change', () => { S.chime = chimeInput.checked; save(); });
pinInput.addEventListener('change', () => { S.pin = pinInput.checked; save(); });
speakInput.addEventListener('change', () => { S.speak = speakInput.checked; save(); });

// ---------- 云端 AI 对话 ----------
const aiEnabled = document.getElementById('set-ai-enabled');
const aiProvider = document.getElementById('set-ai-provider');
const aiKey = document.getElementById('set-ai-key');
const aiModel = document.getElementById('set-ai-model');
const aiBaseUrl = document.getElementById('set-ai-baseurl');
const aiBaseUrlField = document.getElementById('ai-baseurl-field');
const btnAiTest = document.getElementById('btn-ai-test');
const aiTestResult = document.getElementById('ai-test-result');

function syncAiProviderUI() {
  const isCustom = aiProvider.value === 'custom';
  aiBaseUrlField.style.display = isCustom ? 'block' : 'none';
  const prov = window.AI_PROVIDERS[aiProvider.value] || window.AI_PROVIDERS.zhipu;
  aiModel.placeholder = prov.model || '';
  if (!S.ai.model) {  // 模型名留空时跟随服务商默认
    S.ai.model = prov.model || '';
    aiModel.value = S.ai.model;
  }
}

aiEnabled.checked = S.ai.enabled;
aiProvider.value = S.ai.provider;
aiKey.value = '';
aiModel.value = S.ai.model || '';
aiBaseUrl.value = S.ai.baseUrl || '';
syncAiProviderUI();

// Key：显示时解密，保存时加密（safeStorage）；解密失败给出提示而不是显示密文
(async () => {
  const stored = S.ai.apiKey || '';
  let display = stored;
  try { display = await petAPI.keyDecrypt(stored); } catch (e) { display = ''; }
  if (stored && stored.startsWith('enc:') && !display) {
    aiKey.placeholder = '原密钥无法解密，请重新输入';
  }
  aiKey.value = display;
})();

aiEnabled.addEventListener('change', () => { S.ai.enabled = aiEnabled.checked; save(); });
aiProvider.addEventListener('change', () => { S.ai.provider = aiProvider.value; syncAiProviderUI(); save(); });
aiKey.addEventListener('change', async () => {
  const plain = aiKey.value.trim();
  let enc = plain;
  try { enc = await petAPI.keyEncrypt(plain); } catch (e) {}
  S.ai.apiKey = enc;
  save();
});
aiModel.addEventListener('change', () => { S.ai.model = aiModel.value.trim(); save(); });
aiBaseUrl.addEventListener('change', () => { S.ai.baseUrl = aiBaseUrl.value.trim(); save(); });

btnAiTest.addEventListener('click', async () => {
  aiTestResult.textContent = '测试中…';
  const prov = window.AI_PROVIDERS[aiProvider.value] || window.AI_PROVIDERS.zhipu;
  const baseUrl = aiProvider.value === 'custom' ? aiBaseUrl.value.trim() : prov.baseUrl;
  const model = aiModel.value.trim() || prov.model || '';
  const apiKey = aiKey.value.trim();
  if (!apiKey) { aiTestResult.textContent = '请先填写 API Key'; return; }
  if (!baseUrl || !model) { aiTestResult.textContent = '请填写 Base URL / 模型名'; return; }
  const messages = [
    { role: 'system', content: '你是一个连接测试助手，只回复四个字：连接成功。' },
    { role: 'user', content: '测试' }
  ];
  let r = null;
  try { r = await petAPI.chatAI({ baseUrl, model, apiKey, messages }); } catch (e) { r = { error: '网络错误' }; }
  const txt = r && typeof r.content === 'string' ? r.content.trim() : '';
  if (txt) aiTestResult.textContent = '✅ ' + txt;
  else if (r && r.error) aiTestResult.textContent = '❌ ' + r.error;
  else aiTestResult.textContent = '❌ 连接失败（检查 Key / 网络 / 模型名）';
});

// 皮肤预设：静态迷你画布预览卡片
const swatchBox = document.getElementById('preset-swatches');

function renderSwatches() {
  swatchBox.innerHTML = '';
  const dpr = window.devicePixelRatio || 1;
  // 固定姿态的静态预览；scale 0.36 让最高（蓝耳兔耳朵）和最低（蕾米埃尔双马尾）都能装进 64×80 画布
  const POSE = { bob: 0, walking: false, eyeOpen: 1, sleeping: false, tailPhase: 0, emotion: 'normal' };
  Character.PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (p.id === S.preset ? ' active' : '');
    b.title = p.name;

    const c = document.createElement('canvas');
    c.width = 64 * dpr;
    c.height = 80 * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    Character.draw(g, 64, 80, 0, POSE, { kind: p.kind, palette: p.palette, scale: 0.36 });

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    b.append(c, name);

    b.addEventListener('click', () => { S.preset = p.id; save(); renderSwatches(); });
    swatchBox.appendChild(b);
  });
}

// 面板头部好感度徽标
function updateAffectionDisplay() {
  const el = document.getElementById('affection-display');
  if (!el) return;
  const a = S.affection || { score: 0 };
  const lv = window.Affection.levelOf(a.score);
  el.textContent = `${lv.emoji} ${a.score} ${lv.name}`;
}

// 桌宠形象：卡通角色 / 图片
const appearanceChar = document.getElementById('set-appearance-char');
const appearanceImg = document.getElementById('set-appearance-img');
const btnChangeImage = document.getElementById('btn-change-image');
const presetSwatchesEl = document.getElementById('preset-swatches');

appearanceChar.checked = S.appearance !== 'image';
appearanceImg.checked = S.appearance === 'image';

function syncAppearanceUI() {
  const isImg = appearanceImg.checked;
  btnChangeImage.style.display = isImg ? 'inline-block' : 'none';
  presetSwatchesEl.style.opacity = isImg ? 0.4 : 1;
}
appearanceChar.addEventListener('change', () => { S.appearance = 'character'; save(); syncAppearanceUI(); });
appearanceImg.addEventListener('change', () => { S.appearance = 'image'; save(); syncAppearanceUI(); });
btnChangeImage.addEventListener('click', async () => {
  const fname = await petAPI.pickImage();
  if (fname) {
    S.imageFile = fname;
    S.imageVersion = (S.imageVersion || 0) + 1; // 递增版本，桌宠据此重新加载图片
    save();
  }
});
syncAppearanceUI();

document.getElementById('btn-test-notify').addEventListener('click', () => {
  beep(880, 0.15);
  setTimeout(() => beep(660, 0.2, 0.12), 180);
  petAPI.notify('桌宠面板', '这是一条测试提醒：提示音 + 系统通知！');
});

// ---------- 知识库（记忆管理） ----------
const kbInput = document.getElementById('kb-input');
const kbList = document.getElementById('kb-list');

async function renderMemories() {
  let list = [];
  try { list = await petAPI.memoryList(); } catch (e) {}
  kbList.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '还没有记忆 ~ 在上面教它一句吧';
    kbList.appendChild(li);
    return;
  }
  for (const m of list) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'text';
    span.textContent = m.text;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.title = '删除这条记忆';
    del.addEventListener('click', async () => {
      try { await petAPI.memoryDel(m.id); } catch (e) {}
      renderMemories();
    });
    li.append(span, del);
    kbList.appendChild(li);
  }
}

document.getElementById('kb-add').addEventListener('click', async () => {
  const text = kbInput.value.trim();
  if (!text) return;
  try { await petAPI.memoryAdd(text); } catch (e) {}
  kbInput.value = '';
  renderMemories();
});
kbInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('kb-add').click(); });

// ---------- 启动 ----------
renderTodos();
renderSwatches();
renderMemories();
refreshPomo();
updateAffectionDisplay();

// 收到同步广播时刷新（桌宠/聊天窗口改了设置，立即反映到面板）
petAPI.onSync(() => {
  S = loadSettings();
  renderTodos();
  refreshPomo();
  chimeInput.checked = S.chime;
  pinInput.checked = S.pin;
  speakInput.checked = S.speak;
  aiEnabled.checked = S.ai.enabled;
  updateAffectionDisplay();
});

// 每秒重读一次设置：桌宠切换番茄钟阶段时，面板能同步显示
setInterval(() => {
  S = loadSettings();
  refreshPomo();
}, 1000);
