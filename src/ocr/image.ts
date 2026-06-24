// 图像处理工具：解码、缩放、归一化、旋转裁剪

import type { Quad } from "./types.ts";

/** ImageNet 归一化均值/方差（PaddleOCR 检测，按 BGR 通道顺序应用，与 inference.yml 一致） */
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];

/** 从 Blob 解码出位图 */
export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(blob);
}

/** 将位图绘制到一个与其等大的 canvas，返回该 canvas */
export function bitmapToCanvas(bmp: ImageBitmap): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  return c;
}

export interface DetInput {
  /** NCHW Float32，通道顺序 BGR */
  data: Float32Array;
  resizedW: number;
  resizedH: number;
  /** 原图宽/缩放后宽 的比值，用于把检测框映射回原图 */
  ratioW: number;
  ratioH: number;
}

function roundTo32(x: number): number {
  const v = Math.round(x / 32) * 32;
  return Math.max(32, v);
}

/**
 * 检测前处理：等比缩放到长边 <= limitSideLen，且宽高对齐到 32 的倍数。
 * 输出 BGR、ImageNet 归一化后的 NCHW 张量数据（与 inference.yml 一致）。
 */
export function preprocessDet(
  src: HTMLCanvasElement,
  limitSideLen: number,
): DetInput {
  const w = src.width;
  const h = src.height;
  let ratio = 1;
  const maxSide = Math.max(w, h);
  if (maxSide > limitSideLen) ratio = limitSideLen / maxSide;
  const resizedW = roundTo32(w * ratio);
  const resizedH = roundTo32(h * ratio);

  const tmp = document.createElement("canvas");
  tmp.width = resizedW;
  tmp.height = resizedH;
  const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
  tctx.drawImage(src, 0, 0, w, h, 0, 0, resizedW, resizedH);
  const img = tctx.getImageData(0, 0, resizedW, resizedH).data;

  const plane = resizedW * resizedH;
  const data = new Float32Array(3 * plane);
  // 通道顺序 BGR（与 inference.yml img_mode:BGR 一致）：
  // data[0..]=B, data[plane..]=G, data[2*plane..]=R
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    const r = img[p] / 255;
    const g = img[p + 1] / 255;
    const b = img[p + 2] / 255;
    data[i] = (b - DET_MEAN[0]) / DET_STD[0];
    data[plane + i] = (g - DET_MEAN[1]) / DET_STD[1];
    data[2 * plane + i] = (r - DET_MEAN[2]) / DET_STD[2];
  }

  return {
    data,
    resizedW,
    resizedH,
    ratioW: w / resizedW,
    ratioH: h / resizedH,
  };
}

/** 计算两点距离 */
function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export interface RecCrop {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * 根据四边形从原图裁剪文本区域，做透视/仿射拉直为水平矩形。
 * 竖排文本（高远大于宽）会旋转 90 度。
 */
export function cropQuad(src: HTMLCanvasElement, box: Quad): RecCrop {
  const [tl, tr, br, bl] = box;
  const widthTop = dist(tl, tr);
  const widthBottom = dist(bl, br);
  const heightLeft = dist(tl, bl);
  const heightRight = dist(tr, br);
  const cropW = Math.max(16, Math.round(Math.max(widthTop, widthBottom)));
  const cropH = Math.max(16, Math.round(Math.max(heightLeft, heightRight)));

  // 仿射变换：用三个角点（tl、tr、bl）把四边形映射到 cropW×cropH 矩形
  const out = document.createElement("canvas");
  out.width = cropW;
  out.height = cropH;
  const octx = out.getContext("2d", { willReadFrequently: true })!;

  // 求解仿射矩阵：(srcX,srcY) -> (dstX,dstY)
  // 目标: tl->(0,0), tr->(cropW,0), bl->(0,cropH)
  const x0 = tl[0], y0 = tl[1];
  const x1 = tr[0], y1 = tr[1];
  const x2 = bl[0], y2 = bl[1];
  // canvas setTransform(a,b,c,d,e,f) 将源坐标映射到目标，需要反向矩阵。
  // 这里直接构造从目标->源 的矩阵并用 drawImage + clip 的方式实现较繁琐，
  // 改为：以 tl 为原点，沿 (tr-tl)/cropW 与 (bl-tl)/cropH 两个基向量采样。
  const ux = (x1 - x0) / cropW, uy = (y1 - y0) / cropW;
  const vx = (x2 - x0) / cropH, vy = (y2 - y0) / cropH;

  // setTransform 映射：dst = M * src? 我们希望把源图按基向量绘制到目标。
  // 使用源->目标 仿射：源点 s = tl + i*u + j*v （i in [0,cropW], j in [0,cropH]）
  // 对应目标点 (i,j)。即目标(i,j) -> 源(x0+ i*ux + j*vx, y0 + i*uy + j*vy)
  // drawImage 需要 源->目标，故取该矩阵的逆作为 ctx.transform。
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-8) {
    // 退化，回退为轴对齐裁剪
    const minX = Math.min(tl[0], tr[0], br[0], bl[0]);
    const minY = Math.min(tl[1], tr[1], br[1], bl[1]);
    octx.drawImage(src, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  } else {
    // 逆矩阵 (源->目标)
    const ia = vy / det;
    const ib = -uy / det;
    const ic = -vx / det;
    const id = ux / det;
    // 目标 = I * (源 - tl)； ctx.transform(a,b,c,d,e,f): 目标 = [a c; b d]*源 + [e;f]
    const e = -(ia * x0 + ic * y0);
    const f = -(ib * x0 + id * y0);
    octx.save();
    octx.setTransform(ia, ib, ic, id, e, f);
    octx.drawImage(src, 0, 0);
    octx.restore();
  }

  // 竖排：高/宽 >= 1.5 时顺时针旋转 90 度
  if (cropH * 1.0 / cropW >= 1.5) {
    const rot = document.createElement("canvas");
    rot.width = cropH;
    rot.height = cropW;
    const rctx = rot.getContext("2d", { willReadFrequently: true })!;
    rctx.translate(cropH, 0);
    rctx.rotate(Math.PI / 2);
    rctx.drawImage(out, 0, 0);
    return { canvas: rot, width: cropH, height: cropW };
  }
  return { canvas: out, width: cropW, height: cropH };
}

export interface RecInput {
  data: Float32Array;
  width: number;
  height: number;
}

/**
 * 识别前处理：缩放到高 recH，宽按比例（限制在 [16, maxW]）。
 * PP-OCRv6 rec（inference.yml）使用 img_mode:BGR + RecResizeImg 内置归一化
 * (x/255 - 0.5) / 0.5，映射到 [-1, 1]，输出 NCHW。
 */
export function preprocessRec(
  crop: RecCrop,
  recH = 48,
  maxW = 1200,
): RecInput {
  const ratio = crop.width / crop.height;
  let targetW = Math.round(recH * ratio);
  targetW = Math.max(16, Math.min(maxW, targetW));

  const tmp = document.createElement("canvas");
  tmp.width = targetW;
  tmp.height = recH;
  const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
  tctx.drawImage(
    crop.canvas,
    0,
    0,
    crop.width,
    crop.height,
    0,
    0,
    targetW,
    recH,
  );
  const img = tctx.getImageData(0, 0, targetW, recH).data;

  const plane = targetW * recH;
  const data = new Float32Array(3 * plane);
  // 通道顺序 BGR（与 inference.yml img_mode:BGR 一致），归一化 (x/255-0.5)/0.5
  // data[0..]=B, data[plane..]=G, data[2*plane..]=R
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    const r = img[p] / 255;
    const g = img[p + 1] / 255;
    const b = img[p + 2] / 255;
    data[i] = (b - 0.5) / 0.5;
    data[plane + i] = (g - 0.5) / 0.5;
    data[2 * plane + i] = (r - 0.5) / 0.5;
  }
  return { data, width: targetW, height: recH };
}

/** 生成缩略图 dataURL */
export function makeThumbnail(src: HTMLCanvasElement, maxSide = 240): string {
  const ratio = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * ratio));
  const h = Math.max(1, Math.round(src.height * ratio));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(src, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.7);
}
