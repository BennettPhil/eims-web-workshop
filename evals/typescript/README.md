> **Start with [the two simple examples](SIMPLE.md).** They need no judge setup:
> `npm run eval:tests` and `npm run eval:errors` from the workshop root.
> The examples below are retained for the optional deeper walkthrough.

# Three Phoenix evals

Start with one finished Copilot task. Each script loads its trace, runs one
check, and saves a trace annotation in Phoenix.

| File | Question |
| --- | --- |
| [read-agents.ts](read-agents.ts) | Was an explicit, successful read of the root `AGENTS.md` recorded? |
| [check-verification.ts](check-verification.ts) | Did the agent request tests, linting or typechecking? |
| [your-eval.ts](your-eval.ts) | Your own rule, with three commented examples to adapt |

These are examples. Pick your own rule for your own repository.

## Setup

Use Node.js 24.11 or newer within Node 24, and Phoenix 19.16 or newer.
In a terminal at the workshop root:

```sh
cd evals/typescript
npm ci
```

Copy `.env.example` to `.env` **only if you do not already have one**:

```sh
cp .env.example .env
```

Edit these settings:

```dotenv
PHOENIX_BASE_URL=http://127.0.0.1:6006
PHOENIX_PROJECT_NAME=ai_workshop
REPO_ROOT=/absolute/path/to/your/task-repository
```

`REPO_ROOT` is the repository Copilot worked in, not this evals folder.
Use its absolute path as recorded in the trace. Keep one repository per Phoenix
project when evaluating a batch. If your Phoenix server requires authentication,
set `PHOENIX_API_KEY`; that key authenticates to Phoenix, not the judge provider.

Commands below run from **evals/typescript**, except the root npm shortcut shown
in the judge demo.

## 1. Check the trace

Open your project in Phoenix. Match the task's prompt and start time, then copy
its 32-character trace ID. Wait for the task and trace export to finish.

Look for tool calls with actual paths or commands. Internal application events
such as `auth` and `list_models` are not coding-task evidence. If those are all you
see, check the project name and plugin logging before running an eval.

## 2. Run the code check

Replace `<TRACE_ID>` with the copied ID, without the angle brackets:

```sh
node --env-file=.env read-agents.ts <TRACE_ID>
```

You should see a label and a summary confirming that the annotation was saved.
In Phoenix, open the project's **Traces** tab, enable **trace annotations** under
**Columns**, and click the `explicit-agents-md-read` badge on that trace.

`OBSERVED` means a successful structured read of the exact root `AGENTS.md` was
recorded. `NOT_OBSERVED` means this narrow rule found none. Shell reads and
automatically loaded instructions are outside the rule. Reading a file does
not prove the agent understood or followed it.

## 3. Set up the judge in Phoenix

1. In Phoenix admin settings, save credentials for a built-in model provider.
   Use server-side **Secrets**, not a key that exists only in the browser's Playground.
2. Select that provider and model in Playground and check that a short request works.
3. Set the same provider and model ID in your local `.env`:

```dotenv
PHOENIX_JUDGE_MODEL=openai:your-model-id
```

Replace the example with your configured model. This setting is a
`provider:model` identifier, not a URL or secret. Phoenix handles the provider
credentials. A custom provider saved in the UI is not automatically selected
by this built-in-provider route.

The request goes from this script to Phoenix, then to that provider. If the
provider is external, the evidence leaves your laptop.

See [Phoenix provider setup](https://arize.com/docs/phoenix/prompt-engineering/how-to-prompts/configure-ai-providers)
for server credentials and provider options.

## 4. Run the LLM judge

For the facilitator demo, read the rubric in `check-verification.ts`. Predict the
result, then inspect the tool arguments in Phoenix before sending them to the model:

From the **workshop root**, with `evals/typescript/.env` configured above:

```sh
npm run eval:judge -- <TRACE_ID> --send-to-judge
```

The npm command loads that file; check its Phoenix project, repository path and
model before the demo. Use one completed trace ID to keep the demo to one run.
Omitting the trace ID evaluates the whole configured project.

Or, from **evals/typescript**:

```sh
node --env-file=.env check-verification.ts <TRACE_ID> --send-to-judge
```

The flag permits the judge request. Tool arguments can contain code or sensitive
values, even though the helper omits full tool returns and assistant messages.

Open the `verification-request` trace annotation:

- `CHECK_REQUESTED`: a recorded request runs tests, linting or typechecking.
- `NO_CHECK_FOUND`: readable tool requests contain no such check.
- `SKIPPED` appears only in the terminal: no usable tool requests were available,
  so the script made no model call and saved no annotation.

A failed check still counts as an attempt. The labels have no numeric score
and do not say whether the tests passed or whether the work is correct.
Read the cited command and span. Do you agree with the model?

## 5. Write your own check

Open `your-eval.ts`. Change the evaluation name and complete `checkYourRule`.
The comments contain examples for an exact command, an MCP tool argument and
a generated file path. Use one if it fits, or write another rule.

For a written LLM rubric, copy `check-verification.ts` within this directory and
edit its name, labels and rubric. Keep the evidence-review step.

Run your check on the baseline, then keep it unchanged when evaluating the rerun:

```sh
node --env-file=.env your-eval.ts <BASELINE_TRACE_ID>
node --env-file=.env your-eval.ts <RERUN_TRACE_ID>
```

Use your copied judge script and `--send-to-judge` instead if you chose an LLM rule.
Run the repository's normal tests separately.

## After the exercise: check the whole project

Omit the trace ID to check all available traces in the configured project:

```sh
node --env-file=.env read-agents.ts
node --env-file=.env check-verification.ts --send-to-judge
```

The scripts take a snapshot of the available trace IDs, load each trace separately
and finish with counts for evaluated, saved, skipped, errors and unprocessed.
They do not combine runs. Batch judging can make many paid model requests;
use a project whose request data you have reviewed.

A skipped trace is not a failed task. An error stops the batch; earlier saved
results remain in Phoenix. Reusing the same evaluation name on the same trace
updates that annotation. Save the code/rubric version with your comparison notes.

These are on-demand scripts. Future traces do not run them automatically.

## How to read the code

Each example has the same structure:

1. A function defines the check.
2. `createEvaluator` gives it a name and kind (`CODE` or `LLM`).
3. The loop loads a trace, calls `evaluator.evaluate(trace)`, then saves the result.

`generateClassification` is the model call **inside** the LLM check.
`createEvaluator` does not call a model by itself.

For readers new to TypeScript: `const` names a value; `===` means equal;
`&&` means both conditions; `for ... of` reads each item.
`trace: Trace` describes the expected input for the editor.
`await` waits for a network operation to finish.

The support files in `lib/` handle Phoenix access, evidence preparation,
streaming, safe errors and reporting. You do not need to edit them. Native
Phoenix Evals validates the judge's label; the helper saves and reads back the
annotation. Keep `lib/` beside your example if you copy it.

## If something fails

- **Everything is skipped:** check the Phoenix project and whether task tool requests were logged.
- **Wrong AGENTS.md result:** compare `REPO_ROOT` with the recorded file path; an automatic load is not an explicit read.
- **Provider or model error:** check Phoenix Secrets and the exact provider/model ID. A browser-only key is insufficient.
- **Connection error:** check Phoenix and its provider connection. This client collects a streamed response, matching the working Playground route.
- **Invalid judge output:** the model must return the requested JSON label and explanation. Do not treat a parse failure as a negative result.
- **Template TODO:** finish `checkYourRule` before running it.

Errors avoid printing raw provider responses, credentials or trace evidence.

## Maintainer checks

```sh
npm test
npm run typecheck
```

Tests use a synthetic Phoenix server. They do not send traces to a live model.
