// src/options/index.ts
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GENERATION_PROVIDERS, getGenerationProvider } from "../generation/provider-catalog";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings/defaults";
import {
    createSettingsWriteRevision,
    getSettings,
    saveSettings,
    watchSettings,
    type SettingsWatchMetadata,
} from "../settings/storage";
import type { ExtensionSettings, GenerationModels, GenerationProvider } from "../settings/types";

type TabId = "general" | "generation" | "export" | "about";
type OptionsPhase = "loading" | "ready" | "saving" | "error";
type ExternalConflict = { settings: ExtensionSettings; sequence: number };
type PendingSave = { revision: string; ownWatchSequence: number | null };
const MAX_RETAINED_SAVE_ACKNOWLEDGEMENTS = 8;

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
        .settings-fieldset {
            min-width: 0;
            margin: 0;
            padding: 0;
            border: 0;
        }

        .lifecycle-state {
            margin-bottom: 24px;
            color: var(--text-secondary);
            font-size: 14px;
            line-height: 1.5;
        }

        .lifecycle-state p {
            margin: 0 0 12px;
        }

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

        .conflict-banner {
            display: block;
        }

        .conflict-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
        }
    `;

    @state() private phase: OptionsPhase = "loading";
    @state() private draft: ExtensionSettings | null = null;
    @state() private conflict: ExternalConflict | null = null;
    @state() private loadError = "";
    @state() private currentTab: TabId = "general";
    @state() private statusTone: "idle" | "success" | "error" = "idle";
    @state() private statusMessage = "";
    @state() private showApiKey = false;
    private baseline: ExtensionSettings | null = null;
    private pendingSave: PendingSave | null = null;
    private readonly retainedSaveAcknowledgementRevisions = new Set<string>();
    private unwatchSettings: (() => void) | null = null;
    private operationVersion = 0;
    private watchSequence = 0;
    private statusTimer: ReturnType<typeof setTimeout> | null = null;

    connectedCallback(): void {
        super.connectedCallback();
        void this.loadSettings();
    }

    disconnectedCallback(): void {
        this.operationVersion += 1;
        this.stopWatchingSettings();
        this.pendingSave = null;
        this.retainedSaveAcknowledgementRevisions.clear();
        this.clearStatusTimer();
        super.disconnectedCallback();
    }

    private canonicalKey(settings: ExtensionSettings): string {
        return JSON.stringify(mergeSettings(settings));
    }

    private get isDirty(): boolean {
        return this.draft !== null
            && this.baseline !== null
            && this.canonicalKey(this.draft) !== this.canonicalKey(this.baseline);
    }

    private stopWatchingSettings(): void {
        this.unwatchSettings?.();
        this.unwatchSettings = null;
    }

    private clearStatusTimer(): void {
        if (this.statusTimer === null) return;
        clearTimeout(this.statusTimer);
        this.statusTimer = null;
    }

    private clearStatus(): void {
        this.clearStatusTimer();
        this.statusTone = "idle";
        this.statusMessage = "";
    }

    private async loadSettings(): Promise<void> {
        const operation = ++this.operationVersion;
        this.stopWatchingSettings();
        this.clearStatus();
        this.phase = "loading";
        this.draft = null;
        this.baseline = null;
        this.conflict = null;
        this.pendingSave = null;
        this.retainedSaveAcknowledgementRevisions.clear();
        this.loadError = "";

        try {
            let latestSettingsDuringRead: ExtensionSettings | null = null;
            this.unwatchSettings = watchSettings((nextSettings, metadata) => {
                if (operation !== this.operationVersion || !this.isConnected) return;
                if (this.phase === "loading") {
                    latestSettingsDuringRead = mergeSettings(nextSettings);
                    return;
                }
                this.handleExternalSettings(nextSettings, metadata);
            });

            const settings = await getSettings();
            if (operation !== this.operationVersion || !this.isConnected) return;

            const reconciledSettings = latestSettingsDuringRead ?? mergeSettings(settings);
            this.draft = reconciledSettings;
            this.baseline = reconciledSettings;
            this.phase = "ready";
        } catch (error) {
            if (operation !== this.operationVersion || !this.isConnected) return;
            this.stopWatchingSettings();
            this.draft = null;
            this.baseline = null;
            this.phase = "error";
            this.loadError = error instanceof Error ? error.message : "未知错误";
        }
    }

    private handleExternalSettings(
        settings: ExtensionSettings,
        metadata: SettingsWatchMetadata,
    ): void {
        const sequence = ++this.watchSequence;
        const nextSettings = mergeSettings(settings);
        const revision = metadata.revision;
        const pendingSave = this.pendingSave;
        if (revision !== null && pendingSave && revision === pendingSave.revision) {
            this.retainedSaveAcknowledgementRevisions.delete(revision);
            pendingSave.ownWatchSequence = sequence;
            return;
        }
        if (revision !== null && this.retainedSaveAcknowledgementRevisions.delete(revision)) return;
        if (!this.draft || !this.baseline) return;

        if (this.conflict || this.phase === "saving" || (this.phase === "ready" && this.isDirty)) {
            this.conflict = { settings: nextSettings, sequence };
            this.clearStatus();
            return;
        }
        if (this.phase !== "ready") return;

        this.draft = nextSettings;
        this.baseline = nextSettings;
        this.conflict = null;
        this.clearStatus();
    }

    private handleFieldChange = (event: Event): void => {
        const field = event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (this.phase !== "ready" || !this.draft) {
            const draft = this.draft;
            if (draft) {
                const currentValues: Record<string, string | boolean> = {
                    defaultTab: draft.defaultTab,
                    generationEnabled: draft.generationEnabled,
                    copyFormat: draft.copyFormat,
                    downloadFormat: draft.downloadFormat,
                };
                const currentValue = currentValues[field.name];
                if (field instanceof HTMLInputElement && field.type === "checkbox") {
                    field.checked = Boolean(currentValue);
                } else if (typeof currentValue === "string") {
                    field.value = currentValue;
                }
            }
            return;
        }
        const nextValue = field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked : field.value;
        this.draft = {
            ...this.draft,
            [field.name]: nextValue,
        };
        this.clearStatus();
    };

    private handleGenerationApiKeyChange = (event: Event): void => {
        const field = event.currentTarget as HTMLInputElement;
        if (this.phase !== "ready" || !this.draft) {
            const draft = this.draft;
            if (draft) {
                field.value = draft.generationProviderSettings[draft.generationProvider].apiKey;
            }
            return;
        }
        const provider = this.draft.generationProvider;
        const selectedProfile = this.draft.generationProviderSettings[provider];

        this.draft = {
            ...this.draft,
            generationProviderSettings: {
                ...this.draft.generationProviderSettings,
                [provider]: {
                    ...selectedProfile,
                    apiKey: field.value,
                },
            },
        };
        this.clearStatus();
    };

    private handleGenerationModelChange = (task: keyof GenerationModels, event: Event): void => {
        const field = event.currentTarget as HTMLInputElement;
        if (this.phase !== "ready" || !this.draft) {
            const draft = this.draft;
            if (draft) {
                field.value = draft.generationProviderSettings[draft.generationProvider].models[task];
            }
            return;
        }
        const provider = this.draft.generationProvider;
        const selectedProfile = this.draft.generationProviderSettings[provider];

        this.draft = {
            ...this.draft,
            generationProviderSettings: {
                ...this.draft.generationProviderSettings,
                [provider]: {
                    ...selectedProfile,
                    models: {
                        ...selectedProfile.models,
                        [task]: field.value,
                    },
                },
            },
        };
        this.clearStatus();
    };

    private handleGenerationPromptTemplateChange = (
        task: keyof ExtensionSettings["generationPromptTemplates"],
        event: Event,
    ): void => {
        const field = event.currentTarget as HTMLTextAreaElement;
        if (this.phase !== "ready" || !this.draft) {
            if (this.draft) field.value = this.draft.generationPromptTemplates[task];
            return;
        }
        this.draft = {
            ...this.draft,
            generationPromptTemplates: {
                ...this.draft.generationPromptTemplates,
                [task]: field.value,
            },
        };
        this.clearStatus();
    };

    private setProvider(provider: GenerationProvider): void {
        if (this.phase !== "ready" || !this.draft) return;
        this.draft = {
            ...this.draft,
            generationProvider: provider,
        };
        this.clearStatus();
    }

    private handleReset(): void {
        if (this.phase !== "ready" || !this.draft) return;
        this.draft = mergeSettings(DEFAULT_SETTINGS);
        this.clearStatus();
    }

    private handleRetry(): void {
        if (this.phase !== "error") return;
        void this.loadSettings();
    }

    private handleLoadExternal(): void {
        if (this.phase !== "ready" || !this.conflict) return;
        this.draft = this.conflict.settings;
        this.baseline = this.conflict.settings;
        this.conflict = null;
        this.clearStatus();
    }

    private handleKeepLocal(): void {
        if (this.phase !== "ready" || !this.conflict || !this.draft) return;
        this.baseline = this.conflict.settings;
        this.conflict = null;
        this.clearStatus();
    }

    private toggleApiKeyVisibility(): void {
        if (this.phase !== "ready") return;
        this.showApiKey = !this.showApiKey;
    }

    private async handleSubmit(): Promise<void> {
        if (this.phase !== "ready" || !this.draft || this.conflict) return;

        const operation = this.operationVersion;
        const snapshot = this.draft;
        const revision = createSettingsWriteRevision();
        const pendingSave: PendingSave = {
            revision,
            ownWatchSequence: null,
        };
        this.pendingSave = pendingSave;
        this.phase = "saving";
        this.clearStatus();

        try {
            const savedSettings = await saveSettings(snapshot, revision);
            if (operation !== this.operationVersion || !this.isConnected) return;

            this.baseline = savedSettings;
            const ownWatchSequence = pendingSave.ownWatchSequence;
            const conflict = this.conflict as ExternalConflict | null;
            if (!conflict
                || (ownWatchSequence !== null && conflict.sequence <= ownWatchSequence)) {
                this.conflict = null;
            }
            if (ownWatchSequence === null) {
                if (this.retainedSaveAcknowledgementRevisions.size >= MAX_RETAINED_SAVE_ACKNOWLEDGEMENTS) {
                    const oldestRevision = this.retainedSaveAcknowledgementRevisions.values().next().value;
                    if (oldestRevision !== undefined) {
                        this.retainedSaveAcknowledgementRevisions.delete(oldestRevision);
                    }
                }
                this.retainedSaveAcknowledgementRevisions.add(pendingSave.revision);
            }
            this.pendingSave = null;
            this.phase = "ready";
            this.statusTone = "success";
            this.statusMessage = "设置已成功保存 ✓";
            this.statusTimer = setTimeout(() => {
                this.statusTimer = null;
                if (operation !== this.operationVersion || !this.isConnected) return;
                this.statusTone = "idle";
                this.statusMessage = "";
            }, 3000);
        } catch {
            if (operation !== this.operationVersion || !this.isConnected) return;
            this.pendingSave = null;
            this.phase = "ready";
            this.statusTone = "error";
            this.statusMessage = "保存失败，请重试";
        }
    }

    // ===== Icons =====
    private iconGeneral() {
        return html`<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    }
    private iconGeneration() {
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
        const settings = this.draft;
        if (!settings) return html``;
        return html`
            <h2 class="section-title">通用设置</h2>
            <p class="section-desc">控制面板的默认行为和显示偏好。</p>

            <div class="form-group">
                <label>默认标签页</label>
                <select class="form-control" name="defaultTab" .value=${settings.defaultTab} @change=${this.handleFieldChange}>
                    <option value="original">原文</option>
                    <option value="intensive">精读</option>
                    <option value="overview">总览</option>
                </select>
                <p class="hint">打开视频时，面板默认展示的视图。</p>
            </div>

            <div class="section-divider"></div>

            <div class="toggle-row">
                <div class="toggle-info">
                    <p class="toggle-title">AI 生成</p>
                    <p class="toggle-desc">用于总览、精读和 Markdown Note 生成。关闭后仍可查看原文字幕。</p>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" name="generationEnabled" .checked=${settings.generationEnabled} @change=${this.handleFieldChange} />
                    <span class="toggle-slider"></span>
                </label>
            </div>
        `;
    }

    private renderGeneration() {
        const settings = this.draft;
        if (!settings) return html``;
        const selectedProvider = getGenerationProvider(settings.generationProvider);
        const selectedProfile = settings.generationProviderSettings[settings.generationProvider];
        const isApiKeySet = selectedProfile.apiKey.trim().length > 0;

        return html`
            <h2 class="section-title">AI 生成引擎</h2>
            <p class="section-desc">配置大语言模型以生成总览、精读稿和 Markdown Note。密钥仅存储在浏览器本地。</p>

            <div class="form-group">
                <label>模型提供商</label>
                <div class="provider-badges">
                    ${GENERATION_PROVIDERS.map((provider) => html`
                        <button
                            type="button"
                            class="provider-badge ${settings.generationProvider === provider.id ? 'active' : ''}"
                            data-provider=${provider.id}
                            @click=${() => this.setProvider(provider.id)}
                        >
                            ${provider.label}
                        </button>
                    `)}
                </div>
                <p class="hint">${selectedProvider.modelHelpText}</p>
            </div>

            <div class="form-group">
                <div class="form-label-row">
                    <label>API Key</label>
                    ${isApiKeySet ? html`<span style="font-size: 12px; color: var(--success);">● 已配置</span>` : html`<span style="font-size: 12px; color: var(--warning);">○ 未配置</span>`}
                </div>
                <div class="api-key-wrapper">
                    <input class="form-control" type="${this.showApiKey ? 'text' : 'password'}" name="generationApiKey" .value=${selectedProfile.apiKey} @input=${this.handleGenerationApiKeyChange} placeholder="sk-..." />
                    <button type="button" class="toggle-visibility-btn" @click=${this.toggleApiKeyVisibility} title="${this.showApiKey ? '隐藏' : '显示'}">
                        ${this.showApiKey
                ? html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
                : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
            }
                    </button>
                </div>
                <p class="hint">
                    前往 <a href=${selectedProvider.apiKeyHelpUrl} target="_blank">${selectedProvider.label} Platform</a> 获取 API Key。
                </p>
            </div>

            <div class="form-group">
                <label>总览模型</label>
                <input class="form-control" type="text" data-task="overview" .value=${selectedProfile.models.overview} @input=${(event: Event) => this.handleGenerationModelChange("overview", event)} placeholder=${selectedProvider.modelPlaceholder} />
                <p class="hint">用于生成 overview 总览。${selectedProvider.modelHelpText}</p>
            </div>

            <div class="form-group">
                <label>精读模型</label>
                <input class="form-control" type="text" data-task="intensive" .value=${selectedProfile.models.intensive} @input=${(event: Event) => this.handleGenerationModelChange("intensive", event)} placeholder=${selectedProvider.modelPlaceholder} />
                <p class="hint">用于生成 intensive 精读稿。Markdown Note 暂时跟随精读模型。</p>
            </div>

            <div class="section-divider"></div>

            <div class="form-group">
                <label>总览 Prompt 模板</label>
                <textarea class="form-control" .value=${settings.generationPromptTemplates.overview} @input=${(event: Event) => this.handleGenerationPromptTemplateChange("overview", event)} placeholder="例如：优先提取判断、结论、是否值得看原视频。" rows="4"></textarea>
                <p class="hint">作为补充指令附加到 overview 总览生成中。</p>
            </div>

            <div class="form-group">
                <label>精读 Prompt 模板</label>
                <textarea class="form-control" .value=${settings.generationPromptTemplates.intensive} @input=${(event: Event) => this.handleGenerationPromptTemplateChange("intensive", event)} placeholder="例如：保留论证链、关键例子和可复用方法。" rows="4"></textarea>
                <p class="hint">作为补充指令附加到 intensive 精读生成中。Markdown Note 暂时跟随精读 Prompt。</p>
            </div>
        `;
    }

    private renderExport() {
        const settings = this.draft;
        if (!settings) return html``;
        return html`
            <h2 class="section-title">导出与复制</h2>
            <p class="section-desc">配置面板标题栏复制或下载原字幕时使用的默认格式。Markdown Note 使用独立导出动作。</p>

            <div class="form-group">
                <label>复制格式</label>
                <select class="form-control" name="copyFormat" .value=${settings.copyFormat} @change=${this.handleFieldChange}>
                    <option value="readable_text">纯文本（适合阅读）</option>
                    <option value="timestamped_text">带时间戳的文本</option>
                </select>
                <p class="hint">点击面板标题栏的复制按钮时使用的格式。</p>
            </div>
            
            <div class="form-group">
                <label>下载格式</label>
                <select class="form-control" name="downloadFormat" .value=${settings.downloadFormat} @change=${this.handleFieldChange}>
                    <option value="txt">TXT 纯文本</option>
                    <option value="srt">SRT 字幕文件</option>
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
                <p class="about-tagline">帮你判断长视频要不要看，并带走关键信息。</p>
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
                    <span>AI 生成</span>
                    <span class="about-link-value">总览 / 精读 / Markdown Note</span>
                </div>
            </div>
        `;
    }

    render() {
        const tabContent = () => {
            switch (this.currentTab) {
                case "general": return this.renderGeneral();
                case "generation": return this.renderGeneration();
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
                    <div class="nav-item ${this.currentTab === "generation" ? "active" : ""}" @click=${() => this.currentTab = "generation"}>
                        ${this.iconGeneration()}AI 生成
                    </div>
                    <div class="nav-item ${this.currentTab === "export" ? "active" : ""}" @click=${() => this.currentTab = "export"}>
                        ${this.iconExport()}导出偏好
                    </div>
                    <div class="nav-item ${this.currentTab === "about" ? "active" : ""}" @click=${() => this.currentTab = "about"}>
                        ${this.iconAbout()}关于
                    </div>
                </div>

                <div class="content">
                    ${this.currentTab === "about" ? this.renderAbout() : html`
                        ${this.phase === "loading" ? html`
                            <div class="lifecycle-state" role="status">正在加载设置…</div>
                        ` : ""}
                        ${this.phase === "error" ? html`
                            <div class="lifecycle-state" role="alert">
                                <p>无法加载设置：${this.loadError}</p>
                                <button type="button" class="btn btn-ghost" @click=${this.handleRetry}>重试</button>
                            </div>
                        ` : ""}

                        <fieldset class="settings-fieldset" ?disabled=${this.phase !== "ready"}>
                            ${this.draft ? tabContent() : ""}

                            ${this.conflict ? html`
                                <div class="warning-banner conflict-banner">
                                    检测到其他设置页面保存了更新。请选择要使用的版本。
                                    <div class="conflict-actions">
                                        <button type="button" class="btn btn-ghost" @click=${this.handleLoadExternal}>
                                            载入外部设置
                                        </button>
                                        <button type="button" class="btn btn-ghost" @click=${this.handleKeepLocal}>
                                            保留当前编辑
                                        </button>
                                    </div>
                                </div>
                            ` : ""}

                            <div class="footer-actions">
                                <button
                                    type="button"
                                    class="btn btn-primary"
                                    @click=${this.handleSubmit}
                                    ?disabled=${this.phase !== "ready" || !this.draft || this.conflict !== null}
                                >
                                    ${this.phase === "saving" ? "保存中..." : "保存设置"}
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-ghost"
                                    @click=${this.handleReset}
                                    ?disabled=${this.phase !== "ready" || !this.draft}
                                >
                                    恢复默认
                                </button>
                                <span class="status-msg ${this.statusTone} ${this.statusTone !== 'idle' ? 'visible' : ''}">
                                    ${this.statusMessage}
                                </span>
                            </div>
                        </fieldset>
                    `}
                </div>
            </div>
        `;
    }
}
