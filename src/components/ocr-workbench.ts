// OCR 工作台：图片输入（拖放/选择/粘贴）+ 参数设置 + 运行 + 结果

import { css, html, LitElement } from "lit";
import { state } from "lit/decorators.js";
import {
  DEFAULT_OPTIONS,
  type ExecutionProvider,
  type ModelSize,
  type OcrOptions,
  type OcrResult,
  type PresetName,
  PRESETS,
} from "../ocr/types.ts";
import { runOcr } from "../ocr/engine.ts";
import { bitmapToCanvas, decodeImage, makeThumbnail } from "../ocr/image.ts";
import { historyStore, uid } from "../state/store.ts";
import "./result-view.ts";

export class OcrWorkbench extends LitElement {
  @state()
  accessor options: OcrOptions = { ...DEFAULT_OPTIONS };
  @state()
  accessor busy = false;
  @state()
  accessor stage = "";
  @state()
  accessor error = "";
  @state()
  accessor result: OcrResult | null = null;
  @state()
  accessor imageUrl = "";
  @state()
  accessor fileName = "";
  @state()
  accessor dragging = false;

  private srcCanvas: HTMLCanvasElement | null = null;

  static styles = css`
    :host {
      display: block;
    }
    .grid {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 16px;
    }
    @media (max-width: 820px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .panel {
      background: #161a22;
      border: 1px solid #232733;
      border-radius: 12px;
      padding: 16px;
    }
    .drop {
      border: 2px dashed #374151;
      border-radius: 12px;
      padding: 28px 16px;
      text-align: center;
      color: #9ca3af;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .drop.dragging {
      border-color: #3b82f6;
      background: #16203255;
    }
    .drop strong {
      color: #e5e7eb;
    }
    .preview {
      margin-top: 12px;
      text-align: center;
    }
    .preview img {
      max-width: 100%;
      max-height: 200px;
      border-radius: 8px;
      border: 1px solid #232733;
    }
    label.field {
      display: block;
      margin: 14px 0 6px;
      font-size: 13px;
      color: #cbd5e1;
    }
    select, input[type="number"], input[type="range"] {
      width: 100%;
      box-sizing: border-box;
      background: #0f1115;
      color: #e5e7eb;
      border: 1px solid #2a3142;
      border-radius: 8px;
      padding: 7px 9px;
      font-size: 13px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .row .val {
      min-width: 42px;
      text-align: right;
      color: #9ca3af;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
    }
    .run {
      margin-top: 18px;
      width: 100%;
      padding: 11px;
      font-size: 15px;
      font-weight: 600;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 9px;
      cursor: pointer;
    }
    .run:disabled {
      background: #374151;
      cursor: not-allowed;
    }
    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 12px;
    }
    .status {
      font-size: 13px;
      color: #93c5fd;
      min-height: 18px;
      word-break: break-all;
      flex: 1;
    }
    .err {
      color: #f87171;
      white-space: pre-wrap;
    }
    .hint {
      color: #6b7280;
      font-size: 12px;
      margin-top: 4px;
    }
    .spinner {
      display: inline-block;
      width: 13px;
      height: 13px;
      border: 2px solid #93c5fd;
      border-top-color: transparent;
      border-radius: 50%;
      margin-right: 6px;
      animation: spin 0.8s linear infinite;
      vertical-align: -2px;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .result-panel {
      min-height: 200px;
    }
    .progress-bar-track {
      margin-top: 8px;
      height: 6px;
      background: #232733;
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      background: #3b82f6;
      border-radius: 3px;
      transition: width 0.3s;
    }
    .cancel-btn {
      margin-left: 10px;
      padding: 2px 10px;
      font-size: 12px;
      background: #ef4444;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .cancel-btn:hover {
      background: #dc2626;
    }
    /* 批量结果列表 */
    .batch-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .batch-header h3 {
      margin: 0;
      font-size: 15px;
      color: #e5e7eb;
    }
    .batch-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 260px;
      overflow-y: auto;
    }
    .batch-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: #161a22;
      border: 1px solid #232733;
      border-radius: 8px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .batch-item:hover {
      border-color: #3b82f6;
    }
    .batch-item.active {
      border-color: #3b82f6;
      background: #1a2040;
    }
    .batch-item-thumb {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #232733;
    }
    .batch-item-info {
      flex: 1;
      min-width: 0;
    }
    .batch-item-name {
      font-size: 13px;
      color: #e5e7eb;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .batch-item-preview {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .batch-item-lines {
      font-size: 11px;
      color: #6b7280;
    }
    .batch-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .batch-nav button {
      padding: 4px 10px;
      font-size: 12px;
      background: #232733;
      color: #e5e7eb;
      border: 1px solid #374151;
      border-radius: 6px;
      cursor: pointer;
    }
    .batch-nav button:hover {
      background: #2a3142;
    }
    .batch-nav .disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .batch-nav .nav-info {
      font-size: 12px;
      color: #9ca3af;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("paste", this.onPaste);
  }

  disconnectedCallback() {
    window.removeEventListener("paste", this.onPaste);
    super.disconnectedCallback();
  }

  private onPaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) this.loadFile(f);
        break;
      }
    }
  };

  private async loadFile(file: File | Blob, name?: string) {
    this.error = "";
    this.result = null;
    this.fileName = name ?? (file as File).name ?? "pasted-image";
    try {
      const bmp = await decodeImage(file);
      this.srcCanvas = bitmapToCanvas(bmp);
      if (this.imageUrl.startsWith("blob:")) URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = URL.createObjectURL(file);
    } catch (e) {
      this.error = "图片解码失败：" + (e as Error).message;
    }
  }

  private onDrop = (e: DragEvent) => {
    e.preventDefault();
    this.dragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith("image/")) this.loadFile(f);
  };

  private onPick = (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    // 多选：加入批量队列
    if (files.length > 1) {
      this.batchQueue = Array.from(files);
      this.runBatch();
    } else {
      // 单选：正常处理
      const f = files[0];
      if (f) this.loadFile(f);
    }
  };

  /** 取消批量识别 */
  private cancelBatch() {
    this.batchCancelling = true;
  }

  /** 批量识别 */
  private async runBatch() {
    if (this.batchQueue.length === 0 || this.busy) return;

    this.busy = true;
    this.error = "";
    this.result = null;
    this.batchCancelling = false;
    this.batchResults = [];
    this.showingBatchResults = false;
    this.batchViewIndex = -1;
    this.batchProcessed = 0;
    this.batchTotal = this.batchQueue.length;

    try {
      const total = this.batchQueue.length;
      for (let i = 0; i < total; i++) {
        // 检查取消
        if (this.batchCancelling) {
          this.stage = `已取消（已完成 ${this.batchProcessed}/${total}）`;
          break;
        }

        const file = this.batchQueue[i];
        this.batchProgress = `批量识别（${i + 1}/${total}）`;
        this.stage = this.batchProgress;

        // 加载图片
        const bmp = await decodeImage(file);
        const canvas = bitmapToCanvas(bmp);

        // 识别
        const res = await runOcr(canvas, this.options, (stage) => {
          if (this.batchCancelling) return;
          this.stage = `${this.batchProgress} - ${stage}`;
        });

        // 保存结果到历史
        historyStore.add({
          id: uid(),
          createdAt: Date.now(),
          name: file.name,
          thumbnail: makeThumbnail(canvas),
          options: { ...this.options },
          result: res,
        });

        // 收集批量结果
        const thumb = makeThumbnail(canvas);
        this.batchResults = [
          ...this.batchResults,
          { name: file.name, thumbnail: thumb, result: res },
        ];
        this.batchProcessed = this.batchResults.length;
      }

      const done = this.batchCancelling
        ? `已取消（已完成 ${this.batchProcessed} 张）`
        : `批量完成：共识别 ${this.batchResults.length} 张图片`;
      this.stage = done;

      // 批量完成后，进入「查看全部结果」模式，默认显示第一张
      if (this.batchResults.length > 0) {
        this.showingBatchResults = true;
        this.viewBatchResult(0);
      }
    } catch (e) {
      this.error = "批量识别失败：" + (e as Error).message;
      this.stage = "";
    } finally {
      this.busy = false;
      this.batchQueue = [];
      this.batchProgress = "";
      this.batchCancelling = false;
    }
  }

  /** 在批量结果列表中切换查看 */
  private viewBatchResult(index: number) {
    this.batchViewIndex = index;
    const item = this.batchResults[index];
    if (!item) return;
    this.result = item.result;
    this.fileName = item.name;
    // 重新创建 object URL 用于预览
    this.imageUrl = item.thumbnail;
  }

  /** 退出批量结果查看，回到普通模式 */
  private exitBatchResults() {
    this.showingBatchResults = false;
    this.batchResults = [];
    this.batchViewIndex = -1;
  }

  private setOpt<K extends keyof OcrOptions>(k: K, v: OcrOptions[K]) {
    this.options = { ...this.options, [k]: v };
  }

  /** 应用预设参数配置 */
  private applyPreset(name: PresetName) {
    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) return;
    this.options = { ...DEFAULT_OPTIONS, ...preset.options };
  }

  /** 批量处理：队列中的文件列表 */
  @state()
  private accessor batchQueue: File[] = [];

  /** 批量处理：当前进度描述 */
  @state()
  private accessor batchProgress = "";

  /** 批量处理：总张数（用于进度条） */
  @state()
  private accessor batchTotal = 0;

  /** 批量处理：已完成张数（用于进度条） */
  @state()
  private accessor batchProcessed = 0;

  /** 批量处理：是否正在取消 */
  @state()
  private accessor batchCancelling = false;

  /**
   * 批量处理结果列表，每项包含文件信息和识别结果，
   * 用于批量完成后统一展示所有结果。
   */
  @state()
  private accessor batchResults: {
    name: string;
    thumbnail: string;
    result: OcrResult;
  }[] = [];

  /** 批量处理完成后，是否处于「查看全部结果」模式 */
  @state()
  private accessor showingBatchResults = false;

  /** 在批量结果列表中，当前正在查看的序号（-1 表示未选中） */
  @state()
  private accessor batchViewIndex = -1;

  private async run() {
    if (!this.srcCanvas || this.busy) return;
    this.busy = true;
    this.error = "";
    this.result = null;
    this.stage = "准备中…";
    try {
      const res = await runOcr(
        this.srcCanvas,
        this.options,
        (stage, detail) => {
          this.stage = detail ? `${stage}（${detail}）` : stage;
        },
      );
      this.result = res;
      this.stage = `完成：识别 ${res.lines.length} 行`;
      // 写入历史
      historyStore.add({
        id: uid(),
        createdAt: Date.now(),
        name: this.fileName,
        thumbnail: makeThumbnail(this.srcCanvas),
        options: { ...this.options },
        result: res,
      });
    } catch (e) {
      this.error = "运行失败：" + (e as Error).message;
      this.stage = "";
    } finally {
      this.busy = false;
    }
  }

  render() {
    const o = this.options;
    return html`
      <div class="grid">
        <div class="panel">
          <div
            class="drop ${this.dragging ? "dragging" : ""}"
            @click="${() =>
              (this.renderRoot.querySelector("#file") as HTMLInputElement)
                ?.click()}"
            @dragover="${(e: DragEvent) => {
              e.preventDefault();
              this.dragging = true;
            }}"
            @dragleave="${() => (this.dragging = false)}"
            @drop="${this.onDrop}"
          >
            <div><strong>拖放图片</strong> 到此处</div>
            <div class="hint">
              或点击选择 · 支持 Ctrl/⌘+V 粘贴 · 支持多选批量处理
            </div>
            <input
              id="file"
              type="file"
              accept="image/*"
              multiple
              hidden
              @change="${this.onPick}"
            />
          </div>
          ${this.imageUrl
            ? html`
              <div class="preview">
                <img src="${this.imageUrl}" alt="预览" />
                <div class="hint">${this.fileName}</div>
              </div>
            `
            : ""}

          <button class="run" ?disabled="${!this.srcCanvas ||
            this.busy}" @click="${() => this.run()}">
            ${this.busy ? "识别中…" : "开始识别"}
          </button>
          <div class="status-row">
            <div class="status">
              ${this.busy
                ? html`
                  <span class="spinner"></span>${this.batchProgress
                    ? this.batchProgress
                    : "识别中…"}
                `
                : this.error
                ? html`
                  <span class="err">${this.error}</span>
                `
                : this.stage}
            </div>
            ${this.busy && this.batchProgress
              ? html`
                <button class="cancel-btn" @click="${this
                  .cancelBatch}">取消</button>
              `
              : ""}
          </div>
          ${this.busy && this.batchProgress
            ? html`
              <div class="progress-bar-track">
                <div
                  class="progress-bar-fill"
                  style="width: ${(this.batchProcessed / this.batchTotal) *
                    100}%"
                >
                </div>
              </div>
            `
            : ""}

          <label class="field">场景预设</label>
          <select
            @change="${(e: Event) =>
              this.applyPreset(
                (e.target as HTMLSelectElement).value as PresetName,
              )}"
          >
            ${PRESETS.map(
              (p) =>
                html`
                  <option value="${p.name}">${p.label} - ${p
                    .description}</option>
                `,
            )}
          </select>

          <label class="field">推理线程数</label>
          <div class="row">
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              .value="${String(o.threadCount)}"
              @input="${(e: Event) =>
                this.setOpt(
                  "threadCount",
                  +(e.target as HTMLInputElement).value,
                )}"
            />
            <span class="val">${o.threadCount}</span>
          </div>
          <div class="hint">多线程需要服务器配置 COOP/COEP 响应头</div>

          <label class="field">模型规格</label>
          <select
            .value="${o.modelSize}"
            @change="${(e: Event) =>
              this.setOpt(
                "modelSize",
                (e.target as HTMLSelectElement).value as ModelSize,
              )}"
          >
            <option value="tiny">PP-OCRv6 tiny（最快）</option>
            <option value="small">PP-OCRv6 small（均衡）</option>
            <option value="medium">PP-OCRv6 medium（最准）</option>
          </select>

          <label class="field">执行后端</label>
          <select
            .value="${o.provider}"
            @change="${(e: Event) =>
              this.setOpt(
                "provider",
                (e.target as HTMLSelectElement).value as ExecutionProvider,
              )}"
          >
            <option value="wasm">WASM（兼容）</option>
            <option value="webgpu">WebGPU（加速）</option>
          </select>

          <label class="field">检测长边限制：<span>${o
            .detLimitSideLen}</span></label>
          <div class="row">
            <input
              type="range"
              min="320"
              max="1600"
              step="32"
              .value="${String(o.detLimitSideLen)}"
              @input="${(e: Event) =>
                this.setOpt(
                  "detLimitSideLen",
                  +(e.target as HTMLInputElement).value,
                )}"
            />
          </div>

          <label class="field">二值化阈值 detThresh</label>
          <div class="row">
            <input
              type="range"
              min="0.05"
              max="0.6"
              step="0.05"
              .value="${String(o.detThresh)}"
              @input="${(e: Event) =>
                this.setOpt(
                  "detThresh",
                  +(e.target as HTMLInputElement).value,
                )}"
            />
            <span class="val">${o.detThresh.toFixed(2)}</span>
          </div>

          <label class="field">文本框得分阈值 boxThresh</label>
          <div class="row">
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              .value="${String(o.detBoxThresh)}"
              @input="${(e: Event) =>
                this.setOpt(
                  "detBoxThresh",
                  +(e.target as HTMLInputElement).value,
                )}"
            />
            <span class="val">${o.detBoxThresh.toFixed(2)}</span>
          </div>

          <label class="field">膨胀系数 unclipRatio</label>
          <div class="row">
            <input
              type="range"
              min="1.0"
              max="2.5"
              step="0.1"
              .value="${String(o.detUnclipRatio)}"
              @input="${(e: Event) =>
                this.setOpt(
                  "detUnclipRatio",
                  +(e.target as HTMLInputElement).value,
                )}"
            />
            <span class="val">${o.detUnclipRatio.toFixed(1)}</span>
          </div>

          <label class="field">最小框尺寸 detMinSize</label>
          <div class="row">
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              .value="${String(o.detMinSize)}"
              @input="${(e: Event) =>
                this.setOpt(
                  "detMinSize",
                  +(e.target as HTMLInputElement).value,
                )}"
            />
            <span class="val">${o.detMinSize}</span>
          </div>

          <label class="field">识别置信度阈值</label>
          <div class="row">
            <input
              type="range"
              min="0"
              max="0.95"
              step="0.05"
              .value="${String(o.recScoreThresh)}"
              @input="${(e: Event) =>
                this.setOpt(
                  "recScoreThresh",
                  +(e.target as HTMLInputElement).value,
                )}"
            />
            <span class="val">${o.recScoreThresh.toFixed(2)}</span>
          </div>
        </div>

        <div class="panel result-panel">
          ${this.showingBatchResults && this.batchResults.length > 0
            // 批量结果查看模式
            ? html`
              <div class="batch-header">
                <h3>批量结果（${this.batchResults.length} 张）</h3>
                <button class="cancel-btn" @click="${this
                  .exitBatchResults}">退出批量查看</button>
              </div>
              ${this.batchViewIndex >= 0
                // 查看某一张的详细结果
                ? html`
                  <div class="batch-nav">
                    <button @click="${() => {
                      this.batchViewIndex = -1;
                    }}">← 返回列表</button>
                    <button
                      class="${this.batchViewIndex <= 0 ? "disabled" : ""}"
                      @click="${() =>
                        this.viewBatchResult(this.batchViewIndex - 1)}"
                      ?disabled="${this.batchViewIndex <= 0}"
                    >
                      ← 上一张
                    </button>
                    <span class="nav-info">${this.batchViewIndex + 1} / ${this
                      .batchResults.length}</span>
                    <button
                      class="${this.batchViewIndex >=
                          this.batchResults.length - 1
                        ? "disabled"
                        : ""}"
                      @click="${() =>
                        this.viewBatchResult(this.batchViewIndex + 1)}"
                      ?disabled="${this.batchViewIndex >=
                        this.batchResults.length - 1}"
                    >
                      下一张 →
                    </button>
                  </div>
                  <result-view
                    .imageUrl="${this.imageUrl}"
                    .fileName="${this.fileName}"
                    .result="${this.result}"
                  ></result-view>
                `
                // 显示批量结果列表
                : html`
                  <div class="batch-list">
                    ${this.batchResults.map(
                      (item, idx) =>
                        html`
                          <div
                            class="batch-item ${this.batchViewIndex === idx
                              ? "active"
                              : ""}"
                            @click="${() => this.viewBatchResult(idx)}"
                          >
                            <img class="batch-item-thumb" src="${item
                              .thumbnail}" alt="${item.name}" />
                            <div class="batch-item-info">
                              <div class="batch-item-name">${item.name}</div>
                              <div class="batch-item-preview">${item.result
                                .formattedText.slice(0, 60)}</div>
                              <div class="batch-item-lines">${item.result.lines
                                .length} 行 · ${(
                                  item.result.timing.total / 1000
                                ).toFixed(1)}s</div>
                            </div>
                          </div>
                        `,
                    )}
                  </div>
                `}
            `
            : this.result
            ? html`
              <result-view
                .imageUrl="${this.imageUrl}"
                .fileName="${this.fileName}"
                .result="${this.result}"
              ></result-view>
            `
            : html`
              <div style="color:#6b7280;padding:40px;text-align:center">
                选择图片并点击「开始识别」查看结果
              </div>
            `}
        </div>
      </div>
    `;
  }
}

customElements.define("ocr-workbench", OcrWorkbench);
