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
            color: #18191c;
            background:
                radial-gradient(circle at top right, rgba(0, 174, 236, 0.08), transparent 32%),
                linear-gradient(180deg, #f7fbfd 0%, #f6f7f8 42%, #f6f7f8 100%);
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

        main {
            max-width: 880px;
            margin: 0 auto;
            padding: 40px 20px 56px;
        }

        .hero {
            margin-bottom: 24px;
        }

        .eyebrow {
            display: inline-flex;
            align-items: center;
            padding: 5px 10px;
            border-radius: 999px;
            background: rgba(0, 174, 236, 0.1);
            color: #00aeec;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        h1 {
            margin: 12px 0 8px;
            font-size: clamp(28px, 4vw, 38px);
            line-height: 1.1;
            font-weight: 700;
        }

        .lead {
            max-width: 720px;
            margin: 0;
            color: #61666d;
            font-size: 15px;
            line-height: 1.7;
        }

        form {
            display: grid;
            gap: 16px;
        }

        .card {
            padding: 20px;
            border: 1px solid #e3e5e7;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.92);
            box-shadow: 0 10px 28px rgba(24, 25, 28, 0.06);
            backdrop-filter: blur(6px);
        }

        .card-header {
            margin-bottom: 16px;
        }

        h2 {
            margin: 0 0 6px;
            font-size: 18px;
            font-weight: 600;
        }

        .section-copy {
            margin: 0;
            color: #61666d;
            font-size: 14px;
            line-height: 1.6;
        }

        .grid {
            display: grid;
            gap: 14px 16px;
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
        .checkbox-label {
            font-size: 13px;
            font-weight: 600;
            color: #18191c;
        }

        .hint {
            margin: 0;
            color: #9499a0;
            font-size: 12px;
            line-height: 1.5;
        }

        input,
        select,
        textarea {
            width: 100%;
            border: 1px solid #d8dbe0;
            border-radius: 10px;
            background: #ffffff;
            color: #18191c;
            font: inherit;
            padding: 10px 12px;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        textarea {
            min-height: 130px;
            resize: vertical;
        }

        input:focus,
        select:focus,
        textarea:focus {
            outline: none;
            border-color: #00aeec;
            box-shadow: 0 0 0 3px rgba(0, 174, 236, 0.16);
        }

        .checkbox {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 14px;
            border: 1px solid #d8dbe0;
            border-radius: 12px;
            background: #ffffff;
        }

        .checkbox input {
            width: 16px;
            height: 16px;
            margin: 0;
            accent-color: #00aeec;
        }

        .status-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            margin-top: 8px;
        }

        .status {
            min-height: 20px;
            font-size: 13px;
            line-height: 1.5;
        }

        .status.idle {
            color: #61666d;
        }

        .status.success {
            color: #0f7a41;
        }

        .status.error {
            color: #c13515;
        }

        .actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .primary-btn {
            border: none;
            border-radius: 999px;
            background: linear-gradient(135deg, #00aeec 0%, #1f9fff 100%);
            color: #ffffff;
            font: inherit;
            font-weight: 600;
            padding: 10px 18px;
            cursor: pointer;
            transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .primary-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 10px 24px rgba(0, 174, 236, 0.22);
        }

        .primary-btn:disabled {
            cursor: progress;
            transform: none;
            box-shadow: none;
            opacity: 0.72;
        }

        .loading {
            color: #61666d;
            font-size: 14px;
        }

        @media (max-width: 640px) {
            main {
                padding: 28px 16px 40px;
            }

            .card {
                padding: 18px;
                border-radius: 14px;
            }

            .status-row {
                align-items: stretch;
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
    private statusMessage = "Changes here prepare future behavior. Summary integration is not active yet.";

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
                <section class="hero">
                    <span class="eyebrow">Readable Captions</span>
                    <h1>Extension Settings</h1>
                    <p class="lead">
                        Keep panel behavior stable now and prepare the next settings-backed features. Summary
                        provider fields below are configuration only and do not enable live AI generation yet.
                    </p>
                </section>

                ${this.isLoading
                    ? html`<section class="card"><p class="loading">Loading settings...</p></section>`
                    : html`
                          <form @submit=${this.handleSubmit}>
                              <section class="card">
                                  <div class="card-header">
                                      <h2>General</h2>
                                      <p class="section-copy">
                                          Minimal defaults for the panel and summary surface. Stored now, consumed
                                          later.
                                      </p>
                                  </div>
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
                                              Preserves the current panel behavior for now by defaulting to Transcript.
                                          </p>
                                      </div>

                                      <div class="field">
                                          <div class="checkbox">
                                              <input
                                                  id="summaryEnabled"
                                                  type="checkbox"
                                                  name="summaryEnabled"
                                                  ?checked=${this.settings.summaryEnabled}
                                                  @change=${this.handleFieldChange}
                                              />
                                              <label class="checkbox-label" for="summaryEnabled">
                                                  Summary tab enabled
                                              </label>
                                          </div>
                                          <p class="hint">
                                              Configuration only. No real summary backend is wired in yet.
                                          </p>
                                      </div>
                                  </div>
                              </section>

                              <section class="card">
                                  <div class="card-header">
                                      <h2>Summary</h2>
                                      <p class="section-copy">
                                          Provider configuration is prepared here without changing current panel
                                          behavior.
                                      </p>
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
                                          <p class="hint">The webapp mode stays future-facing and experimental.</p>
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
                              </section>

                              <section class="card">
                                  <div class="card-header">
                                      <h2>Export</h2>
                                      <p class="section-copy">
                                          Future copy and download defaults without moving those actions into the
                                          overflow menu.
                                      </p>
                                  </div>
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
                              </section>

                              <div class="status-row">
                                  <p class="status ${this.statusTone}">${this.statusMessage}</p>
                                  <div class="actions">
                                      <button class="primary-btn" type="submit" ?disabled=${this.isSaving}>
                                          ${this.isSaving ? "Saving..." : "Save Settings"}
                                      </button>
                                  </div>
                              </div>
                          </form>
                      `}
            </main>
        `;
    }
}
