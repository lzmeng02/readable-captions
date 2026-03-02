// src/content.ts
import { render } from "lit";
import { panelTemplate, panelStyles } from "./panel/panel-view";
import type { Mode } from "./panel/panel-view";
import { getBiliTranscript } from "./bilibili";

// I will hardcode it first
const ROOT_ID = "readable-captions-root";
const ANCHOR_ID = "div.bpx-player-auxiliary";

function waitForElm(anchorID: string): Promise<Element> {

	const found = document.querySelector(anchorID);
	if (found) return Promise.resolve(found);
	
	return new Promise((resolve) => {

		const obs = new MutationObserver(() => {

			const elm = document.querySelector(anchorID);
			if (elm) {
				obs.disconnect()
				resolve(elm);
			}
		});

		obs.observe(document.documentElement, {childList: true, subtree: true});
	});
}


function ensureHostBefore(anchor: Element): HTMLElement {
	
	let host = document.getElementById(ROOT_ID);
	if (!host) {
		host = document.createElement("section");
		host.id = ROOT_ID;

		host.style.display = "block";
		host.style.width = "100%";
		host.style.marginBottom = "12px";
	}
	
	anchor.insertAdjacentElement("beforebegin", host);

	return host;
}


function mountPanel(host: HTMLElement): void {

	const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

	if (!shadow.querySelector("style[data-rc]")) {

		const styleTag = document.createElement("style");
		styleTag.setAttribute("data-rc", "1");
		styleTag.textContent = String(panelStyles);

		shadow.appendChild(styleTag);
	}

	let mode: Mode = "ts";
  	const setMode = (m: Mode): void => {
    	mode = m;
    	render(panelTemplate(mode, setMode), shadow);
  	};

  	render(panelTemplate(mode, setMode), shadow);
}


async function main() {

  	const anchor = await waitForElm(ANCHOR_ID);
  	const host = ensureHostBefore(anchor);

	const { transcript, source } = await getBiliTranscript(location.href);
	console.log("RC subtitle source:", source, "lines:", transcript?.length);
	console.log("RC transcript type:", Array.isArray(transcript), typeof transcript);
	console.log("RC transcript sample:", Array.isArray(transcript) ? transcript.slice(0, 3) : transcript);

  	mountPanel(host);

	
}

main();

let currentUrl = location.href;

function watchRouteChange(): void {
  	setInterval((): void => {
		if (location.href !== currentUrl) {
			currentUrl = location.href;

			if (/bilibili.com\/video\//.test(location.href)) {
				main();
			}
		}
  	}, 800);
}

watchRouteChange();