// 轻量响应式状态 + 历史记录持久化（localStorage）
//
// 注意：本模块在打包时可能被多个入口（ocr-workbench / ocr-history）各自内联，
// 形成多份模块副本。为了保证它们共享同一份运行时状态，我们把核心状态挂在
// globalThis 上做"真单例"；同一窗口内的多份模块副本均指向同一份 items / listeners。

import type { HistoryItem } from "../ocr/types.ts";

const HISTORY_KEY = "ppocr.history.v1";
const MAX_HISTORY = 50;
const GLOBAL_KEY = "__ppocrHistoryStore__";

type Listener = () => void;

interface SharedState {
  items: HistoryItem[];
  listeners: Set<Listener>;
}

function loadFromLS(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw) as HistoryItem[];
  } catch {
    /* 忽略 */
  }
  return [];
}

function getShared(): SharedState {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  let s: SharedState | undefined = g[GLOBAL_KEY];
  if (!s) {
    s = { items: loadFromLS(), listeners: new Set() };
    g[GLOBAL_KEY] = s;
    // 跨标签页同步：其它标签页改动 localStorage 时刷新本窗口
    if (typeof addEventListener === "function") {
      addEventListener("storage", (e) => {
        if (e.key === HISTORY_KEY) {
          s!.items = loadFromLS();
          s!.listeners.forEach((l) => l());
        }
      });
    }
  }
  return s;
}

class HistoryStore {
  private get shared(): SharedState {
    return getShared();
  }

  private persist() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.shared.items));
    } catch {
      // 超出配额：丢弃最旧的若干条后重试
      this.shared.items = this.shared.items.slice(0, 10);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(this.shared.items));
      } catch {
        /* 忽略 */
      }
    }
  }

  subscribe(fn: Listener): () => void {
    this.shared.listeners.add(fn);
    return () => this.shared.listeners.delete(fn);
  }

  private emit() {
    this.persist();
    this.shared.listeners.forEach((l) => l());
  }

  list(): HistoryItem[] {
    return this.shared.items;
  }

  get(id: string): HistoryItem | undefined {
    return this.shared.items.find((i) => i.id === id);
  }

  add(item: HistoryItem) {
    this.shared.items.unshift(item);
    if (this.shared.items.length > MAX_HISTORY) {
      this.shared.items = this.shared.items.slice(0, MAX_HISTORY);
    }
    this.emit();
  }

  remove(id: string) {
    this.shared.items = this.shared.items.filter((i) => i.id !== id);
    this.emit();
  }

  clear() {
    this.shared.items = [];
    this.emit();
  }
}

export const historyStore = new HistoryStore();

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}
