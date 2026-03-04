import { ReadableCaptionsController } from "./controller";
import { createPlatformRegistry } from "../platforms";
import { TranscriptExporter } from "../services/export/exporter";
import { ExtensionFetcher } from "../services/http/extension_fetcher";
import { BrowserSettingsService } from "../services/settings/service";
import { ChatGPTWebSummarizer } from "../services/summarize/chatgpt_web";
import { OpenAISummarizer } from "../services/summarize/openai";
import { DelegatingSummarizer } from "../services/summarize/summarizer";
import { createLogger } from "../shared/log";

export function createReadableCaptionsApp(targetWindow: Window): ReadableCaptionsController {
    const fetcher = new ExtensionFetcher();
    const logger = createLogger("ReadableCaptions");
    const platformRegistry = createPlatformRegistry(fetcher);
    const settingsService = new BrowserSettingsService();
    const exporter = new TranscriptExporter();
    const summarizer = new DelegatingSummarizer({
        openai: new OpenAISummarizer(fetcher),
        chatgpt_web: new ChatGPTWebSummarizer(targetWindow),
    });

    return new ReadableCaptionsController({
        window: targetWindow,
        document: targetWindow.document,
        logger,
        platformRegistry,
        settingsService,
        summarizer,
        exporter,
    });
}
