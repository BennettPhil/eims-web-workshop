# Simple eval rehearsal — 7 September 2026

The two new examples ran against actual Copilot traces in local Phoenix.
Both outcome labels were observed for each example. This is a technical rehearsal
using the workshop's disposable sample, not client evidence or an improvement study.

## Reproducible commands

From the workshop root with Node 24 selected:

```sh
npm --prefix evals/typescript ci
npm run copilot:traced -- /absolute/path/to/sample-copy
npm run eval:tests
npm run eval:errors
```

The sample was copied outside this authoring repository. No source fixture or
hidden evaluator was edited. Copilot changed only the copy's `render-card.mjs`.
Raw prompts, source returns and user-specific paths remain local and are not
included in this record.

## Observed runs

| Run | Deliberate task | Tool calls | Test-command label | Tool error count |
| --- | --- | ---: | --- | ---: |
| A | Read task.md and summarize; no tests | 1 | NOT_OBSERVED | 0 |
| B | Complete the sample; test before and after | 7 | TEST_COMMAND_FOUND | 0 |
| C | Try viewing an intentionally nonexistent file | 1 | NOT_OBSERVED | 1 |
| D | Read package.json using the new npm launcher | 1 | NOT_OBSERVED | 0 |

Phoenix project: `ai_workshop`.

The original trace and span IDs remain in the facilitator's local rehearsal
record. They are omitted from this public summary.

Run B requested `cd <sample directory> && npm test`. Its recorded first test
output showed six failures; the second showed six passes. A separate local
`npm test` in the completed copy also passed all six tests. Both shell tool
spans themselves had successful status: this demonstrates why the error counter
must not be described as a test pass/fail evaluator.

Run C's actual `view` span had Phoenix status `ERROR` and
reported a missing path.
Run D verifies the documented `npm run copilot:traced` route with the installed
Copilot executable, rather than only a direct invocation of a cached CLI runtime.

## Saved results and verification

Each final batch reported:

```text
Evaluated: 4 | Saved (verified): 4 | Skipped: 0 | Errors: 0 | Unprocessed: 0
```

The first had three `NOT_OBSERVED` labels and one `TEST_COMMAND_FOUND`.
The second had three `NO_RECORDED_ERRORS` labels and one `ERRORS_RECORDED`.
A separate Phoenix REST readback checked all eight annotation names, labels and
scores against these expected outcomes. Rerunning updated the same named results.

The eval suite passed 238 tests, including native Copilot argument decoding,
legacy hook failures, shell-prefix handling, rejection of mere command mentions,
and skipping traces without tools. Typechecking passed. Material checks passed
28 tests, and the updated workflow Slidev deck built successfully. Browser
checks found no horizontal command-box overflow on nine updated slides; the two
code slides and participant command slide were also visually inspected.

## Setup findings

- Node for evals: 24.13.0. The default terminal initially selected Node 23;
  `.nvmrc` now makes the workshop version explicit.
- Copilot used for successful runs: 1.0.83. The model was selected by the
  installed CLI rather than by the evals; record your own selected model.
- Phoenix: 20.8.0, already running locally on port 6006.
- Native export: OTLP HTTP/protobuf to Phoenix, resource attribute
  `openinference.project.name=ai_workshop`, message-content capture enabled.
- An existing Arize tracing runtime was present, but the initial hook-based
  probes produced no Phoenix task trace. Even after a local hook-format
  adjustment, that route did not produce evidence in this rehearsal. The new
  launcher uses Copilot's built-in telemetry and leaves global hook settings alone.
- The existing eval `.env` pointed at `codex`. Loading it sent the first npm
  command trial to internal traces; both batches skipped everything and saved
  zero annotations. The final npm commands do not load that old file and instead
  default to `ai_workshop`. The old file and original examples were preserved.

For the supported settings, see `copilot help monitoring` in the installed CLI.
The [GitHub hook reference](https://docs.github.com/en/copilot/reference/hooks-reference)
and [Arize Copilot setup](https://github.com/Arize-ai/coding-harness-tracing/blob/main/tracing/copilot/README.md)
were also inspected during diagnosis. A hook file's existence is not evidence
that the current CLI exported a task.

These scripts are on-demand checks. A different task may show no command match
or zero errors. Missing telemetry and shell wrappers remain limitations, and
neither score proves the code is correct. Rehearse again when changing CLI,
Phoenix or exporter versions.
