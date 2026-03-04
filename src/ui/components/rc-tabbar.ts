import { html } from "lit";
import type { TabDefinition, TabId } from "../../shared/types";

export function tabbarTemplate(
    currentTab: TabId,
    tabs: readonly TabDefinition[],
    onSelectTab: (tab: TabId) => void,
) {
    return html`
        <nav class="segment-control">
            ${tabs.map((tab) => html`
                <button
                    class="tab ${tab.id === currentTab ? "active" : ""}"
                    title=${tab.description}
                    @click=${() => onSelectTab(tab.id)}
                >
                    ${tab.label}
                </button>
            `)}
        </nav>
    `;
}
