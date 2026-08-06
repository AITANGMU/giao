// ============================================================
// chat.js —— 独立聊天窗口：云端优先 / 本地规则兜底，多轮记忆
// ============================================================

const LS_KEY = 'pet.settings';

// 渲染层错误转发到主进程控制台，便于排查
window.addEventListener('error', (e) => {
  petAPI.log('聊天窗口错误:', e.message, 'at', e.filename, e.lineno);
});

function loadSettings() {
  const base = JSON.parse(JSON.stringify(window.PET_DEFAULTS));
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return Object.assign(base, saved, {
      pomodoro: Object.assign({}, base.pomodoro, saved.pomodoro || {}),
      pomo: Object.assign({}, base.pomo, saved.pomo || {}),
      ai: Object.assign({}, base.ai, saved.ai || {})
    });
  } catch (e) { return base; }
}

let S = loadSettings();
let preset = window.Character.getPreset(S.preset);
let isRemiel = false;

function refreshVoice() {
  preset = window.Character.getPreset(S.preset);
  window.LINES = window.VOICES[preset.voice] || window.VOICES.default;
  isRemiel = window.LINES === window.VOICES.remiel;
}
refreshVoice();

const messagesEl = document.getElementById('chat-messages');
const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');
const clearBtn = document.getElementById('chat-clear');

let chatHistory = [];   // 最近几轮对话（含持久化恢复）

// 窗口聚焦 / 收到同步广播时刷新设置、语音与状态条（换装扮立即生效）
function resync() {
  S = loadSettings();
  refreshVoice();
  updateCtxBar();
  refreshCtxMem();
}
window.addEventListener('focus', resync);
petAPI.onSync(resync);

// ---------- 渲染 ----------
function addMsg(role, text) {
  const row = document.createElement('div');
  row.className = 'msg ' + role;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'pet' ? '🐾' : '🙂';
  if (role === 'pet') avatar.style.background = preset.palette.body;
  const bub = document.createElement('div');
  bub.className = 'bubble-text';
  bub.textContent = text;
  row.append(avatar, bub);
  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bub;   // 返回气泡元素，供朗读高亮定位
}

const TYPING_TEXTS = ['正在输入…', '嗯…让我想想', '（思考中）', '让我组织一下语言…'];

// ---------- 情绪标记（大模型回复以 {情绪} 开头） ----------
const MOODS = { 开心: '😄', 平静: '😊', 困: '😪', 难过: '😢', 惊讶: '😲', 戏谑: '😏' };

function parseEmotion(text) {
  const m = String(text || '').match(/^\{([^}]+)\}\s*/);
  if (m && MOODS[m[1]]) return { emotion: m[1], text: String(text).slice(m[0].length) };
  return { emotion: '平静', text: String(text || '') };
}

function applyEmotion(bub, emotion) {
  if (bub) bub.dataset.emotion = emotion || '平静';
  if (MOODS[emotion]) petAPI.setMood(emotion);   // 通知桌宠本体显示情绪徽标
}

// ---------- 长会话摘要压缩（聊久不丢上下文） ----------
const MAX_HIST = 24;
const KEEP_RECENT = 12;

async function maybeSummarize() {
  try {
    const nonSys = chatHistory.filter((m) => m.role !== 'system');
    if (nonSys.length <= MAX_HIST) return;
    const keep = nonSys.slice(-KEEP_RECENT);
    const old = nonSys.slice(0, nonSys.length - KEEP_RECENT);
    const existing = chatHistory.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const oldText = (existing ? '【已有摘要】' + existing + '\n' : '') +
      old.map((m) => (m.role === 'user' ? '用户：' : '桌宠：') + m.content).join('\n');
    let summary = null;
    if (S.ai && S.ai.enabled && (S.ai.apiKey || '').trim()) {
      const r = await petAPI.chatAI({
        ...aiCfg(),
        messages: [
          { role: 'system', content: '把下面的对话压缩成 100 字以内的摘要，保留关键信息（用户身份、偏好、答应的事、聊过的话题）。只输出摘要正文，不要解释。' },
          { role: 'user', content: oldText }
        ]
      });
      if (r && typeof r.content === 'string' && r.content.trim()) summary = r.content.trim().slice(0, 300);
    }
    chatHistory = [
      ...(summary ? [{ role: 'system', content: '【较早对话摘要】' + summary }] : []),
      ...keep
    ];
    persistHistory();
  } catch (e) {}
}

// ---------- 主动找话题：上下文开场 + 冷场主动 ----------
let lastUserAt = Date.now();
let lastProactiveAt = 0;

function markInteraction() { lastUserAt = Date.now(); }

async function generateGreeting() {
  if (!(S.ai && S.ai.enabled && (S.ai.apiKey || '').trim())) return null;
  try {
    const r = await petAPI.chatAI({
      ...aiCfg(),
      messages: [
        { role: 'system', content: '你是桌面宠物，用一句口语化、自然亲切的开场白跟用户打招呼，结合当前时间、待办和记忆，25字以内，不用情绪标记。' },
        { role: 'user', content: '打个招呼吧' }
      ]
    });
    return r && typeof r.content === 'string' && r.content.trim() ? parseEmotion(r.content).text.trim() : null;
  } catch (e) { return null; }
}

async function generateProactiveText() {
  if (S.ai && S.ai.enabled && (S.ai.apiKey || '').trim()) {
    try {
      const r = await petAPI.chatAI({
        ...aiCfg(),
        messages: [
          { role: 'system', content: '你是桌面宠物。用户有一阵子没说话了，主动说一句关心或找话题的话，结合当前时间/待办/记忆，口语自然，30字以内，不用情绪标记，不要质问。' },
          { role: 'user', content: '说点什么吧' }
        ]
      });
      const t = r && typeof r.content === 'string' ? r.content.trim() : null;
      if (t) return t;
    } catch (e) {}
  }
  return window.Lines.pick('chat');   // 规则兜底
}

async function maybeProactive() {
  try {
    if (busy || !document.hasFocus()) return;
    const now = Date.now();
    if (now - lastUserAt < 5 * 60000) return;
    if (now - lastProactiveAt < 5 * 60000) return;
    lastProactiveAt = now;
    const text = await generateProactiveText();
    addMsg('pet', text);
    chatHistory.push({ role: 'assistant', content: text });
    if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
    persistHistory();
    speakText(text, messagesEl.querySelector('.msg.pet:last-child .bubble-text'));
  } catch (e) {}
}
setInterval(maybeProactive, 60000);

function showTyping(text) {
  const label = text || TYPING_TEXTS[Math.floor(Math.random() * TYPING_TEXTS.length)];
  const row = document.getElementById('typing');
  if (row) {
    row.querySelector('.bubble-text').textContent = label;
    return;
  }
  const r = document.createElement('div');
  r.id = 'typing';
  r.className = 'msg pet';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = '🐾';
  avatar.style.background = preset.palette.body;
  const bub = document.createElement('div');
  bub.className = 'bubble-text';
  bub.textContent = label;
  r.append(avatar, bub);
  messagesEl.appendChild(r);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

// ---------- 对话历史持久化（重启恢复） ----------
async function persistHistory() {
  try { await petAPI.chatLogSave(chatHistory); } catch (e) {}
}

// 返回是否恢复到了历史记录
async function restoreHistory() {
  try {
    const log = await petAPI.chatLogGet();
    if (!Array.isArray(log) || !log.length) return false;
    // 过滤非法条目，角色白名单校验
    const valid = log
      .filter((m) => m && typeof m === 'object' && ['user', 'assistant', 'system'].includes(m.role) && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content }));
    if (!valid.length) return false;
    chatHistory = valid.slice(-40);
    // 渲染最近 6 轮；system（较早对话摘要）只进上下文，不渲染为气泡
    for (const m of chatHistory.slice(-12)) {
      if (m.role === 'system') continue;
      addMsg(m.role === 'user' ? 'user' : 'pet', m.content);
    }
    return true;
  } catch (e) { return false; }
}

async function clearHistory() {
  if (busy) return;   // 流式中禁止清空，避免残留孤立消息
  chatHistory = [];
  messagesEl.innerHTML = '';
  try { await petAPI.chatLogClear(); } catch (e) {}
  addMsg('pet', isRemiel ? '记忆已清空。夜访者，我们重新开始。' : '好啦，我们重新开始聊~');
}

// ---------- 语音朗读（系统自带 TTS，离线；第 0 层拟人化） ----------
// 音色优先级：神经语音（晓晓/云希等） > 传统语音（Huihui 等）
const VOICE_PRIORITY = ['xiaoxiao', 'xiaoyi', 'yunxi', 'yunjian', 'yunyang', 'huihui', 'kangkang', 'yaoyao'];
let zhVoice = null;
if ('speechSynthesis' in window) {
  const pickVoice = () => {
    const zh = window.speechSynthesis.getVoices().filter((v) => /^zh/i.test(v.lang));
    zhVoice = null;
    for (const key of VOICE_PRIORITY) {
      const hit = zh.find((v) => v.name.toLowerCase().includes(key));
      if (hit) { zhVoice = hit; break; }
    }
    if (!zhVoice && zh.length) zhVoice = zh[0];
  };
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;   // 语音列表就绪后缓存中文语音
}

// 数字转中文（用于百分比等，支持 0~9999；50 → 五十，不是五零）
function numToCn(n) {
  if (!/^\d+$/.test(n) || n.length > 4) return n;
  const num = Number(n);
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (num === 0) return '零';
  if (num < 10) return digits[num];
  if (num < 20) return '十' + (num % 10 ? digits[num % 10] : '');
  if (num < 100) {
    const t = Math.floor(num / 10);
    const o = num % 10;
    return digits[t] + '十' + (o ? digits[o] : '');
  }
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const r = num % 100;
    let s = digits[h] + '百';
    if (!r) return s;
    return s + (r < 10 ? '零' + digits[r] : numToCn(String(r)));
  }
  const th = Math.floor(num / 1000);
  const r = num % 1000;
  let s = digits[th] + '千';
  if (!r) return s;
  return s + (r < 100 ? '零' + numToCn(String(r)) : numToCn(String(r)));
}

// 朗读前文本预处理：去 emoji/链接、百分比/小数/符号转中文读音
function preprocessForSpeech(s) {
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}\u{1F900}-\u{1F9FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{200D}]/gu, ' ')
    .replace(/https?:\/\/\S+/gi, '链接')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, (m, n) => {
      const [i, d] = n.split('.');
      return '百分之' + numToCn(i) + (d ? '点' + numToCn(d) : '');
    })
    .replace(/(\d+)\.(\d+)/g, '$1点$2')
    .replace(/×/g, '乘')
    .replace(/[＋+]/g, '加')
    .replace(/=/g, '等于')
    .replace(/[<>]/g, (m) => (m === '>' ? '大于' : '小于'))
    .replace(/&/g, '和')
    .replace(/℃/g, '摄氏度')
    .replace(/°/g, '度')
    .replace(/[—–]/g, '，')
    .replace(/[（()）【】\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 按句读拆段：句号/感叹/问号/分号/换行必断，逗号处超过约 24 字也断
function splitSegments(text) {
  const raw = String(text).trim();
  if (!raw) return [];
  const parts = raw.split(/(?<=[。！？!?；;\n])|(?<=[，,、])/);
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (!p) continue;
    cur += p;
    if (cur.length >= 24 || /[。！？!?；;\n]/.test(p)) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur) out.push(cur);
  return out
    .map((seg) => ({ raw: seg, spoken: preprocessForSpeech(seg) }))
    .filter((s) => s.spoken);
}

function stopSpeaking() {
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
}

function makeUtterance(text) {
  const u = new SpeechSynthesisUtterance(text);
  if (zhVoice) u.voice = zhVoice;
  u.lang = zhVoice ? zhVoice.lang : 'zh-CN';
  u.rate = 0.95;                       // 稍慢，更自然
  u.pitch = isRemiel ? 0.9 : 1.05;
  return u;
}

// 气泡逐段高亮：正在朗读的段落加底色，读完还原
function highlightSegment(bubbleEl, segments, idx) {
  if (!bubbleEl) return;
  const full = bubbleEl.dataset.raw || bubbleEl.textContent;
  let start = 0;
  for (let i = 0; i < idx; i++) start += segments[i].raw.length;
  const seg = segments[idx].raw;
  bubbleEl.textContent = '';
  bubbleEl.append(
    document.createTextNode(full.slice(0, start)),
    (() => {
      const mark = document.createElement('span');
      mark.className = 'speak-highlight';
      mark.textContent = seg;
      return mark;
    })(),
    document.createTextNode(full.slice(start + seg.length))
  );
}

function clearHighlight(bubbleEl) {
  if (!bubbleEl) return;
  const raw = bubbleEl.dataset.raw;
  if (raw) bubbleEl.textContent = raw;
}

// 朗读回复：思考停顿 → 分段朗读（段间换气停顿）→ 逐段高亮同步
function speakText(text, bubbleEl) {
  try {
    if (!S.speak || !('speechSynthesis' in window) || !text) return;
    const segments = splitSegments(text);
    if (!segments.length) return;
    if (bubbleEl) bubbleEl.dataset.raw = String(text);
    setTimeout(() => {
      stopSpeaking();
      let i = 0;
      const next = () => {
        if (i >= segments.length) { clearHighlight(bubbleEl); return; }
        highlightSegment(bubbleEl, segments, i);
        const u = makeUtterance(segments[i].spoken);
        u.onend = () => { i++; setTimeout(next, 420); };
        u.onerror = () => { i++; setTimeout(next, 420); };
        window.speechSynthesis.speak(u);
      };
      next();
    }, 350);   // 思考停顿
  } catch (e) {}
}

// ---------- AI 请求 ----------
function aiCfg() {
  const prov = window.AI_PROVIDERS && window.AI_PROVIDERS[S.ai.provider]
    ? window.AI_PROVIDERS[S.ai.provider]
    : window.AI_PROVIDERS.zhipu;
  return {
    baseUrl: S.ai.provider === 'custom' ? (S.ai.baseUrl || '').trim() : prov.baseUrl,
    model: (S.ai.model || '').trim() || prov.model,
    apiKey: (S.ai.apiKey || '').trim()
  };
}

function aiSystemPrompt() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  // 状态注入：待办列表 + 番茄钟状态
  const pendingTodos = S.todos.filter((x) => !x.done).slice(0, 5);
  const todoPart = pendingTodos.length
    ? '用户待办：' + pendingTodos.map((t, i) => `${i + 1}. ${t.text}`).join('；')
    : '用户暂无待办';
  const pm = S.pomo;
  let pomoPart = '未开番茄钟';
  if (pm.running) {
    if (pm.paused) {
      pomoPart = `番茄钟${pm.phase === 'work' ? '工作' : '休息'}已暂停`;
    } else {
      const left = Math.max(0, Math.round((pm.endAt - Date.now()) / 60000));
      pomoPart = `番茄钟${pm.phase === 'work' ? '工作中' : '休息中'}，还剩约 ${left} 分钟`;
    }
  }
  // 口语化：去掉"不超过60字"硬限制，像朋友一样自然；并约定情绪标记
  const base = `现在是 ${hh}:${mm}。${todoPart}。${pomoPart}。像朋友聊天一样自然：长短随意，用口语和语气词，偶尔带一点小表情；别说"好的呢/没问题/作为AI助手"这类AI腔；合适时自然地问回一句"你呢？"。遇到信息不足或复杂的问题时，先自己联网搜索再回答，不要反问用户来确认信息（不要说"你想知道哪方面？"这类话）。回复请以情绪标记开头（任选其一）{开心}{平静}{困}{难过}{惊讶}{戏谑}，紧跟正文，正文不再重复标记。`;
  if (window.LINES === window.VOICES.remiel) {
    return `你是${S.name}，一个桌面宠物。你的人设是《绝区零》的蕾米埃尔·丹：初代虚狩、被通缉，神秘狡黠爱戏谑、优雅、信守承诺、与时代脱节，喜欢问答游戏。${base}`;
  }
  return `你是${S.name}，一个可爱的桌面宠物，会卖萌、关心主人喝水休息、爱鼓励主人。${base}`;
}

// ---------- 联网搜索：复杂/分析类问题更倾向联网搜索作答 ----------
const FORCE_SEARCH = /搜索|查一下|查查|帮我查|上网查|搜一下|查一查/i;
// 分析/比较/评价类复杂词 → 必搜
const COMPLEX_QUERY = /比较|对比|分析|评价|怎么样|值不值得|好不好|怎么选|选哪个|排行|排名|榜单|攻略|推荐|最新|新闻|价格|多少钱|区别|哪款|哪个好|vs|compare|best|top|review|guide|tutorial|哪些|有哪些|需要|适合|怎么办|是什么|为什么|如何|多少|谁|哪个|哪里|什么|怎么/i;
// 明显闲聊 → 不搜
const SIMPLE_CHAT = /^(你好|hi|hello|嗨|哈喽|在吗|在不在|早上好|中午好|晚上好|谢谢|谢谢你|再见|拜拜|晚安|哈哈|嗯|嗯嗯|好的|好呀|辛苦|加油|嘿嘿|嘻嘻|拜|886)/i;
// 长句但带疑问/意图 → 倾向搜
const QUESTION_LIKE = /吗|呢|是不是|要不要|应该|怎么|怎样|哪|为什|几|？|\?/;

function shouldSearch(text) {
  const t = String(text || '').trim();
  if (FORCE_SEARCH.test(t)) return true;
  if (!t || SIMPLE_CHAT.test(t)) return false;
  if (COMPLEX_QUERY.test(t)) return true;
  if (t.length >= 12 && QUESTION_LIKE.test(t)) return true;
  return false;
}

// 大模型反问用户（没资料却让用户澄清）的痕迹 → 触发补搜
const CLARIFY_HINT = /你想问|哪个方面|能具体说|详细说说|你想知道|请提供更多|需要更多信息|我不太确定你|能再说清楚|可以说得具体点|是哪一个/i;

// ---------- 记忆命令：教它记住 / 忘掉 / 查看 ----------
function parseCommand(t) {
  let m = t.match(/^记住[\s：:,，]*(.+)$/);
  if (m && m[1].trim()) return { type: 'remember', text: m[1].trim() };
  m = t.match(/^(?:忘掉|忘记|忘了)[\s：:,，]*(.+)$/);
  if (m && m[1].trim()) return { type: 'forget', text: m[1].trim() };
  if (/^(?:你记得什么|你有什么记忆|记忆列表|我的记忆|知识库)$/.test(t)) return { type: 'list' };
  return null;
}

async function handleCommand(cmd) {
  if (cmd.type === 'remember') {
    const entry = await petAPI.memoryAdd(cmd.text);
    const list = await petAPI.memoryList();
    return entry ? `好，我记住了：「${entry.text}」（现在共 ${list.length} 条记忆）` : '抱歉，没听清要记住什么。';
  }
  if (cmd.type === 'forget') {
    const n = await petAPI.memoryDelText(cmd.text);
    return n > 0 ? `好，删掉了关于「${cmd.text}」的 ${n} 条记忆。` : `我好像没记住关于「${cmd.text}」的事。`;
  }
  if (cmd.type === 'list') {
    const list = await petAPI.memoryList();
    if (!list.length) return '我还没有任何记忆呢。你可以对我说「记住：……」我会一直记着。';
    return `我记得这些（共 ${list.length} 条）：\n` + list.slice(0, 10).map((m, i) => `${i + 1}. ${m.text}`).join('\n');
  }
  return '';
}

// ---------- 设置保存（工具调用会改动待办/番茄钟） ----------
function saveSettings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
  petAPI.notifyStateChanged();
}

// ---------- 大模型工具调用 ----------
const TOOLS = [
  { type: 'function', function: { name: 'create_todo', description: '为用户添加一条待办事项', parameters: { type: 'object', properties: { text: { type: 'string', description: '待办内容' } }, required: ['text'] } } },
  { type: 'function', function: { name: 'start_pomodoro', description: '启动一个番茄钟工作时段', parameters: { type: 'object', properties: { minutes: { type: 'number', description: '工作时长（分钟）' } }, required: ['minutes'] } } },
  { type: 'function', function: { name: 'query_knowledge', description: '搜索桌宠的长期记忆和个人资料库', parameters: { type: 'object', properties: { query: { type: 'string', description: '要检索的关键词' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'get_time', description: '获取当前日期和时间', parameters: { type: 'object', properties: {} } } }
];

async function runTool(name, args) {
  try {
    if (name === 'create_todo') {
      const text = String(args.text || '').trim();
      if (!text) return '待办内容为空';
      S.todos.push({ id: Date.now() + Math.random(), text, done: false, remindAt: 0, notified: false });
      saveSettings();
      return `已添加待办：「${text}」，目前共 ${S.todos.length} 件待办`;
    }
    if (name === 'start_pomodoro') {
      const min = Math.max(1, Math.round(Number(args.minutes) || 25));
      Object.assign(S.pomo, { running: true, paused: false, phase: 'work', endAt: Date.now() + min * 60000, remaining: 0 });
      saveSettings();
      return `已启动 ${min} 分钟番茄钟`;
    }
    if (name === 'query_knowledge') {
      const r = await petAPI.kbQuery(String(args.query || ''));
      const mems = (r.memories || []).map((m) => m.text);
      const docs = (r.docs || []).map((d) => `[${d.file}] ${d.snippet}`);
      return mems.length || docs.length ? [...mems, ...docs].slice(0, 5).join('\n') : '没有找到相关内容';
    }
    if (name === 'get_time') {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    return '未知工具';
  } catch (e) { return '工具执行失败: ' + (e && e.message); }
}

const TOOL_INTENT = /待办|番茄钟|提醒我|加一个|加个|添加|建一个|建个|定一个|定个|开个番茄|设个|设定|现在几点|几点了|现在时间|几点钟/;
function needsTool(t) { return TOOL_INTENT.test(t); }

// ---------- 本地知识库上下文 ----------
async function getKctx(t) {
  try {
    const kb = await petAPI.kbQuery(t);
    if (!kb.memories.length && !kb.docs.length) return '';
    let s = '\n\n长期记忆（你记住的关于用户的事，回答时参考）：\n' + kb.memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n');
    if (kb.docs.length) s += '\n\n个人资料库相关片段：\n' + kb.docs.map((d, i) => `[${d.file}] ${d.snippet}`).join('\n');
    return s;
  } catch (e) { return ''; }
}

// ---------- 流式对话（普通闲聊走这条，逐字渲染） ----------
function chatStream(sys) {
  return new Promise((resolve) => {
    let full = '';
    let emotion = null;
    const row = document.createElement('div');
    row.className = 'msg pet';
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = '🐾';
    avatar.style.background = preset.palette.body;
    const bub = document.createElement('div');
    bub.className = 'bubble-text';
    row.append(avatar, bub);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const stripToken = () => {
      const m = full.match(/^\{([^}]+)\}/);
      if (m) {
        if (MOODS[m[1]]) emotion = m[1];
        return full.slice(m[0].length);
      }
      return full;
    };
    const onToken = (chunk) => {
      full += chunk;
      // 情绪标记未完整时先不显示，避免露出 {开心
      bub.textContent = full.startsWith('{') && !/^\{[^}]*\}/.test(full) ? '' : stripToken();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };
    const onDone = (final) => {
      const raw = final && final.trim() ? final : full.trim();
      if (!raw) { resolve(null); return; }
      const p = parseEmotion(raw);
      if (!emotion) emotion = p.emotion;
      const clean = p.text.trim();
      bub.dataset.raw = clean;
      bub.textContent = clean;
      resolve({ text: clean, emotion: emotion || '平静' });
    };
    const onError = (msg) => {
      if (row.parentNode) row.parentNode.removeChild(row);   // 失败时移除空气泡
      resolve({ error: msg || '连接失败' });
    };
    petAPI.onChatToken(onToken);
    petAPI.onChatDone(onDone);
    petAPI.onChatError(onError);
    petAPI.chatAIStart({ ...aiCfg(), messages: [{ role: 'system', content: sys }, ...chatHistory] });
  });
}

// ---------- 带工具对话（动作类请求走这条，≤3 轮） ----------
async function chatWithTools(sys) {
  const msgs = [{ role: 'system', content: sys }, ...chatHistory];
  let toolUsed = false;
  let reply = null;
  let error = null;
  for (let i = 0; i < 3; i++) {
    let resp = null;
    try { resp = await petAPI.chatAI({ ...aiCfg(), messages: msgs, tools: TOOLS }); } catch (e) { resp = { error: '网络错误' }; }
    if (!resp) break;
    if (resp.error) { error = resp.error; break; }
    if (Array.isArray(resp.tool_calls) && resp.tool_calls.length) {
      toolUsed = true;
      msgs.push({ role: 'assistant', content: resp.content || '', tool_calls: resp.tool_calls });
      for (const tc of resp.tool_calls) {
        const fn = tc.function || {};
        let args = {};
        try { args = JSON.parse(fn.arguments || '{}') || {}; } catch (e) {}
        const result = await runTool(fn.name, args);
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: String(result) });
      }
      continue;
    }
    if (typeof resp.content === 'string' && resp.content.trim()) reply = resp.content.trim();
    break;
  }
  return { reply, toolUsed, error };
}

// ---------- 自动记忆：对话中自动记住你告诉它的事 ----------
const FACT_HINT = /我(?:是|叫|住在|在|喜欢|最爱|讨厌|养|养了|做|用|工作|家在|来自|名字|生日|毕业|结婚|会|不会)/;
function looksLikeFact(t) { return FACT_HINT.test(t); }

async function maybeAutoMemorize(userText) {
  if (!(S.ai && S.ai.enabled && (S.ai.apiKey || '').trim())) return;
  try {
    const r = await petAPI.chatAI({
      ...aiCfg(),
      messages: [
        { role: 'system', content: '你负责从用户的话里提取值得长期记住的事实（身份、偏好、习惯、个人信息）。若存在，只输出这一条事实本身，不要解释；若不存在，只输出 SKIP。' },
        { role: 'user', content: userText }
      ]
    });
    const fact = r && typeof r.content === 'string' ? r.content.trim() : '';
    if (fact && fact !== 'SKIP' && fact.length < 100) {
      await petAPI.memoryAdd(fact);
      addMsg('pet', `（我记下了：${fact}）`);
    }
  } catch (e) {}
}

// ---------- 发送 ----------
let busy = false;

async function send(text) {
  const t = (text || '').trim();
  if (!t || busy) return;
  stopSpeaking();   // 新消息打断正在朗读的上一条回复
  busy = true;
  input.disabled = true;
  sendBtn.disabled = true;
  clearBtn.disabled = true;
  let toolUsed = false;
  try {
    input.value = '';
    addMsg('user', t);

    // 记忆命令：不经过 AI / 规则（确认语也朗读，不入历史）
    const cmd = parseCommand(t);
    if (cmd) {
      hideTyping();
      const confirmation = await handleCommand(cmd);
      speakText(confirmation, addMsg('pet', confirmation));
      return;
    }

    chatHistory.push({ role: 'user', content: t });
    const cloudAvailable = !!(S.ai && S.ai.enabled && (S.ai.apiKey || '').trim());
    let reply = null;
    let emotion = '平静';
    let cloudError = null;
    let searchedThisTurn = false;
    if (cloudAvailable) {
      showTyping('正在翻找记忆…');
      const kctx = await getKctx(t);
      let searchCtx = '';
      if (shouldSearch(t)) {
        searchedThisTurn = true;
        showTyping('正在搜索资料…');
        let results = [];
        try { results = await petAPI.webSearch(t); } catch (e) { results = []; }
        if (results && results.length) {
          searchCtx = '\n\n网络搜索到的资料（回答时优先参考，可在回答末尾附来源链接）：\n' +
            results.map((r, i) => `${i + 1}. 标题：${r.title}\n   摘要：${r.snippet}\n   来源：${r.url}`).join('\n');
        }
      }
      const sys = aiSystemPrompt() + kctx + searchCtx;

      hideTyping();
      if (needsTool(t)) {
        showTyping('正在处理…');
        const r = await chatWithTools(sys);
        reply = r.reply;
        toolUsed = r.toolUsed;
        if (r.error) cloudError = r.error;
        hideTyping();
        if (reply) {
          const p = parseEmotion(reply);
          reply = p.text;
          emotion = p.emotion;
          addMsg('pet', reply);   // 工具路径：补气泡
        }
      } else {
        const r = await chatStream(sys);      // 流式气泡已在 chatStream 内创建
        if (r) {
          if (r.error) cloudError = r.error;
          else { reply = r.text; emotion = r.emotion; }
        }
      }
    }

    // 云端失败或未启用 → 本地规则兜底（失败时带一句提示）
    if (!reply) {
      const fallback = window.Lines.chatReply(t, { name: S.name });
      const reason = cloudError ? `：${cloudError}` : '';
      reply = (cloudAvailable ? `（云端没连上${reason}，先用本地知识回答）` : '') + fallback;
      addMsg('pet', reply);
    }

    // 反问兜底：大模型没资料却反问用户时，补一次搜索再作答（而不是反问）
    if (reply && cloudAvailable && !searchedThisTurn && CLARIFY_HINT.test(reply)) {
      // 先记住目标气泡（排除 typing 提示），避免 showTyping 后选中错元素
      const targetBub = messagesEl.querySelector('.msg.pet:not(#typing):last-child .bubble-text');
      showTyping('正在查资料…');
      let results = [];
      try { results = await petAPI.webSearch(t); } catch (e) { results = []; }
      if (results && results.length) {
        const ctx2 = '\n\n网络搜索到的资料（回答时优先参考，可在回答末尾附来源链接）：\n' +
          results.map((r, i) => `${i + 1}. 标题：${r.title}\n   摘要：${r.snippet}\n   来源：${r.url}`).join('\n');
        let r2 = null;
        try { r2 = await petAPI.chatAI({ ...aiCfg(), messages: [{ role: 'system', content: aiSystemPrompt() + ctx2 }, ...chatHistory] }); } catch (e) {}
        if (r2 && typeof r2.content === 'string' && r2.content.trim() && !CLARIFY_HINT.test(r2.content)) {
          const p2 = parseEmotion(r2.content);
          reply = p2.text;
          emotion = p2.emotion;
          if (targetBub) { targetBub.textContent = reply; targetBub.dataset.raw = reply; }
        }
      }
      hideTyping();
    }

    // 统一：assistant 回复进历史（云端 / 规则 / 兜底都算数）
    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);

    hideTyping();
    persistHistory();
    const bub = messagesEl.querySelector('.msg.pet:not(#typing):last-child .bubble-text');
    applyEmotion(bub, emotion);   // 气泡样式 + 桌宠情绪徽标
    speakText(reply, bub);
    markInteraction();
    maybeSummarize();   // 长会话后台压缩（不阻塞）
  } finally {
    busy = false;
    input.disabled = false;
    sendBtn.disabled = false;
    clearBtn.disabled = false;
    input.focus();
  }
  // 自动记忆：不阻塞输入，后台抽一句值得记的
  if (!toolUsed && looksLikeFact(t)) maybeAutoMemorize(t);
}

function submit() { send(input.value); }
sendBtn.addEventListener('click', submit);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); submit(); }
});

// 开场白（若有历史则恢复并欢迎回来；恢复期间禁用输入，避免竞态）
(async () => {
  busy = true;
  input.disabled = true;
  sendBtn.disabled = true;
  const had = await restoreHistory();
  busy = false;
  input.disabled = false;
  sendBtn.disabled = false;
  if (had) {
    addMsg('pet', isRemiel ? '欢迎回来，夜访者。我们接着聊。' : '欢迎回来！我们接着聊~');
  } else {
    const opening = await generateGreeting();   // 云端可用时生成贴合当下的开场
    if (opening) {
      addMsg('pet', opening);
      chatHistory.push({ role: 'assistant', content: opening });
      persistHistory();
    } else {
      addMsg('pet', isRemiel
        ? `我是${S.name}。夜访者，你想问些什么？`
        : `你好呀，我是${S.name}！和我说说话吧~`);
    }
  }
  updateCtxBar();
  refreshCtxMem();
  input.focus();
})();

// 清空对话记录
document.getElementById('chat-clear').addEventListener('click', clearHistory);

// ---------- 上下文状态条（显示它"知道什么"） ----------
const ctxBar = document.getElementById('ctx-bar');
let ctxMemCount = 0;

function updateCtxBar() {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const todoN = S.todos.filter((x) => !x.done).length;
    const pm = S.pomo;
    let pomo = '🍅 未开';
    if (pm.running) {
      if (pm.paused) pomo = `🍅 ${pm.phase === 'work' ? '工作' : '休息'}暂停`;
      else {
        const left = Math.max(0, Math.round((pm.endAt - Date.now()) / 60000));
        pomo = `🍅 ${pm.phase === 'work' ? '工作中' : '休息中'} ${left}分`;
      }
    }
    ctxBar.textContent = `🕐 ${hh}:${mm} · ✅ 待办 ${todoN} · ${pomo} · 🧠 记忆 ${ctxMemCount}`;
  } catch (e) {}
}

async function refreshCtxMem() {
  try { ctxMemCount = (await petAPI.memoryList()).length; updateCtxBar(); } catch (e) {}
}

// 桌宠主动消息：进入对话记录、可被朗读、供大模型引用
petAPI.onChatProactive(async (text) => {
  if (!text) return;
  lastProactiveAt = Date.now();   // 重置冷场主动的冷却
  addMsg('pet', text);
  chatHistory.push({ role: 'assistant', content: text });
  if (chatHistory.length > 40) chatHistory.splice(0, chatHistory.length - 40);
  persistHistory();
  speakText(text, messagesEl.querySelector('.msg.pet:last-child .bubble-text'));
});

setInterval(updateCtxBar, 30000);   // 时间刷新
