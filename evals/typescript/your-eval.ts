import { createEvaluator } from "@arizeai/phoenix-evals";
import { resolve } from "node:path";
import { loadTraces, saveResult, reportError, type Trace, type CheckResult } from "./lib/phoenix.ts";

const evaluationName = "your-eval"; // Give your contribution a descriptive name.

// 1. Define your check: adapt ONE example, then replace the TODO with the return below.
function checkYourRule(input: Trace): CheckResult {
  const matches: string[] = [];
  for (const call of input.toolCalls) {
    if (!call.successful) continue;

    // Example 1: the exact test command was invoked. This does not prove tests passed.
    // if (call.action === "shell" && call.input.command === "pnpm test") {
    //   matches.push(call.spanId);
    // }

    // Example 2: replace this MCP tool name and parameter with your own.
    // if (call.name === "mcp__deployment__deploy" && call.input.environment === "test") {
    //   matches.push(call.spanId);
    // }

    // Example 3: a write targeted this exact file. filePath is already absolute.
    // if (call.action === "write_file" && call.filePath === resolve(input.repoRoot, "generated/report.json")) {
    //   matches.push(call.spanId);
    // }
  }

  throw new Error("TODO: implement your own rule before saving any result");
  // if (matches.length === 0) {
  //   return { label: "NOT_OBSERVED", score: 0, explanation: "No matching action was observed." };
  // }
  // return {
  //   label: "OBSERVED",
  //   score: 1,
  //   explanation: `Matching action span IDs: ${matches.join(", ")}.`,
  // };
  // For insufficient evidence, return { label: "UNCLEAR", explanation: "..." }.
}

// 2. Give the check a name and tell Phoenix which kind it is.
const evaluator = createEvaluator(checkYourRule, {
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
