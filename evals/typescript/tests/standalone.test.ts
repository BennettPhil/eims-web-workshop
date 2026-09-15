import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.join(packageRoot, "tests", "fixtures", "repo");
const traceId = "0123456789abcdef0123456789abcdef";
const secondTraceId = "22222222222222222222222222222222";
const thirdTraceId = "33333333333333333333333333333333";

// Synthetic API records based on the official Copilot SDK tool recordings.
// These are test fixtures, not captured participant traces or model judgements.
// https://github.com/github/copilot-sdk/blob/main/test/snapshots/tools/invokes_built_in_tools.yaml
function span(tool: string, input: unknown, options: Record<string, unknown> = {}) {
  return {
    name: tool,
    context: { trace_id: traceId, span_id: "0000000000000001" },
    parent_id: "0000000000000000",
    span_kind: "TOOL",
    start_time: "2026-09-07T10:00:01.000Z",
    end_time: "2026-09-07T10:00:02.000Z",
    status_code: "OK",
    status_message: "",
    attributes: {
      "openinference.span.kind": "TOOL",
      "tool.name": tool,
      "input.value": typeof input === "string" ? input : JSON.stringify(input),
      "output.value": "Synthetic successful tool result",
      "tool.result_type": "success",
      ...options,
    },
    events: [],
  };
}

function traceRecord(id: string, day = 1) {
  return {
    id: `synthetic-trace-${id}`,
    trace_id: id,
    project_id: "synthetic-project",
    start_time: `2024-01-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    end_time: `2024-01-${String(day).padStart(2, "0")}T10:01:00.000Z`,
  };
}

function inTrace(id: string, fixtures: ReturnType<typeof span>[]) {
  return fixtures.map((fixture, index) => ({
    ...fixture, context: { trace_id: id, span_id: `${id.slice(0, 12)}${String(index + 1).padStart(4, "0")}` },
  }));
}

type RecordedRequest = { method: string; url: URL; body: any; headers: http.IncomingHttpHeaders };
type StreamFailure = "error" | "malformed" | "truncated" | "length" | "content_filter" | "tool_calls" | "unknown" | "empty";
type Scenario = {
  pages?: readonly (readonly unknown[])[];
  tracePages?: readonly (readonly unknown[])[];
  pagesByTrace?: Record<string, readonly (readonly unknown[])[]>;
  judgeByTrace?: Record<string, { label?: string; error?: boolean; content?: string; streamFailure?: StreamFailure }>;
  pathPrefix?: string;
  spanErrorTrace?: string;
  annotationErrorTrace?: string;
  missingAnnotationTrace?: string;
  traceListErrorPage?: number;
  serverVersion?: string;
  repeatCursor?: "traces" | "spans" | "annotations";
  judgeLabel?: string;
  judgeExplanation?: string;
  judgeContent?: string;
  judgeChunks?: readonly string[];
  streamFailure?: StreamFailure;
  judgeError?: boolean;
  judgeStatus?: number;
  phoenixError?: boolean;
  readbackSecondPage?: boolean;
  missingAnnotation?: boolean;
};

async function withServer(scenario: Scenario, run: (baseUrl: string, requests: RecordedRequest[]) => Promise<void>) {
  const requests: RecordedRequest[] = [];
  const savedAnnotations = new Map<string, any>();
  let activeTraceId = traceId;
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8");
    const url = new URL(request.url ?? "/", "http://localhost");
    const body = text ? JSON.parse(text) : undefined;
    requests.push({ method: request.method ?? "GET", url, body, headers: request.headers });
    response.setHeader("content-type", "application/json");
    response.setHeader("x-phoenix-server-version", scenario.serverVersion ?? "20.3.0");

    if (url.pathname === `${scenario.pathPrefix ?? ""}/arize_phoenix_version`) {
      response.setHeader("content-type", "text/plain");
      response.end(scenario.serverVersion ?? "20.3.0");
      return;
    }

    if (url.pathname.endsWith("/traces") && request.method === "GET") {
      const pageIndex = Number(url.searchParams.get("cursor") ?? "0");
      if (scenario.traceListErrorPage === pageIndex) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "RAW_TRACE_LIST_SECRET_MUST_NOT_BE_PRINTED" }));
        return;
      }
      const pages = scenario.tracePages ?? [[traceRecord(traceId)]];
      response.end(JSON.stringify({
        data: pages[pageIndex] ?? [],
        next_cursor: scenario.repeatCursor === "traces" ? "1" : pageIndex + 1 < pages.length ? String(pageIndex + 1) : null,
      }));
      return;
    }

    if (url.pathname.endsWith("/spans") && request.method === "GET") {
      activeTraceId = url.searchParams.get("trace_id") ?? traceId;
      if (scenario.phoenixError || scenario.spanErrorTrace === activeTraceId) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "RAW_PHOENIX_SECRET_MUST_NOT_BE_PRINTED" }));
        return;
      }
      const pageIndex = Number(url.searchParams.get("cursor") ?? "0");
      const pages = scenario.pagesByTrace?.[activeTraceId] ?? scenario.pages ?? [[span("view", { path: "AGENTS.md" })]];
      response.end(JSON.stringify({
        data: pages[pageIndex] ?? [],
        next_cursor: scenario.repeatCursor === "spans" ? "1" : pageIndex + 1 < pages.length ? String(pageIndex + 1) : null,
      }));
      return;
    }

    if (url.pathname.endsWith("/trace_annotations") && request.method === "POST") {
      const saved = body.data[0];
      if (scenario.annotationErrorTrace === saved.trace_id) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: "RAW_ANNOTATION_SECRET_MUST_NOT_BE_PRINTED" }));
        return;
      }
      const id = `synthetic-annotation-${savedAnnotations.size + 1}`;
      savedAnnotations.set(saved.trace_id, { ...saved, id });
      response.end(JSON.stringify({ data: [{ id }] }));
      return;
    }

    if (url.pathname.endsWith("/trace_annotations") && request.method === "GET") {
      const requestedTrace = url.searchParams.get("trace_ids") ?? traceId;
      const saved = savedAnnotations.get(requestedTrace);
      const firstPage = scenario.readbackSecondPage && !url.searchParams.has("cursor");
      response.end(JSON.stringify({
        data: saved && !scenario.missingAnnotation && scenario.missingAnnotationTrace !== requestedTrace ? [{
          ...saved, id: firstPage ? "unrelated-annotation" : saved.id,
        }] : [],
        next_cursor: scenario.repeatCursor === "annotations" || firstPage ? "1" : null,
      }));
      return;
    }

    if (url.pathname === `${scenario.pathPrefix ?? ""}/v1/chat/completions` && request.method === "POST") {
      // Phoenix's proxy rejects JSON object/schema response_format; JSON is prompted instead.
      if (body.response_format && body.response_format.type !== "text") {
        response.statusCode = 422;
        response.end(JSON.stringify({ error: "Synthetic Phoenix proxy only accepts omitted or text response_format" }));
        return;
      }
      if (body.stream !== true) {
        response.statusCode = 422;
        response.end(JSON.stringify({ error: "Synthetic Phoenix requires the streaming connection" }));
        return;
      }
      if (scenario.judgeError || scenario.judgeByTrace?.[activeTraceId]?.error) {
        response.statusCode = scenario.judgeStatus ?? 400;
        response.end(JSON.stringify({ error: { message: "RAW_JUDGE_SECRET_MUST_NOT_BE_PRINTED" } }));
        return;
      }
      const content = scenario.judgeByTrace?.[activeTraceId]?.content ?? scenario.judgeContent ?? JSON.stringify({
        label: scenario.judgeByTrace?.[activeTraceId]?.label ?? scenario.judgeLabel ?? "CHECK_REQUESTED",
        explanation: scenario.judgeExplanation ?? "Synthetic judgement seeded by an offline test, not a real model.",
      });
      const failure = scenario.judgeByTrace?.[activeTraceId]?.streamFailure ?? scenario.streamFailure;
      response.setHeader("content-type", "text/event-stream");
      const writeChunk = (delta: object, finishReason: string | null = null) => {
        response.write(`data: ${JSON.stringify({
          id: "synthetic-chat-completion", object: "chat.completion.chunk", created: 0, model: body.model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`);
      };
      writeChunk({ role: "assistant" });
      if (failure === "error" || failure === "malformed") {
        writeChunk({ content: content.slice(0, 12) });
        const data = failure === "error"
          ? JSON.stringify({ error: { message: "RAW_STREAM_ERROR_SECRET_MUST_NOT_BE_PRINTED", type: "synthetic_error", code: "synthetic_error" } })
          : '{"RAW_MALFORMED_STREAM_SECRET_MUST_NOT_BE_PRINTED":';
        response.end(`data: ${data}\n\ndata: [DONE]\n\n`);
        return;
      }
      if (failure !== "empty") {
        // Split the result JSON across separate content events; the installed SDK parses SSE.
        const pieces = scenario.judgeChunks ?? [content.slice(0, 7), content.slice(7, 23), content.slice(23)];
        for (const piece of pieces) writeChunk({ content: piece });
      }
      if (failure === "truncated") {
        response.end(); // Valid result text is still unsafe without a terminal finish event.
        return;
      }
      const incompleteFinish = failure === "length" || failure === "content_filter" || failure === "tool_calls" || failure === "unknown";
      writeChunk({}, incompleteFinish ? failure : "stop");
      response.write(`data: ${JSON.stringify({
        id: "synthetic-chat-completion", object: "chat.completion.chunk", created: 0, model: body.model,
        choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })}\n\n`);
      response.end("data: [DONE]\n\n");
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: `Unexpected synthetic-test route: ${url.pathname}` }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function execute(script: string, baseUrl: string, args: string[] = [traceId], overrides: Record<string, string> = {}, source?: string) {
  // Preserve only environment values needed by Node; no ambient provider credentials.
  const env = {
    PATH: process.env.PATH,
    PHOENIX_BASE_URL: baseUrl,
    PHOENIX_PROJECT_NAME: "synthetic-workshop",
    PHOENIX_API_KEY: "synthetic-phoenix-api-key",
    PHOENIX_JUDGE_MODEL: "openai:synthetic-model",
    REPO_ROOT: repoRoot,
    // Deliberate obsolete-setting decoys: no direct-provider fallback may use these.
    LLM_BASE_URL: `${baseUrl}/forbidden-direct-provider/v1`,
    LLM_MODEL: "forbidden-direct-model",
    LLM_API_KEY: "synthetic-direct-provider-key-must-not-be-used",
    ...overrides,
  };
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    // In-memory learner edits exercise the standalone template without changing its default TODO.
    const command = source === undefined ? [path.join(packageRoot, script), ...args]
      : ["--input-type=module-typescript", "--eval", source, script, ...args];
    const child = spawn(process.execPath, command, { cwd: packageRoot, env });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Synthetic test timed out running ${script}`));
    }, 20_000);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => { clearTimeout(timeout); resolve({ code, output }); });
  });
}

function annotations(requests: RecordedRequest[]) {
  return requests.filter((request) => request.method === "POST" && request.url.pathname.endsWith("/trace_annotations"));
}

function annotation(requests: RecordedRequest[]) {
  const writes = annotations(requests);
  assert.equal(writes.length, 1, "one native Phoenix annotation write");
  const body = writes[0].body;
  return Array.isArray(body?.data) ? body.data[0] : body;
}

function assertPaginatedReadback(requests: RecordedRequest[], name: string) {
  const reads = requests.filter((request) => request.method === "GET" && request.url.pathname.endsWith("/trace_annotations"));
  assert.equal(reads.length, 2, "annotation readback continues past an unrelated first-page result");
  assert.equal(reads[1].url.searchParams.get("cursor"), "1");
  for (const request of reads) {
    assert.match(request.url.pathname, /synthetic-workshop/);
    assert.match(request.url.search, new RegExp(traceId));
    assert.match(request.url.search, new RegExp(name));
  }
}

function assertSummary(output: string, evaluated: number, saved: number, errors: number, unprocessed: number, skipped = 0) {
  assert.match(output, /^Summary: .+ \| project synthetic-workshop$/m);
  assert.ok(output.includes(`Evaluated: ${evaluated} | Saved (verified): ${saved} | Skipped: ${skipped} | Errors: ${errors} | Unprocessed: ${unprocessed}`), output);
  assert.doesNotMatch(output, /NaN|Infinity/);
}

function assertMean(output: string, mean: number | null, scored: number, evaluated: number) {
  const line = output.split("\n").find((item) => item.startsWith("Mean score (evaluated): "));
  assert.ok(line, output);
  assert.ok(line.endsWith(`(${scored}/${evaluated} scored)`), line);
  if (mean === null) {
    assert.match(line, /not available/);
  } else {
    const value = Number.parseFloat(line.slice("Mean score (evaluated): ".length));
    assert.ok(Math.abs(value - mean) < 0.001, line);
  }
}

test("read evaluator fetches every page for the exact trace and annotates the child view", async () => {
  const rootSpan = {
    ...span("Agent Stop", "Synthetic task"),
    attributes: undefined,
    context: { trace_id: traceId, span_id: "0000000000000000" },
    span_kind: "LLM",
    parent_id: null,
  };
  await withServer({ pages: [[rootSpan], [span("view", { path: "AGENTS.md" })]], readbackSecondPage: true }, async (baseUrl, requests) => {
    const result = await execute("read-agents.ts", baseUrl);
    assert.equal(result.code, 0, result.output);
    const reads = requests.filter((request) => request.url.pathname.endsWith("/spans"));
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/traces")).length, 0, "explicit trace mode does not list the project");
    assert.equal(reads.length, 2);
    for (const request of reads) {
      assert.match(request.url.pathname, /synthetic-workshop/);
      assert.match(request.url.search, new RegExp(traceId));
      assert.doesNotMatch(request.url.search, /parent|root/i);
    }
    assert.equal(reads[1].url.searchParams.get("cursor"), "1");
    const saved = annotation(requests);
    assert.equal(saved.trace_id, traceId);
    assert.equal(saved.name, "explicit-agents-md-read");
    assert.equal(saved.annotator_kind, "CODE");
    assert.equal(saved.result.label, "OBSERVED");
    assert.equal(saved.result.score, 1);
    assertPaginatedReadback(requests, "explicit-agents-md-read");
  });
});

test("direct structured reads accept exact absolute and canonical relative AGENTS.md paths", async (t) => {
  for (const [name, fixture] of [
    ["view absolute path", span("view", { path: path.join(repoRoot, "AGENTS.md") })],
    ["view canonical relative path", span("view", { path: "./docs/../AGENTS.md" })],
    ["read file_path", span("read", { file_path: "AGENTS.md" })],
    ["read enriched attribute", span("read", {}, { "tool.file_path": path.join(repoRoot, "AGENTS.md") })],
    ["nested OpenInference attributes", {
      ...span("view", {}),
      attributes: {
        tool: { name: "view", result_type: "success" },
        input: { value: JSON.stringify({ path: "AGENTS.md" }) },
      },
    }],
  ] as const) {
    await t.test(name, async () => {
      await withServer({ pages: [[fixture]] }, async (baseUrl, requests) => {
        const result = await execute("read-agents.ts", baseUrl);
        assert.equal(result.code, 0, result.output);
        assert.equal(annotation(requests).result.score, 1);
      });
    });
  }
});

test("failed reads, listings, incidental mentions and other files never produce a positive read score", async (t) => {
  for (const [name, fixture] of [
    ["failed read even with green span", span("view", { path: "AGENTS.md" }, { "tool.result_type": "failure" })],
    ["denied read", span("view", { path: "AGENTS.md" }, { "tool.result_type": "denied" })],
    ["missing success evidence", span("view", { path: "AGENTS.md" }, { "tool.result_type": "" })],
    ["error span", { ...span("view", { path: "AGENTS.md" }), status_code: "ERROR" }],
    ["file listing", span("bash", { command: "rg --files | rg AGENTS.md" })],
    ["mentioned command", span("bash", { command: "echo 'cat AGENTS.md'" })],
    ["search mention", span("grep", { pattern: "AGENTS.md", path: "." })],
    ["different file", span("view", { path: "README.md", description: "AGENTS.md" })],
    ["backup filename", span("view", { path: "AGENTS.md.bak" })],
    ["outside repository", span("read", { file_path: "/outside/AGENTS.md" })],
    ["malformed tool arguments", span("view", "AGENTS.md is mentioned but these are not JSON arguments")],
    ["array arguments", span("view", [{ path: "AGENTS.md" }])],
    ["null arguments", span("view", null)],
    ["missing attributes", { ...span("view", {}), attributes: undefined }],
  ] as const) {
    await t.test(name, async () => {
      await withServer({ pages: [[fixture]] }, async (baseUrl, requests) => {
        const result = await execute("read-agents.ts", baseUrl);
        assert.equal(result.code, 0, result.output);
        assert.notEqual(annotation(requests).result.score, 1);
      });
    });
  }
});

test("missing project and invalid trace are rejected before any HTTP requests", async (t) => {
  for (const script of ["read-agents.ts", "check-verification.ts", "your-eval.ts"]) {
    for (const [name, args, env] of [
      ["empty project", [traceId], { PHOENIX_PROJECT_NAME: "" }],
      ["invalid trace", ["not-a-trace"], {}],
    ] as const) {
      await t.test(`${script}: ${name}`, async () => {
        await withServer({}, async (baseUrl, requests) => {
          const result = await execute(script, baseUrl, [...args, ...(script === "check-verification.ts" ? ["--send-to-judge"] : [])], env);
          assert.notEqual(result.code, 0);
          assert.equal(requests.length, 0);
        });
      });
    }
  }
});

const verificationSpans = [
  span("view", { path: "package.json" }, {
    "output.value": "PRIVATE_FILE_RETURN",
  }),
  {
    ...span("bash", { command: "pnpm test" }, { "tool.command": "pnpm test", "output.value": "Synthetic: 2 tests passed." }),
    context: { trace_id: traceId, span_id: "0000000000000002" },
    start_time: "2026-09-07T10:00:03.000Z",
    end_time: "2026-09-07T10:00:04.000Z",
  },
];

test("verification evaluator requires an explicit send flag before contacting the model", async () => {
  await withServer({ pages: [verificationSpans] }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl);
    assert.match(result.output, /send-to-judge/);
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/v1/chat/completions")).length, 0);
    assert.equal(annotations(requests).length, 0);
  });
});

test("native LLM evaluator preserves each seeded observation label without inventing a score", async (t) => {
  // Seeded responses test the native SDK/schema/annotation pipeline, not judge accuracy.
  for (const label of ["CHECK_REQUESTED", "NO_CHECK_FOUND"]) {
    await t.test(label, async () => {
      await withServer({ pages: [[verificationSpans[0]], [verificationSpans[1]]], judgeLabel: label, readbackSecondPage: true }, async (baseUrl, requests) => {
        const args = label === "NO_CHECK_FOUND" ? ["--send-to-judge", traceId] : [traceId, "--send-to-judge"];
        const result = await execute("check-verification.ts", baseUrl, args);
        assert.equal(result.code, 0, result.output);
        const calls = requests.filter((request) => request.url.pathname.endsWith("/v1/chat/completions"));
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url.pathname, "/v1/chat/completions");
        assert.equal(calls[0].body.model, "openai:synthetic-model");
        assert.equal(calls[0].body.stream, true);
        assert.equal(calls[0].headers.authorization, "Bearer synthetic-phoenix-api-key");
        assert.equal(Object.hasOwn(calls[0].body, "response_format"), false, "Phoenix proxy must receive prompt-based JSON, not a response_format constraint");
        assert.doesNotMatch(JSON.stringify(calls[0]), /synthetic-direct-provider-key-must-not-be-used|forbidden-direct-model/);
        assert.ok(Array.isArray(calls[0].body.messages));
        const payload = JSON.stringify(calls[0].body.messages);
        assert.match(payload, /package.json/);
        assert.match(payload, /pnpm test/);
        assert.doesNotMatch(payload, /Synthetic: 2 tests passed|PRIVATE_FILE_RETURN/);
        const prompt = calls[0].body.messages.map((message: any) => message.content).join("\n");
        assert.match(prompt, /Return only JSON:\s*\{/i);
        assert.match(prompt, /"label"/);
        assert.match(prompt, /"explanation"/);
        assert.match(prompt, /Allowed labels: CHECK_REQUESTED, NO_CHECK_FOUND/);
        const evidenceText = prompt.split("Tool requests, in start-time order:\n")[1]?.split("\n\nReturn only JSON:")[0];
        assert.ok(evidenceText, "the actual tool requests reach the native judge");
        const evidence = JSON.parse(evidenceText);
        assert.equal(evidence.length, 2);
        assert.equal(evidence[0].action, "read_file");
        assert.deepEqual(evidence[0].decodedInput, { path: "package.json" });
        assert.deepEqual(JSON.parse(evidence[0].input), { path: "package.json" });
        assert.equal(evidence[1].action, "shell");
        assert.deepEqual(evidence[1].decodedInput, { command: "pnpm test" });
        assert.deepEqual(JSON.parse(evidence[1].input), { command: "pnpm test" });
        assert.equal(requests.filter((request) => request.url.pathname.endsWith("/spans")).length, 2);
        const saved = annotation(requests);
        assert.equal(saved.trace_id, traceId);
        assert.equal(saved.name, "verification-request");
        assert.equal(saved.annotator_kind, "LLM");
        assert.equal(saved.result.label, label);
        assert.equal(saved.result.score ?? null, null);
        assert.equal(saved.metadata.scope, "tool-requests");
        assert.equal(saved.metadata.skillName, undefined);
        assert.equal(saved.metadata.skillPath, undefined);
        assert.equal(saved.metadata.rule, undefined);
        assert.equal(saved.metadata.model, "openai:synthetic-model");
        assert.equal(saved.metadata.evidence, "all tool requests and result types; no outputs");
        assertPaginatedReadback(requests, "verification-request");
      });
    });
  }
});

test("oversized judge evidence is rejected before a provider request or annotation", async () => {
  await withServer({ pages: [[span("bash", { command: "x".repeat(60_001) })]] }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /60,000/);
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/v1/chat/completions")).length, 0);
    assert.equal(annotations(requests).length, 0);
  });
});

test("provider and Phoenix error bodies are not printed", async (t) => {
  for (const [name, scenario, script, args] of [
    ["Phoenix", { phoenixError: true }, "read-agents.ts", [traceId]],
    ["judge", { pages: [verificationSpans], judgeError: true }, "check-verification.ts", [traceId, "--send-to-judge"]],
  ] as const) {
    await t.test(name, async () => {
      await withServer(scenario, async (baseUrl, requests) => {
        const result = await execute(script, baseUrl, [...args]);
        assert.notEqual(result.code, 0);
        assert.doesNotMatch(result.output, /RAW_.*SECRET_MUST_NOT_BE_PRINTED|synthetic-phoenix-api-key|synthetic-direct-provider-key-must-not-be-used/);
        assert.equal(annotations(requests).length, 0);
      });
    });
  }
});

test("the unfinished participant template refuses to produce a score or annotation", async () => {
  const matchingExamples = [
    span("bash", { command: "pnpm test" }),
    span("mcp__deployment__deploy", { environment: "test" }),
    span("create", { path: "generated/report.json" }),
  ];
  await withServer({ pages: [matchingExamples] }, async (baseUrl, requests) => {
    const result = await execute("your-eval.ts", baseUrl);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /TODO|write|implement|complete/i);
    assert.equal(annotations(requests).length, 0);
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/v1/chat/completions")).length, 0);
  });
});

async function completedTemplate() {
  let source = await readFile(path.join(packageRoot, "your-eval.ts"), "utf8");
  // Uncomment the supplied example conditions and return block, only in memory.
  source = source.replace('  throw new Error("TODO: implement your own rule before saving any result");', "");
  source = source.replace(/^(    )\/\/ (if \(|  matches\.push|})/gm, "$1$2");
  const start = source.indexOf("  // if (matches.length === 0)");
  const end = source.indexOf("  // For insufficient evidence");
  assert.ok(start > 0 && end > start, "the template includes an editable result block");
  const block = source.slice(start, end);
  return source.replace(block, block.replace(/^(  )\/\/ /gm, "$1"));
}

test("the template's actual code examples run with readable tool fields and paginated native storage", async () => {
  const source = await completedTemplate();
  const fixtures = [
    span("bash", { command: "pnpm test" }),
    span("mcp__deployment__deploy", { environment: "test" }),
    span("write_file", { file_path: "./generated/../generated/report.json" }),
    span("shell", { command: "echo pnpm test" }),
    span("mcp__deployment__deploy", { environment: "test" }, { "tool.result_type": "failure" }),
    span("create", { path: "generated/other.json" }),
    span("write", "not valid JSON"),
    span("write", [{ path: "generated/report.json" }]),
    span("write", null),
    { ...span("write", {}), attributes: undefined },
  ].map((fixture, index) => ({
    ...fixture, context: { trace_id: traceId, span_id: String(index + 1).padStart(16, "0") },
  }));
  await withServer({ pages: [fixtures.slice(0, 2), fixtures.slice(2)], readbackSecondPage: true }, async (baseUrl, requests) => {
    const result = await execute("your-eval.ts", baseUrl, [traceId], {}, source);
    assert.equal(result.code, 0, result.output);
    const saved = annotation(requests);
    assert.equal(saved.name, "your-eval");
    assert.equal(saved.annotator_kind, "CODE");
    assert.equal(saved.result.label, "OBSERVED");
    assert.equal(saved.result.score, 1);
    assert.equal(saved.result.explanation, "Matching action span IDs: 0000000000000001, 0000000000000002, 0000000000000003.");
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/spans")).length, 2);
    assertPaginatedReadback(requests, "your-eval");
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/v1/chat/completions")).length, 0);
  });
});

test("completed template examples return NOT_OBSERVED when no action matches", async () => {
  const source = await completedTemplate();
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("your-eval.ts", baseUrl, [traceId], {}, source);
    assert.equal(result.code, 0, result.output);
    assert.equal(annotation(requests).result.label, "NOT_OBSERVED");
    assert.equal(annotation(requests).result.score, 0);
  });
});

test("every script rejects empty traces and refuses success without annotation readback", async (t) => {
  const source = await completedTemplate();
  for (const script of ["read-agents.ts", "check-verification.ts", "your-eval.ts"]) {
    for (const [name, scenario] of [
      ["empty trace", { pages: [[]] }],
      ["missing annotation", { missingAnnotation: true, readbackSecondPage: true }],
    ] as const) {
      await t.test(`${script}: ${name}`, async () => {
        await withServer(scenario, async (baseUrl, requests) => {
          const args = script === "check-verification.ts" ? [traceId, "--send-to-judge"] : [traceId];
          const result = await execute(script, baseUrl, args, {}, script === "your-eval.ts" ? source : undefined);
          assert.notEqual(result.code, 0);
          assert.doesNotMatch(result.output, /"annotationId"/);
          assert.equal(annotations(requests).length, name === "empty trace" ? 0 : 1);
        });
      });
    }
  }
});

test("all examples show the same native evaluator and run structure without support plumbing", async () => {
  for (const [script, check, loader, kind] of [
    ["read-agents.ts", "checkAgentsRead", "loadTraces", "CODE"],
    ["check-verification.ts", "checkVerification", "loadJudgeTraces", "LLM"],
    ["your-eval.ts", "checkYourRule", "loadTraces", "CODE"],
  ]) {
    const source = await readFile(path.join(packageRoot, script), "utf8");
    assert.match(source, /from "@arizeai\/phoenix-evals"/);
    assert.match(source, /from "\.\/lib\/phoenix\.ts"/);
    assert.ok(source.includes(`function ${check}(`), `${script} exposes a named check`);
    assert.ok(source.includes(`createEvaluator(${check},`), `${script} visibly uses the native evaluator`);
    assert.ok(source.includes(`kind: "${kind}"`), `${script} declares the correct native evaluator kind`);
    const run = `async function main() {\n  for await (const trace of ${loader}(evaluator)) {\n    const result = await evaluator.evaluate(trace);\n    await saveResult(trace, evaluator, result);\n  }\n}`;
    assert.ok(source.includes(run), `${script} has the same load → evaluate → save run section`);
    assert.match(source, /await main\(\)\.catch\(reportError\);/);
    assert.doesNotMatch(source, /JSON\.parse|Awaited<|ReturnType<|Types\[|Record<string|as Record<|getSpans\(|\.GET\(/);
    assert.doesNotMatch(source, /tool\.name|input\.value|tool\.result_type|#region Support/);
    assert.doesNotMatch(source, /from ["']\.\/(?:read-agents|check-verification|your-eval)\.ts["']/);
    const telemetryFlags = source.match(/telemetry:\s*\{\s*isEnabled:\s*false\s*\}/g) ?? [];
    assert.equal(telemetryFlags.length, kind === "LLM" ? 2 : 1, `${script} disables telemetry at each native eval layer`);
    if (kind === "LLM") {
      assert.match(source, /from "\.\/lib\/llm-judge\.ts"/);
      assert.match(source, /await generateClassification\(/);
    }
  }
});

test("shared support imports perform no I/O or CLI validation", async () => {
  const source = 'await import("./lib/phoenix.ts"); await import("./lib/llm-judge.ts"); console.log("imports-only");';
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("imports-only", baseUrl, ["invalid-trace"], {
      PHOENIX_PROJECT_NAME: "", REPO_ROOT: "", PHOENIX_JUDGE_MODEL: "", SKILL_NAME: "",
    }, source);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /imports-only/);
    assert.equal(requests.length, 0);
  });
});

test("each example saves its learner-renamed evaluator name, independently of other examples", async (t) => {
  for (const [script, originalName, kind] of [
    ["read-agents.ts", "explicit-agents-md-read", "CODE"],
    ["check-verification.ts", "verification-request", "LLM"],
    ["your-eval.ts", "your-eval", "CODE"],
  ]) {
    await t.test(script, async () => {
      const source = script === "your-eval.ts" ? await completedTemplate()
        : await readFile(path.join(packageRoot, script), "utf8");
      const name = `learner-${originalName}`;
      const edited = source.replace(`const evaluationName = "${originalName}"`, `const evaluationName = "${name}"`);
      assert.notEqual(source, edited, "the learner edits the visible evaluationName setting");
      await withServer({ pages: [verificationSpans], readbackSecondPage: true }, async (baseUrl, requests) => {
        const args = kind === "LLM" ? [traceId, "--send-to-judge"] : [traceId];
        const result = await execute(script, baseUrl, args, {}, edited);
        assert.equal(result.code, 0, result.output);
        assert.equal(annotation(requests).name, name);
        assert.equal(annotation(requests).annotator_kind, kind);
        if (kind === "LLM") assert.equal(annotation(requests).metadata.scope, "tool-requests");
        assertPaginatedReadback(requests, name);
      });
    });
  }
});

test("code examples run without any judge or skill configuration", async (t) => {
  for (const script of ["read-agents.ts", "your-eval.ts"]) {
    await t.test(script, async () => {
      const source = script === "your-eval.ts" ? await completedTemplate() : undefined;
      await withServer({}, async (baseUrl, requests) => {
        const result = await execute(script, baseUrl, [traceId], {
          PHOENIX_JUDGE_MODEL: "", LLM_BASE_URL: "", LLM_MODEL: "", LLM_API_KEY: "", SKILL_NAME: "", SKILL_PATH: "", SKILL_RULE: "",
        }, source);
        assert.equal(result.code, 0, result.output);
        assert.equal(annotation(requests).annotator_kind, "CODE");
        assert.equal(requests.filter((request) => request.url.pathname.endsWith("/v1/chat/completions")).length, 0);
      });
    });
  }
});

test("default batch snapshots every trace page, deduplicates, sorts and evaluates each trace separately", async () => {
  const scenario: Scenario = {
    // Deliberately not sorted: the client must finish and sort its snapshot.
    tracePages: [[traceRecord(secondTraceId, 2)], [traceRecord(traceId), traceRecord(secondTraceId, 2), traceRecord(thirdTraceId, 3)]],
    pagesByTrace: {
      [traceId]: inTrace(traceId, [span("bash", { command: "echo first" }), span("view", { path: "AGENTS.md" })]).map((item) => [item]),
      [secondTraceId]: [inTrace(secondTraceId, [span("view", { path: "README.md" })])],
      [thirdTraceId]: [inTrace(thirdTraceId, [span("read", { file_path: "AGENTS.md" })])],
    },
    readbackSecondPage: true,
  };
  await withServer(scenario, async (baseUrl, requests) => {
    const result = await execute("read-agents.ts", baseUrl, ["--verbose"]);
    assert.equal(result.code, 0, result.output);
    const lists = requests.filter((request) => request.url.pathname.endsWith("/traces"));
    assert.equal(lists.length, 2);
    assert.equal(lists[1].url.searchParams.get("cursor"), "1");
    const cutoff = lists[0].url.searchParams.get("end_time");
    assert.ok(cutoff && Number.isFinite(Date.parse(cutoff)), "batch has a fixed valid snapshot cutoff");
    for (const request of lists) {
      assert.match(request.url.pathname, /synthetic-workshop/);
      assert.equal(request.url.searchParams.get("end_time"), cutoff);
      assert.equal(request.url.searchParams.get("sort"), "start_time");
      assert.equal(request.url.searchParams.get("order"), "asc");
      assert.equal(request.url.searchParams.get("limit"), "100");
      assert.doesNotMatch(request.url.search, /include_spans|parent|root/);
    }
    const spanReads = requests.filter((request) => request.url.pathname.endsWith("/spans"));
    assert.ok(requests.indexOf(lists[1]) < requests.indexOf(spanReads[0]), "the entire ID snapshot precedes evaluation I/O");
    assert.deepEqual(spanReads.map((request) => request.url.searchParams.getAll("trace_id")), [[traceId], [traceId], [secondTraceId], [thirdTraceId]]);
    assert.equal(spanReads[1].url.searchParams.get("cursor"), "1");
    for (const request of spanReads) assert.doesNotMatch(request.url.search, /parent|root/);
    const writes = annotations(requests).map((request) => request.body.data[0]);
    assert.deepEqual(writes.map((item) => item.trace_id), [traceId, secondTraceId, thirdTraceId]);
    assert.deepEqual(writes.map((item) => item.result.score), [1, 0, 1]);
    assertSummary(result.output, 3, 3, 0, 0);
    assertMean(result.output, 2 / 3, 3, 3);
    assert.match(result.output, /Labels \(evaluated\): .*\bOBSERVED=2/);
    assert.match(result.output, /Labels \(evaluated\): .*\bNOT_OBSERVED=1/);
    const readbacks = requests.filter((request) => request.method === "GET" && request.url.pathname.endsWith("/trace_annotations"));
    assert.deepEqual(readbacks.map((request) => request.url.searchParams.get("trace_ids")), [traceId, traceId, secondTraceId, secondTraceId, thirdTraceId, thirdTraceId]);
    for (const id of [1, 2, 3]) assert.match(result.output, new RegExp(`"annotationId": "synthetic-annotation-${id}"`));
  });
});

test("batch verification evaluation makes a separate model request and annotation for each trace", async () => {
  const first = inTrace(traceId, [span("view", { path: "package.json" }), span("bash", { command: "pnpm test", marker: "FIRST_TRACE_ONLY" })]);
  const second = inTrace(secondTraceId, [span("view", { path: "README.md" }), span("bash", { command: "echo done", marker: "SECOND_TRACE_ONLY" })]);
  await withServer({
    tracePages: [[traceRecord(traceId)], [traceRecord(secondTraceId, 2)]],
    pagesByTrace: { [traceId]: [[first[0]], [first[1]]], [secondTraceId]: [[second[0]], [second[1]]] },
    judgeByTrace: { [traceId]: { label: "CHECK_REQUESTED" }, [secondTraceId]: { label: "NO_CHECK_FOUND" } },
  }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, ["--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    const judges = requests.filter((request) => request.url.pathname.endsWith("/v1/chat/completions"));
    assert.equal(judges.length, 2);
    for (const [index, own, other] of [[0, "FIRST_TRACE_ONLY", "SECOND_TRACE_ONLY"], [1, "SECOND_TRACE_ONLY", "FIRST_TRACE_ONLY"]] as const) {
      const payload = JSON.stringify(judges[index].body.messages);
      assert.match(payload, new RegExp(own));
      assert.doesNotMatch(payload, new RegExp(other));
    }
    const writes = annotations(requests).map((request) => request.body.data[0]);
    assert.deepEqual(writes.map((item) => [item.trace_id, item.annotator_kind, item.result.label, item.result.score ?? null]), [
      [traceId, "LLM", "CHECK_REQUESTED", null], [secondTraceId, "LLM", "NO_CHECK_FOUND", null],
    ]);
  });
});

test("all examples treat an empty project as a successful no-op", async (t) => {
  for (const script of ["read-agents.ts", "check-verification.ts", "your-eval.ts"]) {
    await t.test(script, async () => {
      await withServer({ tracePages: [[]] }, async (baseUrl, requests) => {
        const result = await execute(script, baseUrl, script === "check-verification.ts" ? ["--send-to-judge"] : []);
        assert.equal(result.code, 0, result.output);
        assert.match(result.output, /No traces found.*synthetic-workshop/);
        assertSummary(result.output, 0, 0, 0, 0);
        assertMean(result.output, null, 0, 0);
        assert.equal(annotations(requests).length, 0);
        assert.equal(requests.filter((request) => /\/spans$|\/v1\/chat\/completions$/.test(request.url.pathname)).length, 0);
      });
    });
  }
});

test("invalid extra arguments and unknown flags reject before any single or batch I/O", async (t) => {
  for (const script of ["read-agents.ts", "check-verification.ts", "your-eval.ts"]) {
    for (const args of [["--unknown"], [traceId, secondTraceId], [traceId, "--typo"], ["--verbose", "--verbose"], ["--send-to-judge", "--send-to-judge"]]) {
      await t.test(`${script}: ${args.join(" ")}`, async () => {
        await withServer({}, async (baseUrl, requests) => {
          const consent = script === "check-verification.ts" ? ["--send-to-judge"] : [];
          const result = await execute(script, baseUrl, [...args, ...consent]);
          assert.notEqual(result.code, 0);
          assert.equal(requests.length, 0);
          assert.doesNotMatch(result.output, /^Summary:/m, "invalid arguments must not invent a run summary");
        });
      });
    }
  }
});

test("batch judge mode still requires consent before even listing traces", async () => {
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, []);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /send-to-judge/);
    assert.equal(requests.length, 0);
  });
});

test("a failed trace-list page aborts before any trace is evaluated", async () => {
  await withServer({ tracePages: [[traceRecord(traceId)], [traceRecord(secondTraceId, 2)]], traceListErrorPage: 1 }, async (baseUrl, requests) => {
    const result = await execute("read-agents.ts", baseUrl, []);
    assert.notEqual(result.code, 0);
    assert.doesNotMatch(result.output, /RAW_TRACE_LIST_SECRET_MUST_NOT_BE_PRINTED/);
    assert.match(result.output, /Evaluated: 0 \| Saved \(verified\): 0 \| Skipped: 0 \| Errors: 1 \| Unprocessed: unknown/);
    assert.match(result.output, /Stopped: trace discovery/);
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/spans")).length, 0);
    assert.equal(annotations(requests).length, 0);
  });
});

test("batch stops at the first fetch, judge, evidence or storage error and preserves earlier results", async (t) => {
  for (const [name, script, failure] of [
    ["span fetch", "read-agents.ts", { spanErrorTrace: secondTraceId }],
    ["judge", "check-verification.ts", { judgeByTrace: { [secondTraceId]: { error: true } } }],
    ["oversized evidence", "check-verification.ts", { pagesByTrace: { [secondTraceId]: [inTrace(secondTraceId, [span("bash", { command: "x".repeat(60_001) })])] } }],
    ["annotation write", "read-agents.ts", { annotationErrorTrace: secondTraceId }],
    ["annotation readback", "read-agents.ts", { missingAnnotationTrace: secondTraceId }],
  ] as const) {
    await t.test(name, async () => {
      await withServer({
        tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2), traceRecord(thirdTraceId, 3)]],
        ...failure,
        pagesByTrace: {
          [traceId]: [inTrace(traceId, verificationSpans)],
          [secondTraceId]: [inTrace(secondTraceId, verificationSpans)],
          [thirdTraceId]: [inTrace(thirdTraceId, verificationSpans)],
          ...("pagesByTrace" in failure ? failure.pagesByTrace : {}),
        },
      }, async (baseUrl, requests) => {
        const result = await execute(script, baseUrl, script === "check-verification.ts" ? ["--send-to-judge", "--verbose"] : ["--verbose"]);
        assert.notEqual(result.code, 0);
        assert.match(result.output, /"annotationId": "synthetic-annotation-1"/);
        assertSummary(result.output, name.startsWith("annotation") ? 2 : 1, 1, 1, 1);
        assert.match(result.output, new RegExp(`Stopped: ${secondTraceId}`));
        if (name.startsWith("annotation")) {
          assertMean(result.output, 0, 2, 2);
          assert.match(result.output, /Labels \(evaluated\): NOT_OBSERVED=2/);
        }
        assert.doesNotMatch(result.output, /"annotationId": "synthetic-annotation-2"|RAW_.*SECRET_MUST_NOT_BE_PRINTED/);
        const writes = annotations(requests).map((request) => request.body.data[0]);
        assert.equal(writes[0].trace_id, traceId);
        assert.equal(writes.some((item) => item.trace_id === thirdTraceId), false);
        const fetched = requests.filter((request) => request.url.pathname.endsWith("/spans")).map((request) => request.url.searchParams.get("trace_id"));
        assert.equal(fetched.includes(thirdTraceId), false);
        assert.equal(requests.some((request) => request.method === "DELETE"), false, "previous results are not rolled back");
      });
    });
  }
});

test("completed participant code runs once per trace in default batch mode", async () => {
  const source = await completedTemplate();
  await withServer({
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2)]],
    pagesByTrace: {
      [traceId]: [inTrace(traceId, [span("bash", { command: "pnpm test" })])],
      [secondTraceId]: [inTrace(secondTraceId, [span("bash", { command: "echo pnpm test" })])],
    },
  }, async (baseUrl, requests) => {
    const result = await execute("your-eval.ts", baseUrl, [], {}, source);
    assert.equal(result.code, 0, result.output);
    const writes = annotations(requests).map((request) => request.body.data[0]);
    assert.deepEqual(writes.map((item) => [item.trace_id, item.name, item.result.score]), [
      [traceId, "your-eval", 1], [secondTraceId, "your-eval", 0],
    ]);
  });
});

test("single-trace mode retains Phoenix 13.9 compatibility while batch requires trace-list support", async () => {
  await withServer({ serverVersion: "13.9.0" }, async (baseUrl, requests) => {
    const single = await execute("read-agents.ts", baseUrl, [traceId]);
    assert.equal(single.code, 0, single.output);
    assert.equal(annotation(requests).trace_id, traceId);
    const beforeBatch = requests.length;
    const batch = await execute("read-agents.ts", baseUrl, []);
    assert.notEqual(batch.code, 0);
    assert.equal(requests.slice(beforeBatch).filter((request) => request.url.pathname.endsWith("/traces") || request.url.pathname.endsWith("/spans") || request.method === "POST").length, 0);
  });
});

test("repeated cursors fail promptly in trace discovery, span fetching and annotation readback", async (t) => {
  for (const repeatCursor of ["traces", "spans", "annotations"] as const) {
    await t.test(repeatCursor, async () => {
      await withServer({ repeatCursor, missingAnnotation: repeatCursor === "annotations" }, async (baseUrl, requests) => {
        const result = await execute("read-agents.ts", baseUrl, repeatCursor === "traces" ? [] : [traceId]);
        assert.notEqual(result.code, 0);
        assert.doesNotMatch(result.output, /"annotationId"/);
        const route = repeatCursor === "annotations" ? "/trace_annotations" : `/${repeatCursor}`;
        assert.equal(requests.filter((request) => request.method === "GET" && request.url.pathname.endsWith(route)).length, 2);
        assert.equal(annotations(requests).length, repeatCursor === "annotations" ? 1 : 0);
      });
    });
  }
});

test("malformed trace-discovery IDs and dates are rejected before evaluating anything", async (t) => {
  for (const fixture of [traceRecord("not-a-trace"), { ...traceRecord(traceId), start_time: "not-a-date" }]) {
    await t.test(fixture.start_time, async () => {
      await withServer({ tracePages: [[fixture]] }, async (baseUrl, requests) => {
        const result = await execute("read-agents.ts", baseUrl, []);
        assert.notEqual(result.code, 0);
        assert.equal(requests.filter((request) => request.url.pathname.endsWith("/spans")).length, 0);
        assert.equal(annotations(requests).length, 0);
      });
    });
  }
});

test("single-trace output is concise by default and raw result JSON requires --verbose", async (t) => {
  for (const verbose of [false, true]) {
    await t.test(verbose ? "verbose" : "default", async () => {
      await withServer({}, async (baseUrl, requests) => {
        const result = await execute("read-agents.ts", baseUrl, verbose ? [traceId, "--verbose"] : [traceId]);
        assert.equal(result.code, 0, result.output);
        assert.equal(annotation(requests).result.label, "OBSERVED");
        assertSummary(result.output, 1, 1, 0, 0);
        assertMean(result.output, 1, 1, 1);
        assert.match(result.output, /OBSERVED/);
        if (verbose) {
          assert.match(result.output, /"traceId": "0123456789abcdef0123456789abcdef"/);
          assert.match(result.output, /"annotationId": "synthetic-annotation-1"/);
          assert.match(result.output, /This does not prove the instructions were followed/);
        } else {
          assert.doesNotMatch(result.output, /"annotationId"|"explanation"|This does not prove the instructions were followed/);
        }
      });
    });
  }
});

test("default judge output omits explanations, tool arguments and raw provider details", async () => {
  const explanation = "PRIVATE_SYNTHETIC_JUDGE_EXPLANATION";
  await withServer({
    pages: [[span("bash", { command: "PRIVATE_SYNTHETIC_TOOL_ARGUMENT" })]],
    judgeExplanation: explanation,
  }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    assert.equal(annotation(requests).result.explanation, explanation);
    assert.doesNotMatch(result.output, /PRIVATE_SYNTHETIC|synthetic-phoenix-api-key|synthetic-direct-provider-key-must-not-be-used|"explanation"|"annotationId"/);
  });
});

test("verbose output is not consent to call the judge", async () => {
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, ["--verbose"]);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /send-to-judge/);
    assert.equal(requests.length, 0);
  });
});

test("default verification-request summary counts seeded observation labels and keeps every result unscored", async (t) => {
  const ids = [traceId, secondTraceId, thirdTraceId, "44444444444444444444444444444444"];
  const labels = ["CHECK_REQUESTED", "NO_CHECK_FOUND", "NO_CHECK_FOUND", "CHECK_REQUESTED"];
  const pagesByTrace = Object.fromEntries(ids.map((id) => [id, [inTrace(id, verificationSpans)]]));
  const judgeByTrace = Object.fromEntries(ids.map((id, index) => [id, { label: labels[index] }]));
  await withServer({ tracePages: [ids.map((id, index) => traceRecord(id, index + 1))], pagesByTrace, judgeByTrace }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, ["--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    assert.equal(annotations(requests).length, 4);
    assertSummary(result.output, 4, 4, 0, 0);
    assertMean(result.output, null, 0, 4);
    assert.equal(result.output.split("Judge: using prompt-based JSON; results are validated locally.").length - 1, 1);
    assert.doesNotMatch(result.output, /AI SDK Warning|JSON response format schema is only supported/);
    assert.match(result.output, /\bCHECK_REQUESTED=2\b/);
    assert.match(result.output, /\bNO_CHECK_FOUND=2\b/);
    assert.doesNotMatch(result.output, /"annotationId"|"explanation"|Synthetic judgement seeded/);
    for (const [index, id] of ids.entries()) {
      assert.ok(result.output.includes(`[${index + 1}/4] ${id} ${labels[index]} score=`), result.output);
    }
    t.diagnostic(`Synthetic reporting example (fake judge responses):\n${result.output}`);
  });
});

test("an entirely unscored judge batch reports no numeric average", async () => {
  await withServer({
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2)]],
    judgeByTrace: { [traceId]: { label: "CHECK_REQUESTED" }, [secondTraceId]: { label: "NO_CHECK_FOUND" } },
  }, async (baseUrl) => {
    const result = await execute("check-verification.ts", baseUrl, ["--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    assertSummary(result.output, 2, 2, 0, 0);
    assertMean(result.output, null, 0, 2);
  });
});

test("summary review IDs are bounded even when every trace needs attention", async () => {
  const ids = Array.from({ length: 8 }, (_, index) => (index + 1).toString(16).padStart(32, "0"));
  await withServer({ tracePages: [ids.map((id, index) => traceRecord(id, index + 1))], pages: [[span("view", { path: "README.md" })]] }, async (baseUrl) => {
    const result = await execute("read-agents.ts", baseUrl, []);
    assert.equal(result.code, 0, result.output);
    assertSummary(result.output, 8, 8, 0, 0);
    const review = result.output.split("\n").find((line) => line.startsWith("Review trace IDs"));
    assert.ok(review, result.output);
    const listed = review.match(/\b[a-f\d]{32}\b/g) ?? [];
    assert.equal(listed.length, 5);
    assert.deepEqual(listed, ids.slice(0, 5));
  });
});

test("a learner evaluator exception produces a partial summary without leaking its error", async () => {
  const source = (await completedTemplate()).replace("  const matches: string[] = [];", `  if (input.traceId === "${secondTraceId}") throw new Error("RAW_LEARNER_SECRET_MUST_NOT_BE_PRINTED");\n  const matches: string[] = [];`);
  await withServer({
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2), traceRecord(thirdTraceId, 3)]],
    pages: [[span("bash", { command: "pnpm test" })]],
  }, async (baseUrl, requests) => {
    const result = await execute("your-eval.ts", baseUrl, [], {}, source);
    assert.notEqual(result.code, 0);
    assertSummary(result.output, 1, 1, 1, 1);
    assertMean(result.output, 1, 1, 1);
    assert.match(result.output, new RegExp(`Stopped: ${secondTraceId}`));
    assert.doesNotMatch(result.output, /RAW_LEARNER_SECRET_MUST_NOT_BE_PRINTED|"annotationId"|"explanation"/);
    assert.equal(annotations(requests).length, 1);
  });
});

test("the reporting-only Phoenix link strips credentials, query parameters and fragments", async () => {
  const source = `
import { createReport, setReportTotal, finishReport } from "./lib/reporting.ts";
const report = createReport("synthetic-eval", "synthetic-workshop", "https://PRIVATE_USER:PRIVATE_PASSWORD@phoenix.example/workshop?token=PRIVATE_QUERY#PRIVATE_FRAGMENT", false);
setReportTotal(report, 0);
finishReport(report, true);
`;
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("report-only", baseUrl, [], {}, source);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Phoenix: https:\/\/phoenix\.example\/workshop/);
    assert.doesNotMatch(result.output, /PRIVATE_|token=/);
    assert.equal(requests.length, 0);
  });
});

test("verbose judge mode retains SDK warnings but still removes the unsupported response format", async () => {
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge", "--verbose"]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /AI SDK Warning.*responseFormat/);
    assert.match(result.output, /"annotationId": "synthetic-annotation-1"/);
    const call = requests.find((request) => request.url.pathname.endsWith("/v1/chat/completions"));
    assert.equal(Object.hasOwn(call?.body, "response_format"), false);
  });
});

test("warning handling preserves unknown warnings and restores the prior hook on success and failure", async (t) => {
  const script = await readFile(path.join(packageRoot, "check-verification.ts"), "utf8");
  const prefix = `const originalHook = (options) => console.warn("ORIGINAL_WARNING_HOOK", JSON.stringify(options.warnings));\nglobalThis.AI_SDK_LOG_WARNINGS = originalHook;\n`;
  const suffix = '\nconsole.log("HOOK_RESTORED=" + (globalThis.AI_SDK_LOG_WARNINGS === originalHook));';
  const injected = script.replace("async function checkVerification(trace: JudgeTrace) {", `async function checkVerification(trace: JudgeTrace) {
  globalThis.AI_SDK_LOG_WARNINGS({ warnings: [
    { type: "other", message: "SYNTHETIC_UNKNOWN_WARNING" },
    { type: "unsupported", feature: "responseFormat", details: "SYNTHETIC_DIFFERENT_RESPONSE_FORMAT_WARNING" }
  ], provider: "synthetic-provider", model: "synthetic-model" });`);
  assert.notEqual(injected, script);
  for (const judgeError of [false, true]) {
    await t.test(judgeError ? "failure" : "success", async () => {
      await withServer({ judgeError }, async (baseUrl) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"], {}, prefix + injected + suffix);
        assert.equal(result.code, judgeError ? 1 : 0, result.output);
        assert.match(result.output, /ORIGINAL_WARNING_HOOK.*SYNTHETIC_UNKNOWN_WARNING/);
        assert.match(result.output, /ORIGINAL_WARNING_HOOK.*SYNTHETIC_DIFFERENT_RESPONSE_FORMAT_WARNING/);
        assert.match(result.output, /HOOK_RESTORED=true/);
      });
    });
  }
  await t.test("import only", async () => {
    await withServer({}, async (baseUrl, requests) => {
      const result = await execute("import-only", baseUrl, [], {}, prefix + 'await import("./lib/llm-judge.ts");' + suffix);
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /HOOK_RESTORED=true/);
      assert.equal(requests.length, 0);
    });
  });
});

test("warning dedup is specific to the expected provider and respects an existing disabled logger", async () => {
  const source = `
import { installJudgeWarningLogger } from "./lib/llm-judge.ts";
globalThis.AI_SDK_LOG_WARNINGS = undefined;
const restore = installJudgeWarningLogger(false);
globalThis.AI_SDK_LOG_WARNINGS({ provider: "DIFFERENT_SYNTHETIC_PROVIDER", model: "test", warnings: [{
  type: "unsupported", feature: "responseFormat", details: "JSON response format schema is only supported with structuredOutputs"
}] });
restore();
console.log("UNDEFINED_RESTORED=" + (globalThis.AI_SDK_LOG_WARNINGS === undefined));
globalThis.AI_SDK_LOG_WARNINGS = false;
const restoreDisabled = installJudgeWarningLogger(false);
console.log("DISABLED_PRESERVED=" + (globalThis.AI_SDK_LOG_WARNINGS === false));
restoreDisabled();
`;
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("warning-only", baseUrl, [], {}, source);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /DIFFERENT_SYNTHETIC_PROVIDER/);
    assert.match(result.output, /JSON response format schema is only supported with structuredOutputs/);
    assert.match(result.output, /UNDEFINED_RESTORED=true/);
    assert.match(result.output, /DISABLED_PRESERVED=true/);
    assert.doesNotMatch(result.output, /Judge: using prompt-based/);
    assert.equal(requests.length, 0);
  });
});

test("saved-provider mode requires an explicit valid Phoenix selector and never falls back to old LLM settings", async (t) => {
  for (const selector of ["", "model-without-provider", ":model", "openai:", "unknown:model", "custom:model", "openai:bad model"]) {
    await t.test(selector || "missing selector", async () => {
      await withServer({}, async (baseUrl, requests) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"], { PHOENIX_JUDGE_MODEL: selector });
        assert.notEqual(result.code, 0);
        assert.equal(requests.length, 0, "invalid selector must not trigger discovery, inference or a direct-provider fallback");
        assert.doesNotMatch(result.output, /synthetic-phoenix-api-key|synthetic-direct-provider-key-must-not-be-used/);
      });
    });
  }
});

test("saved-provider mode needs no LLM settings and sends only Phoenix authentication", async () => {
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"], {
      LLM_BASE_URL: "", LLM_MODEL: "", LLM_API_KEY: "",
    });
    assert.equal(result.code, 0, result.output);
    const call = requests.find((request) => request.url.pathname === "/v1/chat/completions");
    assert.ok(call);
    assert.equal(call.headers.authorization, "Bearer synthetic-phoenix-api-key");
    assert.equal(call.body.model, "openai:synthetic-model");
    assert.equal(Object.hasOwn(call.body, "response_format"), false);
    assert.equal(annotation(requests).annotator_kind, "LLM");
    for (const request of requests) assert.equal(request.headers.authorization, "Bearer synthetic-phoenix-api-key");
  });
});

test("an unauthenticated Phoenix does not borrow a legacy direct-provider key", async () => {
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"], { PHOENIX_API_KEY: "" });
    assert.equal(result.code, 0, result.output);
    const call = requests.find((request) => request.url.pathname === "/v1/chat/completions");
    assert.ok(call);
    assert.equal(call.headers.authorization, undefined);
    assert.doesNotMatch(JSON.stringify(requests), /synthetic-direct-provider-key-must-not-be-used/);
  });
});

test("Phoenix judge routing preserves an application base path and normalizes trailing slashes", async (t) => {
  for (const suffix of ["/", "/phoenix", "/phoenix/"]) {
    await t.test(suffix, async () => {
      const prefix = suffix === "/" ? "" : "/phoenix";
      await withServer({ pathPrefix: prefix }, async (baseUrl, requests) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"], { PHOENIX_BASE_URL: baseUrl + suffix });
        assert.equal(result.code, 0, result.output);
        const calls = requests.filter((request) => request.url.pathname.endsWith("/chat/completions"));
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url.pathname, `${prefix}/v1/chat/completions`);
        for (const request of requests) {
          assert.ok(request.url.pathname.startsWith(`${prefix}/`));
          assert.doesNotMatch(request.url.pathname, /\/\//);
        }
      });
    });
  }
});

test("selector normalization changes only provider case and preserves model slashes and colons", async () => {
  await withServer({}, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"], { PHOENIX_JUDGE_MODEL: "OpenAI:Synthetic/Model:v1" });
    assert.equal(result.code, 0, result.output);
    const call = requests.find((request) => request.url.pathname === "/v1/chat/completions");
    assert.equal(call?.body.model, "openai:Synthetic/Model:v1");
    assert.equal(annotation(requests).metadata.model, "openai:Synthetic/Model:v1");
  });
});

test("Phoenix saved-provider chat requires server 19.16 before making a model request", async (t) => {
  for (const version of ["19.15.9", "19.16.0"]) {
    await t.test(version, async () => {
      await withServer({ serverVersion: version }, async (baseUrl, requests) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
        const expectedCalls = version === "19.16.0" ? 1 : 0;
        assert.equal(result.code, expectedCalls ? 0 : 1, result.output);
        assert.equal(requests.filter((request) => request.url.pathname.endsWith("/chat/completions")).length, expectedCalls);
        assert.equal(annotations(requests).length, expectedCalls);
      });
    });
  }
});

test("invalid model JSON or labels fail local native validation without a fabricated annotation", async (t) => {
  for (const [name, content] of [
    ["invalid JSON", "RAW_INVALID_JSON_SECRET_MUST_NOT_BE_PRINTED"],
    ["unknown label", JSON.stringify({ label: "INVALID_LABEL", explanation: "RAW_INVALID_LABEL_SECRET_MUST_NOT_BE_PRINTED" })],
    ["retired targeted label", JSON.stringify({ label: "APPLIED", explanation: "Old targeted labels are not general verification-request observations." })],
    ["missing label", JSON.stringify({ explanation: "RAW_MISSING_LABEL_SECRET_MUST_NOT_BE_PRINTED" })],
  ]) {
    await t.test(name, async () => {
      await withServer({ judgeContent: content }, async (baseUrl, requests) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
        assert.notEqual(result.code, 0);
        assertSummary(result.output, 0, 0, 1, 0);
        assert.equal(annotations(requests).length, 0);
        assert.equal(requests.filter((request) => request.url.pathname.endsWith("/chat/completions")).length, 1);
        assert.doesNotMatch(result.output, /RAW_.*SECRET_MUST_NOT_BE_PRINTED|"annotationId"/);
      });
    });
  }
});

test("invalid model JSON midway through a batch preserves prior results and stops the batch", async () => {
  await withServer({
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2), traceRecord(thirdTraceId, 3)]],
    judgeByTrace: { [secondTraceId]: { content: "RAW_MID_BATCH_JSON_SECRET_MUST_NOT_BE_PRINTED" } },
  }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, ["--send-to-judge"]);
    assert.notEqual(result.code, 0);
    assertSummary(result.output, 1, 1, 1, 1);
    assert.equal(annotation(requests).trace_id, traceId);
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/chat/completions")).length, 2);
    assert.doesNotMatch(result.output, /RAW_MID_BATCH_JSON_SECRET_MUST_NOT_BE_PRINTED/);
  });
});

test("general verification-request works with no target config and ignores obsolete SKILL settings", async (t) => {
  for (const overrides of [{}, {
    SKILL_NAME: "IGNORED_OLD_SKILL_NAME",
    SKILL_PATH: "/IGNORED_OLD_SKILL_PATH/SKILL.md",
    SKILL_RULE: "IGNORED_OLD_SKILL_RULE",
  }] as Record<string, string>[]) {
    await t.test(Object.keys(overrides).length ? "obsolete settings ignored" : "settings absent", async () => {
      await withServer({ pages: [verificationSpans] }, async (baseUrl, requests) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"], overrides);
        assert.equal(result.code, 0, result.output);
        const call = requests.find((request) => request.url.pathname.endsWith("/v1/chat/completions"));
        assert.ok(call);
        const prompt = JSON.stringify(call.body.messages);
        assert.doesNotMatch(prompt, /IGNORED_OLD_SKILL/);
        assert.doesNotMatch(JSON.stringify(annotation(requests).metadata), /IGNORED_OLD_SKILL|skillName|skillPath|"rule"/);
        assert.equal(annotation(requests).name, "verification-request");
        assert.equal(annotation(requests).result.score ?? null, null);
      });
    });
  }
  const helper = await readFile(path.join(packageRoot, "lib/llm-judge.ts"), "utf8");
  assert.doesNotMatch(helper, /process\.env\.SKILL_(?:NAME|PATH|RULE)/);
});

test("judge evidence preserves command variations and ambiguous requests without preclassifying them", async () => {
  // These fixtures verify what reaches the judge. The seeded response does not
  // demonstrate that a real model classifies these requests correctly.
  const fixtures = [
    span("bash", { command: "pytest" }),
    span("shell", { cmd: "npm run typecheck" }),
    span("read", { file_path: "/opt/synthetic-project/tests/test_app.py" }),
    span("view", { path: "package.json" }),
    span("bash", { command: "ruff check" }, { "tool.result_type": "failure" }),
    span("bash", { command: "mvn test" }, { "tool.result_type": "denied" }),
    span("bash", { command: "pnpm lint" }, { "tool.result_type": "" }),
    span("bash", "MALFORMED_SYNTHETIC_COMMAND_ARGUMENTS"),
    span("bash", { command: "rg --files tests" }),
    span("bash", { command: "echo 'pnpm test'" }),
    span("view", { path: "README.md", description: "pnpm test mention only" }),
  ].map((fixture, index) => ({
    ...fixture,
    context: { trace_id: traceId, span_id: String(index + 1).padStart(16, "0") },
    attributes: { ...fixture.attributes, "output.value": "PRIVATE_TOOL_RETURN" },
  }));
  await withServer({ pages: [fixtures.slice(0, 4), fixtures.slice(4)], judgeLabel: "CHECK_REQUESTED" }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    const call = requests.find((request) => request.url.pathname.endsWith("/v1/chat/completions"));
    const prompt = call?.body.messages.map((message: any) => message.content).join("\n");
    assert.doesNotMatch(prompt, /PRIVATE_TOOL_RETURN/);
    const evidenceText = prompt.split("Tool requests, in start-time order:\n")[1].split("\n\nReturn only JSON:")[0];
    const evidence = JSON.parse(evidenceText);
    assert.equal(evidence.length, fixtures.length);
    assert.deepEqual(evidence[0].decodedInput, { command: "pytest" });
    assert.deepEqual(evidence[1].decodedInput, { cmd: "npm run typecheck" });
    assert.equal(evidence[2].action, "read_file");
    assert.equal(evidence[2].filePath, "/opt/synthetic-project/tests/test_app.py");
    assert.equal(evidence[3].filePath, path.join(repoRoot, "package.json"));
    assert.equal(evidence[4].resultType, "failure");
    assert.equal(evidence[4].successful, false);
    assert.equal(evidence[5].resultType, "denied");
    assert.equal(evidence[5].successful, false);
    assert.equal(evidence[6].resultType, "");
    assert.equal(evidence[6].successful, false);
    assert.equal(evidence[7].input, "MALFORMED_SYNTHETIC_COMMAND_ARGUMENTS");
    assert.deepEqual(evidence[7].decodedInput, {});
    assert.equal(evidence[8].action, "shell");
    assert.equal(evidence[9].action, "shell");
    assert.equal(evidence[10].filePath, path.join(repoRoot, "README.md"));
    for (const item of evidence) {
      assert.equal(Object.hasOwn(item, "isSkillLoad"), false);
      assert.equal(Object.hasOwn(item, "isVerification"), false);
      assert.equal(Object.hasOwn(item, "output"), false);
      assert.ok(item.spanId && item.startTime && item.endTime);
    }
    assert.equal(annotation(requests).name, "verification-request");
    assert.equal(annotation(requests).result.score ?? null, null);
  });
});

test("CODE summaries still average numeric scores while excluding explicitly unscored results", async () => {
  const source = (await completedTemplate()).replace("  const matches: string[] = [];", `  if (input.traceId === "${thirdTraceId}") return { label: "UNCLEAR", explanation: "Synthetic insufficient evidence" };\n  const matches: string[] = [];`);
  await withServer({
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2), traceRecord(thirdTraceId, 3)]],
    pagesByTrace: {
      [traceId]: [inTrace(traceId, [span("bash", { command: "echo pnpm test" })])],
      [secondTraceId]: [inTrace(secondTraceId, [span("bash", { command: "pnpm test" })])],
      [thirdTraceId]: [inTrace(thirdTraceId, [span("view", { path: "README.md" })])],
    },
  }, async (baseUrl, requests) => {
    const result = await execute("your-eval.ts", baseUrl, [], {}, source);
    assert.equal(result.code, 0, result.output);
    assertSummary(result.output, 3, 3, 0, 0);
    assertMean(result.output, 0.5, 2, 3);
    const results = annotations(requests).map((request) => request.body.data[0].result);
    assert.deepEqual(results.map((item) => item.score ?? null), [0, 1, null]);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/v1/chat/completions")), false);
  });
});

test("internal telemetry and empty tool requests are skipped without a judge call or annotation", async (t) => {
  for (const [name, fixture] of [
    ["internal UNKNOWN event", { ...span("internal-event", "PRIVATE_INTERNAL_TELEMETRY"), span_kind: "UNKNOWN" }],
    ["LLM-only span", { ...span("Agent Stop", "PRIVATE_FINAL_ANSWER"), span_kind: "LLM", parent_id: null }],
    ["missing attributes", { ...span("tool", {}), attributes: undefined }],
    ["empty object", span("tool", {})],
    ["empty array", span("tool", [])],
    ["null arguments", span("tool", null)],
    ["blank arguments", span("tool", "   ")],
    ["JSON empty string", span("tool", '""')],
    ["empty-valued arguments", span("tool", { command: "", options: null, nested: { text: " " } })],
    ["empty path", span("view", { path: "" })],
    ["redacted raw arguments", span("tool", "REDACTED")],
    ["redacted JSON string", span("tool", '"[REDACTED]"')],
    ["redacted argument values", span("tool", { command: "<redacted>", input: { text: "__REDACTED__" }, args: ["***"] })],
    ["redacted path", span("view", { path: "[REDACTED]" })],
    ["redacted fallback path", span("view", {}, { "tool.file_path": "__REDACTED__" })],
  ] as const) {
    await t.test(name, async () => {
      await withServer({ pages: [[fixture]] }, async (baseUrl, requests) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
        assert.equal(result.code, 0, result.output);
        assertSummary(result.output, 0, 0, 0, 0, 1);
        assertMean(result.output, null, 0, 0);
        assert.ok(result.output.includes(`[1/1] ${traceId} SKIPPED: no usable tool requests`));
        assert.equal(requests.filter((request) => request.url.pathname.endsWith("/chat/completions")).length, 0);
        assert.equal(annotations(requests).length, 0);
        assert.doesNotMatch(result.output, /Judge:|PRIVATE_|"annotationId"|NO_CHECK_FOUND=|CHECK_REQUESTED=/);
      });
    });
  }
});

test("mixed redacted and readable evidence stays visible without implying complete coverage", async () => {
  const fixtures = [
    span("shell", "REDACTED"),
    span("shell", { command: "[REDACTED]" }),
    span("shell", { command: "echo 'pnpm test'" }),
  ];
  await withServer({ pages: [fixtures], judgeLabel: "NO_CHECK_FOUND" }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    assertSummary(result.output, 1, 1, 0, 0);
    const call = requests.find(request => request.url.pathname.endsWith("/chat/completions"));
    const prompt = call?.body.messages.map((message: any) => message.content).join("\n");
    assert.match(prompt, /limited to the visible requests, not proof that no check happened/);
    const evidence = JSON.parse(prompt.split("Tool requests, in start-time order:\n")[1].split("\n\nReturn only JSON:")[0]);
    assert.equal(evidence.length, 3, "eligibility does not silently remove redacted records from an otherwise usable trace");
    assert.equal(evidence[0].input, "REDACTED");
    assert.deepEqual(evidence[1].decodedInput, { command: "[REDACTED]" });
    assert.deepEqual(evidence[2].decodedInput, { command: "echo 'pnpm test'" });
    assert.equal(annotation(requests).result.label, "NO_CHECK_FOUND");
    assert.equal(annotation(requests).result.score ?? null, null);
  });
});

test("a batch skips unsuitable traces and evaluates only isolated usable requests", async () => {
  const internal = { ...span("internal-event", "PRIVATE_INTERNAL_TELEMETRY"), span_kind: "UNKNOWN" };
  await withServer({
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2), traceRecord(thirdTraceId, 3)]],
    pagesByTrace: {
      [traceId]: [[internal]],
      [secondTraceId]: [inTrace(secondTraceId, verificationSpans)],
      [thirdTraceId]: [[{ ...span("tool", {}), attributes: undefined }]],
    },
  }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, ["--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    assertSummary(result.output, 1, 1, 0, 0, 2);
    assertMean(result.output, null, 0, 1);
    assert.equal(annotation(requests).trace_id, secondTraceId);
    const calls = requests.filter((request) => request.url.pathname.endsWith("/chat/completions"));
    assert.equal(calls.length, 1);
    assert.doesNotMatch(JSON.stringify(calls[0].body), /PRIVATE_INTERNAL_TELEMETRY/);
    assert.ok(result.output.includes(`[1/3] ${traceId} SKIPPED:`));
    assert.ok(result.output.includes(`[2/3] ${secondTraceId} CHECK_REQUESTED`));
    assert.ok(result.output.includes(`[3/3] ${thirdTraceId} SKIPPED:`));
    assert.doesNotMatch(result.output, /Stopped:/);
  });
});

test("an all-skipped batch needs no judge-capable server and remains a clean no-op", async () => {
  await withServer({
    serverVersion: "19.15.9",
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2)]],
    pages: [[{ ...span("internal-event", "PRIVATE_INTERNAL_TELEMETRY"), span_kind: "UNKNOWN" }]],
  }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, ["--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    assertSummary(result.output, 0, 0, 0, 0, 2);
    assertMean(result.output, null, 0, 0);
    assert.equal(annotations(requests).length, 0);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/chat/completions")), false);
  });
});

test("a later judge failure preserves skipped counts and leaves unprocessed traces untouched", async () => {
  await withServer({
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2), traceRecord(thirdTraceId, 3)]],
    pagesByTrace: { [traceId]: [[span("tool", {})]] },
    judgeByTrace: { [secondTraceId]: { error: true } },
  }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, ["--send-to-judge"]);
    assert.equal(result.code, 1, result.output);
    assertSummary(result.output, 0, 0, 1, 1, 1);
    assertMean(result.output, null, 0, 0);
    assert.equal(annotations(requests).length, 0);
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/chat/completions")).length, 1);
    const reads = requests.filter((request) => request.url.pathname.endsWith("/spans"));
    assert.deepEqual(reads.map((request) => request.url.searchParams.get("trace_id")), [traceId, secondTraceId]);
    assert.match(result.output, new RegExp(`Stopped: ${secondTraceId}`));
  });
});

test("readable requests remain judge-eligible without success metadata or structured JSON", async (t) => {
  for (const [name, fixture] of [
    ["failed request", span("bash", { command: "pytest" }, { "tool.result_type": "failure" })],
    ["denied request", span("bash", { command: "pnpm test" }, { "tool.result_type": "denied" })],
    ["unknown result", span("bash", { command: "npm run typecheck" }, { "tool.result_type": "" })],
    ["plain raw request", span("shell", "mvn test")],
    ["JSON string request", span("shell", '"ruff check"')],
    ["fallback file path", span("read", {}, { "tool.file_path": "README.md" })],
  ] as const) {
    await t.test(name, async () => {
      await withServer({ pages: [[fixture]] }, async (baseUrl, requests) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
        assert.equal(result.code, 0, result.output);
        assertSummary(result.output, 1, 1, 0, 0);
        assert.equal(annotation(requests).name, "verification-request");
        assert.equal(requests.filter((request) => request.url.pathname.endsWith("/chat/completions")).length, 1);
      });
    });
  }
});

test("native SDK assembles split streaming JSON before native label validation and storage", async () => {
  const explanation = 'Synthetic split text: "quoted" path \\tests and café.';
  const content = JSON.stringify({ label: "NO_CHECK_FOUND", explanation });
  // Deliberately split property names and JSON escape sequences across text events.
  const chunks = Array.from(content);
  await withServer({ judgeChunks: chunks }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
    assert.equal(result.code, 0, result.output);
    const calls = requests.filter((request) => request.url.pathname.endsWith("/chat/completions"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.stream, true);
    assert.equal(Object.hasOwn(calls[0].body, "response_format"), false);
    const saved = annotation(requests);
    assert.equal(saved.name, "verification-request");
    assert.equal(saved.result.label, "NO_CHECK_FOUND");
    assert.equal(saved.result.explanation, explanation);
    assert.equal(saved.result.score ?? null, null);
    assertSummary(result.output, 1, 1, 0, 0);
    assertMean(result.output, null, 0, 1);
    assert.doesNotMatch(result.output, /Synthetic split text/);
  });
});

test("stream errors and incomplete finishes never save even plausible result text", async (t) => {
  const failures: StreamFailure[] = ["error", "malformed", "truncated", "length", "content_filter", "tool_calls", "unknown", "empty"];
  for (const failure of failures) {
    await t.test(failure, async () => {
      await withServer({ streamFailure: failure }, async (baseUrl, requests) => {
        const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge"]);
        assert.notEqual(result.code, 0, result.output);
        assertSummary(result.output, 0, 0, 1, 0);
        assert.equal(annotations(requests).length, 0);
        const calls = requests.filter((request) => request.url.pathname.endsWith("/chat/completions"));
        assert.equal(calls.length, 1);
        assert.equal(calls[0].body.stream, true);
        assert.doesNotMatch(result.output, /RAW_.*SECRET_MUST_NOT_BE_PRINTED|"annotationId"|Synthetic judgement seeded/);
      });
    });
  }
});

test("a broken stream midway through a batch retains verified results and skips later traces", async () => {
  await withServer({
    tracePages: [[traceRecord(traceId), traceRecord(secondTraceId, 2), traceRecord(thirdTraceId, 3)]],
    judgeByTrace: { [secondTraceId]: { streamFailure: "error" } },
  }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, ["--send-to-judge", "--verbose"]);
    assert.notEqual(result.code, 0);
    assertSummary(result.output, 1, 1, 1, 1);
    assert.equal(annotation(requests).trace_id, traceId);
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/chat/completions")).length, 2);
    const reads = requests.filter((request) => request.url.pathname.endsWith("/spans"));
    assert.deepEqual(reads.map((request) => request.url.searchParams.get("trace_id")), [traceId, secondTraceId]);
    assert.doesNotMatch(result.output, /RAW_STREAM_ERROR_SECRET_MUST_NOT_BE_PRINTED/);
  });
});

test("oversized streamed judge output is rejected without printing or saving the result", async () => {
  await withServer({ judgeExplanation: "RAW_OVERSIZED_RESULT_SECRET_".repeat(2_400) }, async (baseUrl, requests) => {
    const result = await execute("check-verification.ts", baseUrl, [traceId, "--send-to-judge", "--verbose"]);
    assert.notEqual(result.code, 0, result.output);
    assertSummary(result.output, 0, 0, 1, 0);
    assert.equal(annotations(requests).length, 0);
    assert.equal(requests.filter((request) => request.url.pathname.endsWith("/chat/completions")).length, 1);
    assert.doesNotMatch(result.output, /RAW_OVERSIZED_RESULT_SECRET/);
  });
});

test("HTTP 502 judge failures show safe guidance without provider details in either output mode", async (t) => {
  for (const verbose of [false, true]) {
    await t.test(verbose ? "verbose" : "default", async () => {
      await withServer({ judgeError: true, judgeStatus: 502 }, async (baseUrl, requests) => {
        const args = [traceId, "--send-to-judge", ...(verbose ? ["--verbose"] : [])];
        const result = await execute("check-verification.ts", baseUrl, args);
        assert.notEqual(result.code, 0, result.output);
        assertSummary(result.output, 0, 0, 1, 0);
        assert.match(result.output, /HTTP 502/);
        assert.match(result.output, /Phoenix.*logs/i);
        assert.equal(annotations(requests).length, 0);
        assert.ok(requests.some((request) => request.url.pathname.endsWith("/chat/completions")));
        assert.doesNotMatch(result.output, /RAW_JUDGE_SECRET_MUST_NOT_BE_PRINTED|synthetic-phoenix-api-key|synthetic-direct-provider-key|responseBody|APICallError/);
      });
    });
  }
});


test("simple test-command reads native Copilot arguments and verifies its saved annotation", async () => {
  const native = span("bash", {}, {
    "input.value": undefined,
    "gen_ai.tool.call.arguments": JSON.stringify({ command: "cd '/tmp/task folder' && npm test" }),
    "tool.result_type": undefined,
  });
  await withServer({ pages: [[native]], readbackSecondPage: true }, async (baseUrl, requests) => {
    const result = await execute("test-command.ts", baseUrl);
    assert.equal(result.code, 0, result.output);
    assert.equal(annotation(requests).result.label, "TEST_COMMAND_FOUND");
    assertPaginatedReadback(requests, "simple-test-command");
    assert.equal(requests.some(r => r.url.pathname.endsWith("/chat/completions")), false);
  });
});

test("simple test-command does not mistake mentions or shell text for the check", async () => {
  const mentions = [
    span("view", { command: "npm test", path: "README.md" }),
    span("bash", { command: "echo 'npm test'" }),
    span("bash", { command: "echo 'cd /tmp && npm test'" }),
    span("bash", { command: "# cd /tmp && npm test" }),
    span("bash", { command: "npm test-extra" }),
    span("bash", { command: "cat <<EOF\nnpm test\nEOF" }),
    span("bash", {}),
  ];
  await withServer({ pages: [mentions] }, async (baseUrl, requests) => {
    const result = await execute("test-command.ts", baseUrl);
    assert.equal(result.code, 0, result.output);
    assert.equal(annotation(requests).result.label, "NOT_OBSERVED");
  });
});

test("simple error count uses native status and legacy failure, not absence of success", async () => {
  const nativeError = { ...span("view", {}), status_code: "ERROR" };
  const legacyError = span("bash", {}, { "tool.result_type": "failure" });
  const unknown = span("view", {}, { "tool.result_type": "unknown" });
  const failedTests = span("bash", { command: "npm test" }, {
    "output.value": "6 tests failed; process exited with code 1",
  });
  await withServer({ pages: [[nativeError, legacyError, unknown, failedTests]] }, async (baseUrl, requests) => {
    const result = await execute("tool-errors.ts", baseUrl);
    assert.equal(result.code, 0, result.output);
    assert.equal(annotation(requests).result.label, "ERRORS_RECORDED");
    assert.equal(annotation(requests).result.score, 2);
    assert.doesNotMatch(result.output, /Review trace IDs/);
  });
});

test("both simple examples skip traces with no tool evidence", async () => {
  for (const script of ["test-command.ts", "tool-errors.ts"]) {
    await withServer({ pages: [[{ ...span("auth", {}), span_kind: "UNKNOWN" }]] }, async (baseUrl, requests) => {
      const result = await execute(script, baseUrl);
      assert.equal(result.code, 0, result.output);
      assertSummary(result.output, 0, 0, 0, 0, 1);
      assert.equal(annotations(requests).length, 0);
    });
  }
});

test("simple examples can be imported without starting an evaluation", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    await import('./test-command.ts');
    await import('./tool-errors.ts');
    console.log('Imported without running');
  `], {
    cwd: packageRoot,
    encoding: "utf8",
    timeout: 5_000,
    env: { ...process.env, PHOENIX_PROJECT_NAME: "invalid/project" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "Imported without running");
});
