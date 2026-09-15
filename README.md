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
