// src/options/index.ts
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings/defaults";
import { getSettings, saveSettings } from "../settings/storage";
import type { ExtensionSettings } from "../settings/types";

type TabId = "general" | "summary" | "export";

@customElement("rc-options-app")
export class ReadableCaptionsOptionsApp extends LitElement {
    static styles = css`
        :host {
            display: block;
            min-height: 100vh;
            background: #f4f5f7;
            color: #18191c;
            font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
            --primary-color: #00aeec;
            --primary-hover: #008ac5;
        }

        * {
            box-sizing: border-box;
        }

        .header {
            background: #ffffff;
            height: 60px;
            display: flex;
            align-items: center;
            padding: 0 24px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
            position: sticky;
            top: 0;
            z-index: 10;
        }

        .header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 500;
            color: #18191c;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .container {
            max-width: 1000px;
            margin: 24px auto;
            display: flex;
            gap: 24px;
            padding: 0 24px;
        }

        /* 左侧边栏导航 */
        .sidebar {
            width: 200px;
            flex-shrink: 0;
            background: #ffffff;
            border-radius: 6px;
            padding: 12px 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
            align-self: flex-start;
        }

        .nav-item {
            display: flex;
            align-items: center;
            padding: 12px 24px;
            font-size: 14px;
            color: #61666d;
            cursor: pointer;
            transition: all 0.2s;
            border-left: 3px solid transparent;
        }

        .nav-item:hover {
            background: #f4f5f7;
            color: var(--primary-color);
        }

        .nav-item.active {
            color: var(--primary-color);
            font-weight: 500;
            background: #eaf7ff;
            border-left-color: var(--primary-color);
        }

        /* 右侧内容区 */
        .content {
            flex: 1;
            background: #ffffff;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
            padding: 32px;
            min-height: 500px;
        }

        .section-title {
            font-size: 20px;
            font-weight: 500;
            margin: 0 0 24px 0;
            padding-bottom: 16px;
            border-bottom: 1px solid #e3e5e7;
        }

        .form-group {
            margin-bottom: 24px;
            max-width: 480px;
        }

        .form-group label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 8px;
            color: #18191c;
        }

        .form-control {
            width: 100%;
            padding: 10px 12px;
            font-size: 14px;
            font-family: inherit;
            color: #18191c;
            background: #f4f5f7;
            border: 1px solid #e3e5e7;
            border-radius: 4px;
            transition: all 0.2s;
        }

        select.form-control {
            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239499a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 8px center;
            background-size: 16px;
            padding-right: 32px;
            cursor: pointer;
        }

        .form-control:hover, .form-control:focus {
            border-color: var(--primary-color);
            background: #ffffff;
            outline: none;
        }

        .hint {
            margin: 6px 0 0;
            font-size: 12px;
            color: #9499a0;
            line-height: 1.5;
        }

        /* 开关切换 (Checkbox) 美化 */
        .switch-label {
            display: flex;
            align-items: center;
            cursor: pointer;
            gap: 8px;
        }
        .switch-label input {
            width: 16px;
            height: 16px;
            accent-color: var(--primary-color);
            cursor: pointer;
        }

        /* 底部操作栏 */
        .footer-actions {
            margin-top: 40px;
            padding-top: 24px;
            border-top: 1px solid #e3e5e7;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 16px;
        }

        .btn {
            padding: 10px 24px;
            font-size: 14px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
            border: none;
        }

        .btn-primary {
            background: var(--primary-color);
            color: white;
        }

        .btn-primary:hover {
            background: var(--primary-hover);
        }

        .btn-primary:disabled {
            background: #c9ccd0;
            cursor: not-allowed;
        }

        .status-msg {
            font-size: 13px;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .status-msg.visible {
            opacity: 1;
        }
        .status-msg.success { color: #43a047; }
        .status-msg.error { color: #e53935; }
    `;

    @state() private settings: ExtensionSettings = DEFAULT_SETTINGS;
    @state() private currentTab: TabId = "general";
    @state() private isSaving = false;
    @state() private statusTone: "idle" | "success" | "error" = "idle";
    @state() private statusMessage = "";

    connectedCallback(): void {
        super.connectedCallback();
        void this.loadSettings();
    }

    private async loadSettings(): Promise<void> {
        try {
            this.settings = await getSettings();
        } catch (error) {
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
        this.statusTone = "idle"; // Reset status on edit
    };

    private async handleSubmit(): Promise<void> {
        this.isSaving = true;
        this.statusTone = "idle";
        try {
            this.settings = await saveSettings(this.settings);
            this.statusTone = "success";
            this.statusMessage = "设置已成功保存";
            setTimeout(() => { this.statusTone = "idle"; }, 3000);
        } catch (error) {
            this.statusTone = "error";
            this.statusMessage = "保存失败，请重试";
        } finally {
            this.isSaving = false;
        }
    }

    render() {
        return html`
            <div class="header">
                <h1>可读字幕 (Readable Captions) 设置</h1>
            </div>

            <div class="container">
                <div class="sidebar">
                    <div class="nav-item ${this.currentTab === "general" ? "active" : ""}" @click=${() => this.currentTab = "general"}>通用设置</div>
                    <div class="nav-item ${this.currentTab === "summary" ? "active" : ""}" @click=${() => this.currentTab = "summary"}>AI 摘要引擎</div>
                    <div class="nav-item ${this.currentTab === "export" ? "active" : ""}" @click=${() => this.currentTab = "export"}>导出偏好</div>
                </div>

                <div class="content">
                    ${this.currentTab === "general" ? html`
                        <h2 class="section-title">通用设置</h2>
                        <div class="form-group">
                            <label>默认开启标签页</label>
                            <select class="form-control" name="defaultTab" @change=${this.handleFieldChange}>
                                <option value="read" ?selected=${this.settings.defaultTab === 'read'}>可读字幕</option>
                                <option value="summary" ?selected=${this.settings.defaultTab === 'summary'}>摘要</option>
                                <option value="ts" ?selected=${this.settings.defaultTab === 'ts'}>原转写</option>
                                <option value="cc" ?selected=${this.settings.defaultTab === 'cc'}>原字幕</option>
                            </select>
                            <p class="hint">打开视频时默认展示的字幕面板视图。</p>
                        </div>
                        <div class="form-group">
                            <label class="switch-label">
                                <input type="checkbox" name="summaryEnabled" ?checked=${this.settings.summaryEnabled} @change=${this.handleFieldChange} />
                                <span>在面板中显示“摘要”标签</span>
                            </label>
                        </div>
                    ` : ""}

                    ${this.currentTab === "summary" ? html`
                        <h2 class="section-title">AI 摘要引擎配置</h2>
                        <p class="hint" style="margin-bottom: 24px; color: #ff8a65;">注：目前摘要功能为占位演示阶段，配置将保存在本地，以供后续版本集成大模型使用。</p>
                        
                        <div class="form-group">
                            <label>模型提供商</label>
                            <select class="form-control" name="summaryProvider" @change=${this.handleFieldChange}>
                                <option value="openai" ?selected=${this.settings.summaryProvider === 'openai'}>OpenAI</option>
                                <option value="deepseek" ?selected=${this.settings.summaryProvider === 'deepseek'}>DeepSeek</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>API Key</label>
                            <input class="form-control" type="password" name="summaryApiKey" .value=${this.settings.summaryApiKey} @input=${this.handleFieldChange} placeholder="sk-..." />
                            <p class="hint">密钥将安全地保存在浏览器本地，不会上传。</p>
                        </div>

                        <div class="form-group">
                            <label>自定义模型名</label>
                            <input class="form-control" type="text" name="summaryModel" .value=${this.settings.summaryModel} @input=${this.handleFieldChange} placeholder="例如: gpt-4o-mini" />
                        </div>
                    ` : ""}

                    ${this.currentTab === "export" ? html`
                        <h2 class="section-title">导出与复制偏好</h2>
                        <div class="form-group">
                            <label>默认复制格式</label>
                            <select class="form-control" name="copyFormat" @change=${this.handleFieldChange}>
                                <option value="readable_text" ?selected=${this.settings.copyFormat === 'readable_text'}>仅文本 (适合阅读)</option>
                                <option value="timestamped_text" ?selected=${this.settings.copyFormat === 'timestamped_text'}>带时间戳的文本</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>默认下载格式</label>
                            <select class="form-control" name="downloadFormat" @change=${this.handleFieldChange}>
                                <option value="txt" ?selected=${this.settings.downloadFormat === 'txt'}>TXT 纯文本</option>
                                <option value="srt" ?selected=${this.settings.downloadFormat === 'srt'}>SRT 字幕文件</option>
                            </select>
                        </div>
                    ` : ""}

                    <div class="footer-actions">
                        <button class="btn btn-primary" @click=${this.handleSubmit} ?disabled=${this.isSaving}>
                            ${this.isSaving ? "保存中..." : "保存设置"}
                        </button>
                        <span class="status-msg ${this.statusTone} ${this.statusTone !== 'idle' ? 'visible' : ''}">
                            ${this.statusMessage}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }
}