import { runEvaluation, shellCommand, isMainModule, type Trace, type CheckResult } from "./lib/simple.ts";

// Change this to your repository's check command.
// Match exactly, ignoring an optional leading `cd folder &&`.
const testCommand = "npm test";

// Question: did Copilot request this shell command? It need not have passed.
export function checkTestCommand(trace: Trace): CheckResult {
  for (const tool of trace.toolCalls) {
    const command = shellCommand(tool);

    if (command === testCommand) {
      return {
        label: "TEST_COMMAND_FOUND",
        score: 1,
        explanation: `Requested ${testCommand} in span ${tool.spanId}. Inspect its output to see whether it passed.`,
      };
    }
  }

  return {
    label: "NOT_OBSERVED",
    score: 0,
    explanation: `No exact ${testCommand} request recorded. Other commands, shell wrappers and missing arguments are outside this rule.`,
  };
}

// The helper loads Phoenix traces, runs this function and saves the results.
if (isMainModule(import.meta.url)) await runEvaluation("simple-test-command", checkTestCommand);
