import type { PlatformTranscriptResult } from "../platforms/types";

export type PanelStatus = "loading" | "ready" | "error";

export type PanelData = PlatformTranscriptResult & {
    status: PanelStatus;
    errorMessage?: string;
};

export type PanelCallbacks = {
    onTranscriptChange?(result: PlatformTranscriptResult): void;
};

export type SubtitleSelectionUiState = {
    pendingSubtitleUrl: string | null;
    subtitleError: string | null;
};

export type PanelHandle = {
    updateData(next: PanelData): void;
    reset(next: PanelData): void;
    dispose(): void;
};
