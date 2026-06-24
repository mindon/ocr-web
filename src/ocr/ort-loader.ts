// 运行时加载 onnxruntime-web（从 static 复制到输出根目录的 /onnxruntime 路径）。
// 使用变量形式的动态 import，避免被 biu/Bun 打包器静态解析。

import type { ExecutionProvider } from "./types.ts";

/** onnxruntime-web 的最小类型表面，避免直接依赖其 d.ts */
export interface OrtTensor {
  data: Float32Array | Uint8Array | BigInt64Array | Int32Array;
  dims: readonly number[];
  type: string;
}
export interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
}
export interface OrtModule {
  env: {
    wasm: { wasmPaths: string; numThreads: number; proxy?: boolean };
    logLevel?: string;
  };
  Tensor: new (
    type: string,
    data: Float32Array | Uint8Array,
    dims: readonly number[],
  ) => OrtTensor;
  InferenceSession: {
    create(
      uri: string | ArrayBuffer | Uint8Array,
      options?: Record<string, unknown>,
    ): Promise<OrtSession>;
  };
}

const ORT_BASE = "/onnxruntime/web/dist/";
const ORT_ENTRY = ORT_BASE + "ort.min.mjs";

let ortPromise: Promise<OrtModule> | null = null;

/**
 * 检查当前环境是否支持多线程 WASM
 * 需要：1. SharedArrayBuffer API 2. COOP/COEP 响应头
 */
function isMultiThreadSupported(): boolean {
  if (typeof SharedArrayBuffer === "undefined") return false;
  // 检查是否设置了 COOP/COEP
  // 注意：无法从 JS 直接检测响应头，这里仅检查 API 可用性
  return true;
}

/** 懒加载并配置 onnxruntime-web 模块（单例） */
export async function loadOrt(
  options?: { threadCount?: number },
): Promise<OrtModule> {
  if (!ortPromise) {
    ortPromise = (async () => {
      // 变量化 specifier，阻止打包器把它当成本地模块解析
      const specifier = ORT_ENTRY;
      const mod = (await import(/* @vite-ignore */ specifier)) as
        & OrtModule
        & { default?: OrtModule };
      const ort = (mod.default ?? mod) as OrtModule;

      const threadCount = options?.threadCount ?? 1;
      const useMultiThread = threadCount > 1 && isMultiThreadSupported();

      // wasm 工件位于同目录
      ort.env.wasm.wasmPaths = ORT_BASE;

      if (useMultiThread) {
        // 多线程模式：需要 SharedArrayBuffer 和 COOP/COEP
        ort.env.wasm.numThreads = threadCount;
        ort.env.wasm.proxy = false; // 多线程时不需要 proxy worker
        console.log(`[ORT] 多线程模式：numThreads=${threadCount}`);
      } else {
        // 单线程模式（默认，无需特殊响应头）
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = true;
        if (threadCount > 1) {
          console.warn(
            `[ORT] 多线程不可用（需要 COOP/COEP 响应头），已降级为单线程模式。\n` +
              `请在服务器配置中添加：\n` +
              `  Cross-Origin-Opener-Policy: same-origin\n` +
              `  Cross-Origin-Embedder-Policy: require-corp`,
          );
        }
      }

      return ort;
    })();
  }
  return ortPromise;
}

/** 将参数转换为 onnxruntime 的 executionProviders 配置 */
export function toExecutionProviders(provider: ExecutionProvider): string[] {
  return provider === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
}
