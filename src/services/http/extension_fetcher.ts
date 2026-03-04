import type { Fetcher } from "./fetcher";

type ErrorPayload = {
    error?: {
        message?: string;
    };
    message?: string;
};

export class ExtensionFetcher implements Fetcher {
    async json<T>(url: string, init: RequestInit = {}): Promise<T> {
        const response = await fetch(url, init);
        const text = await response.text();

        if (!response.ok) {
            let message = `HTTP ${response.status} for ${url}`;

            if (text) {
                try {
                    const payload = JSON.parse(text) as ErrorPayload;
                    message = payload.error?.message ?? payload.message ?? message;
                } catch {
                    message = text;
                }
            }

            throw new Error(message);
        }

        if (!text) {
            return null as T;
        }

        return JSON.parse(text) as T;
    }
}
