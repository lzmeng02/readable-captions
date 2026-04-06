import { getSettings, saveSettings } from "../settings/storage";

type Lang = "zh" | "en";

const i18n = {
    zh: {
        title: "选项设置",
        tabGeneral: "通用设置",
        tabSummary: "摘要功能",
        tabExport: "导出设置",
        languageLabel: "界面语言",
        langZh: "简体中文",
        langEn: "English",
        providerLabel: "摘要提供商",
        notActive: "此功能暂未激活，仅作未来扩展配置展示。",
        copyFormatLabel: "复制格式",
        downloadFormatLabel: "下载格式",
    },
    en: {
        title: "Options",
        tabGeneral: "General",
        tabSummary: "Summary",
        tabExport: "Export",
        languageLabel: "Interface Language",
        langZh: "简体中文",
        langEn: "English",
        providerLabel: "Summary Provider",
        notActive: "This feature is not active yet, configuration only.",
        copyFormatLabel: "Copy Format",
        downloadFormatLabel: "Download Format",
    }
};

let currentLang: Lang = "zh";

async function init(): Promise<void> {
    const settings = await getSettings();
    // 假设 settings 中包含了 language 属性，若没有则回退至默认 zh
    currentLang = (settings as any).language || "zh";
    render();
}

function render(): void {
    const t = i18n[currentLang];
    document.title = `Readable Captions - ${t.title}`;

    const app = document.getElementById("app");
    if (!app) return;

    app.innerHTML = `
        <div class="options-container">
            <div class="tabs">
                <button class="tab active" data-target="sec-general">${t.tabGeneral}</button>
                <button class="tab" data-target="sec-summary">${t.tabSummary}</button>
                <button class="tab" data-target="sec-export">${t.tabExport}</button>
            </div>
            <div class="content">
                <!-- 通用设置面板 -->
                <div class="section" id="sec-general">
                    <div class="form-group">
                        <label>${t.languageLabel}</label>
                        <select id="langSelect">
                            <option value="zh" ${currentLang === "zh" ? "selected" : ""}>${t.langZh}</option>
                            <option value="en" ${currentLang === "en" ? "selected" : ""}>${t.langEn}</option>
                        </select>
                    </div>
                </div>

                <!-- 摘要配置面板 (目前按规范作为配置占位) -->
                <div class="section" id="sec-summary" style="display: none;">
                    <div class="form-group">
                        <label>${t.providerLabel}</label>
                        <select id="providerSelect">
                            <option value="openai">OpenAI</option>
                            <option value="deepseek">DeepSeek</option>
                        </select>
                        <div class="helper-text">${t.notActive}</div>
                    </div>
                </div>

                <!-- 导出配置面板 -->
                <div class="section" id="sec-export" style="display: none;">
                    <div class="form-group">
                        <label>${t.copyFormatLabel}</label>
                        <select id="copyFormatSelect">
                            <option value="text">Plain Text</option>
                            <option value="markdown">Markdown</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>${t.downloadFormatLabel}</label>
                        <select id="downloadFormatSelect">
                            <option value="txt">.txt</option>
                            <option value="srt">.srt</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 语言切换事件：即时保存并渲染
    document.getElementById("langSelect")?.addEventListener("change", async (e) => {
        const newLang = (e.target as HTMLSelectElement).value as Lang;
        currentLang = newLang;
        const settings = await getSettings();
        await saveSettings({ ...settings, language: newLang } as any);
        render();
    });

    // 选项卡切换逻辑
    const tabs = app.querySelectorAll(".tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", (e) => {
            tabs.forEach(t => t.classList.remove("active"));
            (e.target as HTMLElement).classList.add("active");
            
            const targetId = (e.target as HTMLElement).dataset.target;
            app.querySelectorAll(".section").forEach((sec) => {
                (sec as HTMLElement).style.display = sec.id === targetId ? "block" : "none";
            });
        });
    });
}

document.addEventListener("DOMContentLoaded", init);