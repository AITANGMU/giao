// ============================================================
// settings-shared.js —— pet 与 panel 共用的默认设置（两边必须一致）
// ============================================================

window.PET_DEFAULTS = {
  name: '小橘',
  appearance: 'image',         // 'character' 卡通角色 / 'image' 图片形象
  imageFile: 'pet-image.jpg',  // 图片形象对应的 assets 文件名
  imageVersion: 0,             // 换图时 +1，桌宠据此判断是否需要重新加载
  preset: 'cat_orange',
  scale: 1,
  wanderSpeed: 1,
  wander: false,               // 是否自动在桌面散步
  speechFreq: 45,              // 空闲说话的间隔（秒）
  chime: false,                // 整点报时
  pin: true,                   // 置顶显示
  todos: [],
  pomodoro: { workMin: 25, breakMin: 5 },
  pomo: { running: false, phase: 'work', endAt: 0, paused: false, remaining: 0 },
  // 云端 AI 对话配置（Key 加密后保存在本机 localStorage）
  ai: { enabled: false, provider: 'zhipu', baseUrl: '', model: '', apiKey: '' },
  speak: false                 // 语音朗读回复
};

// 服务商预设（OpenAI 兼容接口，请求在 Electron 主进程发出，无 CORS 限制）
window.AI_PROVIDERS = {
  zhipu:    { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',              model: 'glm-4.7-flash' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',                          model: 'deepseek-v4-flash' },
  qwen:     { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  kimi:     { name: 'Kimi',     baseUrl: 'https://api.moonshot.cn/v1',                        model: 'moonshot-v1-8k' },
  custom:   { name: '自定义',   baseUrl: '',                                                  model: '' }
};
