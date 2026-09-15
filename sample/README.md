# Sample task: an article card

Use this if you did not bring a repository. It is a small JavaScript function
with ordinary Node tests. It needs Node.js 24.11 or newer within Node 24 and no dependency installation.

## Make your own copy

From the workshop root, copy the sample to a new folder outside the entire
cloned repository. For example, in macOS/Linux or Git Bash:

```sh
cp -R sample "$HOME/workshop-sample"
cd "$HOME/workshop-sample"
git init
```

Choose another folder name if `workshop-sample` already exists. Do not run the
exercise in this source folder or elsewhere inside the cloned workshop repository.

Read [task.md](task.md), then run:

```sh
npm test
```

The starter deliberately fails all six tests. That is the task, not an
installation problem. The tests should all pass after the implementation.

## Run the workshop

From the workshop root, launch `npm run copilot:traced -- /absolute/path/to/your/copy`.
In that Copilot session, use this task prompt:

> Complete the task in task.md. Follow the repository instructions.

The configuration is [AGENTS.md](AGENTS.md). The test command is `npm test`.
The new `test-command.ts` eval looks for that command in the trace. The
`tool-errors.ts` eval counts recorded tool failures. Neither result replaces
running `npm test` and reading the changed function. The earlier evals remain
available in the older guide, including their additional setup requirements.

## Repeat the task

Keep the first copy and its trace. Make a second copy from the **unchanged
workshop sample**, not from the completed first copy. Add your one configuration
change to the second copy, launch it with `npm run copilot:traced -- /absolute/path/to/second-copy` and
use the same task prompt in a fresh Copilot session.

Use exact trace IDs for this comparison. Keep both labels, repository test
results and your configuration change. If the first run already requested a
check, say so; do not invent a failure to make the example look better.
