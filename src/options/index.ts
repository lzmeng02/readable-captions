import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings/defaults";
import { getSettings, saveSettings } from "../settings/storage";
import type { ExtensionSettings } from "../settings/types";
import {
    COPY_FORMAT_VALUES,
    DEFAULT_TAB_VALUES,
    DOWNLOAD_FORMAT_VALUES,
    SUMMARY_ACCESS_MODE_VALUES,
    SUMMARY_PROVIDER_VALUES,
} from "../settings/types";

type StatusTone = "idle" | "success" | "error";

const defaultTabLabels: Record<(typeof DEFAULT_TAB_VALUES)[number], string> = {
    read: "Readable",
    summary: "Summary",
    ts: "Transcript",
    cc: "Captions",
};

const summaryProviderLabels: Record<(typeof SUMMARY_PROVIDER_VALUES)[number], string> = {
    openai: "OpenAI",
    deepseek: "DeepSeek",
};

const summaryAccessModeLabels: Record<(typeof SUMMARY_ACCESS_MODE_VALUES)[number], string> = {
    api_key: "API key",
    webapp: "Webapp (experimental)",
};

const copyFormatLabels: Record<(typeof COPY_FORMAT_VALUES)[number], string> = {
    readable_text: "Readable text",
    timestamped_text: "Timestamped text",
};

const downloadFormatLabels: Record<(typeof DOWNLOAD_FORMAT_VALUES)[number], string> = {
    txt: "TXT",
    srt: "SRT",
};

@customElement("rc-options-app")
export class ReadableCaptionsOptionsApp extends LitElement {
    static styles = css`
        :host {
            display: block;
            min-height: 100vh;
            background: #f4f5f7;
            color: #18191c;
            font-family:
                -apple-system,
                BlinkMacSystemFont,
                "Helvetica Neue",
                Helvetica,
                Arial,
                "PingFang SC",
                "Hiragino Sans GB",
                "Microsoft YaHei",
                sans-serif;
        }

        * {
            box-sizing: border-box;
        }

        button,
        input,
        select,
        textarea {
            font-family: inherit;
        }

        main {
            max-width: 760px;
            margin: 0 auto;
            padding: 16px 16px 28px;
        }

        .page-stack,
        form {
            display: grid;
            gap: 12px;
        }

        .surface {
            border: 1px solid #e3e5e7;
            border-radius: 6px;
            background: #ffffff;
        }

        .page-header {
            padding: 16px;
        }

        .brand {
            margin: 0 0 6px;
            font-size: 12px;
            color: #9499a0;
        }

        h1 {
            margin: 0;
            font-size: 20px;
            line-height: 1.3;
            font-weight: 500;
            color: #18191c;
        }

        .page-lead {
            margin: 8px 0 0;
            font-size: 13px;
            line-height: 1.6;
            color: #61666d;
        }

        .section-header {
            padding: 12px 16px;
            border-bottom: 1px solid #e3e5e7;
        }

        h2 {
            margin: 0;
            font-size: 14px;
            font-weight: 500;
            color: #18191c;
        }

        .section-copy {
            margin: 4px 0 0;
            font-size: 12px;
            line-height: 1.5;
            color: #9499a0;
        }

        .section-body {
            display: grid;
            gap: 12px;
            padding: 12px 16px 16px;
        }

        .grid {
            display: grid;
            gap: 12px 16px;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .field {
            display: grid;
            gap: 6px;
        }

        .field-wide {
            grid-column: 1 / -1;
        }

        label,
        .checkbox-title {
            font-size: 13px;
            font-weight: 500;
            color: #18191c;
        }

        .hint {
            margin: 0;
            font-size: 12px;
            line-height: 1.5;
            color: #9499a0;
        }

        input,
        select,
        textarea {
            width: 100%;
            border: 1px solid #e3e5e7;
            background: #ffffff;
            color: #18191c;
            font-size: 13px;
            line-height: 1.6;
            padding: 8px 10px;
            transition: border-color 0.2s, box-shadow 0.2s, color 0.2s;
        }

        input,
        textarea {
            border-radius: 6px;
        }

        select {
            appearance: none;
            -webkit-appearance: none;
            border-radius: 4px;
            padding-right: 28px;
            background-image:
                linear-gradient(45deg, transparent 50%, #9499a0 50%),
                linear-gradient(135deg, #9499a0 50%, transparent 50%);
            background-position:
                calc(100% - 12px) calc(50% - 2px),
                calc(100% - 7px) calc(50% - 2px);
            background-size: 5px 5px;
            background-repeat: no-repeat;
        }

        input:hover,
        textarea:hover {
            border-color: #c9ccd0;
        }

        select:hover {
            border-color: #00aeec;
            color: #00aeec;
        }

        input:focus,
        select:focus,
        textarea:focus {
            outline: none;
            border-color: #00aeec;
            box-shadow: 0 0 0 2px rgba(0, 174, 236, 0.1);
        }

        textarea {
            min-height: 120px;
            resize: vertical;
        }

        .checkbox-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px;
            border: 1px solid #e3e5e7;
            border-radius: 6px;
            background: #ffffff;
            cursor: pointer;
            transition: background-color 0.2s, border-color 0.2s;
        }

        .checkbox-row:hover {
            background: #f4f5f7;
        }

        .checkbox-row input {
            width: 14px;
            height: 14px;
            margin: 2px 0 0;
            accent-color: #00aeec;
            flex: 0 0 auto;
        }

        .checkbox-copy {
            display: grid;
            gap: 2px;
        }

        .section-note {
            padding: 10px 12px;
            border: 1px solid #e3e5e7;
            border-radius: 6px;
            background: #f4f5f7;
            font-size: 12px;
            line-height: 1.6;
            color: #61666d;
        }

        .footer-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            padding: 12px 16px;
        }

        .status {
            margin: 0;
            min-height: 18px;
            font-size: 12px;
            line-height: 1.5;
            color: #9499a0;
        }

        .status.success {
            color: #00aeec;
        }

        .status.error {
            color: #18191c;
        }

        .footer-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .primary-btn {
            border: 1px solid #00aeec;
            border-radius: 4px;
            background: #00aeec;
            color: #ffffff;
            font: inherit;
            font-size: 13px;
            font-weight: 500;
            line-height: 1.4;
            padding: 8px 14px;
            cursor: pointer;
            transition: background-color 0.2s, border-color 0.2s, opacity 0.2s;
        }

        .primary-btn:hover {
            background: #008ac5;
            border-color: #008ac5;
        }

        .primary-btn:disabled {
            cursor: progress;
            opacity: 0.72;
        }

        .loading {
            margin: 0;
            padding: 16px;
            font-size: 13px;
            line-height: 1.6;
            color: #61666d;
        }

        @media (max-width: 640px) {
            main {
                padding: 12px 12px 24px;
            }

            .page-header,
            .section-header,
            .section-body,
            .footer-bar {
                padding-left: 12px;
                padding-right: 12px;
            }
        }
    `;

    @state()
    private settings: ExtensionSettings = DEFAULT_SETTINGS;

    @state()
    private isLoading = true;

    @state()
    private isSaving = false;

    @state()
    private statusTone: StatusTone = "idle";

    @state()
    private statusMessage =
        "Configuration only. Summary and provider settings are stored now, but not active yet.";

    connectedCallback(): void {
        super.connectedCallback();
        void this.loadSettings();
    }

    private async loadSettings(): Promise<void> {
        try {
            this.settings = await getSettings();
        } catch (error) {
            this.settings = DEFAULT_SETTINGS;
            this.statusTone = "error";
            this.statusMessage = error instanceof Error ? error.message : "Failed to load saved settings.";
        } finally {
            this.isLoading = false;
        }
    }

    private handleFieldChange = (event: Event): void => {
        const field = event.currentTarget;
        if (
            !(field instanceof HTMLInputElement) &&
            !(field instanceof HTMLSelectElement) &&
            !(field instanceof HTMLTextAreaElement)
        ) {
            return;
        }

        const nextValue = field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked : field.value;
        this.settings = mergeSettings({
            ...this.settings,
            [field.name]: nextValue,
        });
        this.statusTone = "idle";
        this.statusMessage = "Unsaved changes.";
    };

    private async handleSubmit(event: Event): Promise<void> {
        event.preventDefault();
        this.isSaving = true;

        try {
            this.settings = await saveSettings(this.settings);
            this.statusTone = "success";
            this.statusMessage = "Settings saved.";
        } catch (error) {
            this.statusTone = "error";
            this.statusMessage = error instanceof Error ? error.message : "Failed to save settings.";
        } finally {
            this.isSaving = false;
        }
    }

    private renderSelectOptions<T extends string>(
        values: readonly T[],
        labels: Record<T, string>,
        selectedValue: T,
    ) {
        return values.map((value) => {
            return html`<option value=${value} ?selected=${selectedValue === value}>${labels[value]}</option>`;
        });
    }

    render() {
        return html`
            <main>
                <div class="page-stack">
                    <section class="surface page-header">
                        <p class="brand">Readable Captions</p>
                        <h1>Extension Settings</h1>
                        <p class="page-lead">
                            Keep the options page aligned with the in-page panel. Summary and provider fields below
                            are configuration only for now and do not enable live AI generation yet.
                        </p>
                    </section>

                    ${this.isLoading
                        ? html`<section class="surface"><p class="loading">Loading settings...</p></section>`
                        : html`
                              <form @submit=${this.handleSubmit}>
                                  <section class="surface">
                                      <div class="section-header">
                                          <h2>General</h2>
                                          <p class="section-copy">
                                              Stored defaults for the current panel surface without changing behavior
                                              yet.
                                          </p>
                                      </div>
                                      <div class="section-body">
                                          <div class="grid">
                                              <div class="field">
                                                  <label for="defaultTab">Default tab</label>
                                                  <select
                                                      id="defaultTab"
                                                      name="defaultTab"
                                                      @change=${this.handleFieldChange}
                                                  >
                                                      ${this.renderSelectOptions(
                                                          DEFAULT_TAB_VALUES,
                                                          defaultTabLabels,
                                                          this.settings.defaultTab,
                                                      )}
                                                  </select>
                                                  <p class="hint">
                                                      Current default stays on Transcript until the panel starts using
                                                      this setting.
                                                  </p>
                                              </div>

                                              <div class="field field-wide">
                                                  <label class="checkbox-row" for="summaryEnabled">
                                                      <input
                                                          id="summaryEnabled"
                                                          type="checkbox"
                                                          name="summaryEnabled"
                                                          ?checked=${this.settings.summaryEnabled}
                                                          @change=${this.handleFieldChange}
                                                      />
                                                      <span class="checkbox-copy">
                                                          <span class="checkbox-title">Summary tab enabled</span>
                                                          <span class="hint">
                                                              Configuration only. No real summary backend is wired in
                                                              yet.
                                                          </span>
                                                      </span>
                                                  </label>
                                              </div>
                                          </div>
                                      </div>
                                  </section>

                                  <section class="surface">
                                      <div class="section-header">
                                          <h2>Summary</h2>
                                          <p class="section-copy">
                                              Provider configuration for future summary support, kept clearly inactive
                                              for now.
                                          </p>
                                      </div>
                                      <div class="section-body">
                                          <div class="section-note">
                                              Configuration only. These fields are stored for future provider support
                                              and are not active in the panel yet.
                                          </div>

                                          <div class="grid">
                                              <div class="field">
                                                  <label for="summaryProvider">Provider</label>
                                                  <select
                                                      id="summaryProvider"
                                                      name="summaryProvider"
                                                      @change=${this.handleFieldChange}
                                                  >
                                                      ${this.renderSelectOptions(
                                                          SUMMARY_PROVIDER_VALUES,
                                                          summaryProviderLabels,
                                                          this.settings.summaryProvider,
                                                      )}
                                                  </select>
                                              </div>

                                              <div class="field">
                                                  <label for="summaryAccessMode">Access mode</label>
                                                  <select
                                                      id="summaryAccessMode"
                                                      name="summaryAccessMode"
                                                      @change=${this.handleFieldChange}
                                                  >
                                                      ${this.renderSelectOptions(
                                                          SUMMARY_ACCESS_MODE_VALUES,
                                                          summaryAccessModeLabels,
                                                          this.settings.summaryAccessMode,
                                                      )}
                                                  </select>
                                                  <p class="hint">Webapp stays future-facing and experimental.</p>
                                              </div>

                                              <div class="field">
                                                  <label for="summaryModel">Model</label>
                                                  <input
                                                      id="summaryModel"
                                                      type="text"
                                                      name="summaryModel"
                                                      .value=${this.settings.summaryModel}
                                                      placeholder="e.g. gpt-4.1-mini"
                                                      @input=${this.handleFieldChange}
                                                  />
                                              </div>

                                              <div class="field">
                                                  <label for="summaryApiKey">API key</label>
                                                  <input
                                                      id="summaryApiKey"
                                                      type="password"
                                                      name="summaryApiKey"
                                                      .value=${this.settings.summaryApiKey}
                                                      autocomplete="off"
                                                      placeholder="Stored locally in extension storage"
                                                      @input=${this.handleFieldChange}
                                                  />
                                              </div>

                                              <div class="field field-wide">
                                                  <label for="summaryPromptTemplate">Prompt template</label>
                                                  <textarea
                                                      id="summaryPromptTemplate"
                                                      name="summaryPromptTemplate"
                                                      .value=${this.settings.summaryPromptTemplate}
                                                      placeholder="Optional custom instructions for future summary generation."
                                                      @input=${this.handleFieldChange}
                                                  ></textarea>
                                              </div>
                                          </div>
                                      </div>
                                  </section>

                                  <section class="surface">
                                      <div class="section-header">
                                          <h2>Export</h2>
                                          <p class="section-copy">
                                              Future copy and download defaults without moving those actions into the
                                              overflow menu.
                                          </p>
                                      </div>
                                      <div class="section-body">
                                          <div class="grid">
                                              <div class="field">
                                                  <label for="copyFormat">Copy format</label>
                                                  <select
                                                      id="copyFormat"
                                                      name="copyFormat"
                                                      @change=${this.handleFieldChange}
                                                  >
                                                      ${this.renderSelectOptions(
                                                          COPY_FORMAT_VALUES,
                                                          copyFormatLabels,
                                                          this.settings.copyFormat,
                                                      )}
                                                  </select>
                                              </div>

                                              <div class="field">
                                                  <label for="downloadFormat">Download format</label>
                                                  <select
                                                      id="downloadFormat"
                                                      name="downloadFormat"
                                                      @change=${this.handleFieldChange}
                                                  >
                                                      ${this.renderSelectOptions(
                                                          DOWNLOAD_FORMAT_VALUES,
                                                          downloadFormatLabels,
                                                          this.settings.downloadFormat,
                                                      )}
                                                  </select>
                                              </div>
                                          </div>
                                      </div>
                                  </section>

                                  <div class="surface footer-bar">
                                      <p class="status ${this.statusTone}">${this.statusMessage}</p>
                                      <div class="footer-actions">
                                          <button class="primary-btn" type="submit" ?disabled=${this.isSaving}>
                                              ${this.isSaving ? "Saving..." : "Save Settings"}
                                          </button>
                                      </div>
                                  </div>
                              </form>
                          `}
                </div>
            </main>
        `;
    }
}
