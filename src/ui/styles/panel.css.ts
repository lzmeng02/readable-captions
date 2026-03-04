import { css } from "lit";

export const panelStyles = css`
    :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        display: block;
        color: #333;
    }

    * {
        box-sizing: border-box;
    }

    .panel {
        position: relative;
        height: 540px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        border-radius: 12px;
        background: #ffffff;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
        border: 1px solid rgba(0, 0, 0, 0.05);
        overflow: hidden;
    }

    .panel.reader-mode {
        height: 100%;
        max-height: none;
    }

    .panel.collapsed {
        height: auto;
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 12px;
    }

    .panel.collapsed .header {
        padding: 16px 20px;
    }

    .title {
        cursor: pointer;
        user-select: none;
        transition: opacity 0.2s ease;
    }

    .title:hover {
        opacity: 0.72;
    }

    .name {
        font-size: 16px;
        font-weight: 600;
        color: #111;
        letter-spacing: 0.3px;
        line-height: 1.2;
    }

    .sub {
        font-size: 12px;
        color: #888;
        line-height: 1.2;
        margin-top: 4px;
        font-weight: 400;
    }

    .actions {
        display: flex;
        gap: 4px;
    }

    .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: #666;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .icon-btn:hover {
        background: #f4f4f5;
        color: #111;
    }

    .icon-btn.active {
        background: #111;
        color: #fff;
    }

    .segment-control {
        display: flex;
        background: #f4f4f5;
        border-radius: 8px;
        padding: 4px;
        margin: 0 20px 8px 20px;
    }

    .tab {
        flex: 1;
        text-align: center;
        border: none;
        background: transparent;
        padding: 6px 0;
        font-size: 13px;
        color: #666;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
        font-weight: 500;
        white-space: nowrap;
    }

    .tab:hover {
        color: #111;
    }

    .tab.active {
        background: #ffffff;
        color: #111;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .content {
        padding: 12px 20px 16px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.6;
        flex: 1;
    }

    .content::-webkit-scrollbar {
        width: 6px;
    }

    .content::-webkit-scrollbar-track {
        background: transparent;
    }

    .content::-webkit-scrollbar-thumb {
        background: #e0e0e0;
        border-radius: 4px;
    }

    .content::-webkit-scrollbar-thumb:hover {
        background: #c0c0c0;
    }

    .meta-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
    }

    .meta-info {
        font-size: 12px;
        color: #888;
        display: flex;
        align-items: center;
    }

    .meta-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #d4d4d4;
        margin-right: 8px;
    }

    .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .line {
        text-align: left;
        border: none;
        border-radius: 8px;
        padding: 10px 12px;
        background: transparent;
        cursor: pointer;
        display: flex;
        gap: 16px;
        align-items: flex-start;
        transition: background-color 0.2s ease;
        width: 100%;
    }

    .line:hover {
        background: #f7f7f9;
    }

    .line:disabled {
        cursor: default;
        opacity: 0.7;
    }

    .t {
        display: inline-block;
        font-size: 13px;
        color: #999;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
        margin-top: 2px;
        min-width: 72px;
    }

    .c {
        flex: 1 1 auto;
        color: #222;
        font-size: 14px;
        line-height: 1.5;
    }

    .article {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 4px 0;
    }

    .paragraph {
        margin: 0;
        font-size: 15px;
        line-height: 1.75;
        color: #222;
        text-align: justify;
    }

    .inline-t {
        color: #aaa;
        font-size: 12px;
        margin-right: 6px;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        transition: color 0.2s;
        user-select: none;
    }

    .inline-t:hover {
        color: #111;
    }

    .summary-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .summary-card {
        background: #f8f9fa;
        border-radius: 10px;
        padding: 16px;
        border: 1px solid #f1f1f1;
    }

    .summary-card-error {
        background: #fff7f7;
        border-color: #ffd9d9;
    }

    .summary-title {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 600;
        color: #111;
    }

    .summary-model {
        font-size: 12px;
        color: #888;
        margin-bottom: 10px;
    }

    .summary-desc {
        margin: 0 0 10px 0;
        font-size: 14px;
        color: #555;
        line-height: 1.6;
    }

    .summary-actions,
    .settings-actions,
    .points-header {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .points-header {
        justify-content: space-between;
        margin-bottom: 10px;
    }

    .points-title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .summary-points {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .point-item {
        text-align: left;
        border: none;
        border-radius: 8px;
        padding: 10px 12px;
        background: transparent;
        cursor: pointer;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        transition: background-color 0.2s ease;
        width: 100%;
    }

    .point-item:hover:not(:disabled) {
        background: #f7f7f9;
    }

    .point-item:disabled {
        cursor: default;
        opacity: 0.72;
    }

    .point-t {
        display: inline-block;
        font-size: 12px;
        color: #fff;
        background: #ccc;
        padding: 2px 6px;
        border-radius: 4px;
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
        margin-top: 1px;
    }

    .point-item:hover:not(:disabled) .point-t {
        background: #999;
    }

    .point-c {
        flex: 1 1 auto;
        color: #222;
        font-size: 14px;
        line-height: 1.5;
    }

    .primary-btn,
    .secondary-btn,
    .ghost-btn {
        border: none;
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
    }

    .primary-btn {
        background: #111;
        color: #fff;
    }

    .primary-btn:hover {
        background: #000;
    }

    .secondary-btn {
        background: #f4f4f5;
        color: #222;
    }

    .secondary-btn:hover,
    .ghost-btn:hover {
        background: #ededee;
    }

    .ghost-btn {
        background: transparent;
        color: #666;
        padding-inline: 8px;
    }

    .empty-state,
    .placeholder,
    .empty-inline {
        color: #888;
        font-size: 14px;
        text-align: center;
        padding: 40px 0;
    }

    .error-state {
        color: #c23a3a;
    }

    .settings-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(17, 17, 17, 0.16);
        backdrop-filter: blur(2px);
        z-index: 20;
    }

    .settings-modal {
        position: absolute;
        inset: 16px;
        z-index: 21;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .settings-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 18px 20px 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    .settings-title {
        margin: 0;
        font-size: 16px;
        color: #111;
    }

    .settings-subtitle {
        margin: 6px 0 0;
        font-size: 12px;
        color: #777;
    }

    .settings-form {
        padding: 16px 20px 20px;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .field,
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        border: none;
        margin: 0;
        padding: 0;
    }

    .field-label {
        font-size: 12px;
        font-weight: 600;
        color: #555;
    }

    .field-input {
        width: 100%;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 8px;
        background: #fafafa;
        padding: 10px 12px;
        font-size: 13px;
        color: #222;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s ease, background 0.2s ease;
    }

    .field-input:focus {
        border-color: rgba(0, 0, 0, 0.2);
        background: #fff;
    }

    .field-textarea {
        min-height: 140px;
        resize: vertical;
    }

    .field-hint {
        font-size: 12px;
        color: #888;
    }

    .tab-toggle-list {
        display: grid;
        gap: 10px;
    }

    .tab-toggle {
        display: grid;
        grid-template-columns: 20px 1fr;
        gap: 10px;
        align-items: start;
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 10px;
        padding: 12px;
        background: #fafafa;
    }

    .tab-toggle-title {
        font-size: 13px;
        font-weight: 600;
        color: #222;
    }

    .tab-toggle-desc {
        font-size: 12px;
        color: #777;
        margin-top: 4px;
        line-height: 1.5;
    }

    .field-callout {
        background: #f7f7fb;
        border: 1px solid rgba(65, 80, 160, 0.08);
        border-radius: 10px;
        padding: 12px;
    }

    .callout-title {
        font-size: 12px;
        font-weight: 600;
        color: #3d4f95;
        margin-bottom: 4px;
    }

    .callout-text {
        font-size: 12px;
        color: #5c6696;
        line-height: 1.5;
    }

    @media (max-width: 900px) {
        .panel {
            height: 480px;
        }

        .settings-modal {
            inset: 8px;
        }

        .content {
            padding-inline: 16px;
        }

        .segment-control {
            margin-inline: 16px;
        }
    }
`;
