// 结果可视化：在图像上叠加文本框，并列出识别文本

import { css, html, LitElement, type PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import type { OcrResult } from "../ocr/types.ts";
import { formatOcrText } from "../ocr/format.ts";
import {
  exportAndDownloadCsv,
  exportAndDownloadExcel,
  exportAndDownloadMarkdown,
} from "../ocr/exporter.ts";

export class ResultView extends LitElement {
  @property({ type: String, attribute: "image-url" })
  accessor imageUrl = "";
  @property({ type: String, attribute: "file-name" })
  accessor fileName = "image";
  @property({ type: Object })
  accessor result: OcrResult | null = null;
  @state()
  private accessor hovered = -1;

  static styles = css`
    :host {
      display: block;
    }
    .wrap {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
    }
    @media (max-width: 860px) {
      .wrap {
        grid-template-columns: 1fr;
      }
    }
    .canvas-box {
      position: relative;
      background: #0f1115;
      border-radius: 10px;
      overflow: auto;
      border: 1px solid #232733;
      max-height: 70vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }
    canvas {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .lines {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 70vh;
      overflow: auto;
      padding-right: 4px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .toolbar .sp {
      flex: 1;
    }
    .line {
      display: flex;
      gap: 8px;
      align-items: baseline;
      padding: 8px 10px;
      background: #161a22;
      border: 1px solid #232733;
      border-radius: 8px;
      cursor: default;
      transition: background 0.12s, border-color 0.12s;
    }
    .line:hover, .line.active {
      background: #1d2330;
      border-color: #3b82f6;
    }
    .line .idx {
      color: #6b7280;
      font-variant-numeric: tabular-nums;
      min-width: 24px;
    }
    .line .txt {
      flex: 1;
      word-break: break-all;
      color: #e5e7eb;
    }
    .line .score {
      color: #10b981;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .empty {
      color: #6b7280;
      padding: 24px;
      text-align: center;
    }
    button {
      background: #1f2937;
      color: #e5e7eb;
      border: 1px solid #374151;
      border-radius: 7px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
    }
    button:hover {
      background: #374151;
    }
    .meta {
      color: #9ca3af;
      font-size: 12px;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 120px;
      margin-top: 8px;
      background: #0f1115;
      color: #e5e7eb;
      border: 1px solid #232733;
      border-radius: 8px;
      padding: 10px;
      font-family: ui-monospace, monospace;
      resize: vertical;
    }
  `;

  private img: HTMLImageElement | null = null;
  private scale = 1;

  updated(changed: PropertyValues) {
    if (
      changed.has("imageUrl") || changed.has("result") || changed.has("hovered")
    ) {
      this.draw();
    }
  }

  private ensureImage(): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (this.img && this.img.src === this.imageUrl) {
        resolve(this.img);
        return;
      }
      const im = new Image();
      im.onload = () => {
        this.img = im;
        resolve(im);
      };
      im.onerror = reject;
      im.src = this.imageUrl;
    });
  }

  private async draw() {
    if (!this.imageUrl || !this.result) return;
    const canvas = this.renderRoot.querySelector("canvas") as
      | HTMLCanvasElement
      | null;
    if (!canvas) return;
    let im: HTMLImageElement;
    try {
      im = await this.ensureImage();
    } catch {
      return;
    }
    const maxW = 1100;
    this.scale = Math.min(1, maxW / im.naturalWidth);
    const W = Math.round(im.naturalWidth * this.scale);
    const H = Math.round(im.naturalHeight * this.scale);
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(im, 0, 0, W, H);

    // 结果坐标基于原图，按结果宽高换算
    const sx = W / this.result.width;
    const sy = H / this.result.height;
    this.result.lines.forEach((ln, i) => {
      const active = i === this.hovered;
      ctx.beginPath();
      ln.box.forEach(([x, y], k) => {
        const px = x * sx;
        const py = y * sy;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.lineWidth = active ? 3 : 1.6;
      ctx.strokeStyle = active ? "#f59e0b" : "#3b82f6";
      ctx.stroke();
      if (active) {
        ctx.fillStyle = "rgba(245,158,11,0.18)";
        ctx.fill();
      }
    });
  }

  private allText(): string {
    if (!this.result) return "";
    if (this.result.formattedText) return this.result.formattedText;
    // 兼容旧历史记录（无 formattedText 字段）
    return formatOcrText(this.result.lines);
  }

  private async copyAll() {
    try {
      await navigator.clipboard.writeText(this.allText());
    } catch {
      /* 忽略 */
    }
  }

  private async copyRaw() {
    const text = (this.result?.lines ?? []).map((l) => l.text).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 忽略 */
    }
  }

  private exportCsv() {
    if (!this.result) return;
    exportAndDownloadCsv(this.result, this.fileName);
  }

  private exportMarkdown() {
    if (!this.result) return;
    exportAndDownloadMarkdown(this.result, this.fileName);
  }

  private exportExcel() {
    if (!this.result) return;
    exportAndDownloadExcel(this.result, this.fileName);
  }

  render() {
    const r = this.result;
    if (!r) {
      return html`
        <div class="empty">暂无结果</div>
      `;
    }
    return html`
      <div class="wrap">
        <div>
          <div class="canvas-box"><canvas></canvas></div>
          <div class="meta">
            ${r.width}×${r.height}px · 检测 ${r.timing.detect.toFixed(
              0,
            )}ms · 识别 ${r.timing.recognize.toFixed(0)}ms
            · 共 ${r.timing.total.toFixed(0)}ms
          </div>
        </div>
        <div>
          <div class="toolbar">
            <strong>识别结果（${r.lines.length} 行）</strong>
            <p>
              <button @click="${() => this.copyAll()}">复制文本</button>
              <button @click="${() => this.copyRaw()}">原始行</button>
              <button @click="${() => this.exportCsv()}">导出CSV</button>
              <button @click="${() => this.exportMarkdown()}">MD</button>
              <button @click="${() => this.exportExcel()}">XLSX</button>
            </p>
          </div>
          <div class="lines">
            ${r.lines.length === 0
              ? html`
                <div class="empty">未识别到文本</div>
              `
              : r.lines.map(
                (ln, i) =>
                  html`
                    <div
                      class="line ${i === this.hovered ? "active" : ""}"
                      @mouseenter="${() => (this.hovered = i)}"
                      @mouseleave="${() => (this.hovered = -1)}"
                    >
                      <span class="idx">${i + 1}</span>
                      <span class="txt">${ln.text}</span>
                      <span class="score">${(ln.score * 100).toFixed(0)}%</span>
                    </div>
                  `,
              )}
          </div>
          <textarea
            readonly
            .value="${this.allText()}"
            placeholder="格式化文本（自动保留空格）"
          ></textarea>
        </div>
      </div>
    `;
  }
}

customElements.define("result-view", ResultView);
