// Plumbing for the two short examples. No model or judge credentials required.
import { createEvaluator } from "@arizeai/phoenix-evals";
import { loadTraces, saveResult, reportError, type Trace, type CheckResult, type ToolCall } from "./phoenix.ts";
import { recordSkipped, traceReport } from "./reporting.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type { Trace, CheckResult };

// import.meta.main is absent in Node 23; using it silently skips the whole eval.
// Compare paths instead, while keeping imports in tests free of network calls.
export function isMainModule(moduleUrl: string): boolean {
  return !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === moduleUrl;
}

// Accept a standalone command, optionally after one ordinary `cd folder &&`.
// Deliberately not a shell interpreter: no splitting quoted text or matching echoes.
export function shellCommand(tool: ToolCall): string {
  if (tool.action !== "shell" && tool.name !== "powershell") return "";
  if (typeof tool.input.command !== "string") return "";
  return tool.input.command.trim().replace(
    /^cd (?:[A-Za-z0-9_./~:-]+|"[^"$`\\]*"|'[^']*')\s*&&\s*/, "",
  ).trim();
}

export async function runEvaluation(name: string, check: (trace: Trace) => CheckResult) {
  // These rules do not compare file paths, so no REPO_ROOT setup is needed.
  process.env.PHOENIX_PROJECT_NAME ||= "ai_workshop";
  process.env.REPO_ROOT ||= process.cwd();
  const evaluator = createEvaluator(check, {
    name, kind: "CODE", telemetry: { isEnabled: false },
  });

  try {
    for await (const trace of loadTraces(evaluator)) {
      if (trace.toolCalls.length === 0) {
        recordSkipped(trace);
        continue;
      }
      const result = await evaluator.evaluate(trace);
      await saveResult(trace, evaluator, result);
      // These examples have different score meanings; labels identify what to inspect.
      const report = trace[traceReport];
      if (report) report.review = [];
      console.log(`  ${result.explanation}`);
    }
  } catch (error) {
    reportError(error);
  }
}
