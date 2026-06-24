// DBNet 检测后处理：概率图 -> 文本框四边形

import type { OcrOptions, Quad } from "./types.ts";
import type { OrtModule, OrtSession } from "./ort-loader.ts";
import { preprocessDet } from "./image.ts";
import type { DetInput } from "./image.ts";

type Pt = [number, number];

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** 凸包（Andrew monotone chain），输入/输出均为点数组 */
function convexHull(points: Pt[]): Pt[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** 由凸包计算最小外接矩形（旋转卡壳的简化版：遍历每条边方向） */
function minAreaRect(hull: Pt[]): { corners: Quad; w: number; h: number } {
  if (hull.length < 2) {
    const p = hull[0] ?? [0, 0];
    const q: Quad = [
      [p[0], p[1]],
      [p[0], p[1]],
      [p[0], p[1]],
      [p[0], p[1]],
    ];
    return { corners: q, w: 0, h: 0 };
  }
  let best: { area: number; corners: Quad; w: number; h: number } | null = null;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % n];
    let ex = b[0] - a[0];
    let ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    ex /= len;
    ey /= len;
    // 法向量
    const nx = -ey;
    const ny = ex;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p[0] * ex + p[1] * ey;
      const v = p[0] * nx + p[1] * ny;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU;
    const h = maxV - minV;
    const area = w * h;
    if (!best || area < best.area) {
      // 四角（U/V 坐标系还原回 XY）
      const toXY = (u: number, v: number): Pt => [
        u * ex + v * nx,
        u * ey + v * ny,
      ];
      const corners: Quad = [
        toXY(minU, minV),
        toXY(maxU, minV),
        toXY(maxU, maxV),
        toXY(minU, maxV),
      ];
      best = { area, corners, w, h };
    }
  }
  return best
    ? { corners: best.corners, w: best.w, h: best.h }
    : { corners: hull.slice(0, 4) as Quad, w: 0, h: 0 };
}

/** 将矩形从中心向外膨胀（unclip 近似），保持角点顺序 */
function unclip(corners: Quad, w: number, h: number, ratio: number): Quad {
  const area = w * h;
  const perimeter = 2 * (w + h);
  if (perimeter < 1e-6) return corners;
  const distance = (area * ratio) / perimeter;
  // 中心
  const cx = (corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) /
    4;
  const cy = (corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) /
    4;
  const scaleW = (w + 2 * distance) / Math.max(w, 1e-6);
  const scaleH = (h + 2 * distance) / Math.max(h, 1e-6);
  // 边方向单位向量
  let ex = corners[1][0] - corners[0][0];
  let ey = corners[1][1] - corners[0][1];
  const el = Math.hypot(ex, ey) || 1;
  ex /= el;
  ey /= el;
  const nx = -ey;
  const ny = ex;
  return corners.map(([x, y]) => {
    // 投影到 U/V，相对中心缩放
    const dx = x - cx;
    const dy = y - cy;
    const u = dx * ex + dy * ey;
    const v = dx * nx + dy * ny;
    const su = u * scaleW;
    const sv = v * scaleH;
    return [cx + su * ex + sv * nx, cy + su * ey + sv * ny] as Pt;
  }) as Quad;
}

/** 按 左上、右上、右下、左下 排序四个角点 */
function orderQuad(q: Quad): Quad {
  const pts = q.slice().sort((a, b) => a[0] - b[0]);
  const left = [pts[0], pts[1]].sort((a, b) => a[1] - b[1]);
  const right = [pts[2], pts[3]].sort((a, b) => a[1] - b[1]);
  const tl = left[0], bl = left[1];
  const tr = right[0], br = right[1];
  return [tl, tr, br, bl];
}

export interface DetModel {
  session: OrtSession;
  ort: OrtModule;
}

/** 运行检测并返回原图坐标系下的文本框 */
export async function runDetection(
  model: DetModel,
  src: HTMLCanvasElement,
  opts: OcrOptions,
): Promise<Quad[]> {
  const input: DetInput = preprocessDet(src, opts.detLimitSideLen);
  const { ort, session } = model;
  const tensor = new ort.Tensor("float32", input.data, [
    1,
    3,
    input.resizedH,
    input.resizedW,
  ]);
  const feeds: Record<string, typeof tensor> = {};
  feeds[session.inputNames[0]] = tensor;
  const out = await session.run(feeds);
  const outName = session.outputNames[0];
  const probTensor = out[outName];
  const dims = probTensor.dims;
  const H = dims[dims.length - 2];
  const W = dims[dims.length - 1];
  const raw = probTensor.data as Float32Array;

  // 概率图（必要时 sigmoid）
  const plane = H * W;
  const prob = new Float32Array(plane);
  let needSigmoid = false;
  for (let i = 0; i < Math.min(plane, 4096); i++) {
    if (raw[i] < 0 || raw[i] > 1) {
      needSigmoid = true;
      break;
    }
  }
  for (let i = 0; i < plane; i++) {
    prob[i] = needSigmoid ? sigmoid(raw[i]) : raw[i];
  }

  // 二值化
  const bin = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) bin[i] = prob[i] > opts.detThresh ? 1 : 0;

  // 连通域标记（8 邻域，迭代栈）
  const labels = new Int32Array(plane).fill(0);
  const boxes: Quad[] = [];
  const stack: number[] = [];
  const ratioToOrigX = input.ratioW;
  const ratioToOrigY = input.ratioH;
  const minSize = opts.detMinSize ?? 3;

  for (let start = 0; start < plane; start++) {
    if (bin[start] === 0 || labels[start] !== 0) continue;
    // BFS/DFS 收集该连通域像素
    stack.length = 0;
    stack.push(start);
    labels[start] = 1;
    const pixels: number[] = [];
    let scoreSum = 0;
    while (stack.length) {
      const idx = stack.pop()!;
      pixels.push(idx);
      scoreSum += prob[idx];
      const x = idx % W;
      const y = (idx - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nidx = ny * W + nx;
          if (bin[nidx] === 1 && labels[nidx] === 0) {
            labels[nidx] = 1;
            stack.push(nidx);
          }
        }
      }
    }
    if (pixels.length < minSize) continue;

    // 得分过滤
    const score = scoreSum / pixels.length;
    if (score < opts.detBoxThresh) continue;

    // 取连通域的点集（用边界点足够，这里用全部点的凸包）
    const ptsArr: Pt[] = new Array(pixels.length);
    for (let k = 0; k < pixels.length; k++) {
      const idx = pixels[k];
      const x = idx % W;
      const y = (idx - x) / W;
      ptsArr[k] = [x, y];
    }
    const hull = convexHull(ptsArr);
    const rect = minAreaRect(hull);
    if (Math.min(rect.w, rect.h) < minSize) continue;

    // unclip 膨胀
    const expanded = unclip(rect.corners, rect.w, rect.h, opts.detUnclipRatio);

    // 映射回原图坐标并裁剪到边界
    const mapped: Quad = expanded.map(([x, y]) => [
      Math.max(0, Math.min(src.width, x * ratioToOrigX)),
      Math.max(0, Math.min(src.height, y * ratioToOrigY)),
    ]) as Quad;
    const ordered = orderQuad(mapped);

    // 过滤过小框
    const bw = Math.hypot(
      ordered[1][0] - ordered[0][0],
      ordered[1][1] - ordered[0][1],
    );
    const bh = Math.hypot(
      ordered[3][0] - ordered[0][0],
      ordered[3][1] - ordered[0][1],
    );
    if (Math.min(bw, bh) < 4) continue;

    boxes.push(ordered);
  }

  // 从上到下、从左到右排序
  boxes.sort((a, b) => {
    const ay = (a[0][1] + a[2][1]) / 2;
    const by = (b[0][1] + b[2][1]) / 2;
    if (Math.abs(ay - by) > 10) return ay - by;
    return a[0][0] - b[0][0];
  });

  return boxes;
}
