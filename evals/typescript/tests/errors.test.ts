import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "@arizeai/phoenix-client";
import { describeError, WorkshopError, type WorkshopErrorCode } from "../lib/errors.ts";
import { reportError } from "../lib/phoenix.ts";

const privateText = "PRIVATE_TRACE_AND_KEY_SENTINEL";
const missingKeyMessage = "An API key is required for OpenAI models. Set the OPENAI_API_KEY environment variable or store it in Phoenix secrets.";

test("local diagnostic codes provide specific, fixed guidance", async (t) => {
  const cases: Array<[WorkshopErrorCode, RegExp]> = [
    ["arguments", /32-character TRACE_ID/], ["project", /PHOENIX_PROJECT_NAME/],
    ["repo-root", /absolute path/], ["phoenix-url", /HTTP or HTTPS/],
    ["trace-discovery-data", /invalid trace ID or start time/],
    ["trace-discovery-pages", /repeated a page cursor/], ["trace-pages", /Incomplete evidence/],
    ["trace-empty", /No spans were found/], ["annotation-id", /did not return an annotation ID/],
    ["annotation-not-found", /not found during readback/], ["annotation-pages", /save was not verified/],
    ["judge-model", /PHOENIX_JUDGE_MODEL/], ["judge-version", />=19\.16\.0/],
    ["judge-evidence", /60,000 characters/], ["judge-stream", /stream failed/],
    ["judge-empty", /without a usable text answer/], ["judge-truncated", /truncated or filtered/],
    ["judge-output-size", /60,000-character limit/], ["judge-timeout", /timed out/],
    ["participant-todo", /Complete the TODO/],
  ];
  for (const [code, expected] of cases) {
    await t.test(code, () => assert.match(describeError(new WorkshopError(code)), expected));
  }
});

test("specific local causes survive trace-loading context", () => {
  assert.match(describeError(new WorkshopError("trace-load", {
    cause: new WorkshopError("trace-empty"),
  })), /No spans were found/);
});

test("HTTP categories retain status without copying API data", async (t) => {
  const cases: Array<[number, RegExp]> = [
    [400, /Request rejected/], [401, /Authentication rejected/], [403, /Access denied/],
    [404, /not found/], [408, /timed out/], [422, /expected format/],
    [429, /rate or quota limit/], [500, /server error/],
    [502, /could not complete/], [503, /server error/], [504, /timed out/],
  ];
  for (const [statusCode, expected] of cases) {
    await t.test(String(statusCode), () => {
      const output = describeError({
        name: "AI_APICallError", statusCode, message: privateText,
        requestBodyValues: privateText, responseBody: privateText,
        responseHeaders: { authorization: privateText }, url: privateText, stack: privateText,
      });
      assert.match(output, new RegExp(`HTTP ${statusCode}:`));
      assert.match(output, expected);
      assert.ok(!output.includes(privateText));
    });
  }
});

test("native Phoenix HttpError preserves saving/readback context", () => {
  const error = new HttpError(new Response(privateText, { status: 403, statusText: privateText }));
  for (const code of ["trace-discovery", "trace-load", "annotation-save", "annotation-readback"] as const) {
    const output = describeError(new WorkshopError(code, { cause: error }));
    assert.match(output, /Could not/);
    assert.match(output, /HTTP 403: Access denied/);
    assert.ok(!output.includes(privateText));
  }
});

test("exact missing-provider credential error gives actionable guidance", () => {
  const messageOutput = describeError({ name: "AI_APICallError", statusCode: 400, message: missingKeyMessage });
  const bodyOutput = describeError({
    name: "AI_APICallError", statusCode: 400, message: privateText,
    responseBody: JSON.stringify({ error: { message: missingKeyMessage }, private: privateText }),
  });
  for (const output of [messageOutput, bodyOutput]) {
    assert.match(output, /Phoenix has no OpenAI provider key/);
    assert.match(output, /OPENAI_API_KEY in Phoenix Secrets/);
    assert.ok(!output.includes(privateText));
  }
});

test("missing-key matching is exact, bounded and never echoes the response", () => {
  for (const responseBody of [
    JSON.stringify({ error: { message: missingKeyMessage + privateText } }),
    JSON.stringify({ error: { message: missingKeyMessage }, padding: "x".repeat(4_096) }),
    privateText,
  ]) {
    const output = describeError({ name: "AI_APICallError", statusCode: 400, responseBody });
    assert.match(output, /HTTP 400/);
    assert.doesNotMatch(output, /Phoenix has no OpenAI provider key/);
    assert.ok(!output.includes(privateText));
  }
});

test("SDK JSON, model, prompt, cancellation and connection categories are fixed", async (t) => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ name: "AI_NoObjectGeneratedError", text: privateText }, /allowed label and explanation schema/],
    [{ name: "AI_JSONParseError", text: privateText }, /not valid JSON/],
    [{ name: "AI_TypeValidationError", value: privateText }, /expected JSON schema/],
    [{ name: "AI_UnsupportedModelVersionError" }, /Reinstall the pinned dependencies/],
    [{ name: "AI_InvalidPromptError" }, /prompt is invalid/],
    [{ name: "TimeoutError" }, /timed out/], [{ code: "UND_ERR_CONNECT_TIMEOUT" }, /timed out/],
    [{ name: "AbortError" }, /cancelled/], [{ code: "ECONNREFUSED" }, /Could not connect/],
    [{ name: "AI_APICallError" }, /request could not be completed/],
  ];
  for (const [error, expected] of cases) {
    await t.test(String(error.name ?? error.code), () => {
      const output = describeError({ ...error, message: privateText, stack: privateText, response: privateText });
      assert.match(output, expected);
      assert.ok(!output.includes(privateText));
    });
  }
});

test("bounded cause/lastError traversal handles cycles and retries", () => {
  const outer: Record<string, unknown> = { name: "AI_RetryError", message: privateText };
  const inner = { name: "AI_APICallError", statusCode: 429, cause: outer };
  outer.cause = outer;
  outer.lastError = inner;
  assert.match(describeError(outer), /HTTP 429/);

  let deep: unknown = { statusCode: 401, message: privateText };
  for (let depth = 0; depth < 20; depth++) deep = { cause: deep };
  assert.doesNotMatch(describeError(deep), /HTTP 401/);
  assert.match(describeError(deep), /unclassified reason/);
});

test("hostile values cannot leak text, invoke toString or break reporting", () => {
  const hostile = new Proxy({}, { get() { throw new Error(privateText); } });
  assert.match(describeError(hostile), /unclassified reason/);
  const code = { toString() { throw new Error("must not stringify arbitrary values"); } };
  assert.match(describeError({ code, name: privateText, message: privateText }), /unclassified reason/);
  for (const value of [privateText, null, undefined, 123, { statusCode: privateText }, { statusCode: Infinity }]) {
    assert.ok(!describeError(value).includes(privateText));
  }
});

test("known TODO guidance is exact; arbitrary messages stay private", () => {
  assert.match(describeError(new Error("TODO: implement your own rule before saving any result")), /Complete the TODO/);
  assert.match(describeError(new Error("TODO: implement your own rule before saving any result " + privateText)), /unclassified reason/);
});

test("reportError keeps exit status 1 and safe diagnostics even with --verbose", () => {
  const originalConsole = console.error;
  const originalExitCode = process.exitCode;
  const originalArgs = process.argv;
  const lines: string[] = [];
  try {
    console.error = value => { lines.push(String(value)); };
    process.argv = [...originalArgs, "--verbose"];
    reportError({ name: "AI_APICallError", statusCode: 502, message: privateText, responseBody: privateText });
    assert.equal(process.exitCode, 1);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^Batch stopped: HTTP 502:/);
    assert.match(lines[0], /Earlier results may remain in Phoenix/);
    assert.ok(!lines[0].includes(privateText));
  } finally {
    console.error = originalConsole;
    process.exitCode = originalExitCode;
    process.argv = originalArgs;
  }
});
