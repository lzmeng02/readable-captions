export const GENERATION_ERROR_MESSAGES = {
    "invalid-request": "Invalid generation request.",
    "settings-unavailable": "Extension settings are unavailable. Please try again.",
    "generation-disabled": "Generation is disabled in the extension settings.",
    "api-key-missing": "API Key is not set. Please configure it in the extension options.",
    "model-missing": "A model is not set for the selected provider. Please configure it in the extension options.",
    "provider-unavailable": "Could not reach the generation provider. Check your connection and try again.",
    "provider-rejected": "The generation provider rejected the request. Check your provider settings and try again.",
    "provider-response-invalid": "The generation provider returned an invalid response. Please try again.",
    "generation-failed": "Generation failed. Please try again.",
    "runtime-unavailable": "Extension runtime is unavailable. Reload the extension and try again.",
    "runtime-invalidated": "Extension context was invalidated. Reload this page and try again.",
    "service-disconnected": "Generation service disconnected before completion.",
} as const;

export type GenerationErrorCode = keyof typeof GENERATION_ERROR_MESSAGES;

export class GenerationUserError extends Error {
    readonly code: GenerationErrorCode;

    constructor(code: GenerationErrorCode) {
        super(GENERATION_ERROR_MESSAGES[code]);
        this.name = "GenerationUserError";
        this.code = code;
    }
}

export function isGenerationErrorCode(value: unknown): value is GenerationErrorCode {
    return typeof value === "string" && Object.hasOwn(GENERATION_ERROR_MESSAGES, value);
}

export function toGenerationErrorCode(
    value: unknown,
    fallback: GenerationErrorCode = "generation-failed",
): GenerationErrorCode {
    return value instanceof GenerationUserError ? value.code : fallback;
}

export function getSafeGenerationErrorMessage(value: unknown): string {
    return value instanceof GenerationUserError
        ? value.message
        : GENERATION_ERROR_MESSAGES["generation-failed"];
}
