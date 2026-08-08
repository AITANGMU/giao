#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_pet_image.py —— 把通义万相生成的 Q 版立绘处理成桌宠默认形象
输出：D:\\visual pet\\assets\\pet-image.png（透明背景，自动裁切、加边距、等比缩放）

用法（本机 Python 在 D:\\python，不进 PATH）：
  D:\\python\\python.exe make_pet_image.py <源图路径> [选项]

常用选项：
  --out          输出路径（默认 assets\\pet-image.png）
  --height       目标高度像素（默认 600）
  --pad          四周边距比例（默认 0.06）
  --tolerance    背景容差 0-255（默认 45；背景偏复杂时调低，偏灰调时调高）
  --bgcolor      手动指定背景色（white / 255,255,255 / #f0f0f0），跳过自动估计

说明：
- 若源图已带透明（alpha 通道），直接裁切缩放，不做抠图。
- 若源图是纯色/浅色背景，自动从四边向里做「背景泛洪」抠图。
- 生成结果为透明背景 PNG，供桌宠图片模式使用。

依赖：Pillow 12.3.0、numpy 2.4.6（本机已装）
"""
import argparse
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

# Windows 中文控制台默认 GBK，统一改用 UTF-8 输出，避免 emoji/生僻字编码崩溃
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

NAMED = {'white': (255, 255, 255), 'black': (0, 0, 0), 'gray': (128, 128, 128), 'grey': (128, 128, 128)}


def hex2rgb(s):
    s = s.strip().lower()
    if s.startswith('#'):
        s = s[1:]
        return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))
    if ',' in s:
        return tuple(int(x) for x in s.split(',')[:3])
    if s in NAMED:
        return NAMED[s]
    raise SystemExit(f'无法识别的背景色: {s}')


def already_transparent(arr):
    """边框一圈是否已大面积透明（判断是否已经是抠好的图）"""
    h, w = arr.shape[:2]
    if h < 4 or w < 4:
        return False
    border = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]])
    return border.shape[0] > 0 and np.mean(border[:, 3] < 128) > 0.5


def flood_remove_bg(rgb, bg, tol):
    """从四边向内泛洪，把连通的近似背景色像素标记为背景"""
    h, w = rgb.shape[:2]
    visited = np.zeros((h, w), dtype=bool)
    mask = np.zeros((h, w), dtype=bool)
    dq = deque()
    # 种子：四边中与背景色接近的像素
    edges = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] \
        + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for x, y in edges:
        if visited[y, x]:
            continue
        visited[y, x] = True
        if np.max(np.abs(rgb[y, x] - bg)) <= tol:
            mask[y, x] = True
            dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                visited[ny, nx] = True
                if np.max(np.abs(rgb[ny, nx] - bg)) <= tol:
                    mask[ny, nx] = True
                    dq.append((nx, ny))
    return mask


def grabcut_bg(img, inset=6, iters=5):
    """GrabCut 前景分割：返回 0-255 的 alpha 掩膜。
    相比泛洪抠图，它对「前景颜色接近背景」的情况更稳（边界平滑约束）。"""
    import cv2
    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    rect = (inset, inset, max(1, w - 2 * inset), max(1, h - 2 * inset))
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, rect, bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)  # 去噪点
    fg = cv2.GaussianBlur(fg, (3, 3), 0)  # 边缘羽化，避免硬边
    return fg


def main():
    ap = argparse.ArgumentParser(description='把 Q 版立绘处理成桌宠默认形象（透明 PNG）')
    ap.add_argument('src', help='源图路径')
    default_out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'pet-image.png')
    ap.add_argument('--out', default=default_out, help=f'输出路径（默认 {default_out}）')
    ap.add_argument('--height', type=int, default=600, help='目标高度像素（默认 600）')
    ap.add_argument('--pad', type=float, default=0.06, help='四周边距比例（默认 0.06）')
    ap.add_argument('--tolerance', type=int, default=45, help='背景容差 0-255（默认 45）')
    ap.add_argument('--bgcolor', default=None, help='手动指定背景色，跳过自动估计')
    ap.add_argument('--method', choices=['flood', 'grabcut'], default='flood',
                    help='抠图方法：flood 泛洪（默认）/ grabcut OpenCV 分割（抗颜色重叠）')
    args = ap.parse_args()

    im = Image.open(args.src).convert('RGBA')
    arr = np.array(im).astype(np.float64)
    h, w = arr.shape[:2]
    print(f'源图: {args.src}  ({w}×{h})')

    if not already_transparent(arr):
        if args.method == 'grabcut':
            arr[..., 3] = grabcut_bg(Image.fromarray(arr.astype(np.uint8)))
            kept = int((arr[..., 3] > 128).mean() * 100)
            print(f'GrabCut 分割完成，主体保留约 {kept}%')
        else:
            rgb = arr[..., :3]
            if args.bgcolor:
                bg = np.array(hex2rgb(args.bgcolor), dtype=np.float64)
            else:
                # 背景色估计：四边颜色中位数（对渐变背景更稳）
                border = np.concatenate([rgb[0, :], rgb[-1, :], rgb[:, 0], rgb[:, -1]])
                bg = np.median(border, axis=0)
            print(f'背景色估计: {tuple(bg.round().astype(int))} (容差 {args.tolerance})')
            mask = flood_remove_bg(rgb, bg, args.tolerance)
            removed = int(mask.sum())
            arr[..., 3] = np.where(mask, 0, arr[..., 3])
            print(f'抠图完成，移除背景像素 {removed}/{h * w} ({removed * 100.0 // (h * w)}%)')
    else:
        print('源图已带透明，跳过抠图')

    # 裁切到主体包围盒
    alpha = arr[..., 3]
    ys, xs = np.where(alpha > 40)
    if len(xs) == 0:
        raise SystemExit('裁切后没有有效像素，请检查源图，或用 --bgcolor / --tolerance 重试')
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()
    pad = int(round(max(h, w) * args.pad))
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w - 1, x1 + pad)
    y1 = min(h - 1, y1 + pad)
    arr = arr[y0:y1 + 1, x0:x1 + 1]

    out = Image.fromarray(arr.astype(np.uint8))
    if out.height > args.height:
        nw = max(1, round(out.width * args.height / out.height))
        out = out.resize((nw, args.height), Image.LANCZOS)
        print(f'等比缩放到 {out.width}×{out.height}')
    elif out.width % 2 == 1:
        out = out.resize((out.width - 1, out.height), Image.LANCZOS)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    out.save(args.out, 'PNG')
    print(f'已输出: {args.out}  ({out.width}×{out.height})')


if __name__ == '__main__':
    main()
