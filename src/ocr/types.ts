// 共享类型定义

/** 可用模型规格（对应 static/ppocrv6_onnx/<size> 目录） */
export type ModelSize = "tiny" | "small" | "medium";

/** 执行后端 */
export type ExecutionProvider = "wasm" | "webgpu";

/** 场景预设配置名称 */
export type PresetName = "default" | "fast" | "accurate" | "noisy";

/** 场景预设参数配置 */
export interface PresetConfig {
  name: PresetName;
  label: string;
  description: string;
  options: Partial<OcrOptions>;
}

/** 场景预设参数列表 */
export const PRESETS: PresetConfig[] = [
  {
    name: "default",
    label: "默认",
    description: "PP-OCRv6 推荐参数，适合大多数场景",
    options: {},
  },
  {
    name: "fast",
    label: "快速识别",
    description: "使用 Tiny 模型，适合截图、普通文档等简单场景",
    options: {
      modelSize: "tiny",
      detLimitSideLen: 640,
      detThresh: 0.2,
      detBoxThresh: 0.4,
      detUnclipRatio: 1.4,
      detMinSize: 3,
      recScoreThresh: 0.5,
      threadCount: 2,
    },
  },
  {
    name: "accurate",
    label: "高精度",
    description: "使用 Medium 模型，适合合同、发票、低分辨率扫描件",
    options: {
      modelSize: "medium",
      detLimitSideLen: 1280,
      detThresh: 0.15,
      detBoxThresh: 0.3,
      detUnclipRatio: 1.6,
      detMinSize: 2,
      recScoreThresh: 0.4,
      threadCount: 4,
    },
  },
  {
    name: "noisy",
    label: "噪声图片",
    description: "适合手机拍照、歪斜文档等噪声较多的场景",
    options: {
      modelSize: "small",
      detLimitSideLen: 960,
      detThresh: 0.15,
      detBoxThresh: 0.3,
      detUnclipRatio: 1.8,
      detMinSize: 2,
      recScoreThresh: 0.4,
      threadCount: 4,
    },
  },
];

/** OCR 运行参数 */
export interface OcrOptions {
  /** 模型规格 */
  modelSize: ModelSize;
  /** 执行后端 */
  provider: ExecutionProvider;
  /** 检测：长边限制（会被向上取整到 32 的倍数） */
  detLimitSideLen: number;
  /** 检测：二值化阈值 */
  detThresh: number;
  /** 检测：文本框得分阈值 */
  detBoxThresh: number;
  /** 检测：文本框膨胀系数 */
  detUnclipRatio: number;
  /** 检测：最小文本框尺寸（宽或高小于该值的区域会被过滤） */
  detMinSize: number;
  /** 识别：识别结果置信度过滤阈值 */
  recScoreThresh: number;
  /** ONNX 推理线程数（仅 CPU 后端生效） */
  threadCount: number;
}

/** PP-OCRv6 推荐缺省参数（参考 ppocrv6-studio 实践经验） */
export const DEFAULT_OPTIONS: OcrOptions = {
  modelSize: "tiny",
  provider: "wasm",
  detLimitSideLen: 960,
  detThresh: 0.2,
  detBoxThresh: 0.4,
  detUnclipRatio: 1.4,
  detMinSize: 3,
  recScoreThresh: 0.5,
  threadCount: 4,
};

/** 四边形顶点，顺序为 左上、右上、右下、左下 */
export type Quad = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

/** 单条识别结果 */
export interface OcrLine {
  /** 文本框（原图坐标） */
  box: Quad;
  /** 识别文本 */
  text: string;
  /** 识别置信度 0~1 */
  score: number;
}

/** 一次完整 OCR 的结果 */
export interface OcrResult {
  lines: OcrLine[];
  /** 按视觉行分组、自动插入空格后的格式化纯文本 */
  formattedText: string;
  /** 原图宽 */
  width: number;
  /** 原图高 */
  height: number;
  /** 各阶段耗时（毫秒） */
  timing: {
    detect: number;
    recognize: number;
    total: number;
  };
}

/** 历史记录条目 */
export interface HistoryItem {
  id: string;
  createdAt: number;
  /** 原始文件名 */
  name: string;
  /** 缩略图 dataURL */
  thumbnail: string;
  /** 运行参数 */
  options: OcrOptions;
  /** 识别结果 */
  result: OcrResult;
}
