# Generation Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenAI/DeepSeek requests compatible, reject incomplete streams, reduce streaming work from quadratic snapshots to deltas, keep visible rendering bounded, and prevent active MV3 generation from being suspended.

**Architecture:** Build provider-specific request bodies, parse SSE through a strict pure state machine, send deltas across the background port while reconstructing snapshots in the content context, and schedule at most one visible panel render per frame. Move background registration behind injectable functions so an active request can own a bounded 25-second Chrome-API keepalive without permanent side effects.

**Tech Stack:** TypeScript 5.9, Vitest 4, jsdom 29, Web Streams, Chrome Manifest V3 runtime ports, Lit 3.

## Global Constraints

- Execute after the subtitle/content lifecycle plan; reuse its Vitest configuration and `PanelHandle` API.
- Preserve current prompts, task names (`overview`, `intensive`, `note`), public-settings security, exports, cancellation, and error retry UI.
- OpenAI raw JSON must never receive DeepSeek-only fields. DeepSeek raw JSON must never contain SDK-only `extra_body`.
- Reasoning content is never rendered or exported as the final answer.
- No permanent heartbeat: keepalive exists only for a pending generation request and is cleared on every terminal path.
- Every behavior change follows RED → GREEN → REFACTOR with the exact target command.

---

## File Structure

- `src/generation/sse.ts`: pure SSE state and terminal validation.
- `src/generation/keepalive.ts`: generic bounded keepalive wrapper.
- `src/generation/background-stream.ts`: one generation-port lifecycle.
- `src/background-app.ts`: injectable settings/generation port registration.
- `src/background.ts`: thin composition root only.
- `src/panel/render-scheduler.ts`: animation-frame coalescer.
- `tests/helpers/generation.ts` and `tests/helpers/runtime-port.ts`: real `Response`/fake port boundaries shared by tests.

### Task 1: Build Provider-Specific Raw HTTP Payloads

**Files:**
- Create: `tests/helpers/generation.ts`
- Create: `tests/unit/generation/llm-api-payload.test.ts`
- Modify: `src/generation/llm-api.ts:4-22,293-315`

**Interfaces:**
- Consumes: `ExtensionSettings`, `GenerationRequest`, existing prompt/model resolution.
- Produces a module-private body builder:

```ts
type ChatCompletionRequestBody = {
    model: string;
    messages: ChatMessage[];
    stream: true;
    thinking?: { type: "enabled" };
    reasoning_effort?: "high";
};

function buildChatCompletionBody(
    provider: ExtensionSettings["generationProvider"],
    model: string,
    messages: ChatMessage[],
): ChatCompletionRequestBody;
```

- [ ] **Step 1: Create concrete generation test helpers**

Create `tests/helpers/generation.ts`:

```ts
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import type { ExtensionSettings } from "../../src/settings/types";
import type { GenerationRequest } from "../../src/generation/types";

export type SettingsOverrides = Partial<Omit<
    ExtensionSettings,
    "generationModels" | "generationPromptTemplates"
>> & {
    generationModels?: Partial<ExtensionSettings["generationModels"]>;
    generationPromptTemplates?: Partial<ExtensionSettings["generationPromptTemplates"]>;
};

export function createSettings(overrides: SettingsOverrides = {}): ExtensionSettings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        generationApiKey: overrides.generationApiKey ?? "test-key",
        generationModels: { ...DEFAULT_SETTINGS.generationModels, ...overrides.generationModels },
        generationPromptTemplates: {
            ...DEFAULT_SETTINGS.generationPromptTemplates,
            ...overrides.generationPromptTemplates,
        },
    };
}

export const generationRequest: GenerationRequest = {
    task: "overview",
    transcript: [{ from: 0, to: 1, content: "hello" }],
    metadata: { title: "Video", url: "https://www.bilibili.com/video/BV1abc" },
};

export function createSseResponse(chunks: readonly string[], init: ResponseInit = {}): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        ...init,
    });
}

export const successfulSse = [
    'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
    "data: [DONE]\n\n",
];
```

- [ ] **Step 2: Write fetch-level payload RED tests**

Create `tests/unit/generation/llm-api-payload.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGenerationFromApi } from "../../../src/generation/llm-api";
import { createSettings, generationRequest, createSseResponse, successfulSse } from "../../helpers/generation";

afterEach(() => vi.unstubAllGlobals());

async function captureBody(provider: "openai" | "deepseek"): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return createSseResponse(successfulSse);
    }));
    await streamGenerationFromApi({
        settings: createSettings({
            generationProvider: provider,
            generationModels: { overview: provider === "openai" ? "gpt-4o-mini" : "" },
        }),
        request: generationRequest,
        signal: new AbortController().signal,
        onToken: vi.fn(),
    });
    if (!body) throw new Error("fetch body was not captured");
    return body;
}

describe("chat completion request bodies", () => {
    it("sends only common fields to OpenAI", async () => {
        const body = await captureBody("openai");
        expect(Object.keys(body).sort()).toEqual(["messages", "model", "stream"]);
    });

    it("sends top-level thinking and high effort to DeepSeek", async () => {
        const body = await captureBody("deepseek");
        expect(body.thinking).toEqual({ type: "enabled" });
        expect(body.reasoning_effort).toBe("high");
        expect(body).not.toHaveProperty("extra_body");
    });
});
```

- [ ] **Step 3: Run RED**

```powershell
npm test -- tests/unit/generation/llm-api-payload.test.ts
```

Expected: OpenAI contains `reasoning_effort`/`extra_body`; DeepSeek lacks top-level `thinking` and contains `extra_body`.

- [ ] **Step 4: Implement the minimal body builder**

Replace `DEFAULT_EXTRA_BODY` with `const DEFAULT_DEEPSEEK_THINKING = { type: "enabled" } as const;`, then implement:

```ts
function buildChatCompletionBody(
    provider: ExtensionSettings["generationProvider"],
    model: string,
    messages: ChatMessage[],
): ChatCompletionRequestBody {
    const body: ChatCompletionRequestBody = { model, messages, stream: true };
    if (provider === "deepseek") {
        body.thinking = DEFAULT_DEEPSEEK_THINKING;
        body.reasoning_effort = DEFAULT_REASONING_EFFORT;
    }
    return body;
}
```

Pass this result to `JSON.stringify()`; leave endpoint, headers, signal, prompts, and error response parsing unchanged.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npm test -- tests/unit/generation/llm-api-payload.test.ts
npm exec tsc -- --noEmit --pretty false
git add src/generation/llm-api.ts tests/helpers/generation.ts tests/unit/generation/llm-api-payload.test.ts
git commit -m "fix: build provider-specific chat payloads"
```

### Task 2: Validate SSE Framing and Completion

**Files:**
- Create: `src/generation/sse.ts`
- Create: `tests/unit/generation/llm-api-stream.test.ts`
- Modify: `src/generation/llm-api.ts:231-290,323-357`

**Interfaces:**

```ts
export type ChatStreamState = {
    pending: string;
    text: string;
    finishReason: string | null;
    sawDone: boolean;
    errorMessage: string | null;
};
export type ChatStreamDelta = { delta: string; snapshot: string };
export function createChatStreamState(): ChatStreamState;
export function consumeChatSse(state: ChatStreamState, input: string): ChatStreamDelta[];
export function finalizeChatSse(state: ChatStreamState): string;
```

- [ ] **Step 1: Write strict stream RED tests through the public API**

Use this runner in `tests/unit/generation/llm-api-stream.test.ts`:

```ts
async function run(chunks: readonly string[]): Promise<string> {
    vi.stubGlobal("fetch", vi.fn(async () => createSseResponse(chunks)));
    return streamGenerationFromApi({
        settings: createSettings({ generationProvider: "openai", generationModels: { overview: "gpt-4o-mini" } }),
        request: generationRequest,
        signal: new AbortController().signal,
        onToken: vi.fn(),
    });
}
```

Add these concrete cases:

```ts
it("rejects EOF before DONE", async () => {
    await expect(run(['data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n']))
        .rejects.toThrow("before [DONE]");
});

it.each(["length", "content_filter", "insufficient_system_resource"])("rejects finish reason %s", async (reason) => {
    await expect(run([
        'data: {"choices":[{"delta":{"content":"cut"},"finish_reason":null}]}\n\n',
        `data: {"choices":[{"delta":{},"finish_reason":"${reason}"}]}\n\n`,
        "data: [DONE]\n\n",
    ])).rejects.toThrow(reason);
});

it("rejects empty stop plus DONE", async () => {
    await expect(run(['data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n', "data: [DONE]\n\n"]))
        .rejects.toThrow("empty");
});

it("surfaces streamed provider errors", async () => {
    await expect(run(['data: {"error":{"message":"quota exceeded"}}\n\n']))
        .rejects.toThrow("quota exceeded");
});

it("rejects malformed JSON instead of discarding it", async () => {
    await expect(run(["data: {not-json}\n\n"])).rejects.toThrow("Malformed SSE JSON");
});

it("joins multiple data lines in one event", async () => {
    await expect(run([
        'data: {"choices":\n',
        'data: [{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
    ])).resolves.toBe("ok");
});

it("accepts reasoning progress before final content", async () => {
    await expect(run([
        'data: {"choices":[{"delta":{"reasoning_content":"thinking"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
    ])).resolves.toBe("answer");
});

it("rejects reasoning-only output", async () => {
    await expect(run([
        'data: {"choices":[{"delta":{"reasoning_content":"thinking"},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
    ])).rejects.toThrow("empty");
});
```

Add the byte-split UTF-8 case explicitly:

```ts
it("decodes a multibyte content delta split across byte chunks", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode([
        'data: {"choices":[{"delta":{"content":"回答"},"finish_reason":"stop"}]}',
        "",
        "data: [DONE]",
        "",
        "",
    ].join("\n"));
    const marker = encoder.encode("回");
    const markerStart = bytes.findIndex((_value, index) =>
        marker.every((value, offset) => bytes[index + offset] === value));
    if (markerStart < 0) throw new Error("UTF-8 marker was not found");
    const splitAt = markerStart + 1;
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes.slice(0, splitAt));
            controller.enqueue(bytes.slice(splitAt));
            controller.close();
        },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
    })));
    await expect(streamGenerationFromApi({
        settings: createSettings({ generationProvider: "openai", generationModels: { overview: "gpt-4o-mini" } }),
        request: generationRequest,
        signal: new AbortController().signal,
        onToken: vi.fn(),
    })).resolves.toBe("回答");
});
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- tests/unit/generation/llm-api-stream.test.ts
```

Expected: abnormal EOF, finish reasons, empty output, provider errors, and malformed JSON resolve instead of rejecting; multi-line events are discarded.

- [ ] **Step 3: Implement the pure SSE reducer**

`consumeChatSse()` appends to `state.pending`, extracts blank-line-delimited events, and joins an event's `data:` lines with `\n`. Handle terminal/error values as follows:

```ts
if (data === "[DONE]") {
    state.sawDone = true;
    continue;
}
let payload: unknown;
try {
    payload = JSON.parse(data);
} catch {
    throw new Error("Malformed SSE JSON from generation provider.");
}
const apiError = getApiErrorMessage(payload);
if (apiError) {
    state.errorMessage = apiError;
    throw new Error(apiError);
}
```

Read `choices[0].finish_reason` even when content is absent. Append only `delta.content`; ignore `reasoning_content`. Return `{ delta, snapshot }` for each content delta.

`finalizeChatSse()` enforces:

```ts
if (state.errorMessage) throw new Error(state.errorMessage);
if (!state.sawDone) throw new Error("Generation stream ended before [DONE].");
if (state.finishReason !== "stop") throw new Error(`Generation stopped with finish_reason: ${state.finishReason ?? "missing"}.`);
if (!state.text.trim()) throw new Error("Generation completed with empty output.");
return state.text;
```

- [ ] **Step 4: Integrate without changing callback semantics yet**

Keep `TextDecoder` in `llm-api.ts`. Feed decoded text into `consumeChatSse()` and call the current `onToken(update.snapshot)` for every update. At EOF, feed `decoder.decode()` and call `finalizeChatSse()`.

- [ ] **Step 5: Run GREEN and commit**

```powershell
npm test -- tests/unit/generation/llm-api-stream.test.ts tests/unit/generation/llm-api-payload.test.ts
npm exec tsc -- --noEmit --pretty false
git add src/generation/sse.ts src/generation/llm-api.ts tests/unit/generation/llm-api-stream.test.ts
git commit -m "fix: validate streamed generation completion"
```

### Task 3: Send Deltas Across the Runtime Port

**Files:**
- Create: `tests/helpers/runtime-port.ts`
- Create: `tests/unit/generation/llm-api-delta.test.ts`
- Create: `tests/unit/generation/llm-provider.test.ts`
- Modify: `src/generation/llm-api.ts`
- Modify: `src/generation/protocol.ts:14-22`
- Modify: `src/background.ts:96-118`
- Modify: `src/generation/llm-provider.ts:71-117`

**Interfaces:** API `onToken` becomes delta; runtime token `text` becomes one delta; panel-facing `onToken` remains cumulative.

- [ ] **Step 1: Add API delta RED tests**

```ts
it("emits raw API deltas instead of snapshots", async () => {
    const onToken = vi.fn();
    await runSuccessfulStream(["a", "b"], onToken);
    expect(onToken.mock.calls.map(([text]) => text)).toEqual(["a", "b"]);
});

it("keeps callback payload linear", async () => {
    const onToken = vi.fn();
    await runSuccessfulStream(Array.from({ length: 1000 }, () => "x"), onToken);
    expect(onToken.mock.calls.reduce((sum, [text]) => sum + String(text).length, 0)).toBe(1000);
});
```

Expected RED: callbacks are `["a", "ab"]`; 1000 deltas transfer 500500 characters.

- [ ] **Step 2: Create a fake runtime port and provider RED test**

Create `tests/helpers/runtime-port.ts` with real stored listener arrays:

```ts
export function createFakeRuntimePort(name = "readable-captions-generation-stream") {
    const messageListeners: Array<(message: unknown) => void> = [];
    const disconnectListeners: Array<() => void> = [];
    const postedMessages: unknown[] = [];
    let disconnected = false;
    const emitDisconnect = (): void => {
        if (disconnected) return;
        disconnected = true;
        for (const listener of disconnectListeners) listener();
    };
    const port = {
        name,
        postMessage(message: unknown) { postedMessages.push(message); },
        disconnect: emitDisconnect,
        onMessage: { addListener(listener: (message: unknown) => void) { messageListeners.push(listener); } },
        onDisconnect: { addListener(listener: () => void) { disconnectListeners.push(listener); } },
    };
    return {
        port,
        postedMessages,
        emitMessage(message: unknown) {
            for (const listener of messageListeners) listener(message);
        },
        emitDisconnect,
    };
}
```

Then test:

```ts
it("reconstructs partial snapshots from port deltas", () => {
    const fake = createFakeRuntimePort();
    vi.stubGlobal("chrome", { runtime: { connect: () => fake.port } });
    const onToken = vi.fn();
    const onDone = vi.fn();
    streamGeneration({ request: generationRequest, onToken, onDone, onError: vi.fn() });
    fake.emitMessage({ type: "token", text: "a" });
    fake.emitMessage({ type: "token", text: "b" });
    fake.emitMessage({ type: "done", text: "ab" });
    expect(onToken.mock.calls.map(([text]) => text)).toEqual(["a", "ab"]);
    expect(onDone).toHaveBeenCalledWith("ab");
});
```

Expected RED: provider forwards `["a", "b"]`.

- [ ] **Step 3: Implement delta semantics**

`llm-api.ts` calls `options.onToken(update.delta)`. Background forwards `deltaText` unchanged. Add a protocol comment that token text is one delta. In `llm-provider.ts`:

```ts
let accumulatedText = "";
if (message.type === "token") {
    accumulatedText += message.text;
    options.onToken(accumulatedText);
    return;
}
```

Use `message.text` from `done` as canonical final output.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm test -- tests/unit/generation/llm-api-delta.test.ts tests/unit/generation/llm-provider.test.ts tests/unit/generation/llm-api-stream.test.ts
npm exec tsc -- --noEmit --pretty false
git add src/generation src/background.ts tests/helpers/runtime-port.ts tests/unit/generation
git commit -m "perf: send generation deltas across runtime ports"
```

### Task 4: Coalesce Visible Panel Rendering

**Files:**
- Create: `src/panel/render-scheduler.ts`
- Create: `tests/unit/panel/render-scheduler.test.ts`
- Create: `tests/dom/panel/mount-generation-render.test.ts`
- Modify: `src/panel/mount.ts:145-176,278-318,390-410`

**Interfaces:**

```ts
export type RenderScheduler = { schedule(): void; flush(): void; cancel(): void };
export function createRenderScheduler(
    renderNow: () => void,
    requestFrame?: typeof requestAnimationFrame,
    cancelFrame?: typeof cancelAnimationFrame,
): RenderScheduler;
```

- [ ] **Step 1: Write scheduler and panel RED tests**

Use this concrete fake in `tests/unit/panel/render-scheduler.test.ts`:

```ts
function createFakeFrames() {
    let nextId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    return {
        request(callback: FrameRequestCallback): number {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancel(id: number): void { callbacks.delete(id); },
        runAll(): void {
            const pending = [...callbacks.values()];
            callbacks.clear();
            for (const callback of pending) callback(0);
        },
    };
}

it("coalesces schedules into one frame", () => {
    const renderNow = vi.fn();
    const frames = createFakeFrames();
    const scheduler = createRenderScheduler(renderNow, frames.request, frames.cancel);
    scheduler.schedule();
    scheduler.schedule();
    expect(renderNow).not.toHaveBeenCalled();
    frames.runAll();
    expect(renderNow).toHaveBeenCalledTimes(1);
});

it("flush replaces a pending frame with one immediate render", () => {
    const renderNow = vi.fn();
    const frames = createFakeFrames();
    const scheduler = createRenderScheduler(renderNow, frames.request, frames.cancel);
    scheduler.schedule();
    scheduler.flush();
    frames.runAll();
    expect(renderNow).toHaveBeenCalledTimes(1);
});

it("cancel prevents a pending render", () => {
    const renderNow = vi.fn();
    const frames = createFakeFrames();
    const scheduler = createRenderScheduler(renderNow, frames.request, frames.cancel);
    scheduler.schedule();
    scheduler.cancel();
    frames.runAll();
    expect(renderNow).not.toHaveBeenCalled();
});
```

In jsdom, capture generation callbacks and assert:

```ts
it("renders multiple visible tokens once on the next frame", () => {
    const generation = mountGeneratedPanel("overview");
    const baseline = litRenderSpy.mock.calls.length;
    generation.onToken("a");
    generation.onToken("ab");
    expect(litRenderSpy).toHaveBeenCalledTimes(baseline);
    runAnimationFrame();
    expect(litRenderSpy).toHaveBeenCalledTimes(baseline + 1);
});

it("does not render hidden task tokens", () => {
    const generation = mountGeneratedPanel("overview");
    clickOriginalTab();
    const baseline = litRenderSpy.mock.calls.length;
    generation.onToken("hidden");
    runAnimationFrame();
    expect(litRenderSpy).toHaveBeenCalledTimes(baseline);
});
```

Expected RED: current callbacks render immediately for every visible or hidden token.

- [ ] **Step 2: Implement and integrate the scheduler**

`schedule()` stores one frame id; `flush()` cancels it then renders; `cancel()` cancels without rendering. Visibility is:

```ts
const isGenerationTaskVisible = (task: GenerationTask): boolean =>
    isNoteOpen ? task === "note" : task !== "note" && mode === task;
```

Visible tokens schedule; hidden tokens only update state. Visible done/error flush; hidden terminal updates do not render. `PanelHandle.reset()` and `dispose()` cancel pending frames.

- [ ] **Step 3: Run GREEN and commit**

```powershell
npm test -- tests/unit/panel/render-scheduler.test.ts tests/dom/panel/mount-generation-render.test.ts tests/dom/panel/mount.test.ts
npm exec tsc -- --noEmit --pretty false
git add src/panel tests/unit/panel/render-scheduler.test.ts tests/dom/panel
git commit -m "perf: coalesce generation panel renders"
```

### Task 5: Add Request-Scoped MV3 Keepalive Behind Testable Background Wiring

**Files:**
- Create: `src/generation/keepalive.ts`
- Create: `src/generation/background-stream.ts`
- Create: `src/background-app.ts`
- Modify: `src/background.ts:1-173`
- Create: `tests/unit/background/keepalive.test.ts`
- Create: `tests/unit/background/background-stream.test.ts`
- Create: `tests/unit/background/background-app.test.ts`
- Create: `tests/unit/background/background-entry.test.ts`

**Interfaces:**

```ts
export const GENERATION_KEEPALIVE_INTERVAL_MS = 25_000;
export type KeepAliveDependencies = {
    pulse(): unknown | Promise<unknown>;
    setInterval(callback: () => void, delayMs: number): ReturnType<typeof globalThis.setInterval>;
    clearInterval(handle: ReturnType<typeof globalThis.setInterval>): void;
};
export async function withKeepAlive<T>(
    work: () => Promise<T>,
    signal: AbortSignal,
    deps: KeepAliveDependencies,
): Promise<T>;

export type RuntimePort = {
    name: string;
    postMessage(message: unknown): void;
    onMessage: { addListener(listener: (message: unknown) => void): void };
    onDisconnect: { addListener(listener: () => void): void };
};

export type KeepAliveRunner = <T>(work: () => Promise<T>, signal: AbortSignal) => Promise<T>;

export type GenerationPortDependencies = {
    getSettings: typeof getSettings;
    streamGenerationFromApi: typeof streamGenerationFromApi;
    keepAlive: KeepAliveRunner;
};

export type BackgroundDependencies = {
    chrome: ExtensionChrome | null;
    getSettings: typeof getSettings;
    restrictStorageAccessToTrustedContexts: typeof restrictStorageAccessToTrustedContexts;
    watchSettings: typeof watchSettings;
    streamGenerationFromApi: typeof streamGenerationFromApi;
    keepAlive: KeepAliveRunner;
};

export function attachGenerationStreamPort(port: RuntimePort, deps: GenerationPortDependencies): void;
export function registerBackground(deps: BackgroundDependencies): void;
```

- [ ] **Step 1: Write current-entry and pure keepalive RED tests**

Install fake Chrome APIs, dynamically import `background.ts`, start a pending generation, advance fake timers 25 seconds, and expect `getPlatformInfo()` once. Current result is zero. Pure tests must cover pending pulses, resolve/reject cleanup, immediate abort cleanup, and ignored pulse rejection:

```ts
it("pulses every 25 seconds while work is pending", async () => {
    vi.useFakeTimers();
    const pending = deferred<void>();
    const pulse = vi.fn();
    const result = withKeepAlive(() => pending.promise, new AbortController().signal, timerDeps(pulse));
    await vi.advanceTimersByTimeAsync(50_000);
    expect(pulse).toHaveBeenCalledTimes(2);
    pending.resolve();
    await result;
});
```

- [ ] **Step 2: Extract side-effect-free background units**

`keepalive.ts`, `background-stream.ts`, and `background-app.ts` have no import-time side effects. `background-app.ts` preserves existing storage access restriction, public-settings broadcasting, port validation, replacement, cancel, and disconnect behavior via injected dependencies.

- [ ] **Step 3: Implement request-scoped keepalive and the thin entry**

`withKeepAlive()` creates one interval, catches sync/async pulse errors, clears immediately on abort, and repeats idempotent cleanup in `finally`. Compose it in `background.ts` with `chrome.runtime.getPlatformInfo()`:

```ts
const keepAlive: KeepAliveRunner = (work, signal) => withKeepAlive(work, signal, {
    pulse: () => chromeApi?.runtime?.getPlatformInfo?.(),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
});
```

Each request owns its timer. Settings ports create none.

- [ ] **Step 4: Run GREEN and commit**

```powershell
npm test -- tests/unit/background
npm test
npm run build
git diff --check
git add src/background.ts src/background-app.ts src/generation/keepalive.ts src/generation/background-stream.ts tests/unit/background
git commit -m "fix: keep active generation streams alive in MV3"
```

## Plan Completion Gate

```powershell
npm test
npm run build
git diff --check
```

Expected: all suites pass, all extension bundles build, and no whitespace errors remain.
