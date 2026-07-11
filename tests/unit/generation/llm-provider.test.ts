import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGeneration } from "../../../src/generation/llm-provider";
import { generationRequest } from "../../helpers/generation";
import { createFakeRuntimePort } from "../../helpers/runtime-port";

afterEach(() => vi.unstubAllGlobals());

describe("runtime generation streams", () => {
    it("reconstructs partial snapshots from port deltas", () => {
        const fake = createFakeRuntimePort();
        vi.stubGlobal("chrome", { runtime: { connect: () => fake.port } });
        const onToken = vi.fn();
        const onDone = vi.fn();

        streamGeneration({
            request: generationRequest,
            onToken,
            onDone,
            onError: vi.fn(),
        });
        fake.emitMessage({ type: "token", text: "a" });
        fake.emitMessage({ type: "token", text: "b" });
        fake.emitMessage({ type: "done", text: "ab" });

        expect(onToken.mock.calls.map(([text]) => text)).toEqual(["a", "ab"]);
        expect(onDone).toHaveBeenCalledWith("ab");
    });

    it("uses the done message as the canonical final output", () => {
        const fake = createFakeRuntimePort();
        vi.stubGlobal("chrome", { runtime: { connect: () => fake.port } });
        const onDone = vi.fn();

        streamGeneration({
            request: generationRequest,
            onToken: vi.fn(),
            onDone,
            onError: vi.fn(),
        });
        fake.emitMessage({ type: "token", text: "partial" });
        fake.emitMessage({ type: "done", text: "canonical" });

        expect(onDone).toHaveBeenCalledWith("canonical");
    });

    it("ignores late port messages after aborting a stream", () => {
        const lateMessages = [
            { type: "token", text: "late" },
            { type: "done", text: "late" },
            { type: "error", message: "late" },
        ] as const;

        for (const lateMessage of lateMessages) {
            const fake = createFakeRuntimePort();
            const disconnect = vi.spyOn(fake.port, "disconnect");
            vi.stubGlobal("chrome", { runtime: { connect: () => fake.port } });
            const onToken = vi.fn();
            const onDone = vi.fn();
            const onError = vi.fn();
            const controller = streamGeneration({
                request: generationRequest,
                onToken,
                onDone,
                onError,
            });

            controller.abort();

            expect(fake.postedMessages).toEqual([
                { type: "start", request: generationRequest },
                { type: "cancel" },
            ]);
            expect(disconnect).toHaveBeenCalledOnce();

            fake.emitMessage(lateMessage);

            expect(onToken).not.toHaveBeenCalled();
            expect(onDone).not.toHaveBeenCalled();
            expect(onError).not.toHaveBeenCalled();
        }
    });
});
