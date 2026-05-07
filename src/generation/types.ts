import type { Transcript } from "../transcript/model";

export type GenerationTask = "overview" | "intensive" | "note";

export type GenerationMetadata = {
    title: string;
    url: string;
    aid?: number;
    cid?: number;
    source?: string;
};

export type GenerationRequest = {
    transcript: Transcript;
    task: GenerationTask;
    metadata?: GenerationMetadata;
};

export type GenerationStatus = "ready" | "placeholder";

export type GenerationResult = {
    status: GenerationStatus;
    text: string | null;
};
