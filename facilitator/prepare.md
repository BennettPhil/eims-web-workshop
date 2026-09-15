# Prepare the coding workshop

Use this checklist before delivery. The [tutor notes](iterative-workflows-tutor-notes.md)
cover timing; the [participant guide](../participants/iterative-workflows-handout.md)
contains the commands people will follow.

## Rehearse on the actual machine

- Check Node.js 24, Docker and Copilot. Install root and `evals/typescript` dependencies.
- Start Phoenix and confirm its UI opens. If an instance is already running,
  use it deliberately; do not start a second server on the same port.
- Launch Copilot in a copy of the [sample](../sample/README.md) with
  `npm run copilot:traced -- /absolute/path/to/copy` from the workshop root.
- Confirm actual tool spans arrive in `ai_workshop`, including command arguments.
- Run `npm run eval:tests -- <TRACE_ID>` and `npm run eval:errors -- <TRACE_ID>`.
  Check their labels and saved trace annotations. Neither example needs a judge.
- Complete one participant rule, change one instruction and repeat the task.
- Record the software versions and actual timings. Keep the task diff, trace IDs,
  annotations and repository test results.

## Check the tracing and data settings

The demonstrated route uses Copilot's built-in OpenTelemetry support, with local
Phoenix and content capture configured by the launcher. Rehearsed versions:
Copilot CLI 1.0.83 and Phoenix 20.8.0. See the
[live rehearsal](simple-evals-rehearsal-2026-09-07.md).

The older Arize hook installer remains an alternative for an already-working
setup. It did not produce traces in this machine's rehearsal. Do not infer a
working integration from the presence of its runtime or hooks file. If using
it, check its actual permission behaviour and trace output separately.

The workshop logs prompts, requests and returns to local Phoenix. That can include
source code and sensitive arguments. Choose material that can be logged. The two simple evals make no model calls. The optional older judge forwards
tool requests to its provider; review that boundary separately. Keep
credentials and personal data out of both. Agree what local trace data to retain
after the session.

The slides use a launcher and a `latest` Docker image. Record the versions
you rehearsed; an older successful rehearsal is not evidence about a later CLI
or image. If workshop Wi-Fi is unreliable, download dependencies
and the Docker image beforehand.

## Prepare for different experience levels

Ask each participant for a one-sentence task and its normal repository check.
Offer the sample to anyone without a suitable task. Pair people for the rubric
review, not for copying an answer.

Keep `lib/` closed during the eval walkthrough. Explain the input, the check and
the saved result first. Show a single trace before the optional batch command.
Allow time for participants to challenge a rule and inspect its evidence.

The deck's shell commands use macOS/Linux syntax. Rehearse equivalent commands if
the room uses PowerShell; use the official Windows installer instructions rather
than improvising during the session.
