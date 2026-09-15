# Two simple Copilot evals

In this kit, **workshop root** means the folder containing the main README and
`package.json`. If the kit is in a repository subfolder, run workshop commands
from that subfolder.

Start with these. Each example is about 30 lines, runs without an LLM judge,
and saves its result on the trace in Phoenix. The existing `read-agents.ts`,
`check-verification.ts` and `your-eval.ts` are still available.

## Run them

From the **workshop repository root**, use Node 24 and install once:

```sh
nvm use
npm --prefix evals/typescript ci
```

If you do not use nvm, install Node 24.11 or newer within Node 24 another way.
The two simple scripts also run on the existing Node 23.9 installation; its
experimental Type Stripping warning is informational.
Then run:

```sh
npm run eval:tests
npm run eval:errors
```

That checks all existing traces in `ai_workshop` at `http://localhost:6006`.
No `.env`, repository path, provider key or trace ID is required with these defaults.
The new commands leave the old `.env` alone. For another project, set
`PHOENIX_PROJECT_NAME` and `PHOENIX_BASE_URL` in this terminal, or explicitly
load your settings with `node --env-file=.env test-command.ts` from this folder.

To check just one run, copy its trace ID from Phoenix:

```sh
npm run eval:tests -- <TRACE_ID>
npm run eval:errors -- <TRACE_ID>
```

Replace `<TRACE_ID>` with the actual ID, without angle brackets. Each command
prints a label, explanation, and count of results saved and verified.
In Phoenix's **Traces** table, enable **trace annotations** under **Columns**.
Open the `simple-test-command` or `simple-tool-errors` badge.

## 1. Was the expected test command requested?

Open [test-command.ts](test-command.ts). Read the `testCommand` value and the
`for` loop: for each recorded tool, compare its shell command with `npm test`.

- `TEST_COMMAND_FOUND` (1): that command was requested. It may have failed.
- `NOT_OBSERVED` (0): this exact rule found no matching request.

**Use case:** after asking Copilot to run a project's checks, find runs where
the expected command was not recorded. Compare before and after adding the
check command to `AGENTS.md`.

The helper ignores one ordinary leading `cd folder &&`. It does not match
`echo "npm test"`, mentions in a README, extra flags, other wrappers, or a
different test command. Change `testCommand` for your repository. Missing
arguments can also cause `NOT_OBSERVED`; inspect the trace before drawing a conclusion.

## 2. Did any tool record an error?

Open [tool-errors.ts](tool-errors.ts). It starts a counter at zero and adds one
for each recorded tool error.

- `ERRORS_RECORDED`: inspect this run. The score is the number of tool errors.
- `NO_RECORDED_ERRORS`: the recorded error count is zero.

**Use case:** find broken file paths, tool failures or failed integrations to
investigate before changing the agent's instructions. Lower counts mean fewer
recorded errors, not necessarily better work.

`failed` means Phoenix's span status is `ERROR` or the tracing plugin recorded
`tool.result_type` as `failure` or `error`. Unknown results are not counted.
A shell tool can return successfully while the tests it launched fail. This
rule does not parse test output or prove that the code works.

Both scripts skip traces without tool spans. They never call a model. The score
mean is a match rate for the first eval and an average error count for the second.
Do not compare those two numbers as if they measured the same thing.

## Get actual Copilot traces

Start local Phoenix using the participant guide. In a separate terminal at the
workshop root, launch Copilot in your task repository:

```sh
npm run copilot:traced -- /absolute/path/to/task-repository
```

For a disposable task, follow [the sample instructions](../../sample/README.md).
The launcher enables Copilot's built-in OpenTelemetry exporter and content
capture for this process, sending to local Phoenix in `ai_workshop`. Use this
launcher again for the rerun. No tracing plugin or global configuration edit is needed.
Use Copilot CLI 1.0.83 and Phoenix 20.8.0 (the versions rehearsed here), or rehearse
your installed versions first. `copilot help monitoring` describes the built-in
settings. Wait for export and confirm that the task's tool spans are visible.

The new examples also read the workshop's existing Arize hook traces. The hook
installer did not produce traces in this machine's rehearsal, so the built-in
exporter is the demonstrated route. Avoid running both exporters for the same task.
Tracing captures prompts and tool content; use the disposable sample or approved material.

## Make a small example produce useful output

In fresh Copilot sessions, try these deliberately controlled demonstrations:

1. Read `task.md` and summarize it; do not run tests. Expect `NOT_OBSERVED`.
2. Complete the sample task and run `npm test`. Expect `TEST_COMMAND_FOUND`.
3. Ask Copilot to use `view` on a deliberately nonexistent file. Expect an error
   count greater than zero, if the tool call is made and its failure exported.

These probes test the evals. They are not evidence that a configuration change
improved an agent. For a real before/after comparison, keep the task unchanged.

[Live rehearsal results](../../facilitator/simple-evals-rehearsal-2026-09-07.md)
record both labels from real Copilot runs, plus annotation readback.
The [older examples and judge setup](README.md) remain available as an optional extension.
