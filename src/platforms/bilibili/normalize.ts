import type { Transcript } from "../../transcript/model";

export function normalizeBilibiliTranscript(body: unknown): Transcript | null {
    if (!Array.isArray(body)) {
        return null;
    }

    return body as Transcript;
}
