import { render } from "lit";
import { panelTemplate, panelStyles } from "./panel-view";
import type { Mode } from "./panel-view";
import type { Transcript } from "../transcript/model";

type PanelData = {
    transcript: Transcript | null;
    source: string;
};

export function mountPanel(host: HTMLElement, data: PanelData): void {
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    if (!shadow.querySelector("style[data-rc]")) {
        const styleTag = document.createElement("style");
        styleTag.setAttribute("data-rc", "1");
        styleTag.textContent = String(panelStyles);

        shadow.appendChild(styleTag);
    }

    let mode: Mode = "ts";
    const setMode = (nextMode: Mode): void => {
        mode = nextMode;
        render(panelTemplate(mode, setMode, data), shadow);
    };

    render(panelTemplate(mode, setMode, data), shadow);
}
