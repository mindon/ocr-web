// 应用根：选项卡组织「OCR 工作台」与「历史记录」

import { css, html, LitElement } from "lit";
import { state } from "lit/decorators.js";
import "./components/ocr-workbench.ts";
import "./components/ocr-history.ts";

type Tab = "workbench" | "history";

export class AppRoot extends LitElement {
  @state()
  accessor tab: Tab = "workbench";

  static styles = css`
    :host {
      display: block;
    }
    header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 20px;
      border-bottom: 1px solid #232733;
      background: #11141b;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .logo {
      font-size: 17px;
      font-weight: 700;
      color: #e5e7eb;
    }
    .logo .ver {
      color: #60a5fa;
      font-weight: 600;
    }
    nav {
      display: flex;
      gap: 4px;
      margin-left: 8px;
    }
    nav button {
      background: transparent;
      border: none;
      color: #9ca3af;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    }
    nav button.active {
      background: #1d2330;
      color: #e5e7eb;
    }
    nav button:hover {
      color: #e5e7eb;
    }
    .sp {
      flex: 1;
    }
    .gh {
      color: #6b7280;
      font-size: 12px;
      text-decoration: none;
    }
    .gh:hover {
      color: #9ca3af;
    }
    main {
      padding: 20px;
      max-width: 1280px;
      margin: 0 auto;
    }
  `;

  render() {
    return html`
      <header>
        <div class="logo">OCR Web</div>
        <nav>
          <button
            class="${this.tab === "workbench" ? "active" : ""}"
            @click="${() => (this.tab = "workbench")}"
          >
            工作台
          </button>
          <button
            class="${this.tab === "history" ? "active" : ""}"
            @click="${() => (this.tab = "history")}"
          >
            记录
          </button>
        </nav>
        <span class="sp"></span>
        <span class="gh">onnxruntime-web · lit · biu</span>
      </header>
      <main>
        ${this.tab === "workbench"
          ? html`
            <ocr-workbench></ocr-workbench>
          `
          : html`
            <ocr-history></ocr-history>
          `}
      </main>
    `;
  }
}

customElements.define("app-root", AppRoot);
