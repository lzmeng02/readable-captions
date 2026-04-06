import type { SummaryProvider, SummaryRequest, SummaryResult } from "./types";

function createPlaceholderSummary(_request: SummaryRequest): SummaryResult {
    return {
        status: "placeholder",
        text: null,
        sections: [],
    };
}

export const mockSummaryProvider: SummaryProvider = {
    providerId: "mock",
    async summarize(request: SummaryRequest): Promise<SummaryResult> {
        return createPlaceholderSummary(request);
    },
};
