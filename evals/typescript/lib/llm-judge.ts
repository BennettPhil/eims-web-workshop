// Tool-evidence preparation, not the evaluator: its rubric stays in check-verification.ts.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { basename } from "node:path";
import { ensureServerCapability } from "@arizeai/phoenix-client";
import { toObjectHeaders } from "@arizeai/phoenix-client/utils/toObjectHeaders";
import { loadTraces, type Trace } from "./phoenix.ts";
import { recordSkipped, setTraceStage } from "./reporting.ts";
import { streamingJudgeModel } from "./streaming-model.ts";

type JudgeModel = ReturnType<typeof streamingJudgeModel>;
export type Labels = [string, ...string[]];
export type JudgeTrace = Trace & {
  evidence: string;
  model: JudgeModel;
};
type ToolEvidence = {
  spanId: string;
  name: string;
  action: string;
  filePath?: string;
  startTime: string;
  endTime: string;
  resultType: unknown;
  successful: boolean;
  input: unknown;
  decodedInput: Record<string, unknown>;
};

export async function* loadJudgeTraces(evaluator = { name: "evaluation" }): AsyncGenerator<JudgeTrace> {
  // Consent is checked before ANY request, including fetching the trace from Phoenix.
  if (!process.argv.includes("--send-to-judge")) {
    console.error("No data sent. Add --send-to-judge to send the selected traces' tool requests through Phoenix to its configured model provider (all project traces when no TRACE_ID is given).");
    process.exit(1);
  }
  const modelId = readJudgeModel();
  let model: JudgeModel | undefined;
  const restoreWarnings = installJudgeWarningLogger(process.argv.includes("--verbose"));
  try {
    for await (const trace of loadTraces(evaluator)) {
      setTraceStage(trace, "preparing");
      if (!trace.toolCalls.some(call => hasUsableRequest(call, trace.repoRoot))) {
        recordSkipped(trace);
        continue;
      }
      const evidence = prepareEvidence(trace);
      if (!model) model = await createJudgeModel(trace.client, modelId);
      setTraceStage(trace, "evaluating");
      yield {
        ...trace,
        evidence,
        model,
        annotationMetadata: {
          ...trace.annotationMetadata,
          model: modelId,
          scope: "tool-requests",
          evidence: "all tool requests and result types; no outputs",
        },
      };
    }
  } finally {
    restoreWarnings();
  }
}

function hasUsableRequest(call: Trace["toolCalls"][number], repoRoot: string): boolean {
  if (hasReadableValue(call.input)) return true;
  if (call.filePath && call.filePath !== repoRoot && hasReadableValue(basename(call.filePath))) return true;
  if (typeof call.rawInput !== "string") return false;
  // Empty/redacted values aren't evidence. Preserve readable non-JSON arguments.
  try {
    return hasReadableValue(JSON.parse(call.rawInput));
  } catch { return hasReadableValue(call.rawInput); }
}

function hasReadableValue(value: unknown, depth = 0): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0 && !/^(?:redacted|\[redacted\]|<redacted>|__redacted__|\*+)$/i.test(value.trim());
  }
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (!value || typeof value !== "object" || depth >= 6) return false;
  return Object.values(value).some(item => hasReadableValue(item, depth + 1));
}

function readJudgeModel(): string {
  const selection = process.env.PHOENIX_JUDGE_MODEL?.match(/^([a-z_]+):(\S+)$/i);
  const builtInProviders = [
    "anthropic", "aws", "azure_openai", "cerebras", "deepseek", "fireworks", "google",
    "groq", "minimax", "moonshot", "ollama", "openai", "perplexity", "together", "xai", "zai",
  ];
  if (!selection || !builtInProviders.includes(selection[1].toLowerCase())) {
    console.error("Set PHOENIX_JUDGE_MODEL to a Phoenix built-in provider:model selector, such as openai:your-model-name. Configure that provider in Phoenix first. Legacy LLM_* settings are not used.");
    throw new Error("Invalid Phoenix judge model");
  }
  return `${selection[1].toLowerCase()}:${selection[2]}`;
}

export async function createJudgeModel(client: Trace["client"], modelId: string): Promise<JudgeModel> {
  try {
    await ensureServerCapability({
      client,
      requirement: {
        kind: "route", method: "POST", path: "/v1/chat/completions", minServerVersion: [19, 16, 0],
      },
    });
  } catch {
    console.error("The Phoenix judge requires server >=19.16.0. Check Phoenix connectivity and version; no judge request was sent.");
    throw new Error("Phoenix judge capability unavailable");
  }
  const model = createOpenAICompatible({
    name: "workshop-judge",
    baseURL: `${client.config.baseUrl}/v1`,
    // Reuse Phoenix authentication, never the upstream provider's API key.
    headers: toObjectHeaders(client.config.headers ?? {}),
    // Phoenix accepts text output only. The visible prompt requests JSON; Phoenix Evals validates it.
    transformRequestBody: ({ response_format, ...body }) => body,
  }).chatModel(modelId);
  // The working Phoenix/Playground route streams. Keep this detail out of the rubric.
  return streamingJudgeModel(model);
}

// Explain only the SDK's known structured-output warning; preserve other diagnostics.
export function installJudgeWarningLogger(verbose: boolean): () => void {
  const previous = globalThis.AI_SDK_LOG_WARNINGS;
  if (verbose || previous === false) return () => {};
  let explainedJsonMode = false;
  const logger: Exclude<typeof previous, undefined | false> = (options) => {
    const remaining = [];
    for (const warning of options.warnings) {
      const knownJsonMode = options.provider === "workshop-judge.chat"
        && warning.type === "unsupported" && warning.feature === "responseFormat"
        && warning.details === "JSON response format schema is only supported with structuredOutputs";
      if (knownJsonMode) {
        if (!explainedJsonMode) console.warn("Judge: using prompt-based JSON; results are validated locally.");
        explainedJsonMode = true;
      } else {
        remaining.push(warning);
      }
    }
    if (remaining.length === 0) return;
    if (typeof previous === "function") previous({ ...options, warnings: remaining });
    else for (const warning of remaining) console.warn("AI SDK warning:", options.provider, options.model, warning);
  };
  globalThis.AI_SDK_LOG_WARNINGS = logger;
  return () => {
    if (globalThis.AI_SDK_LOG_WARNINGS === logger) globalThis.AI_SDK_LOG_WARNINGS = previous;
  };
}

function prepareEvidence(trace: Trace): string {
  const tools: ToolEvidence[] = [];
  for (const call of trace.toolCalls) {
    tools.push({
      spanId: call.spanId,
      name: call.name,
      action: call.action,
      filePath: call.filePath,
      startTime: call.startTime,
      endTime: call.endTime,
      resultType: call.resultType,
      successful: call.successful,
      input: call.rawInput,
      decodedInput: call.input,
    });
  }
  tools.sort((first, second) => first.startTime.localeCompare(second.startTime));

  // Outputs and assistant text are omitted. Requests can still contain code or secrets.
  const evidence = JSON.stringify(tools);
  if (evidence.length > 60_000) {
    console.error("Tool-request evidence exceeds 60,000 characters. Choose a smaller completed task/trace. This trace was not sent to the judge or silently truncated.");
    throw new Error("Judge evidence is oversized");
  }
  return evidence;
}
