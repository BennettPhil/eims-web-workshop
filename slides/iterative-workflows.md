---
theme: default
title: "Ignitis: Is our coding harness working?"
info: A hands-on Phoenix and Copilot evaluation workshop
author: Software Shaped Objects
canvasWidth: 1280
aspectRatio: 16/9
colorSchema: dark
transition: none
favicon: /favicon.svg
fonts:
  webfonts: []
mdc: true
---

<div class="kicker">Iterative Agentic Workflows</div>
<h1>How do we know our coding harness configuration is actually working?</h1>
<p class="cover-subtitle">Use one real task. Watch what Copilot does. Check the result.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows</span></div>

<!-- Speaker note: Read the question and pause. The workshop tests one configuration change on one task; it does not try to prove a general productivity claim. -->

---

<div class="kicker">Workshop access</div>
<h1>Get the workshop code</h1>
<p class="lead" style="font-size: 34px; margin-top: 48px;"><a href="https://github.com/BennettPhil/eims-web-workshop" target="_blank" rel="noopener noreferrer" style="color: var(--orange);">github.com/BennettPhil/eims-web-workshop</a></p>
<div class="prompt-box">git clone https://github.com/BennettPhil/eims-web-workshop.git<br>cd eims-web-workshop</div>
<p class="lead">Or choose <strong>Code → Download ZIP</strong> on GitHub and extract it.</p>
<p class="micro-rule">Start with README.md, then open the participant guide.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Pause while everyone opens the public repository. README.md links the participant guide, simple TypeScript evaluators and sample task. Run workshop commands from the cloned or extracted eims-web-workshop folder. Provider details and keys are supplied separately; the public kit contains placeholders. -->

---

<div class="kicker">Today</div>
<h1>What we will do today</h1>
<ul class="clean-list">
  <li>Work on a real task in your own repository</li>
  <li>Trace a real Copilot task with Phoenix</li>
  <li>Evaluate your agentic coding configuration</li>
  <li>Write a new eval</li>
  <li>Improve the configuration and test the change</li>
</ul>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Each person works through the full loop and keeps their own trace IDs, results and configuration diff. -->

---

<div class="kicker">Definition</div>
<h1>What counts as agentic configuration?</h1>
<p class="lead">The instructions, tools and context that shape how the coding harness works:</p>
<ul class="clean-list">
  <li><code>AGENTS.md</code> or <code>CLAUDE.md</code></li>
  <li>MCP servers and the tools they expose</li>
  <li>Skills and subagents</li>
  <li>Supporting documentation or configuration supplied to the harness</li>
</ul>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: These are examples, not a required stack. Different coding harnesses expose different configuration mechanisms. -->

---

<div class="kicker">The loop</div>
<h1>Your agentic configuration is code. Treat it like code.</h1>
<svg class="workflow-cycle" viewBox="0 0 1000 350" role="img" aria-labelledby="workflow-cycle-title">
  <title id="workflow-cycle-title">Observe, Evaluate, Improve, Re-run, Adopt, then Observe again</title>
  <defs><marker id="workflow-cycle-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M2 2 L10 6 L2 10" /></marker></defs>
  <g class="cycle-arrows" marker-end="url(#workflow-cycle-arrow)">
    <path d="M590 50 Q770 35 834 109" />
    <path d="M886 169 Q898 246 802 278" />
    <path d="M655 299 Q500 340 345 299" />
    <path d="M198 278 Q102 246 114 169" />
    <path d="M166 109 Q230 35 410 50" />
  </g>
  <g class="cycle-labels" text-anchor="middle">
    <text x="500" y="60">Observe</text>
    <text x="875" y="147">Evaluate</text>
    <text x="750" y="304">Improve</text>
    <text x="250" y="304">Re-run</text>
    <text x="125" y="147">Adopt</text>
  </g>
</svg>
<p class="micro-rule">Apply the same iterative approach to agentic configuration that you use for other code.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Point back to this loop as the workshop moves from the baseline to the changed configuration. -->

---

<div class="kicker">Your task</div>
<h1>A task that exercises your setup</h1>
<p class="lead">Each person brings a defined agent task in a real repository that already has some agentic configuration.</p>
<div class="two-col">
  <div class="column"><h2>The setup may include</h2><ul class="clean-list"><li><code>AGENTS.md</code> or <code>CLAUDE.md</code></li><li>Skills or subagents</li><li>MCP servers</li><li>Supporting documentation or configuration</li></ul></div>
  <div class="column"><h2>The task should</h2><ul class="clean-list"><li>Take the agent about 5–10 minutes</li><li>Be complex enough to depend on that setup</li></ul></div>
</div>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Ask each person to state their task in one sentence. A tiny typo fix will not exercise the configuration; a broad feature will take too long. -->

---

<div class="kicker">Sample task</div>
<h1>No repository or task? Use the sample</h1>
<div class="claim">Use the small JavaScript task in <code>sample/</code>.</div>
<p class="claim-note">Open <code>sample/README.md</code>. It explains how to make your own copy and start.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Open sample/README.md. Copy the sample outside this workshop checkout before running Copilot. It includes a small JavaScript task, AGENTS.md and ordinary Node tests that deliberately fail at the start. No Java, Drupal or custom scoring helper is needed. -->

---

<div class="kicker">Phoenix</div>
<h1>Phoenix makes an agent run inspectable</h1>
<div class="phoenix-intro">
  <div>
    <p class="lead">Phoenix is an open-source observability and evaluation tool for AI applications.</p>
    <ul class="clean-list">
      <li>A trace records a Copilot run</li>
      <li>Spans show the steps within that run</li>
      <li>Phoenix also supports evals and annotations</li>
    </ul>
  </div>
  <img class="phoenix-logo" src="/phoenix-logo.svg" alt="Phoenix logo" width="260" height="260" />
</div>
<p class="micro-rule">We will use the trace as evidence about how the harness behaved.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Sources: https://arize.com/docs/phoenix and https://arize.com/docs/phoenix/quickstart. Official Phoenix logo, unmodified: https://github.com/Arize-ai/phoenix-assets/blob/f5ab6367204da8393255359b7cbfb7d38f1374ce/logos/Phoenix/phoenix.svg -->

---

<div class="kicker">Phoenix</div>
<h1>Start Phoenix in Docker</h1>
<div class="prompt-box">docker run -p 127.0.0.1:6006:6006 &#92;<br>&nbsp;&nbsp;-p 127.0.0.1:4317:4317 -i -t arizephoenix/phoenix:latest</div>
<p class="lead">Leave this terminal open, then check <code>http://127.0.0.1:6006</code>.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Confirm the Phoenix page loads before installing tracing. Binding the published ports to 127.0.0.1 limits access to the local machine. Source: https://docs.docker.com/engine/network/port-publishing/ -->

---

<div class="kicker">Phoenix · AI setup</div>
<h1>Ignitis AI provider</h1>
<p class="lead">Settings → AI Providers → Custom AI Providers → New Provider</p>
<div class="prompt-box">Provider Name: Ignitis Test · SDK: OpenAI · Provider String: openai<br>API Type: Chat Completions<br>Base URL: your supplied Azure resource URL ending in /openai/v1/<br>API Key: paste your Ignitis-supplied key<br>Test → Credentials Valid → Create Provider</div>
<p class="lead">Playground → Ignitis Test → type <code>YOUR_DEPLOYMENT_NAME</code>.<br>Run <code>Reply only with OK.</code> and check the response.</p>
<p class="micro-rule">Use the deployment name. Keep /openai/v1/. No API version field needed.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: If Ignitis Test already exists, edit it and choose Update Provider. These fields use the OpenAI SDK with Azure's v1 endpoint. In the Playground model menu, open Ignitis Test, type the full deployment name in its search field and select the custom result. Use the deployment assigned by Ignitis if it differs from this example. Enter the key only in Phoenix's API Key field; never put it in slides, task prompts or source files. Leave Organization, Project and Default Headers blank. The supplied 2024-12-01-preview API version belongs to the older Azure route and is not entered here. This config enables Playground requests; the two simple code evals need no provider. The optional TypeScript LLM judge uses a separate built-in-provider route and does not automatically select this custom provider; see evals/typescript/README.md. Sources: https://arize.com/docs/phoenix/settings/custom-ai-providers and https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/chatgpt -->

---

<div class="kicker">Tracing</div>
<h1>Launch Copilot with tracing</h1>
<p class="lead">From the workshop repository root, point the launcher at your task repository.</p>
<div class="prompt-box">npm run copilot:traced -- /path/to/your/project</div>
<p class="micro-rule">Built-in Copilot telemetry → local Phoenix. No plugin installation.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Rehearsed with Copilot CLI 1.0.83 and Phoenix 20.8.0. The launcher sets OTLP HTTP/protobuf, the ai_workshop project and content capture for its child process only. It does not modify global settings. The existing Arize hook installation remains an alternative for working setups; do not use both exporters on one run. See evals/typescript/SIMPLE.md and copilot help monitoring. -->

---

<div class="kicker">Trace policy</div>
<h1>Traces can contain sensitive data</h1>
<ul class="clean-list"><li>The launcher enables prompts, tool arguments and returned content</li><li>Use the disposable sample or approved task material</li><li>Review trace data before sharing it</li></ul>
<p class="micro-rule">The two simple evals do not send evidence to a model.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Native content capture can include instructions and source code. Local storage does not make every input safe to log. Keep credentials and personal data out of the task. -->

---

<div class="kicker">Trace settings</div>
<h1>One local project</h1>
<div class="prompt-box">Phoenix: http://127.0.0.1:6006<br>Project: ai_workshop<br>Tool arguments and results: enabled</div>
<p class="lead">Use the same launcher for each Copilot run. Wait for export before evaluating.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Match the task prompt and start time in Phoenix. If no actual tool spans appear, stop and check the tracing setup. Do not score an internal auth or list_models event as a coding task. -->
---

<div class="kicker">Copilot</div>
<h1>Open Copilot and run the task</h1>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Use the Copilot session opened by npm run copilot:traced. Allow 5–10 minutes. -->

---

<div class="kicker">Observe</div>
<h1>Find the trace in Phoenix</h1>
<div class="prompt-box">http://127.0.0.1:6006<br><br>Project: ai_workshop<br>Match the start time and prompt<br>Copy the trace ID</div>
<ul class="clean-list">
  <li>Open the spans in execution order</li>
  <li>Confirm that the trace belongs to your task</li>
</ul>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: If several traces match, use the prompt and start time to identify the correct one before evaluating it. -->

---

<div class="kicker">Inside the trace</div>
<h1>What you will find in the trace</h1>
<div class="two-col">
  <div class="column"><h2>Run structure</h2><ul class="clean-list"><li>Trace and span IDs</li><li>Timing and execution order</li><li>Session, model and subagent metadata</li></ul></div>
  <div class="column"><h2>Captured content</h2><ul class="clean-list"><li>The task prompt</li><li>Tool names, arguments and result types</li><li>File paths, commands, URLs and queries</li><li>Tool returns, including file content</li></ul></div>
</div>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: A trace shows activity and order; it does not prove comprehension or correctness. Captured fields depend on the exporter version and logging settings. Inspect what is actually present; do not promise a complete response transcript. Sources: https://github.com/Arize-ai/coding-harness-tracing/blob/main/tracing/copilot/hooks/handlers.py and https://arize.com/docs/phoenix/tracing/concepts-tracing/what-are-traces -->

---

<div class="kicker">Eval input</div>
<h1>Make sure this is a task trace</h1>
<ul class="clean-list">
  <li>Wait for Copilot to finish and the trace to arrive</li>
  <li>Look for tool requests with readable arguments, such as a path or command</li>
  <li>Match the task, repository and start time</li>
</ul>
<p class="micro-rule">Internal events such as <code>auth</code> and <code>list_models</code> do not show coding actions.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Start with one completed task trace. An empty request list is not evidence that the agent failed to verify. The simple examples skip traces with no tool spans. UNKNOWN application telemetry is not converted into TOOL spans. If only internal events appear, select ai_workshop and check the launcher settings before continuing. The scripts can later check all project traces when no ID is supplied, but use exact IDs for this baseline/rerun comparison. -->

---

<div class="kicker">Evaluations</div>
<h1>Two small checks</h1>
<div class="two-col"><div class="column"><h2>Test command</h2><p>Did Copilot request the expected test command?</p></div><div class="column"><h2>Tool errors</h2><p>Did any tool call record an error?</p></div></div>
<p class="micro-rule">Read a trace, apply a rule, save a trace annotation. No judge setup.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Open test-command.ts and tool-errors.ts. Both are about 30 lines. runEvaluation in lib/simple.ts uses native createEvaluator and evaluator.evaluate, loads the selected traces and saves each result with readback. Keep lib/ closed for the walkthrough. Existing read-agents.ts and check-verification.ts remain available in evals/typescript/README.md as optional extensions. -->

---

<div class="kicker">Eval setup</div>
<h1>Install once, run two commands</h1>
<p class="lead">Use Node.js 24.11 or newer within Node 24. From the workshop repository root:</p>
<div class="prompt-box">nvm use<br>npm --prefix evals/typescript ci<br>npm run eval:tests<br>npm run eval:errors</div>
<p class="micro-rule">Defaults: local Phoenix, ai_workshop. No .env or provider key required.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: nvm use selects the checked-in Node version; another Node 24 installation is fine. The new commands leave the old .env alone. Explicit PHOENIX_PROJECT_NAME and PHOENIX_BASE_URL environment variables can select another project. With no trace ID, these commands evaluate all existing project traces and print summaries. They do not run automatically on future traces. -->

---

<div class="kicker">First rule</div>
<h1>Was the test command requested?</h1>
<div class="prompt-box" v-pre>const testCommand = "npm test";<br><br>for (const tool of trace.toolCalls) {<br>&nbsp;&nbsp;const command = shellCommand(tool);<br>&nbsp;&nbsp;if (command === testCommand) {<br>&nbsp;&nbsp;&nbsp;&nbsp;return { label: "TEST_COMMAND_FOUND", score: 1 };<br>&nbsp;&nbsp;}<br>}</div>
<p class="micro-rule">Open test-command.ts. Change testCommand to your repository’s check.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Read for as each tool, and === as equals. This excerpt omits explanations and the NOT_OBSERVED return. shellCommand ignores one ordinary leading cd folder &&. It does not count echoes, README mentions, extra flags or other shell wrappers. Missing arguments may also mean NOT_OBSERVED. Inspect the evidence; this rule does not prove tests passed. -->

---

<div class="kicker">First result</div>
<h1>Look at one trace</h1>
<div class="prompt-box">npm run eval:tests -- &lt;TRACE_ID&gt;</div>
<ul class="clean-list"><li>TEST_COMMAND_FOUND: exact command requested</li><li>NOT_OBSERVED: no matching request recorded</li><li>In Phoenix, enable trace annotations under Columns</li><li>Open the simple-test-command badge</li></ul>
<p class="micro-rule">A requested check does not prove the tests passed.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Replace TRACE_ID with the actual ID without angle brackets. The helper saves a trace annotation and reads it back. Use a read-only task and a tested task to demonstrate both outcomes, clearly labelled as different demo tasks rather than a controlled improvement comparison. -->

---

<div class="kicker">Second rule</div>
<h1>Count recorded tool errors</h1>
<div class="prompt-box" v-pre>let errors = 0;<br><br>for (const tool of trace.toolCalls) {<br>&nbsp;&nbsp;if (tool.failed) errors = errors + 1;<br>}</div>
<p class="lead">Open tool-errors.ts. The score is an error count.</p>
<p class="micro-rule">Use it to find broken paths or tool failures worth investigating.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: failed means a Phoenix ERROR span status or the hook result type failure/error. Unknown results do not become failures. The full function returns ERRORS_RECORDED or NO_RECORDED_ERRORS, with a count and explanation. A tool may succeed while the tests it runs fail. This is not a test pass rate. -->

---

<div class="kicker">Second result</div>
<h1>Find a run to inspect</h1>
<div class="prompt-box">npm run eval:errors -- &lt;TRACE_ID&gt;</div>
<ul class="clean-list"><li>ERRORS_RECORDED: open its tool spans</li><li>NO_RECORDED_ERRORS: zero recorded tool errors</li><li>Open the simple-tool-errors trace annotation</li></ul>
<p class="micro-rule">No tool spans means SKIPPED. Missing telemetry is not a passing result.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: The error count is independent of the test-command score. Do not compare their averages. The deliberate missing-file probe in the live rehearsal produced one error; a normal read produced zero. The public rehearsal summary is in facilitator/simple-evals-rehearsal-2026-09-07.md; original trace IDs remain local. -->
---

<div class="kicker">Your evaluator</div>
<h1>Choose your own check</h1>
<p class="lead">Copy <code>test-command.ts</code> to <code>my-eval.ts</code> in the same folder. Change the rule and annotation name.</p>
<ul class="clean-list">
  <li>The comments offer package-manager, MCP parameter and file-path examples</li>
  <li>Choose your own rule from something you noticed in the trace</li>
  <li>Use code for a fixed check, or adapt the LLM example for a written rubric</li>
</ul>
<p class="micro-rule">The support files in <code>lib/</code> can stay unchanged. Explain your rule to a partner.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Give participants time to copy test-command.ts within evals/typescript, edit its rule and change the annotation name in runEvaluation. The original your-eval.ts template is also available; it requires REPO_ROOT. Keep lib/ unchanged. For an LLM rule, copy check-verification.ts in the same evals/typescript directory and edit the visible rubric, labels and name, keeping the same evidence review before sending. Keeping the copy in this directory preserves its relative imports from lib/. -->

---

<div class="kicker">Your first result</div>
<h1>Test your check on the first run</h1>
<div class="prompt-box">node evals/typescript/my-eval.ts &lt;BASELINE_TRACE_ID&gt;</div>
<ul class="clean-list"><li>Compare the saved result with the evidence in Phoenix</li><li>Ask a partner for a case your check might get wrong</li><li>Revise the evaluator if needed and rerun the baseline</li></ul>
<p class="micro-rule">Keep the evaluator unchanged for the next comparison.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: This command runs from the workshop root and assumes the copied example was adapted. For an LLM evaluator, run the adapted judge script instead. Keep the trace ID, evaluator code and result. Label invented examples as synthetic. When the evaluator is settled, evaluate the baseline again and freeze the check for the comparison. Reusing the same annotation name on the same trace updates that result. -->

---

<div class="kicker">Project check</div>
<h1>Repository tests</h1>
<div class="prompt-box">cd /path/to/your/project<br>&lt;your normal test or check command&gt;</div>
<p class="lead">Run the repository's normal checks and record the result.</p>
<p class="micro-rule">An eval of agent behaviour does not establish whether the code works.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Keep the repository test result separate from the eval score. -->

---

<div class="kicker">Fair comparison</div>
<h1>Before the rerun</h1>
<div class="two-col">
  <div class="column"><h2>Keep the same</h2><ul class="clean-list"><li>Task and starting code</li><li>Copilot model and available tools</li><li>Evaluator code, rubric and judge model</li><li>Evidence scope and repository tests</li></ul></div>
  <div class="column"><h2>Change</h2><ul class="clean-list"><li>One config item</li></ul></div>
</div>
<p class="micro-rule">Write down what you expect to change in the next run.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Preserve the first run's changes before restoring the starting code. Keep the config edit and tracing setup. Use npm run copilot:traced to launch both sessions. Both eval runs use the same evidence rule on all spans in their respective trace. Record missing evidence rather than substituting another run. -->

---

<div class="kicker">Improve</div>
<h1>Change one instruction</h1>
<div class="two-col">
  <div class="column"><h2>Where</h2><ul class="clean-list"><li><code>AGENTS.md</code> or <code>CLAUDE.md</code></li><li>A skill or subagent instruction</li><li>An MCP tool description</li><li>Supporting documentation</li></ul></div>
  <div class="column"><h2>Examples</h2><ul class="clean-list"><li>Specify the test command</li><li>Document a required tool parameter</li><li>Set the path for generated files</li></ul></div>
</div>
<p class="micro-rule">Make one change that addresses what you saw in the first run.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Participants choose their own change based on their evaluator. Prefer a change that helps the agent perform the intended task, such as adding "After changing code, run the relevant tests or typecheck." The participants choose their own change; the verification example is optional. -->

---

<div class="kicker">Re-run</div>
<h1>Run the same task again</h1>
<ul class="clean-list"><li>Start a fresh Copilot session</li><li>Run the same task with the updated config</li><li>Find the new trace in Phoenix</li></ul>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Allow 5–10 minutes for Copilot, plus time for the eval. Keep the original task text and record the new trace ID. -->

---

<div class="kicker">Evaluate again</div>
<h1>Compare the two runs</h1>
<div class="prompt-box">node evals/typescript/my-eval.ts &lt;NEW_TRACE_ID&gt;</div>
<ul class="clean-list"><li>Run your unchanged evaluator against the new trace</li><li>Compare both annotations in Phoenix</li><li>Run the same repository tests</li></ul>
<p class="micro-rule">These scripts run when you invoke them. New traces do not trigger them automatically.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: If using the adapted LLM script, use its command and the same judge settings instead. Wait for the second run to finish exporting. Compare the same annotation name on both traces. If the evaluator needs a fix, apply it to both runs and evaluate both again. -->

---

<div class="kicker">Adopt</div>
<h1>Keep, revise or revert?</h1>
<ul class="clean-list">
  <li>Did the behaviour change as expected?</li>
  <li>What did the eval and repository tests show?</li>
  <li>Would you keep, revise or revert the config change?</li>
</ul>
<p class="micro-rule">One comparison is a starting point. Repeat it on other tasks.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Keep both trace IDs, the evaluator code, saved annotations, repository test results and the config diff. Record the decision even if there was no improvement. These scripts already save durable native results. A larger dataset and automated regression runs can follow after this exercise. -->

---

<div class="kicker">Human process</div>
<h1>Next week</h1>
<p class="lead">Choose one improvement to take back to your team.</p>
<ul class="clean-list"><li>What will you change?</li><li>How will you test it?</li><li>When will you share the result?</li></ul>
<p class="micro-rule">Write it down and share it with the group.</p>
<div class="chrome"><span>Software Shaped Objects</span><span class="track">Ignitis · Iterative Agentic Workflows · <SlideCurrentNo /></span></div>

<!-- Speaker note: Give everyone two minutes to write, then ask each person to share their commitment. -->
