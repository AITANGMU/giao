// ============================================================
// character.js —— 程序化绘制的 Q 版小宠物（零图片素材）
// 通过调色板 + 耳朵形态组合出不同皮肤预设
// ============================================================

window.PRESETS = [
  { id: 'cat_orange',  name: '橘猫',   kind: 'cat',    palette: { body: '#f6a05c', belly: '#ffe6c4', accent: '#ff9b7d', line: '#4a3b2a' } },
  { id: 'cat_black',   name: '黑猫',   kind: 'cat',    palette: { body: '#47475e', belly: '#7b7b93', accent: '#8a8aa3', line: '#23232f' } },
  { id: 'cat_white',   name: '白猫',   kind: 'cat',    palette: { body: '#ffffff', belly: '#ffeef4', accent: '#ffc2cf', line: '#6b5b6b' } },
  { id: 'rabbit_blue', name: '蓝耳兔', kind: 'rabbit', palette: { body: '#ffffff', belly: '#fff0f5', accent: '#7ec8e3', line: '#6b5b6b' } },
  { id: 'frog_green',  name: '绿蛙',   kind: 'frog',   palette: { body: '#93d35c', belly: '#dff2c6', accent: '#5fa63c', line: '#3a5a28' } },
  // 《绝区零》蕾米埃尔·丹：粉发粉瞳尖耳、黑纱面罩、黑裙、黑翼
  { id: 'remiel',     name: '蕾米埃尔', kind: 'remiel', voice: 'remiel', palette: { body: '#3a2f44', belly: '#4a3d55', accent: '#f2a6c8', line: '#1c1822', wing: '#332b3f', hair: '#f2a6c8', eye: '#d8588f' } }
];

window.Character = {
  PRESETS: window.PRESETS,

  getPreset(id) {
    return this.PRESETS.find((p) => p.id === id) || this.PRESETS[0];
  },

  /**
   * 绘制一帧宠物
   * @param ctx      Canvas 2D 上下文（已按 DPR 缩放）
   * @param W H      canvas 逻辑宽高
   * @param t        秒级时间，驱动动画
   * @param pose     { bob, walking, eyeOpen, sleeping }
   * @param cfg      { kind, palette, scale }
   */
  draw(ctx, W, H, t, pose, cfg) {
    const kind = cfg.kind;
    const p = cfg.palette;
    const scale = cfg.scale || 1;

    const groundY = H * 0.94;
    const cx = W / 2;

    // 行走时整体轻微压扁/拉伸
    const vScale = 1 + Math.sin(t * 10) * (pose.walking ? 0.055 : 0);
    const bob = pose.bob;

    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(scale, scale * vScale);
    ctx.translate(0, bob);

    // ---- 尾巴（在最底层） ----
    if (kind === 'cat') {
      ctx.strokeStyle = p.body;
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const wag = Math.sin(t * 4 + (pose.tailPhase || 0)) * 9;
      ctx.moveTo(36, -76);
      ctx.quadraticCurveTo(64, -70 + wag, 60, -40 + wag);
      ctx.stroke();
    } else if (kind === 'rabbit') {
      ctx.fillStyle = p.body;
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(54, -58, 13, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'remiel') {
      // 背后双翼（黑翼）
      drawWing(ctx, -1, t, p);
      drawWing(ctx, 1, t, p);
    }

    // ---- 耳朵（在身体后面） ----
    if (kind === 'cat') {
      drawEar(ctx, -22, -106, -40, -152, -8, -112, p);
      drawEar(ctx, 22, -106, 40, -152, 8, -112, p);
    } else if (kind === 'rabbit') {
      drawEar(ctx, -18, -106, -32, -170, -6, -112, p);
      drawEar(ctx, 18, -106, 32, -170, 6, -112, p);
    } else if (kind === 'frog') {
      // 头顶两个小鼓包（逆时针画上半圆弧，向上鼓起）
      ctx.fillStyle = p.body;
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-24, -112, 10, Math.PI, 0, true);
      ctx.arc(24, -112, 10, Math.PI, 0, true);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'remiel') {
      // 粉色尖耳
      drawPointedEar(ctx, -1, p);
      drawPointedEar(ctx, 1, p);
    }

    // ---- 身体（豆形） ----
    ctx.fillStyle = p.body;
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -60, 52, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 肚皮
    ctx.fillStyle = p.belly;
    ctx.beginPath();
    ctx.ellipse(0, -64, 30, 38, 0, 0, Math.PI * 2);
    ctx.fill();

    // 蛙类身上的小圆点
    if (kind === 'frog') {
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(-18, -34, 5, 0, Math.PI * 2);
      ctx.arc(20, -96, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 蕾米埃尔：粉色发盖 + 黑丝带蝴蝶结
    if (kind === 'remiel') {
      ctx.fillStyle = p.hair || p.accent;
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -96, 40, 24, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawBow(ctx, 0, -116);
    }

    // ---- 小爪爪 ----
    ctx.fillStyle = p.belly;
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(-18, -8, 11, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(18, -8, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ---- 脸 ----
    const open = pose.eyeOpen !== undefined ? pose.eyeOpen : 1;
    const eyeR = 5.5;
    const eyeColor = kind === 'remiel' ? (p.eye || '#d8588f') : '#2b2b2b';

    // 眼睛
    ctx.fillStyle = eyeColor;
    for (const ex of [-17, 17]) {
      if (open > 0.45) {
        const r = eyeR * open;
        ctx.beginPath();
        ctx.ellipse(ex, -78, r, r * 1.25, 0, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex + r * 0.35, -80, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeColor;
      } else {
        // 闭眼：一条向下弯的弧线
        ctx.strokeStyle = eyeColor;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - 6, -78);
        ctx.quadraticCurveTo(ex, -74, ex + 6, -78);
        ctx.stroke();
      }
    }

    // 腮红
    ctx.fillStyle = 'rgba(255,120,140,0.45)';
    ctx.beginPath();
    ctx.ellipse(-31, -62, 8, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(31, -62, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 嘴（蕾米埃尔的面罩遮住了嘴，不画）
    if (kind !== 'remiel') {
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      if (pose.sleeping) {
        // 打盹：小圆嘴
        ctx.fillStyle = p.line;
        ctx.beginPath();
        ctx.arc(0, -54, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(-7, -57);
        ctx.quadraticCurveTo(-3.5, -53.5, 0, -57);
        ctx.quadraticCurveTo(3.5, -53.5, 7, -57);
        ctx.stroke();
      }
    }

    // 蕾米埃尔：黑色蕾丝面罩（覆盖下半张脸）
    if (kind === 'remiel') {
      ctx.fillStyle = 'rgba(38,32,46,0.92)';
      ctx.beginPath();
      ctx.roundRect(-23, -70, 46, 22, 9);
      ctx.fill();
      // 蕾丝点缀
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = -15; i <= 15; i += 7.5) {
        ctx.beginPath();
        ctx.arc(i, -61, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 胡须（猫）
    if (kind === 'cat') {
      ctx.strokeStyle = 'rgba(60,50,40,0.7)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-46, -74); ctx.lineTo(-63, -70);
      ctx.moveTo(-46, -80); ctx.lineTo(-63, -86);
      ctx.moveTo(46, -74); ctx.lineTo(63, -70);
      ctx.moveTo(46, -80); ctx.lineTo(63, -86);
      ctx.stroke();
    }

    // ---- 打盹时的 Zzz ----
    if (pose.sleeping) {
      const zy = -118 - ((t * 14) % 42);
      const alpha = 1 - ((zy + 118) / 42);
      ctx.fillStyle = `rgba(80,90,110,${(0.9 * alpha).toFixed(2)})`;
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      ctx.fillText('z', 46, zy);
      ctx.fillText('Z', 58, zy - 8);
    }

    ctx.restore();
  }
};

// 画一只耳朵。左右耳分别传各自的坐标（左耳为负、右耳为正），函数不做翻转
function drawEar(ctx, bx, by, tx, ty, ix, iy, p) {
  ctx.fillStyle = p.body;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo((bx + tx) / 2, Math.min(by, ty) - 6, tx, ty);
  ctx.quadraticCurveTo((tx + ix) / 2, by - 14, ix, iy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 耳内粉色
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.moveTo(bx * 0.9, by + 4);
  ctx.quadraticCurveTo((bx + tx) / 2, Math.min(by, ty) - 2, tx * 0.85, ty + 4);
  ctx.quadraticCurveTo((tx + ix) / 2, by - 8, ix * 0.9, iy + 4);
  ctx.closePath();
  ctx.fill();
}

// 蕾米埃尔：粉色尖耳（side = -1 左 / 1 右）
function drawPointedEar(ctx, side, p) {
  const bx = side * 18, by = -108, tx = side * 52, ty = -164, ix = side * 4, iy = -114;
  ctx.fillStyle = p.hair || p.accent;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo((bx + tx) / 2, Math.min(by, ty) - 8, tx, ty);
  ctx.quadraticCurveTo((tx + ix) / 2, by - 16, ix, iy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// 蕾米埃尔：背后黑翼（side = -1 左 / 1 右），微小幅摆动
function drawWing(ctx, side, t, p) {
  const sway = Math.sin(t * 2.4 + (side > 0 ? 0 : 1.6)) * 3;
  ctx.save();
  ctx.translate(side * 16, -64);
  ctx.fillStyle = p.wing || '#332b3f';
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(side * 34, -52 + sway, side * 52, -116 + sway);
  ctx.quadraticCurveTo(side * 40, -46 + sway, side * 18, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// 蕾米埃尔：头顶黑丝带蝴蝶结
function drawBow(ctx, x, y) {
  ctx.fillStyle = '#221d2b';
  ctx.strokeStyle = '#1c1822';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x - 6, y, 6, 3.6, -0.45, 0, Math.PI * 2);
  ctx.ellipse(x + 6, y, 6, 3.6, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - 2, y - 2.2, 4, 4.4);
}
