// OCR 历史记录：列表 + 详情查看

import { css, html, LitElement } from "lit";
import { state } from "lit/decorators.js";
import { historyStore } from "../state/store.ts";
import type { HistoryItem } from "../ocr/types.ts";
import "./result-view.ts";

export class OcrHistory extends LitElement {
  @state()
  accessor items: HistoryItem[] = [];
  @state()
  accessor selectedId = "";

  private unsub: (() => void) | null = null;

  static styles = css`
    :host {
      display: block;
    }
    .grid {
      display: grid;
      grid-template-columns: 280px 1fr;
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
      padding: 14px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .head .sp {
      flex: 1;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 72vh;
      overflow: auto;
    }
    .item {
      display: flex;
      gap: 10px;
      padding: 8px;
      border-radius: 9px;
      cursor: pointer;
      border: 1px solid #232733;
      background: #0f1115;
      align-items: center;
    }
    .item.active {
      border-color: #3b82f6;
      background: #1d2330;
    }
    .item:hover {
      border-color: #374151;
    }
    .item img {
      width: 56px;
      height: 56px;
      object-fit: cover;
      border-radius: 6px;
      background: #000;
    }
    .item .info {
      flex: 1;
      min-width: 0;
    }
    .item .name {
      color: #e5e7eb;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item .sub {
      color: #6b7280;
      font-size: 11px;
      margin-top: 2px;
    }
    .item .del {
      color: #6b7280;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 16px;
    }
    .item .del:hover {
      color: #f87171;
    }
    .empty {
      color: #6b7280;
      padding: 36px;
      text-align: center;
    }
    button.act {
      background: #1f2937;
      color: #e5e7eb;
      border: 1px solid #374151;
      border-radius: 7px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 12px;
    }
    button.act:hover {
      background: #374151;
    }
    .tag {
      font-size: 11px;
      color: #9ca3af;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.refresh();
    this.unsub = historyStore.subscribe(() => this.refresh());
  }

  disconnectedCallback() {
    this.unsub?.();
    super.disconnectedCallback();
  }

  private refresh() {
    this.items = [...historyStore.list()];
    if (!this.selectedId && this.items.length) {
      this.selectedId = this.items[0].id;
    }
    if (this.selectedId && !this.items.find((i) => i.id === this.selectedId)) {
      this.selectedId = this.items[0]?.id ?? "";
    }
  }

  private fmtTime(t: number): string {
    const d = new Date(t);
    return d.toLocaleString();
  }

  // 注意：方法名不能叫 remove —— 会覆盖 DOM 原生 ChildNode.prototype.remove()，
  // 导致 lit 在移除本元素时误调用此方法（e 为 undefined）而崩溃。
  private removeItem(e: Event, id: string) {
    e.stopPropagation();
    historyStore.remove(id);
  }

  private clearAll() {
    if (confirm("确认清空全部历史记录？")) historyStore.clear();
  }

  render() {
    const sel = this.items.find((i) => i.id === this.selectedId);
    return html`
      <div class="grid">
        <div class="panel">
          <div class="head">
            <strong>历史记录</strong>
            <span class="tag">(${this.items.length})</span>
            <span class="sp"></span>
            ${this.items.length
              ? html`
                <button class="act" @click="${() =>
                  this.clearAll()}">清空</button>
              `
              : ""}
          </div>
          ${this.items.length === 0
            ? html`
              <div class="empty">暂无记录</div>
            `
            : html`
              <div class="list">
                ${this.items.map(
                  (it) =>
                    html`
                      <div
                        class="item ${it.id === this.selectedId
                          ? "active"
                          : ""}"
                        @click="${() => (this.selectedId = it.id)}"
                      >
                        <img src="${it.thumbnail}" alt="" />
                        <div class="info">
                          <div class="name">${it.name}</div>
                          <div class="sub">
                            ${it.result.lines.length} 行 · ${it.options
                              .modelSize} · ${this.fmtTime(it.createdAt)}
                          </div>
                        </div>
                        <button class="del" title="删除" @click="${(e: Event) =>
                          this.removeItem(e, it.id)}">×</button>
                      </div>
                    `,
                )}
              </div>
            `}
        </div>

        <div class="panel">
          ${sel
            ? html`
              <result-view .imageUrl="${sel.thumbnail}" .result="${sel
                .result}"></result-view>
            `
            : html`
              <div class="empty">选择左侧记录查看详情</div>
            `}
        </div>
      </div>
    `;
  }
}

customElements.define("ocr-history", OcrHistory);
