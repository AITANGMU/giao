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
  // 《绝区零》蕾米埃尔·丹：粉发粉瞳尖耳、黑纱面罩、黑裙、黑翼、双马尾、皇冠
  { id: 'remiel',     name: '蕾米埃尔', kind: 'remiel', voice: 'remiel', palette: { body: '#3a2f44', belly: '#4a3d55', accent: '#f2a6c8', line: '#1c1822', wing: '#332b3f', hair: '#f2a6c8', eye: '#d8588f', stocking: '#1c1822', crown: '#d4af37', hem: '#2a2235', sparkle: '#f2a6c8' } }
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
   * @param pose     { bob, walking, eyeOpen, sleeping, tailPhase, emotion, wingStretch }
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
      // 背后增强黑翼
      drawEnhancedWing(ctx, -1, t, pose, p);
      drawEnhancedWing(ctx, 1, t, pose, p);
      // 双马尾（在翅膀前面、身体后面）
      drawTwinTail(ctx, -1, t, pose, p);
      drawTwinTail(ctx, 1, t, pose, p);
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

    // 蕾米埃尔：哥特裙摆蕾丝边
    if (kind === 'remiel') {
      drawDressHem(ctx, t, pose, p);
    }

    // 蕾米埃尔：粉色发盖 + 黑丝带蝴蝶结 + 小皇冠
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
      drawCrown(ctx, 0, -120, p);
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

    // 蕾米埃尔：黑色过膝袜（覆盖爪爪下半部分）
    if (kind === 'remiel') {
      drawStocking(ctx, -1, p);
      drawStocking(ctx, 1, p);
    }

    // ---- 脸 ----
    if (kind === 'remiel') {
      drawRemielEyes(ctx, t, pose, p);
    } else {
      const open = pose.eyeOpen !== undefined ? pose.eyeOpen : 1;
      const eyeR = 5.5;
      const eyeColor = '#2b2b2b';

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

    // 蕾米埃尔：周围漂浮的粉色光点
    if (kind === 'remiel') {
      drawSparkles(ctx, t, pose, p);
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

// ============================================================
//  辅助绘制函数
// ============================================================

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

// 蕾米埃尔：背后黑翼（side = -1 左 / 1 右），微小幅摆动（保留旧版供兼容）
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

// ============================================================
//  蕾米埃尔增强绘制函数
// ============================================================

// 蕾米埃尔：增强黑翼（多羽毛曲线，更大扇动幅度）
function drawEnhancedWing(ctx, side, t, pose, p) {
  const color = p.wing || '#332b3f';
  const sleeping = pose.sleeping;

  // 扇动幅度：睡眠时收拢，正常时微摆，偶尔伸展
  const baseSway = Math.sin(t * 2.4 + (side > 0 ? 0 : 1.6));
  const stretch = Math.sin(t * 0.3) * 0.5 + 0.5;  // 慢周期：0~1，偶尔完全展开
  const flapAngle = sleeping ? 2 : (6 + stretch * 8);
  const sway = baseSway * flapAngle;

  ctx.save();
  ctx.translate(side * 16, -64);
  ctx.fillStyle = color;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';

  // 主翼面（更大）
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(side * 38, -56 + sway, side * 58, -126 + sway);
  ctx.quadraticCurveTo(side * 44, -50 + sway, side * 20, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 羽毛纹理：2条内弧线
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(side * 4, -4);
  ctx.quadraticCurveTo(side * 28, -48 + sway * 0.8, side * 46, -105 + sway * 0.9);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(side * 8, -8);
  ctx.quadraticCurveTo(side * 22, -38 + sway * 0.7, side * 34, -80 + sway * 0.8);
  ctx.stroke();

  // 翼尖分叉小羽毛
  ctx.fillStyle = color;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(side * 48, -110 + sway);
  ctx.quadraticCurveTo(side * 62, -130 + sway, side * 56, -140 + sway);
  ctx.quadraticCurveTo(side * 52, -120 + sway, side * 46, -105 + sway);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// 蕾米埃尔：双马尾（side = -1 左 / 1 右）
// 从头后方出发，向下垂到身体两侧，带正弦波动
function drawTwinTail(ctx, side, t, pose, p) {
  const color = p.hair || p.accent;
  const walking = pose.walking;

  // 波动幅度：行走时大，静止时小
  const swayAmp = walking ? 8 : 3;
  const swayFreq = walking ? 3.5 : 1.8;
  // 第二层波动（更慢的次级晃动）
  const sway2 = Math.sin(t * 1.2 + (side > 0 ? 2 : 0)) * 2;
  const sway = Math.sin(t * swayFreq + (side > 0 ? 0 : 1.5)) * swayAmp + sway2;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';

  // 马尾起点：头顶两侧（略低于发盖顶部）
  const startX = side * 20;
  const startY = -98;

  // 马尾用多段贝塞尔曲线模拟自然下垂
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(
    side * 32, startY - 10 + sway * 0.3,
    side * 40, -60 + sway * 0.6,
    side * 36, -30 + sway * 0.8
  );
  ctx.bezierCurveTo(
    side * 30, -10 + sway * 0.5,
    side * 28, 5 + sway * 0.3,
    side * 24, 12 + sway * 0.2
  );
  // 画回来形成有宽度的马尾（而非单线）
  ctx.bezierCurveTo(
    side * 20, 5 + sway * 0.3,
    side * 22, -10 + sway * 0.5,
    side * 26, -30 + sway * 0.8
  );
  ctx.bezierCurveTo(
    side * 30, -60 + sway * 0.6,
    side * 22, startY - 5 + sway * 0.3,
    startX - side * 2, startY + 5
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 尾尖渐细的细节线
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(side * 30, -40 + sway * 0.6);
  ctx.quadraticCurveTo(side * 26, -20 + sway * 0.5, side * 24, 12 + sway * 0.2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

// 蕾米埃尔：哥特裙摆蕾丝边
function drawDressHem(ctx, t, pose, p) {
  const hemColor = p.hem || '#2a2235';
  const walking = pose.walking;
  const sway = walking ? Math.sin(t * 8) * 2 : Math.sin(t * 1.5) * 0.5;

  ctx.save();
  ctx.fillStyle = hemColor;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.5;

  // 裙摆位于身体底部
  const hemY = -4;
  const hemW = 52;
  const ruffleCount = 7;
  const ruffleDepth = 5;

  ctx.beginPath();
  for (let i = 0; i <= ruffleCount; i++) {
    const frac = i / ruffleCount;
    const x = -hemW + frac * hemW * 2;
    const yBase = hemY + Math.sqrt(Math.max(0, 1 - Math.pow((x / hemW), 2))) * 12;
    const yRuffle = yBase + ruffleDepth * (i % 2 === 0 ? 1 : -1) * 0.5 + sway * (1 - Math.abs(frac - 0.5) * 2);
    if (i === 0) ctx.moveTo(x, yRuffle);
    else ctx.lineTo(x, yRuffle);
  }
  ctx.lineTo(hemW, hemY + 8);
  ctx.lineTo(-hemW, hemY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 蕾丝点缀小圆点
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  for (let i = 0; i < ruffleCount; i++) {
    const frac = (i + 0.5) / ruffleCount;
    const x = -hemW + frac * hemW * 2;
    const yBase = hemY + Math.sqrt(Math.max(0, 1 - Math.pow((x / hemW), 2))) * 12;
    ctx.beginPath();
    ctx.arc(x, yBase + ruffleDepth + sway * (1 - Math.abs(frac - 0.5) * 2), 1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// 蕾米埃尔：头顶小皇冠
function drawCrown(ctx, x, y, p) {
  const gold = p.crown || '#d4af37';
  ctx.save();
  ctx.fillStyle = gold;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 1.5;

  // 小皇冠：底座 + 3个尖角
  const w = 14, h = 8;
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(x - w, y - h * 0.4);
  ctx.lineTo(x - w * 0.5, y - h);
  ctx.lineTo(x, y - h * 0.5);
  ctx.lineTo(x + w * 0.5, y - h);
  ctx.lineTo(x + w, y - h * 0.4);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3个小宝石点（粉色）
  ctx.fillStyle = p.accent || '#f2a6c8';
  ctx.beginPath();
  ctx.arc(x - w * 0.5, y - h * 0.85, 1.2, 0, Math.PI * 2);
  ctx.arc(x, y - h * 0.35, 1.2, 0, Math.PI * 2);
  ctx.arc(x + w * 0.5, y - h * 0.85, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// 蕾米埃尔：黑色过膝袜（覆盖小爪爪下半部分）
function drawStocking(ctx, side, p) {
  const stockColor = p.stocking || p.line;
  ctx.save();
  ctx.fillStyle = stockColor;

  // 袜子覆盖爪爪的下半部分
  ctx.beginPath();
  ctx.ellipse(side * 18, -5, 11, 5, 0, 0, Math.PI);
  ctx.fill();

  // 袜口蕾丝线
  ctx.strokeStyle = p.accent || '#f2a6c8';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(side * 18 - 11, -5);
  ctx.lineTo(side * 18 + 11, -5);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

// 蕾米埃尔：增强粉色眼睛（支持多种表情）
// emotion: 'normal' | 'happy' | 'curious' | 'sleepy'
function drawRemielEyes(ctx, t, pose, p) {
  const eyeColor = p.eye || '#d8588f';
  const open = pose.eyeOpen !== undefined ? pose.eyeOpen : 1;
  const emotion = pose.emotion || 'normal';

  for (const ex of [-17, 17]) {
    const eyeR = emotion === 'curious' && ex > 0 ? 6.5 : 5.5;

    if (emotion === 'happy' && open > 0.3) {
      // 开心眼：^_^ 向上弧线
      ctx.strokeStyle = eyeColor;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 6, -76);
      ctx.quadraticCurveTo(ex, -82, ex + 6, -76);
      ctx.stroke();
    } else if (emotion === 'sleepy' && open > 0.15) {
      // 困倦眼：半闭，上眼皮下垂
      const halfR = eyeR * 0.55;
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(ex, -77, halfR, halfR * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      // 高光
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex + halfR * 0.3, -78, halfR * 0.25, 0, Math.PI * 2);
      ctx.fill();
    } else if (open > 0.45) {
      // 正常/好奇：标准椭圆眼
      const r = eyeR * open;
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(ex, -78, r, r * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();

      // 高光（带闪烁）
      const twinkleScale = 1 + Math.sin(t * 4 + ex) * 0.3;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex + r * 0.35, -80, r * 0.3 * twinkleScale, 0, Math.PI * 2);
      ctx.fill();

      // curious: 左眼加一个小弧线眉毛
      if (emotion === 'curious' && ex < 0) {
        ctx.strokeStyle = eyeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ex - 5, -85);
        ctx.quadraticCurveTo(ex, -88, ex + 5, -86);
        ctx.stroke();
      }
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
}

// 蕾米埃尔：周围漂浮的粉色光点
// 纯正弦/余弦驱动，无对象池，轻量级
function drawSparkles(ctx, t, pose, p) {
  const color = p.sparkle || p.accent;
  const sleeping = pose.sleeping;
  if (sleeping) return;  // 睡觉时不显示光点

  const count = 6;
  ctx.save();

  for (let i = 0; i < count; i++) {
    const phase = i * 1.047;  // 2π/6，均匀分布
    const speed = 0.6 + (i % 3) * 0.3;

    // 围绕角色做椭圆轨道运动
    const orbitX = Math.cos(t * speed + phase) * (55 + i * 6);
    const orbitY = Math.sin(t * speed * 0.7 + phase) * (30 + i * 4);
    const x = orbitX;
    const y = -60 + orbitY;

    // 闪烁
    const twinkle = Math.sin(t * 2.5 + phase * 3) * 0.5 + 0.5;
    const alpha = 0.15 + twinkle * 0.45;
    const size = 1 + twinkle * 1.5;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    drawStar4(ctx, x, y, size);
    ctx.fill();
  }

  ctx.restore();
}

// 四角星路径（十字 + 菱形叠加）
function drawStar4(ctx, x, y, r) {
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.3, y - r * 0.3);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.3, y + r * 0.3);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.3, y + r * 0.3);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.3, y - r * 0.3);
  ctx.closePath();
}
