# EIMS / Web workshop evals

Participant code for running the workshop evaluators against Copilot traces in
local Phoenix.

## Install

Use Node.js 24.11 or newer within Node 24. From your terminal:

```sh
git clone https://github.com/BennettPhil/eims-web-workshop.git
cd eims-web-workshop
nvm use
npm --prefix evals/typescript ci
```

If you do not use nvm, select Node 24.11+ with your usual Node installation.
Run the following commands from this repository root.

## Create a trace

If Phoenix is not already running, start it with Docker in another terminal:

```sh
docker run -p 127.0.0.1:6006:6006 \
  -p 127.0.0.1:4317:4317 -i -t arizephoenix/phoenix:latest
```

With Copilot CLI installed, launch your task repository with tracing enabled:

```sh
npm run copilot:traced -- /absolute/path/to/your/task-repository
```

Run your task. Open `http://127.0.0.1:6006`, select `ai_workshop`, find the run
by its prompt and start time, and copy its trace ID. Tracing records prompts
and tool content; use material approved for the exercise.

## Run the evals

```sh
npm run eval:tests -- <TRACE_ID>
npm run eval:errors -- <TRACE_ID>
```

Replace `<TRACE_ID>` with the actual value, without angle brackets.

- `eval:tests` checks whether the agent requested `npm test`. Edit `testCommand`
  in `evals/typescript/test-command.ts` for your task repository.
- `eval:errors` counts recorded tool errors.

Both save trace annotations in Phoenix and need no model provider or API key.
They check recorded behaviour; run your task repository's own tests separately.
Omit the trace ID to evaluate all existing traces in `ai_workshop`.

## Optional LLM judge demo

The facilitator can demonstrate a model judging whether recorded tool requests
asked for tests, linting or typechecking. It saves a `verification-request`
annotation with a label and explanation; it does not decide whether checks passed.

Follow [the judge setup](evals/typescript/README.md#3-set-up-the-judge-in-phoenix)
first: configure a built-in provider in Phoenix 19.16+, then create
`evals/typescript/.env` from its `.env.example` if you do not already have one.
Review any existing file before the demo, and set:

```dotenv
PHOENIX_BASE_URL=http://127.0.0.1:6006
PHOENIX_PROJECT_NAME=ai_workshop
REPO_ROOT=/absolute/path/to/your/task-repository
PHOENIX_JUDGE_MODEL=openai:your-model-id
```

Use the actual project, repository path and configured provider/model. The npm
command loads this file. A custom provider saved only in Phoenix's UI is not
selected by this evaluator.

Inspect the selected trace's tool arguments, then run from this repository root:

```sh
npm run eval:judge -- <TRACE_ID> --send-to-judge
```

The flag permits sending those tool arguments through Phoenix to its configured
model provider. Include one trace ID for the demo; without it, the command judges
all usable traces in the configured project.

## Write your own eval

Copy `evals/typescript/test-command.ts` to `evals/typescript/my-eval.ts`.
Change the rule and the evaluator name in `runEvaluation`, then run:

```sh
node evals/typescript/my-eval.ts <TRACE_ID>
```

See [the simple eval guide](evals/typescript/SIMPLE.md) for result labels and
limitations. [Additional examples and judge setup](evals/typescript/README.md)
are available if you want to extend the checks.

## Check the evaluator code

After installing the evaluator dependencies:

```sh
npm test
npm run typecheck
```

These checks use synthetic traces and make no live model calls.
