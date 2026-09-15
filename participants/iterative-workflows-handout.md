# Iterative agentic workflows

In this kit, **workshop root** means the folder containing the main README and
`package.json`. If the kit is in a repository subfolder, run workshop commands
from that subfolder.

Run a real task, inspect what the agent did, and test one change to its configuration.

Bring a task that Copilot can complete in about 5–10 minutes in a repository with some agentic configuration: `AGENTS.md`, `CLAUDE.md`, skills, subagents, MCP tools or supporting documentation. If you need a repository and task, use the [sample instructions](../sample/README.md).

You need Copilot CLI, Docker and Node.js 24.11 or newer within Node 24. Keep credentials, personal data and production actions out of the exercise.

## 1. Start Phoenix

In a new terminal, from any folder:

```sh
docker run -p 127.0.0.1:6006:6006 \
  -p 127.0.0.1:4317:4317 -i -t arizephoenix/phoenix:latest
```

Leave that terminal open. You should see the Phoenix page at `http://127.0.0.1:6006`. If Phoenix is already running there, use that instance.

### Set up the Ignitis AI provider

In Phoenix, open **Settings → AI Providers → Custom AI Providers → New Provider**.
If **Ignitis Test** already exists, edit that provider instead.

| Field | Value |
| --- | --- |
| Provider Name | `Ignitis Test` |
| SDK | `OpenAI` |
| Provider String | `openai` |
| API Type | `Chat Completions` |
| Base URL | Your supplied Azure resource URL ending in `/openai/v1/` |
| API Key | Paste your Ignitis-supplied key into this field only |

Leave Organization, Project and Default Headers blank. Keep `/openai/v1/` at the
end of the URL. This configuration does not need an API version; do not add
`2024-12-01-preview` to the URL.

Click **Test**, check for **Credentials Valid**, then **Create Provider** (or
**Update Provider** when editing). Re-enter your key if the save form requires it.

In **Playground**, open the model menu, choose **Ignitis Test**, and type
your supplied deployment name in that provider's model search. Select the
**custom** result. Use the exact Azure deployment name supplied by your team,
which may differ from the model family name.

Enter `Reply only with OK.` in the question input and click **Run**. Check that
the output is `OK`. Keep the key out of task prompts, slides and source files.

This enables model requests in Playground. The two simple evals below do not
need a provider. The optional TypeScript LLM judge has a
[separate setup](../evals/typescript/README.md#3-set-up-the-judge-in-phoenix);
its built-in-provider route does not automatically select this custom provider.

## 2. Launch Copilot with tracing

From a terminal at the **workshop repository root**:

```sh
nvm use
npm run copilot:traced -- /absolute/path/to/your/task-repository
```

Use Node 24.11 or newer within Node 24 if you do not use nvm. The launcher uses
Copilot's built-in telemetry to send traces to local Phoenix in `ai_workshop`.
No plugin installation or global configuration change is needed. The rehearsed
versions are Copilot CLI 1.0.83 and Phoenix 20.8.0.

Prompts, tool requests and tool returns are enabled. Use the disposable sample
or approved material. These traces can contain source code and sensitive values.
If an existing hook exporter is active, use one export route for the task.

## 3. Run your task

In the Copilot session opened by the launcher, enter the task you brought.
Use your normal configuration and allow 5–10 minutes. Save the task text for
the second run and record the model. Wait for the run and trace export to finish.

## 4. Find the trace

Open `http://127.0.0.1:6006`, select `ai_workshop`, and match the trace by its prompt and start time. Copy the trace ID.

Open a few tool spans. Look at their names, arguments, result types, paths and commands. Check the timing and any returned content. Find one thing you can point to in the trace and one thing it cannot establish. For example, a request to run tests does not show that the tests passed.

## 5. Set up the two simple evals

Use another terminal at the **workshop repository root**:

```sh
nvm use
npm --prefix evals/typescript ci
```

The commands below default to local Phoenix and `ai_workshop`. They leave the
old `.env` alone. No judge model, provider key or repository path setting is
required for these two examples.

## 6. Was the test command requested?

Open `evals/typescript/test-command.ts`. Read `testCommand` and the loop.
It compares each recorded shell command with `npm test`, ignoring an optional
leading `cd folder &&`. Change `testCommand` for your repository if needed.
Predict the result, then run this from the workshop root:

```sh
npm run eval:tests -- <BASELINE_TRACE_ID>
```

Replace the placeholder with your actual trace ID, without angle brackets.
`TEST_COMMAND_FOUND` means the command was requested. `NOT_OBSERVED` means no
match was recorded. Missing arguments, different commands and extra flags can
also explain a missing match. A request does not prove that the tests passed.

In Phoenix's Traces table, enable **trace annotations** under **Columns** and
open the `simple-test-command` badge. Compare it with the actual command and output.

## 7. Did any tool record an error?

Open `evals/typescript/tool-errors.ts`. It adds one for each recorded tool error.

```sh
npm run eval:errors -- <BASELINE_TRACE_ID>
```

Open the `simple-tool-errors` badge. `ERRORS_RECORDED` identifies a run to inspect;
`NO_RECORDED_ERRORS` means the count is zero. The score is a count, not a pass mark.
Missing-file calls and broken tools may produce errors. Failing tests can still
have a successful shell tool status; read their output separately.

Both scripts skip traces without tool spans and make no model calls.
See [the simple guide](../evals/typescript/SIMPLE.md) for examples and limitations.

## 8. Write your own check

Copy `test-command.ts` to `my-eval.ts` in the same folder. Change the check and
the annotation name in `runEvaluation` at the bottom. Pick something you can
point to in your trace. Explain your rule to a partner and ask for a case it
might get wrong. From the workshop root:

```sh
node evals/typescript/my-eval.ts <BASELINE_TRACE_ID>
```

Keep the name distinct so you do not overwrite the supplied result. The earlier
`read-agents.ts`, `check-verification.ts` LLM judge and `your-eval.ts` template
remain available in the [older guide](../evals/typescript/README.md). They have
additional setup requirements; use them only as an optional extension.

## 9. Test the code, then change the config

In your task repository, run its normal test or check command and record the actual result. Review the task diff as well. Keep this separate from the behavioural eval.

Choose one config change that addresses what you observed. You might specify the test command in `AGENTS.md`, clarify an MCP parameter or document where generated files belong. Write down what you expect to change.

Save the first run's changes before restoring the task's starting code. Use your usual repository workflow and preserve unrelated work. Keep the tracing setup and your one config change. Keep the task, model, available tools, evaluator and repository checks the same.

## 10. Run the comparison

Use `npm run copilot:traced -- /path/to/task-repository` again to open a fresh session and enter the same task. Find its new trace in Phoenix. From the workshop root, run your unchanged evaluator:

```sh
node evals/typescript/my-eval.ts <NEW_TRACE_ID>
```

Run the same repository tests again. The simple examples do not need `REPO_ROOT`. If you chose the optional LLM route, follow its separate setup and evidence-review instructions.

Compare both traces and decide whether to keep, revise or revert the config change. If you fix the evaluator, run the fixed version against both traces. A single comparison gives you a reason to test further, not a general claim about productivity.

## Your worksheet

```text
Task and repository:
Copilot model:
Baseline trace ID:
One observed tool action and its span ID:
One thing the trace cannot establish:
My evaluator name and rule:
Baseline label and explanation:
Repository check command and actual result:
One config change:
Predicted difference:
New trace ID and evaluator result:
Repository check result after rerun:
Decision and evidence: keep / revise / revert
Next week: what will I change, how will I test it, and when will I share it?
```

## Optional: evaluate the project

Omit the trace ID to evaluate all existing traces in the configured project.
From the workshop root:

```sh
npm run eval:tests
npm run eval:errors
```

The summary separates saved results, skipped traces and errors. An empty project
produces no results. If a batch stops, earlier saved annotations remain. These
scripts run on demand; they do not automatically evaluate future traces.
