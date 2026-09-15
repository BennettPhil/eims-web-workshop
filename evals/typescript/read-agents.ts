import { createEvaluator } from "@arizeai/phoenix-evals";
import { loadTraces, saveResult, reportError, type Trace, type CheckResult } from "./lib/phoenix.ts";

const evaluationName = "explicit-agents-md-read";

// 1. Define the check. Connection settings are in .env.
// A tool record has readable fields: action, filePath, successful and spanId.
function checkAgentsRead(trace: Trace): CheckResult {
  for (const call of trace.toolCalls) {
    const isRead = call.action === "read_file";
    const isAgentsFile = call.filePath === trace.agentsPath;

    if (isRead && isAgentsFile && call.successful) {
      return {
        label: "OBSERVED",
        score: 1,
        explanation: `Successful AGENTS.md read in span ${call.spanId}. This does not prove the instructions were followed.`,
      };
    }
  }

  return {
    label: "NOT_OBSERVED",
    score: 0,
    explanation: "No successful explicit AGENTS.md read observed. Auto-loading, shell reads and missing telemetry are outside this check.",
  };
}

// 2. Give the check a name and tell Phoenix which kind it is.
const evaluator = createEvaluator(checkAgentsRead, {
  name: evaluationName,
  kind: "CODE",
  telemetry: { isEnabled: false },
});

// 3. Evaluate each trace in the project (or just the optional trace ID).
async function main() {
  for await (const trace of loadTraces(evaluator)) {
    const result = await evaluator.evaluate(trace);
    await saveResult(trace, evaluator, result);
  }
}

await main().catch(reportError);
