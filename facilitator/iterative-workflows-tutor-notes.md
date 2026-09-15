# Iterative agentic workflows: tutor notes

120 minutes. Follow the slides in order. Each participant uses one task, makes one config change, and keeps the two trace IDs and comparison.

## Before the session

Use the [preparation checklist](prepare.md), including the actual trace check.

- Rehearse the [sample task](../sample/README.md), including its reset instructions and repository checks. Have it ready for anyone without a task.
- Check Docker, Copilot CLI and Node.js 24. Have participants install the eval dependencies before the session where possible.
- Rehearse `npm run copilot:traced -- /path/to/sample-copy` with the installed Copilot version.
- Confirm Phoenix opens at `http://127.0.0.1:6006` and receives a Copilot trace in `ai_workshop`.
- Have the Ignitis endpoint, assigned deployment name and participant keys ready through the agreed channel. Follow the handout's AI provider setup and check a Playground request before the session.
- Check both simple examples and a participant rule on an actual trace. No judge provider is required. Do not substitute offline fixture results for this rehearsal.
- Agree what task data can be logged. The simple evals do not send evidence to a model.

Use the [participant handout](../participants/iterative-workflows-handout.md) for commands and the worksheet. The task repository and workshop root terminals have different jobs; name the folder whenever you switch.

## 0:00–0:10 · Today, config, loop and task

Ask the opening question, then explain the loop: Observe → Evaluate → Improve → Re-run → Adopt.

Define agentic configuration using the examples on the slide. Use the configuration each participant already has. Ask each person to state their task in one sentence; keep it to a 5–10 minute agent run.

Offer the sample without making it a separate workshop route. Participants keep their own task text for the rerun.

## 0:10–0:24 · Phoenix and tracing

Introduce traces as runs and spans as steps. Phoenix also stores evaluation annotations.

Start Phoenix in Docker and confirm the page loads. Follow the **Ignitis AI provider**
slide and handout: OpenAI SDK, Chat Completions and the Azure base URL ending in
`/openai/v1/`. Test and save the provider, then choose its exact deployment name
in Playground and run `Reply only with OK.`. Use the deployment assigned to each
participant. Keep keys out of the projected screen. No API version is needed for
this v1 route. The two simple evals remain independent of this provider; the
optional TypeScript judge requires its separate built-in-provider setup.

From the workshop root,
launch `npm run copilot:traced -- /path/to/task-repository`. The launcher enables
built-in Copilot telemetry to local Phoenix in `ai_workshop`, including prompts,
tool arguments and returned content. It changes only the launched process's
settings. Use the sample or approved material. Do not enable two export routes
for the same task.

## 0:24–0:34 · Open Copilot and run the task

Participants use the Copilot session opened by the launcher and enter their chosen task. Do not add a prompt that tells the agent to satisfy the example eval.

Allow 5–10 minutes. Record the model and keep the exact task text. Wait for trace export to finish before evaluating.

## 0:34–0:44 · Find and read the trace

Match the trace using the task prompt and start time, then copy its ID. Do not select an arbitrary latest row.

Explore tool names, arguments, result types, timing and returned content. Ask each person for one observed fact with a span ID. Then ask what the trace cannot establish.

A request to run a check is different from a passing check. Automatically supplied instructions may leave no explicit read span.

If tracing is missing, check the endpoint, project and launcher. Pair with a working setup if troubleshooting would consume the lab; keep the result labelled as that person's trace.

## 0:44–0:55 · Setup and the test-command example

Stay at the workshop root. Use Node 24 and install with
`npm --prefix evals/typescript ci`. No `.env` is required with the defaults.

Open `test-command.ts`. Read `for` as each tool call and `===` as equals.
Explain that `shellCommand` ignores an ordinary `cd folder &&` prefix. Leave
`lib/` closed. Ask participants to predict the result, then run
`npm run eval:tests -- <TRACE_ID>`.

Open the `simple-test-command` trace annotation. `TEST_COMMAND_FOUND` means
an exact command request; it does not prove the tests passed. `NOT_OBSERVED`
can mean no check, another command, or missing evidence. Inspect the actual span.

## 0:55–1:05 · The tool-error example

Open `tool-errors.ts`. Read the counter and loop, then run
`npm run eval:errors -- <TRACE_ID>`. Open the `simple-tool-errors` annotation.
The score counts recorded tool errors. A failing shell command may still have
a successful tool status. Keep this separate from repository test results.

The deliberately missing-file probe in the live rehearsal gave one error;
normal reads gave zero. These are controlled demonstrations, not an agent
improvement comparison. A trace without tools is skipped, not given a pass.

## 1:05–1:22 · Write and test a participant evaluator

Each person chooses something they noticed in their trace. Ask for a rule in one sentence before they edit code.

Copy `test-command.ts` to `my-eval.ts` in the same folder. Change the rule and the annotation name in `runEvaluation`. Run it from the workshop root as shown in the handout. Leave `lib/` unchanged. The earlier `your-eval.ts` template is still available as an optional extension.

For a written rubric, they can copy `check-verification.ts` in the same folder and adapt the visible check. Keep the same evidence review before a model call.

Run the rule on the baseline trace and inspect its annotation. Ask a partner for a case the evaluator might get wrong. Once revised, run it again on the baseline and keep it unchanged for the comparison.

## 1:22–1:27 · Repository checks

Switch to the task repository. Run its normal check command and inspect the task diff. Record the actual command and outcome separately from the behavioural eval.

Do not call code correct because an annotation is green or Copilot says it finished.

## 1:27–1:33 · Fair comparison and config change

Keep the task, starting code, model, tools, evaluator, evidence scope and repository checks the same. Change one config item and write a prediction.

Examples include naming the test command, documenting an MCP parameter or stating where generated files belong. Prefer a useful task behaviour over improving an explicit-read score for its own sake.

Save the baseline changes before restoring the task's starting code. Use the repository's normal workflow; preserve unrelated work and keep the config edit and tracing setup. Two worktrees are an option, not a requirement.

## 1:33–1:43 · Second Copilot run

Launch another session with `npm run copilot:traced -- /path/to/task-repository` and use the same task text. Give the agent another 5–10 minutes. Record the new trace ID after export finishes.

## 1:43–1:51 · Second eval and repository checks

From the workshop root, run the unchanged participant evaluator on the new trace using the handout command. The simple examples do not need `REPO_ROOT`.

Compare the same annotation on both traces and run the same repository checks. If the evaluator needs a correction, evaluate both traces with the corrected version.

## 1:51–1:55 · Adopt

Ask: did the predicted behaviour change, what did the repository checks show, and would you keep, revise or revert the config edit?

Keep both trace IDs, the evaluator, config diff and actual check results. A flat or worse result is still useful. One comparison does not establish a general productivity improvement.

## 1:55–2:00 · Human process

Give everyone two minutes to write one improvement they will take back next week, how they will test it and when they will share the result. Ask each person to share that commitment.

## Optional follow-up

Omitting the trace ID evaluates existing traces in the configured project. Demonstrate this only after the selected-trace loop is clear. The simple examples make no model calls. Check project scope before running them. The older LLM judge remains optional and needs its separate setup.

Scripts run on demand, not automatically on future traces. If a batch fails, read the summary; previously saved results remain. Resolve connection or output errors before trying again, without sharing raw provider errors or credentials.
