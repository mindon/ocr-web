/**
 * OCR 结果后处理：将逐框识别结果格式化为保留空格/换行的纯文本
 *
 * 逻辑：
 *  1. 按框的 y 中心分组为「视觉行」（阈值 = 中位数框高 × 0.5）
 *  2. 同一视觉行内按 x 排序
 *  3. 基于框间距决定是否插入空格（间距 > 1.5 × 平均字符宽度时插入）
 */

import type { Quad } from "./types.ts";

export interface FormatInput {
  box: Quad;
  text: string;
}

/**
 * 将识别结果格式化为保留空格/换行的纯文本
 */
export function formatOcrText(lines: FormatInput[]): string {
  if (lines.length === 0) return "";

  // 计算自适应行分组阈值：取框高度的中位数
  const heights = lines.map((l) => {
    const ys = l.box.map((p: [number, number]) => p[1]);
    return Math.max(...ys) - Math.min(...ys);
  }).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] ?? 10;
  const lineThresh = Math.max(medianH * 0.5, 5);

  // 排序：先按 y 中心，再按 x
  const sorted = [...lines].sort((a, b) => {
    const ay = (a.box[0][1] + a.box[2][1]) / 2;
    const by = (b.box[0][1] + b.box[2][1]) / 2;
    if (Math.abs(ay - by) > lineThresh) return ay - by;
    return a.box[0][0] - b.box[0][0];
  });

  // 分组为视觉行
  const groups: FormatInput[][] = [];
  let cur: FormatInput[] = [];
  let curY: number | null = null;
  for (const ln of sorted) {
    const y = (ln.box[0][1] + ln.box[2][1]) / 2;
    if (curY === null || Math.abs(y - curY) < lineThresh) {
      cur.push(ln);
      if (curY === null) curY = y;
    } else {
      groups.push(cur);
      cur = [ln];
      curY = y;
    }
  }
  if (cur.length > 0) groups.push(cur);

  // 每行内按 x 排序，基于框间距决定是否插入空格
  return groups
    .map((g) => {
      g.sort((a, b) => a.box[0][0] - b.box[0][0]);
      let out = "";
      for (let i = 0; i < g.length; i++) {
        if (i > 0) {
          const prev = g[i - 1];
          const curr = g[i];
          const prevRight = Math.max(
            ...prev.box.map((p: [number, number]) => p[0]),
          );
          const currLeft = Math.min(
            ...curr.box.map((p: [number, number]) => p[0]),
          );
          const gap = currLeft - prevRight;
          const prevW = prevRight -
            Math.min(...prev.box.map((p: [number, number]) => p[0]));
          const avgCharW = prev.text.length > 0
            ? prevW / prev.text.length
            : medianH * 0.5;
          // 间距 > 1.5 倍字符宽度时插入空格
          if (gap > avgCharW * 1.5) out += " ";
        }
        out += g[i].text;
      }
      return out;
    })
    .join("\n");
}
