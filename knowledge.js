// ============================================================
// knowledge.js —— 桌宠知识库模块（纯本地，零依赖）
// 长期记忆：knowledge/memory.json（聊天命令写入）
// 个人资料库：knowledge/ 下的 .txt / .md 文件（用户自行放入）
// 检索：关键词打分（词 + 中文二元组），无分词依赖
// ============================================================

const fs = require('fs');
const path = require('path');

// 数据目录：开发时用项目内 knowledge/，打包后（只读临时目录）由 main 切换到用户目录
let KB_DIR = path.join(__dirname, 'knowledge');
const memFile = () => path.join(KB_DIR, 'memory.json');
const logFile = () => path.join(KB_DIR, 'chat-log.json');

function setKbDir(dir) {
  KB_DIR = dir;
  ensureDir();
}

function ensureDir() {
  try { fs.mkdirSync(KB_DIR, { recursive: true }); } catch (e) {}
}

// ---------- 长期记忆 ----------
function loadMemory() {
  try { return JSON.parse(fs.readFileSync(memFile(), 'utf8')) || []; } catch (e) { return []; }
}

function saveMemory(list) {
  ensureDir();
  try { fs.writeFileSync(memFile(), JSON.stringify(list, null, 2), 'utf8'); } catch (e) {}
}

function addMemory(text) {
  const list = loadMemory();
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    text: String(text || '').trim(),
    ts: new Date().toISOString()
  };
  if (!entry.text) return null;
  list.push(entry);
  saveMemory(list);
  return entry;
}

function delMemory(id) {
  const list = loadMemory().filter((x) => x.id !== id);
  saveMemory(list);
  return list.length;
}

function delByText(text) {
  const before = loadMemory();
  const after = before.filter((x) => !x.text.includes(String(text || '')));
  saveMemory(after);
  return before.length - after.length;
}

// ---------- 关键词检索 ----------
function termsOf(query) {
  const q = String(query || '').toLowerCase();
  const parts = q.split(/[\s，。！？、；：,.!?;:'"（）()【】\[\]——\-]+/).filter(Boolean);
  const bigrams = [];
  for (const p of parts) for (let i = 0; i < p.length - 1; i++) bigrams.push(p.slice(i, i + 2));
  return [...parts, ...bigrams];
}

function scoreText(text, terms) {
  let s = 0;
  for (const t of terms) if (t && text.includes(t)) s++;
  return s;
}

function searchMemory(query, limit = 3) {
  const terms = termsOf(query);
  return loadMemory()
    .map((m) => ({ ...m, score: scoreText(m.text, terms) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------- 个人资料库（.txt / .md） ----------
function listDocs() {
  ensureDir();
  const out = [];
  for (const f of fs.readdirSync(KB_DIR)) {
    // 跳过使用说明和临时/测试文件，避免被当资料喂给模型
    if (/^(?:_|使用说明)/.test(f)) continue;
    if (/\.(txt|md|markdown)$/i.test(f)) {
      try { out.push({ file: f, text: fs.readFileSync(path.join(KB_DIR, f), 'utf8') }); } catch (e) {}
    }
  }
  return out;
}

function chunkText(text, size = 600) {
  const clean = String(text || '').replace(/\r/g, '');
  const chunks = [];
  for (let i = 0; i < clean.length; i += size) chunks.push(clean.slice(i, i + size));
  return chunks;
}

function searchDocs(query, limit = 3) {
  const terms = termsOf(query);
  const hits = [];
  for (const doc of listDocs()) {
    for (const chunk of chunkText(doc.text)) {
      const score = scoreText(chunk, terms);
      if (score > 0) hits.push({ file: doc.file, snippet: chunk, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function kbQuery(query) {
  const q = String(query || '').trim();
  if (!q) return { memories: [], docs: [] };
  return { memories: searchMemory(q), docs: searchDocs(q) };
}

// ---------- 对话日志（聊天窗口持久化，重启恢复上下文） ----------
const LOG_MAX = 40;   // 与 chat.js 的 chatHistory 上限保持一致

function loadChatLog() {
  try { return JSON.parse(fs.readFileSync(logFile(), 'utf8')) || []; } catch (e) { return []; }
}

function saveChatLog(messages) {
  ensureDir();
  const arr = Array.isArray(messages) ? messages.slice(-LOG_MAX) : [];
  try { fs.writeFileSync(logFile(), JSON.stringify(arr, null, 2), 'utf8'); } catch (e) {}
}

function clearChatLog() {
  saveChatLog([]);
}

module.exports = {
  setKbDir, loadMemory, addMemory, delMemory, delByText, searchMemory, searchDocs, kbQuery,
  loadChatLog, saveChatLog, clearChatLog
};
