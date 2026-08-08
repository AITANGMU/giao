const { app, BrowserWindow, ipcMain, Menu, Notification, screen, Tray, nativeImage, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { bingSearch } = require('./search.js');
const kb = require('./knowledge.js');

// 透明窗口在部分 Windows 显卡上需要关闭硬件加速，否则背景会发黑
app.disableHardwareAcceleration();
app.setAppUserModelId('com.visualpet.app');

// 桌宠窗口尺寸（横向留一点余量放气泡）
const PET_W = 220;
const PET_H = 280;

let petWin = null;
let panelWin = null;
let chatWin = null;
let tray = null;

// 置顶 / 整点报时状态（与右键菜单勾选态保持一致）
const uiState = { pin: true, chime: false };

// ---------- 工具 ----------

// 把窗口坐标钳制在当前显示工作区内，防止桌宠跑出屏幕
function clampToWorkArea(x, y) {
  const wa = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
  const cx = Math.min(Math.max(Math.round(x), wa.x), wa.x + wa.width - PET_W);
  const cy = Math.min(Math.max(Math.round(y), wa.y), wa.y + wa.height - PET_H);
  return { x: cx, y: cy };
}

function buildPetMenu() {
  return [
    { label: '打开面板', click: () => { if (petWin) petWin.webContents.send('menu-action', 'panel'); } },
    { label: '说句话', click: () => { if (petWin) petWin.webContents.send('menu-action', 'say'); } },
    { label: '对话', click: () => { if (petWin) petWin.webContents.send('menu-action', 'chat'); } },
    { label: '喂食 🍪', click: () => { if (petWin) petWin.webContents.send('menu-action', 'feed'); } },
    { label: '洗澡 🫧', click: () => { if (petWin) petWin.webContents.send('menu-action', 'clean'); } },
    { type: 'separator' },
    {
      label: '整点报时', type: 'checkbox', checked: uiState.chime,
      click: (item) => { if (petWin) petWin.webContents.send('menu-action', 'chime', item.checked); }
    },
    {
      label: '置顶显示', type: 'checkbox', checked: uiState.pin,
      click: (item) => { if (petWin) petWin.webContents.send('menu-action', 'pin', item.checked); }
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ];
}

// ---------- 窗口 ----------

function createPetWindow() {
  petWin = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    alwaysOnTop: uiState.pin,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  petWin.setAlwaysOnTop(uiState.pin, 'screen-saver');
  petWin.setMenu(null);
  petWin.loadFile(path.join(__dirname, 'renderer', 'pet.html'));
  petWin.webContents.on('did-fail-load', (_e, code, desc) => console.error('[pet] 加载失败', code, desc));
  petWin.on('closed', () => { petWin = null; });
}

function createPanelWindow() {
  if (panelWin && !panelWin.isDestroyed()) { panelWin.show(); panelWin.focus(); return; }
  panelWin = new BrowserWindow({
    width: 380,
    height: 560,
    title: '桌宠面板',
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  panelWin.setMenu(null);
  panelWin.loadFile(path.join(__dirname, 'renderer', 'panel.html'));
  panelWin.on('closed', () => { panelWin = null; });
}

function createChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) { chatWin.show(); chatWin.focus(); return; }
  chatWin = new BrowserWindow({
    width: 340,
    height: 480,
    title: '与桌宠聊天',
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  chatWin.setMenu(null);
  chatWin.loadFile(path.join(__dirname, 'renderer', 'chat.html'));
  chatWin.on('closed', () => { chatWin = null; });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (img.isEmpty()) return; // 图标缺失时跳过托盘，不阻塞启动
  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip('虚拟桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '显示桌宠',
      click: () => { if (petWin && !petWin.isDestroyed()) petWin.show(); else createPetWindow(); }
    },
    { label: '打开面板', click: createPanelWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
}

// ---------- IPC ----------

// 移动桌宠窗口（渲染层拖拽 / 散步）
ipcMain.on('pet:move', (_e, x, y) => {
  if (!petWin) return;
  const p = clampToWorkArea(x, y);
  petWin.setPosition(p.x, p.y);
});

ipcMain.handle('pet:get-pos', () => (petWin ? petWin.getPosition() : [0, 0]));

ipcMain.handle('pet:get-work-area', () => {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x, y: wa.y, width: wa.width, height: wa.height };
});

ipcMain.on('pet:quit', () => app.quit());

ipcMain.on('pet:notify', (_e, title, body) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
});

ipcMain.on('pet:set-pin', (_e, on) => {
  uiState.pin = !!on;
  if (petWin) petWin.setAlwaysOnTop(on, 'screen-saver');
});

// 右键菜单：popup 使用屏幕坐标
ipcMain.on('pet:menu', (_e, pos) => {
  Menu.buildFromTemplate(buildPetMenu()).popup({ x: pos.x, y: pos.y });
});

// 菜单勾选态与渲染层双向同步
ipcMain.on('menu:set-check', (_e, s) => {
  uiState.chime = !!s.chime;
  uiState.pin = !!s.pin;
});

ipcMain.on('panel:open', createPanelWindow);
ipcMain.on('chat:open', createChatWindow);

// 桌宠主动消息 → 转发给聊天窗口（若已打开）
ipcMain.on('chat:notify', (_e, text) => {
  if (chatWin && !chatWin.isDestroyed() && typeof text === 'string' && text.trim()) {
    chatWin.webContents.send('chat:proactive', text.trim());
  }
});

// 聊天窗口情绪 → 转发给桌宠本体（显示情绪徽标）
ipcMain.on('pet:set-mood', (_e, emotion) => {
  if (petWin && !petWin.isDestroyed() && typeof emotion === 'string') {
    petWin.webContents.send('mood', emotion);
  }
});

// 任一窗口保存设置后，广播给所有窗口保持同步
function broadcastSync() {
  for (const w of [petWin, panelWin, chatWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('sync');
  }
}
ipcMain.on('panel:changed', broadcastSync);

// 让用户挑选一张本地图片作为桌宠形象，复制进 assets 并返回文件名
ipcMain.handle('pet:pick-image', async () => {
  const r = await dialog.showOpenDialog({
    title: '选择桌宠图片',
    properties: ['openFile'],
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const src = r.filePaths[0];
  const ext = (path.extname(src) || '.png').toLowerCase();
  const fname = 'pet-image' + ext;
  try {
    fs.copyFileSync(src, path.join(__dirname, 'assets', fname));
    return fname;
  } catch (e) {
    console.error('[pet] 复制图片失败', e);
    return null;
  }
});

// 渲染层日志转发到主进程控制台，便于排查
ipcMain.on('pet:log', (_e, args) => console.log('[pet]', ...args));

// 联网搜索：给对话提供更准确的资料（Bing 抓取，失败返回空数组）
ipcMain.handle('pet:web-search', async (_e, query) => {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return [];
  return bingSearch(q);
});

// 知识库：长期记忆 + 个人资料库检索（纯本地）
ipcMain.handle('pet:memory-list', () => kb.loadMemory());
ipcMain.handle('pet:memory-add', (_e, text) => kb.addMemory(text));
ipcMain.handle('pet:memory-del', (_e, id) => kb.delMemory(id));
ipcMain.handle('pet:memory-del-text', (_e, text) => kb.delByText(text));
ipcMain.handle('pet:kb-query', (_e, query) => kb.kbQuery(query));

// 对话日志：聊天窗口持久化（重启恢复上下文）
ipcMain.handle('pet:chat-log-get', () => kb.loadChatLog());
ipcMain.handle('pet:chat-log-save', (_e, messages) => kb.saveChatLog(messages));
ipcMain.handle('pet:chat-log-clear', () => kb.clearChatLog());

// API Key 加密存储（safeStorage / DPAPI）：enc: 前缀 + base64
function tryDecrypt(s) {
  if (typeof s !== 'string' || !s.startsWith('enc:')) return null;
  try { return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')); } catch (e) { return null; }
}
function encryptKey(s) {
  if (typeof s !== 'string' || !s) return '';
  if (s.startsWith('enc:')) {
    // 已是有效密文则原样返回；解不开的当成明文重新加密
    if (tryDecrypt(s) !== null) return s;
  }
  if (!safeStorage.isEncryptionAvailable()) { console.warn('[pet] safeStorage 不可用，key 将明文存储'); return s; }
  try { return 'enc:' + safeStorage.encryptString(s).toString('base64'); } catch (e) { console.warn('[pet] key 加密失败，明文存储'); return s; }
}
function decryptKey(s) {
  const p = tryDecrypt(s);
  if (p !== null) return p;
  // 密文解不开（DPAPI 变更等）→ 返回空，避免把密文当 key 发出去；明文直接透传
  if (typeof s === 'string' && s.startsWith('enc:')) { console.warn('[pet] key 解密失败'); return ''; }
  return s;
}
// 仅允许面板窗口调用 key 加解密（最小权限）
ipcMain.handle('pet:key-encrypt', (event, plain) =>
  (panelWin && event.sender === panelWin.webContents) ? encryptKey(plain) : '');
ipcMain.handle('pet:key-decrypt', (event, stored) =>
  (panelWin && event.sender === panelWin.webContents) ? decryptKey(stored) : '');

// 云端 AI 对话（非流式）：返回完整 message { content, tool_calls }，失败返回 null
ipcMain.handle('pet:chat-ai', async (_e, req) => {
  const { baseUrl, model, apiKey, messages, tools } = req || {};
  const key = decryptKey(apiKey);
  if (!baseUrl || !model || !key || !Array.isArray(messages) || !messages.length) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const body = { model, messages, temperature: 0.9, max_tokens: 400 };
    if (Array.isArray(tools) && tools.length) body.tools = tools;
    const resp = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify(body),
      signal: ac.signal
    });
    if (!resp.ok) {
      console.error('[pet] AI HTTP', resp.status);
      let detail = `HTTP ${resp.status}`;
      try {
        const j = await resp.json();
        if (j && j.error) detail += ': ' + (j.error.message || j.error.code || '');
      } catch (e) {}
      return { error: detail };
    }
    const data = await resp.json();
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) return { error: '返回数据格式异常' };
    const content = typeof msg.content === 'string' ? msg.content : '';
    const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (!content && !toolCalls.length) return { error: '返回内容为空' };
    return { content, tool_calls: toolCalls };
  } catch (e) {
    console.error('[pet] AI 请求失败', e && e.message);
    return { error: '网络错误：' + String(e && e.message || '').slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
});

// 云端 AI 对话（流式 SSE）：把内容逐块 push 给发起方窗口，结束发 chat:done
ipcMain.on('pet:chat-ai-stream', async (event, req) => {
  const sender = event.sender;
  const fail = (m) => sender.send('chat:error', m);
  const { baseUrl, model, apiKey, messages } = req || {};
  const key = decryptKey(apiKey);
  if (!baseUrl || !model || !key || !Array.isArray(messages) || !messages.length) return fail('参数不完整');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const resp = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 400, stream: true }),
      signal: ac.signal
    });
    if (!resp.ok) {
      console.error('[pet] AI stream HTTP', resp.status);
      let detail = `HTTP ${resp.status}`;
      try {
        const j = await resp.json();
        if (j && j.error) detail += ': ' + (j.error.message || j.error.code || '');
      } catch (e) {}
      return fail(detail);
    }
    if (!resp.body) return fail('响应无内容');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let finalText = '';
    let gotToken = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (typeof delta === 'string' && delta) {
              gotToken = true;
              finalText += delta;
              sender.send('chat:token', delta);
            }
          } catch (e) { /* 忽略无法解析的块 */ }
        }
      }
    }

    // 兜底：服务商忽略 stream 时整段是 JSON
    if (!gotToken) {
      try {
        const j = JSON.parse(buf.trim() || finalText);
        const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (typeof content === 'string' && content.trim()) { gotToken = true; finalText = content; sender.send('chat:token', content); }
      } catch (e) {}
    }
    if (!gotToken || !finalText.trim()) return fail('返回内容为空');
    sender.send('chat:done', finalText);
  } catch (e) {
    console.error('[pet] AI stream 失败', e && e.message);
    sender.send('chat:error', '网络错误：' + String(e && e.message || '').slice(0, 80));
  } finally {
    clearTimeout(timer);
  }
});

// ---------- 生命周期 ----------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWin && !petWin.isDestroyed()) { petWin.show(); petWin.focus(); }
    else createPetWindow();
  });

  app.whenReady().then(() => {
    // 打包后运行目录是只读临时目录，知识库数据改存到用户目录
    if (app.isPackaged) {
      kb.setKbDir(path.join(app.getPath('userData'), 'knowledge'));
    }
    createPetWindow();
    createTray();
    // 初始位置：主屏右下角
    const wa = screen.getPrimaryDisplay().workArea;
    const p = clampToWorkArea(wa.x + wa.width - PET_W - 48, wa.y + wa.height - PET_H - 48);
    petWin.setPosition(p.x, p.y);
  });

  // 托盘常驻：关闭所有窗口也不退出
  app.on('window-all-closed', () => {});
}
