# EIMS / Web: iterative agentic workflows

One shared workshop for the EIMS and Web teams. Run a task with Copilot, inspect
its Phoenix trace, write an evaluator, change one instruction and compare runs.

## Get the code

```sh
git clone https://github.com/BennettPhil/eims-web-workshop.git
cd eims-web-workshop
```

You can also use **Code → Download ZIP** on
[GitHub](https://github.com/BennettPhil/eims-web-workshop) and extract it.

## Start here

Open the [participant guide](participants/iterative-workflows-handout.md).
Use your own approved task repository, or make a disposable copy of the
[sample task](sample/README.md).

**Workshop root** means the folder containing this README and `package.json`.
If this kit is in a subfolder of the Software-Shaped Objects repository, open
that subfolder in your terminal before running these commands. Keep your task
repository or sample copy outside the entire cloned workshop repository.

### Install the evaluator dependencies

Use Node.js 24.11 or newer within Node 24, Docker and GitHub Copilot CLI.
With nvm installed, from the workshop root:

```sh
nvm use
npm --prefix evals/typescript ci
npm run doctor
```

If you do not use nvm, select Node 24.11+ using your usual Node installation.
The tracing launcher and setup check do not need root dependencies.

### Run the workshop

1. Start local Phoenix using the participant guide.
2. From the workshop root, launch Copilot in your task repository:

   ```sh
   npm run copilot:traced -- /absolute/path/to/task-repository
   ```

3. Complete the task, find its trace in Phoenix's `ai_workshop` project, and copy
   the trace ID.
4. From a second terminal at the workshop root, run the two examples:

   ```sh
   npm run eval:tests -- <TRACE_ID>
   npm run eval:errors -- <TRACE_ID>
   ```

   Replace `<TRACE_ID>` with the actual value, without angle brackets.
5. Follow the guide to write your own evaluator, change one configuration item,
   repeat the same task from its starting code, and compare the evidence.

The two simple evaluators need no model provider or API key. The guide also
contains Ignitis provider setup for optional Phoenix Playground work.
Never put the supplied key in source files or task prompts.

## What to read

- [Two simple evaluators](evals/typescript/SIMPLE.md)
- [Optional older evaluators and judge setup](evals/typescript/README.md)
- [Sample task and reset instructions](sample/README.md)
- [Workshop slides](slides/iterative-workflows.md)
- [Facilitator notes](facilitator/iterative-workflows-tutor-notes.md)

An evaluator checks one recorded behaviour. Run the task repository's own tests
and review its diff separately. A requested test command does not prove a pass.

## Check the kit

After installing the evaluator dependencies:

```sh
npm test
npm run typecheck
```

These checks use synthetic traces and make no live model calls. The sample
starts with six failing tests deliberately; `npm run sample:check` shows that
baseline and is separate from the kit checks.

## Present the slides

Only presenters need the root dependencies:

```sh
npm ci
npm run slides:workflow
```

Open `http://localhost:3030`. To build or export:

```sh
npm run slides:build:workflow
npm run slides:export:workflow
```

## Source

Packaged on 15 September 2026 from `ignitis-ai-workshops` commit
`5cc2b016c6122e1dd9b758355e66fe7549017608`.
The workshop code is copied from that source. The deck has an added access
slide. Provider endpoints and deployment names are replaced with setup
instructions; obtain those values and your key from your team. Root commands
and folder instructions are adapted for this standalone participant kit.
The shared slide stylesheet retains its existing CSS import. Local configuration,
dependencies, trace identifiers, raw traces, generated output and the separate
Billing exercises are excluded.
