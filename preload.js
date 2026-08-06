const { contextBridge, ipcRenderer } = require('electron');

// 流式对话回调（单槽：同一时刻只处理一个流）
let tokenCb = null;
let doneCb = null;
let errorCb = null;
ipcRenderer.on('chat:token', (_e, chunk) => { if (tokenCb) tokenCb(chunk); });
ipcRenderer.on('chat:done', (_e, final) => { const cb = doneCb; doneCb = null; tokenCb = null; if (cb) cb(final); });
ipcRenderer.on('chat:error', (_e, msg) => { const cb = errorCb; errorCb = null; tokenCb = null; if (cb) cb(msg); });

// 渲染层统一通过 petAPI 与主进程通信
contextBridge.exposeInMainWorld('petAPI', {
  move: (x, y) => ipcRenderer.send('pet:move', x, y),
  getPos: () => ipcRenderer.invoke('pet:get-pos'),
  getWorkArea: () => ipcRenderer.invoke('pet:get-work-area'),
  quit: () => ipcRenderer.send('pet:quit'),
  notify: (title, body) => ipcRenderer.send('pet:notify', title, body),
  showMenu: (x, y) => ipcRenderer.send('pet:menu', { x, y }),
  openPanel: () => ipcRenderer.send('panel:open'),
  openChat: () => ipcRenderer.send('chat:open'),
  notifyChat: (text) => ipcRenderer.send('chat:notify', text),   // pet 窗口：把主动消息推给聊天窗口
  onChatProactive: (cb) => ipcRenderer.on('chat:proactive', (_e, text) => cb(text)),   // chat 窗口：接收主动消息
  setMood: (emotion) => ipcRenderer.send('pet:set-mood', emotion),   // chat 窗口：把情绪发给桌宠本体
  onMood: (cb) => ipcRenderer.on('mood', (_e, emotion) => cb(emotion)),   // pet 窗口：接收情绪
  pickImage: () => ipcRenderer.invoke('pet:pick-image'),
  chatAI: (req) => ipcRenderer.invoke('pet:chat-ai', req),
  chatAIStart: (req) => ipcRenderer.send('pet:chat-ai-stream', req),
  onChatToken: (cb) => { tokenCb = cb; },
  onChatDone: (cb) => { doneCb = cb; },
  onChatError: (cb) => { errorCb = cb; },
  webSearch: (q) => ipcRenderer.invoke('pet:web-search', q),
  memoryList: () => ipcRenderer.invoke('pet:memory-list'),
  memoryAdd: (text) => ipcRenderer.invoke('pet:memory-add', text),
  memoryDel: (id) => ipcRenderer.invoke('pet:memory-del', id),
  memoryDelText: (text) => ipcRenderer.invoke('pet:memory-del-text', text),
  kbQuery: (q) => ipcRenderer.invoke('pet:kb-query', q),
  chatLogGet: () => ipcRenderer.invoke('pet:chat-log-get'),
  chatLogSave: (messages) => ipcRenderer.invoke('pet:chat-log-save', messages),
  chatLogClear: () => ipcRenderer.invoke('pet:chat-log-clear'),
  keyEncrypt: (plain) => ipcRenderer.invoke('pet:key-encrypt', plain),
  keyDecrypt: (stored) => ipcRenderer.invoke('pet:key-decrypt', stored),
  setPin: (on) => ipcRenderer.send('pet:set-pin', on),
  syncMenuChecks: (chime, pin) => ipcRenderer.send('menu:set-check', { chime, pin }),
  notifyStateChanged: () => ipcRenderer.send('panel:changed'),
  onMenuAction: (cb) => ipcRenderer.on('menu-action', (_e, id, val) => cb(id, val)),
  onSync: (cb) => ipcRenderer.on('sync', () => cb()),
  log: (...args) => ipcRenderer.send('pet:log', args)
});
