// src/panel/panel-view.ts
import { css, html } from "lit";

export type Mode = "read" | "timeline" | "summary" | "cc" | "ts";

export function panelTemplate(mode: Mode, setMode: (m: Mode) => void) {
  const tab = (id: Mode, label: string) => {
    const active = mode === id;
    return html`
      <button class="tab ${active ? "active" : ""}" @click=${() => setMode(id)}>
        ${label}
      </button>
    `;
  };

  const content = () => {
    switch (mode) {
      case "read": return html`<p>这里是“可读段落”视图（v0.1 占位）。</p>`;
      case "timeline": return html`<p>这里是“时间轴”视图（逐句对齐）。</p>`;
      case "summary": return html`<p>这里是“摘要”视图。</p>`;
      case "cc": return html`<p>这里是“原始 CC”视图。</p>`;
      case "ts": return html`<p>这里是“原始 TS”视图。</p>`;
    }
  };

  return html`
    <div class="panel">
      <header class="header">
        <div class="title">
          <div class="name">可读字幕</div>
          <div class="sub">Readable Captions</div>
        </div>

        <div class="actions">
          <button class="icon" title="下载">⬇</button>
          <button class="icon" title="复制">⎘</button>
          <button class="icon" title="更多">⋯</button>
        </div>
      </header>

      <nav class="tabs">
        ${tab("read", "可读")}
        ${tab("timeline", "时间轴")}
        ${tab("summary", "摘要")}
        ${tab("cc", "原字幕")}
        ${tab("ts", "原转写")}
      </nav>

      <main class="content">${content()}</main>
    </div>
  `;
}

export const panelStyles = css`
  :host {
    all: initial;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial;
  }

  .panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .title .name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
  }

  .title .sub {
    font-size: 12px;
    opacity: 0.65;
    line-height: 1.2;
    margin-top: 2px;
  }

  .actions { display: flex; gap: 6px; }

  .icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    background: transparent;
    cursor: pointer;
    font-size: 14px;
  }
  .icon:hover { background: rgba(0, 0, 0, 0.04); }

  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }

  .tab {
    border: 0;
    background: transparent;
    cursor: pointer;
    padding: 10px 10px 9px;
    font-size: 12px;
    opacity: 0.7;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }
  .tab.active {
    opacity: 1;
    border-bottom-color: rgba(0, 0, 0, 0.8);
    font-weight: 600;
  }

  .content {
    padding: 12px;
    overflow: auto;
    font-size: 13px;
    line-height: 1.6;
  }
`;