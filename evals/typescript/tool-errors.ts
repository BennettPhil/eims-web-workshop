import { runEvaluation, isMainModule, type Trace, type CheckResult } from "./lib/simple.ts";

// Question: how many tool calls recorded an error? Use this to find runs to inspect.
export function checkToolErrors(trace: Trace): CheckResult {
  let errors = 0;

  for (const tool of trace.toolCalls) {
    if (tool.failed) errors = errors + 1;
  }

  if (errors > 0) {
    return {
      label: "ERRORS_RECORDED",
      score: errors,
      explanation: `${errors} of ${trace.toolCalls.length} tool calls recorded an error. Open the tool spans to investigate.`,
    };
  }

  return {
    label: "NO_RECORDED_ERRORS",
    score: 0,
    explanation: `No errors recorded in ${trace.toolCalls.length} tool calls. Missing telemetry and failing tests can still exist.`,
  };
}

// Here the score is an error COUNT, not a pass mark. Lower means fewer recorded errors.
if (isMainModule(import.meta.url)) await runEvaluation("simple-tool-errors", checkToolErrors);
