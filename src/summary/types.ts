import type { Transcript } from "../transcript/model";

export type SummaryStatus = "ready" | "placeholder";

export type SummaryRequest = {
    transcript: Transcript;
};

export type SummarySection = {
    title: string;
    startTime: number;
};

export type SummaryResult = {
    status: SummaryStatus;
    text: string | null;
    sections: SummarySection[];
};

export interface SummaryProvider {
    providerId: string;
    summarize(request: SummaryRequest): Promise<SummaryResult>;
}
