// src/options/index.ts
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings/defaults";
import { getSettings, saveSettings } from "../settings/storage";
import type { ExtensionSettings } from "../settings/types";

type TabId = "general" | "summary" | "export" | "about";

@customElement("rc-options-app")
export class ReadableCaptionsOptionsApp extends LitElement {
    static styles = css`
        :host {
            display: block;
            min-height: 100vh;
            background: #f4f5f7;
            color: #18191c;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            --primary: #00aeec;
            --primary-hover: #008ac5;
            --primary-bg: #eaf7ff;
            --border: #e3e5e7;
            --bg-card: #ffffff;
            --bg-input: #f4f5f7;
            --text-primary: #18191c;
            --text-secondary: #61666d;
            --text-hint: #9499a0;
            --success: #43a047;
            --error: #e53935;
            --warning: #ff8a65;
        }

        * { box-sizing: border-box; }

        /* ===== Header ===== */
        .header {
            background: var(--bg-card);
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 32px;
            box-shadow: 0 1px 0 var(--border);
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header-logo {
            width: 28px;
            height: 28px;
            background: var(--primary);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 14px;
        }

        .header h1 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .header-version {
            font-size: 12px;
            color: var(--text-hint);
            background: var(--bg-input);
            padding: 2px 8px;
            border-radius: 10px;
        }

        /* ===== Layout ===== */
        .container {
            max-width: 960px;
            margin: 32px auto;
            display: flex;
            gap: 24px;
            padding: 0 24px;
        }

        /* ===== Sidebar ===== */
        .sidebar {
            width: 200px;
            flex-shrink: 0;
            background: var(--bg-card);
            border-radius: 8px;
            padding: 8px 0;
            box-shadow: 0 1px 4px rgba(0,0,0,0.04);
            align-self: flex-start;
            position: sticky;
            top: 88px;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 11px 20px;
            font-size: 14px;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.15s;
            border-left: 3px solid transparent;
            user-select: none;
        }

        .nav-item:hover {
            background: var(--bg-input);
            color: var(--primary);
        }

        .nav-item.active {
            color: var(--primary);
            font-weight: 500;
            background: var(--primary-bg);
            border-left-color: var(--primary);
        }

        .nav-icon {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
        }

        /* ===== Content ===== */
        .content {
            flex: 1;
            background: var(--bg-card);
            border-radius: 8px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.04);
            padding: 32px;
            min-height: 480px;
        }

        .section-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 8px 0;
            color: var(--text-primary);
        }

        .section-desc {
            font-size: 13px;
            color: var(--text-hint);
            margin: 0 0 28px 0;
            line-height: 1.5;
        }

        /* ===== Form ===== */
        .form-group {
            margin-bottom: 24px;
            max-width: 520px;
        }

        .form-group label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--text-primary);
        }

        .form-label-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
        }

        .form-label-row label {
            margin-bottom: 0;
        }

        .form-control {
            width: 100%;
            padding: 9px 12px;
            font-size: 14px;
            font-family: inherit;
            color: var(--text-primary);
            background: var(--bg-input);
            border: 1px solid var(--border);
            border-radius: 6px;
            transition: all 0.2s;
        }

        .form-control:hover {
            border-color: #c9ccd0;
        }

        .form-control:focus {
            border-color: var(--primary);
            background: var(--bg-card);
            outline: none;
            box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.12);
        }

        select.form-control {
            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239499a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 16px;
            padding-right: 34px;
            cursor: pointer;
        }

        textarea.form-control {
            resize: vertical;
            min-height: 80px;
            line-height: 1.5;
        }

        .hint {
            margin: 6px 0 0;
            font-size: 12px;
            color: var(--text-hint);
            line-height: 1.5;
        }

        .hint a {
            color: var(--primary);
            text-decoration: none;
        }
        .hint a:hover { text-decoration: underline; }

        /* ===== Toggle Switch ===== */
        .toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 0;
            border-bottom: 1px solid #f0f1f3;
        }

        .toggle-row:last-child { border-bottom: none; }

        .toggle-info {
            flex: 1;
        }

        .toggle-info .toggle-title {
            font-size: 14px;
            font-weight: 500;
            color: var(--text-primary);
            margin: 0 0 2px 0;
        }

        .toggle-info .toggle-desc {
            font-size: 12px;
            color: var(--text-hint);
            margin: 0;
        }

        .toggle-switch {
            position: relative;
            width: 40px;
            height: 22px;
            flex-shrink: 0;
            margin-left: 16px;
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #c9ccd0;
            border-radius: 22px;
            transition: 0.2s;
        }

        .toggle-slider::before {
            content: "";
            position: absolute;
            height: 18px;
            width: 18px;
            left: 2px;
            bottom: 2px;
            background: white;
            border-radius: 50%;
            transition: 0.2s;
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }

        .toggle-switch input:checked + .toggle-slider {
            background: var(--primary);
        }

        .toggle-switch input:checked + .toggle-slider::before {
            transform: translateX(18px);
        }

        /* ===== API Key Field ===== */
        .api-key-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        .api-key-wrapper .form-control {
            padding-right: 40px;
        }

        .toggle-visibility-btn {
            position: absolute;
            right: 10px;
            background: none;
            border: none;
            color: var(--text-hint);
            cursor: pointer;
            padding: 2px;
            display: flex;
            align-items: center;
            transition: color 0.2s;
        }
        .toggle-visibility-btn:hover { color: var(--primary); }

        /* ===== Footer ===== */
        .footer-actions {
            margin-top: 36px;
            padding-top: 20px;
            border-top: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .btn {
            padding: 9px 28px;
            font-size: 14px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
            border: none;
            font-family: inherit;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-primary:disabled { background: #c9ccd0; cursor: not-allowed; }

        .btn-ghost {
            background: transparent;
            color: var(--text-secondary);
            border: 1px solid var(--border);
        }
        .btn-ghost:hover { border-color: #c9ccd0; color: var(--text-primary); }

        .status-msg {
            font-size: 13px;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .status-msg.visible { opacity: 1; }
        .status-msg.success { color: var(--success); }
        .status-msg.error { color: var(--error); }

        /* ===== About Page ===== */
        .about-hero {
            text-align: center;
            padding: 20px 0 32px;
        }

        .about-logo {
            width: 64px;
            height: 64px;
            background: var(--primary);
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 28px;
            margin-bottom: 16px;
        }

        .about-name {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 4px 0;
        }

        .about-tagline {
            font-size: 13px;
            color: var(--text-hint);
            margin: 0 0 12px 0;
        }

        .about-badge {
            display: inline-block;
            background: var(--primary-bg);
            color: var(--primary);
            font-size: 12px;
            font-weight: 500;
            padding: 4px 12px;
            border-radius: 12px;
        }

        .about-links {
            display: flex;
            flex-direction: column;
            gap: 0;
            margin-top: 24px;
        }

        .about-link-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 0;
            border-bottom: 1px solid #f0f1f3;
            font-size: 14px;
            color: var(--text-secondary);
        }

        .about-link-row:last-child { border-bottom: none; }

        .about-link-value {
            color: var(--text-hint);
            font-size: 13px;
        }

        /* ===== Divider ===== */
        .section-divider {
            height: 1px;
            background: #f0f1f3;
            margin: 28px 0;
            max-width: 520px;
        }

        /* ===== Provider Badges ===== */
        .provider-badges {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
        }

        .provider-badge {
            padding: 8px 20px;
            border-radius: 6px;
            border: 1px solid var(--border);
            background: var(--bg-card);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s;
            color: var(--text-secondary);
            font-family: inherit;
        }

        .provider-badge:hover {
            border-color: var(--primary);
            color: var(--primary);
        }

        .provider-badge.active {
            border-color: var(--primary);
            background: var(--primary-bg);
            color: var(--primary);
        }

        /* ===== Warning Banner ===== */
        .warning-banner {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 12px 16px;
            background: #fff8e1;
            border: 1px solid #ffe082;
            border-radius: 6px;
            margin-bottom: 24px;
            font-size: 13px;
            color: #795548;
            line-height: 1.5;
            max-width: 520px;
        }

        .warning-banner svg { flex-shrink: 0; margin-top: 1px; }
    `;

    @state() private settings: ExtensionSettings = DEFAULT_SETTINGS;
    @state() private currentTab: TabId = "general";
    @state() private isSaving = false;
    @state() private statusTone: "idle" | "success" | "error" = "idle";
    @state() private statusMessage = "";
    @state() private showApiKey = false;

    connectedCallback(): void {
        super.connectedCallback();
        void this.loadSettings();
    }

    private async loadSettings(): Promise<void> {
        try {
            this.settings = await getSettings();
        } catch {
            this.settings = DEFAULT_SETTINGS;
        }
    }

    private handleFieldChange = (event: Event): void => {
        const field = event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const nextValue = field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked : field.value;
        this.settings = mergeSettings({
            ...this.settings,
            [field.name]: nextValue,
        });
        this.statusTone = "idle";
    };

    private setProvider(provider: string): void {
        this.settings = mergeSettings({
            ...this.settings,
            summaryProvider: provider,
        });
        this.statusTone = "idle";
    }

    private handleReset(): void {
        this.settings = { ...DEFAULT_SETTINGS };
        this.statusTone = "idle";
    }

    private async handleSubmit(): Promise<void> {
        this.isSaving = true;
        this.statusTone = "idle";
        try {
            this.settings = await saveSettings(this.settings);
            this.statusTone = "success";
            this.statusMessage = "设置已成功保存 ✓";
            setTimeout(() => { this.statusTone = "idle"; }, 3000);
        } catch {
            this.statusTone = "error";
            this.statusMessage = "保存失败，请重试";
        } finally {
            this.isSaving = false;
        }
    }

    // ===== Icons =====
    private iconGeneral() {
        return html`<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    }
    private iconSummary() {
        return html`<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`;
    }
    private iconExport() {
        return html`<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    }
    private iconAbout() {
        return html`<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    // ===== Render Tabs =====
    private renderGeneral() {
        return html`
            <h2 class="section-title">通用设置</h2>
            <p class="section-desc">控制面板的默认行为和显示偏好。</p>

            <div class="form-group">
                <label>默认标签页</label>
                <select class="form-control" name="defaultTab" @change=${this.handleFieldChange}>
                    <option value="read" ?selected=${this.settings.defaultTab === 'read'}>可读模式</option>
                    <option value="summary" ?selected=${this.settings.defaultTab === 'summary'}>摘要</option>
                    <option value="ts" ?selected=${this.settings.defaultTab === 'ts'}>原转写</option>
                    <option value="cc" ?selected=${this.settings.defaultTab === 'cc'}>原字幕</option>
                </select>
                <p class="hint">打开视频时，面板默认展示的视图。</p>
            </div>

            <div class="section-divider"></div>

            <div class="toggle-row">
                <div class="toggle-info">
                    <p class="toggle-title">摘要功能</p>
                    <p class="toggle-desc">在面板中显示"摘要"标签页，支持 AI 生成内容总结。</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" name="summaryEnabled" ?checked=${this.settings.summaryEnabled} @change=${this.handleFieldChange} />
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `;
    }

    private renderSummary() {
        const isApiKeySet = this.settings.summaryApiKey.length > 0;

        return html`
            <h2 class="section-title">AI 摘要引擎</h2>
            <p class="section-desc">配置大语言模型以自动生成视频内容摘要。密钥仅存储在浏览器本地。</p>

            <div class="form-group">
                <label>模型提供商</label>
                <div class="provider-badges">
                    <button class="provider-badge ${this.settings.summaryProvider === 'openai' ? 'active' : ''}" @click=${() => this.setProvider('openai')}>
                        OpenAI
                    </button>
                    <button class="provider-badge ${this.settings.summaryProvider === 'deepseek' ? 'active' : ''}" @click=${() => this.setProvider('deepseek')}>
                        DeepSeek
                    </button>
                </div>
                <p class="hint">
                    ${this.settings.summaryProvider === 'openai'
                ? '使用 OpenAI 的 ChatGPT 模型。默认使用 gpt-3.5-turbo。'
                : '使用 DeepSeek 模型。默认使用 deepseek-chat。'}
                </p>
            </div>

            <div class="form-group">
                <div class="form-label-row">
                    <label>API Key</label>
                    ${isApiKeySet ? html`<span style="font-size: 12px; color: var(--success);">● 已配置</span>` : html`<span style="font-size: 12px; color: var(--warning);">○ 未配置</span>`}
                </div>
                <div class="api-key-wrapper">
                    <input class="form-control" type="${this.showApiKey ? 'text' : 'password'}" name="summaryApiKey" .value=${this.settings.summaryApiKey} @input=${this.handleFieldChange} placeholder="${this.settings.summaryProvider === 'openai' ? 'sk-...' : 'sk-...'}" />
                    <button class="toggle-visibility-btn" @click=${() => this.showApiKey = !this.showApiKey} title="${this.showApiKey ? '隐藏' : '显示'}">
                        ${this.showApiKey
                ? html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
                : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
            }
                    </button>
                </div>
                <p class="hint">
                    ${this.settings.summaryProvider === 'openai'
                ? html`前往 <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a> 获取 API Key。`
                : html`前往 <a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek Platform</a> 获取 API Key。`}
                </p>
            </div>

            <div class="form-group">
                <label>自定义模型</label>
                <input class="form-control" type="text" name="summaryModel" .value=${this.settings.summaryModel} @input=${this.handleFieldChange} placeholder="${this.settings.summaryProvider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat'}" />
                <p class="hint">留空使用默认模型。可填写如 gpt-4o、deepseek-reasoner 等。</p>
            </div>

            <div class="section-divider"></div>

            <div class="form-group">
                <label>自定义 Prompt 模板</label>
                <textarea class="form-control" name="summaryPromptTemplate" .value=${this.settings.summaryPromptTemplate} @input=${this.handleFieldChange} placeholder="请总结以下视频字幕内容，提取要点并有逻辑地组织。" rows="4"></textarea>
                <p class="hint">留空使用默认指令。此 Prompt 将作为 System Message 发送给大模型。</p>
            </div>
        `;
    }

    private renderExport() {
        return html`
            <h2 class="section-title">导出与复制</h2>
            <p class="section-desc">配置在面板中点击复制或下载按钮时使用的默认格式。</p>

            <div class="form-group">
                <label>复制格式</label>
                <select class="form-control" name="copyFormat" @change=${this.handleFieldChange}>
                    <option value="readable_text" ?selected=${this.settings.copyFormat === 'readable_text'}>纯文本（适合阅读）</option>
                    <option value="timestamped_text" ?selected=${this.settings.copyFormat === 'timestamped_text'}>带时间戳的文本</option>
                </select>
                <p class="hint">点击面板标题栏的复制按钮时使用的格式。</p>
            </div>
            
            <div class="form-group">
                <label>下载格式</label>
                <select class="form-control" name="downloadFormat" @change=${this.handleFieldChange}>
                    <option value="txt" ?selected=${this.settings.downloadFormat === 'txt'}>TXT 纯文本</option>
                    <option value="srt" ?selected=${this.settings.downloadFormat === 'srt'}>SRT 字幕文件</option>
                </select>
                <p class="hint">点击面板标题栏的下载按钮时使用的格式。</p>
            </div>
        `;
    }

    private renderAbout() {
        return html`
            <div class="about-hero">
                <div class="about-logo">RC</div>
                <h2 class="about-name">可读字幕 Readable Captions</h2>
                <p class="about-tagline">让视频内容不只是被观看，更可以被阅读。</p>
                <span class="about-badge">v0.1.0 · Beta</span>
            </div>
            
            <div class="about-links">
                <div class="about-link-row">
                    <span>平台支持</span>
                    <span class="about-link-value">Bilibili</span>
                </div>
                <div class="about-link-row">
                    <span>字幕来源</span>
                    <span class="about-link-value">人工 CC / AI 自动转写</span>
                </div>
                <div class="about-link-row">
                    <span>技术栈</span>
                    <span class="about-link-value">TypeScript · Lit · Vite · Manifest V3</span>
                </div>
                <div class="about-link-row">
                    <span>AI 摘要</span>
                    <span class="about-link-value">OpenAI / DeepSeek (流式)</span>
                </div>
            </div>
        `;
    }

    render() {
        const tabContent = () => {
            switch (this.currentTab) {
                case "general": return this.renderGeneral();
                case "summary": return this.renderSummary();
                case "export": return this.renderExport();
                case "about": return this.renderAbout();
            }
        };

        return html`
            <div class="header">
                <div class="header-left">
                    <div class="header-logo">RC</div>
                    <h1>可读字幕 设置</h1>
                </div>
                <span class="header-version">v0.1.0</span>
            </div>

            <div class="container">
                <div class="sidebar">
                    <div class="nav-item ${this.currentTab === "general" ? "active" : ""}" @click=${() => this.currentTab = "general"}>
                        ${this.iconGeneral()}通用设置
                    </div>
                    <div class="nav-item ${this.currentTab === "summary" ? "active" : ""}" @click=${() => this.currentTab = "summary"}>
                        ${this.iconSummary()}AI 摘要
                    </div>
                    <div class="nav-item ${this.currentTab === "export" ? "active" : ""}" @click=${() => this.currentTab = "export"}>
                        ${this.iconExport()}导出偏好
                    </div>
                    <div class="nav-item ${this.currentTab === "about" ? "active" : ""}" @click=${() => this.currentTab = "about"}>
                        ${this.iconAbout()}关于
                    </div>
                </div>

                <div class="content">
                    ${tabContent()}

                    ${this.currentTab !== "about" ? html`
                        <div class="footer-actions">
                            <button class="btn btn-primary" @click=${this.handleSubmit} ?disabled=${this.isSaving}>
                                ${this.isSaving ? "保存中..." : "保存设置"}
                            </button>
                            <button class="btn btn-ghost" @click=${() => this.handleReset()}>
                                恢复默认
                            </button>
                            <span class="status-msg ${this.statusTone} ${this.statusTone !== 'idle' ? 'visible' : ''}">
                                ${this.statusMessage}
                            </span>
                        </div>
                    ` : ""}
                </div>
            </div>
        `;
    }
}