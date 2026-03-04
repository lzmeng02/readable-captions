import { html } from "lit";
import { BUILTIN_TABS } from "../../services/settings/schema";
import type { AppSettings, SummaryProvider, TabId } from "../../shared/types";

export function settingsModalTemplate(
    settings: AppSettings,
    onClose: () => void,
    onSave: (event: Event) => void,
) {
    return html`
        <div class="settings-backdrop" @click=${onClose}></div>
        <section class="settings-modal" @click=${(event: Event) => event.stopPropagation()}>
            <div class="settings-header">
                <div>
                    <h3 class="settings-title">设置</h3>
                    <p class="settings-subtitle">这里控制摘要来源、Prompt 和面板显示的标签数量。</p>
                </div>
                <button class="icon-btn" title="关闭设置" @click=${onClose}>
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round">
                        <path d="M18 6 6 18"></path>
                        <path d="m6 6 12 12"></path>
                    </svg>
                </button>
            </div>

            <form class="settings-form" @submit=${onSave}>
                <label class="field">
                    <span class="field-label">摘要提供方</span>
                    <select class="field-input" name="summaryProvider">
                        <option value="disabled" ?selected=${settings.summary.provider === "disabled"}>禁用</option>
                        <option value="openai" ?selected=${settings.summary.provider === "openai"}>OpenAI API</option>
                        <option value="chatgpt_web" ?selected=${settings.summary.provider === "chatgpt_web"}>ChatGPT Web</option>
                    </select>
                </label>

                <label class="field">
                    <span class="field-label">OpenAI API Key</span>
                    <input
                        class="field-input"
                        type="password"
                        name="apiKey"
                        .value=${settings.summary.apiKey}
                        placeholder="sk-..."
                        autocomplete="off"
                    />
                </label>

                <label class="field">
                    <span class="field-label">OpenAI Model</span>
                    <input
                        class="field-input"
                        type="text"
                        name="model"
                        .value=${settings.summary.model}
                        placeholder="gpt-4.1-mini"
                    />
                </label>

                <label class="field">
                    <span class="field-label">自定义摘要 Prompt</span>
                    <textarea class="field-input field-textarea" name="prompt">${settings.summary.prompt}</textarea>
                </label>

                <fieldset class="field-group">
                    <legend class="field-label">显示中的标签页</legend>
                    <div class="tab-toggle-list">
                        ${BUILTIN_TABS.map((tab) => html`
                            <label class="tab-toggle">
                                <input
                                    type="checkbox"
                                    name="visibleTabs"
                                    value=${tab.id}
                                    ?checked=${settings.visibleTabs.includes(tab.id)}
                                />
                                <div>
                                    <div class="tab-toggle-title">${tab.label}</div>
                                    <div class="tab-toggle-desc">${tab.description}</div>
                                </div>
                            </label>
                        `)}
                    </div>
                    <div class="field-hint">勾选几个标签页，面板里就显示几个。顺序暂时固定为默认顺序。</div>
                </fieldset>

                <label class="field">
                    <span class="field-label">默认标签页</span>
                    <select class="field-input" name="defaultTab">
                        ${BUILTIN_TABS.map((tab) => html`
                            <option value=${tab.id} ?selected=${settings.defaultTab === tab.id}>
                                ${tab.label}
                            </option>
                        `)}
                    </select>
                </label>

                <div class="field-callout">
                    <div class="callout-title">ChatGPT Web 说明</div>
                    <div class="callout-text">
                        当前实现会复制提示词并打开 ChatGPT Web，适合作为 Glarity 式流程的过渡版本。
                    </div>
                </div>

                <div class="settings-actions">
                    <button type="button" class="secondary-btn" @click=${onClose}>取消</button>
                    <button type="submit" class="primary-btn">保存设置</button>
                </div>
            </form>
        </section>
    `;
}

export function parseSettingsForm(form: HTMLFormElement, previous: AppSettings): AppSettings {
    const data = new FormData(form);
    const visibleTabs = data
        .getAll("visibleTabs")
        .filter((value): value is string => typeof value === "string") as TabId[];

    return {
        visibleTabs,
        defaultTab: (data.get("defaultTab") as TabId) ?? previous.defaultTab,
        summary: {
            provider: ((data.get("summaryProvider") as string) ?? previous.summary.provider) as SummaryProvider,
            apiKey: String(data.get("apiKey") ?? ""),
            model: String(data.get("model") ?? ""),
            prompt: String(data.get("prompt") ?? ""),
        },
    };
}
