// Use the SDK's stream parser, then let native Phoenix Evals validate the completed JSON.
import { wrapLanguageModel } from "ai";
import { WorkshopError } from "./errors.ts";

type Model = ReturnType<typeof wrapLanguageModel>;
type Result = Awaited<ReturnType<Model["doGenerate"]>>;

export function streamingJudgeModel(model: Model): Model {
  return wrapLanguageModel({
    model,
    middleware: {
      // Bound a stalled connection/stream without changing the workshop's evaluator API.
      transformParams: async ({ params }) => ({
        ...params,
        abortSignal: AbortSignal.any([
          ...(params.abortSignal ? [params.abortSignal] : []),
          AbortSignal.timeout(120_000),
        ]),
      }),
      wrapGenerate: async ({ doStream }) => {
        const streamed = await doStream();
        const reader = streamed.stream.getReader();
        let text = "";
        let warnings: Result["warnings"] = [];
        let response: Result["response"] = streamed.response;
        let completion: Pick<Result, "finishReason" | "usage" | "providerMetadata"> | undefined;

        try {
          while (true) {
            const { done, value: part } = await reader.read();
            if (done) break;
            switch (part.type) {
              case "stream-start":
                warnings = part.warnings;
                break;
              case "response-metadata": {
                const { type, ...metadata } = part;
                response = { ...response, ...metadata };
                break;
              }
              case "text-delta":
                if (completion) throw new WorkshopError("judge-stream");
                text += part.delta;
                if (text.length > 60_000) throw new WorkshopError("judge-output-size");
                break;
              case "finish":
                if (completion) throw new WorkshopError("judge-stream");
                completion = part;
                break;
              case "error":
                throw new WorkshopError("judge-stream", { cause: part.error });
              case "text-start":
              case "text-end":
              case "reasoning-start":
              case "reasoning-delta":
              case "reasoning-end":
                // Only the final answer is classified, not a provider's reasoning text.
                break;
              default:
                // This judge asks for text only. Do not silently accept tools or files.
                throw new WorkshopError("judge-stream");
            }
          }
          if (!completion) throw new WorkshopError("judge-stream");
          if (completion.finishReason.unified !== "stop") throw new WorkshopError("judge-truncated");
          if (!text.trim()) throw new WorkshopError("judge-empty");
          return {
            content: [{ type: "text", text }],
            finishReason: completion.finishReason,
            usage: completion.usage,
            providerMetadata: completion.providerMetadata,
            warnings,
            request: streamed.request,
            response,
          };
        } catch (cause) {
          // Closing a failed reader releases the HTTP response; never hide the first error.
          await reader.cancel().catch(() => {});
          if (cause instanceof WorkshopError) throw cause;
          throw new WorkshopError("judge-stream", { cause });
        } finally {
          reader.releaseLock();
        }
      },
    },
  });
}
