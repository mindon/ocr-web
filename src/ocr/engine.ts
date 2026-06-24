// OCR 引擎：加载模型会话、编排 检测 -> 识别 全流程

import type { OcrOptions, OcrResult } from "./types.ts";
import {
  loadOrt,
  type OrtModule,
  type OrtSession,
  toExecutionProviders,
} from "./ort-loader.ts";
import { runDetection } from "./det.ts";
import { loadCharDict, recognizeAll } from "./rec.ts";
import { formatOcrText } from "./format.ts";

interface LoadedModels {
  ort: OrtModule;
  det: OrtSession;
  rec: OrtSession;
  charDict: string[];
}

const cache = new Map<string, Promise<LoadedModels>>();

function cacheKey(opts: OcrOptions): string {
  return `${opts.modelSize}:${opts.provider}:${opts.threadCount}`;
}

/** 加载（并缓存）指定规格与后端的检测/识别模型 */
async function getModels(opts: OcrOptions): Promise<LoadedModels> {
  const key = cacheKey(opts);
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      // 传递 threadCount 参数
      const ort = await loadOrt({ threadCount: opts.threadCount });
      const eps = toExecutionProviders(opts.provider);
      const sessOpts = {
        executionProviders: eps,
        graphOptimizationLevel: "all",
      };
      const base = `/ppocrv6/${opts.modelSize}`;
      const [det, rec, charDict] = await Promise.all([
        ort.InferenceSession.create(`${base}/det/inference.onnx`, sessOpts),
        ort.InferenceSession.create(`${base}/rec/inference.onnx`, sessOpts),
        loadCharDict(opts.modelSize),
      ]);
      return { ort, det, rec, charDict };
    })();
    cache.set(key, p);
  }
  try {
    return await p;
  } catch (e) {
    cache.delete(key); // 失败不缓存，便于重试
    throw e;
  }
}

export type ProgressFn = (stage: string, detail?: string) => void;

/** 执行完整 OCR 流程 */
export async function runOcr(
  src: HTMLCanvasElement,
  opts: OcrOptions,
  onProgress?: ProgressFn,
): Promise<OcrResult> {
  const t0 = performance.now();
  onProgress?.("加载模型", `${opts.modelSize} / ${opts.provider}`);
  const models = await getModels(opts);

  onProgress?.("文本检测");
  const tDet0 = performance.now();
  const boxes = await runDetection(
    { session: models.det, ort: models.ort },
    src,
    opts,
  );
  const detMs = performance.now() - tDet0;

  onProgress?.("文本识别", `${boxes.length} 个候选框`);
  const tRec0 = performance.now();
  const lines = await recognizeAll(
    { session: models.rec, ort: models.ort, charDict: models.charDict },
    src,
    boxes,
    opts,
  );
  const recMs = performance.now() - tRec0;

  const totalMs = performance.now() - t0;
  return {
    lines,
    formattedText: formatOcrText(lines),
    width: src.width,
    height: src.height,
    timing: { detect: detMs, recognize: recMs, total: totalMs },
  };
}

/** 预热（可选）：提前加载模型 */
export async function warmup(opts: OcrOptions): Promise<void> {
  await getModels(opts);
}
