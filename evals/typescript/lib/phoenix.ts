// Shared transport and trace decoding. Workshop rules stay in the example files.
import { isAbsolute, resolve } from "node:path";
import { createClient, type PhoenixClient, type Types } from "@arizeai/phoenix-client";
import { getSpans } from "@arizeai/phoenix-client/spans";
import { addTraceAnnotation, getTraces } from "@arizeai/phoenix-client/traces";
import type { EvaluationKind, EvaluationResult } from "@arizeai/phoenix-evals";
import { describeError, WorkshopError } from "./errors.ts";
import {
  createReport, finishReport, recordEvaluation, recordVerifiedSave, setReportTotal,
  setTraceStage, startTrace, traceReport, type Report,
} from "./reporting.ts";

export type CheckResult = { label: string; score?: number; explanation: string };
export type ToolCall = {
  name: string;
  action: string;
  filePath?: string;
  input: Record<string, unknown>;
  rawInput: unknown;
  spanId: string;
  startTime: string;
  endTime: string;
  resultType: unknown;
  successful: boolean;
  failed?: boolean;
};
export type Trace = {
  client: PhoenixClient;
  projectName: string;
  traceId: string;
  repoRoot: string;
  spanCount: number;
  agentsPath: string;
  toolCalls: ToolCall[];
  annotationMetadata?: Record<string, unknown>;
  [traceReport]?: Report;
};

type Span = Types["V1"]["components"]["schemas"]["Span"];
type AnnotationPage = { data?: Types["V1"]["components"]["schemas"]["TraceAnnotationsResponseBody"] };
type EvaluatorDescription = { name: string; kind: EvaluationKind };
type Settings = { traceId?: string; projectName: string; repoRoot: string; baseUrl: string; verbose: boolean };

export async function* loadTraces(evaluator = { name: "evaluation" }): AsyncGenerator<Trace> {
  const snapshotEndTime = new Date().toISOString();
  const settings = readSettings();
  const client = createClient({ options: { baseUrl: settings.baseUrl } });
  const report = createReport(evaluator.name, settings.projectName, settings.baseUrl, settings.verbose);
  let completed = false;
  try {
    const traceIds = settings.traceId
      ? [settings.traceId]
      : await snapshotTraceIds(client, settings.projectName, snapshotEndTime).catch(cause => {
        throw new WorkshopError("trace-discovery", { cause });
      });
    setReportTotal(report, traceIds.length);
    if (traceIds.length === 0) {
      console.log(`No traces found in project ${settings.projectName}. No evaluations were run.`);
    }
    // Snapshot IDs first; fetch only one trace's spans at a time.
    for (const traceId of traceIds) {
      startTrace(report, traceId);
      const trace = await loadOneTrace(client, settings, traceId).catch(cause => {
        throw new WorkshopError("trace-load", { cause });
      });
      trace[traceReport] = report;
      setTraceStage(trace, "evaluating");
      yield trace;
    }
    completed = true;
  } finally {
    // A caller's evaluator/save error closes this generator while its trace is active.
    finishReport(report, completed);
  }
}

function readSettings(): Settings {
  let traceId: string | undefined;
  const flags = new Set<string>();
  for (const argument of process.argv.slice(2)) {
    if (["--send-to-judge", "--verbose"].includes(argument) && !flags.has(argument)) {
      flags.add(argument);
      continue;
    }
    if (traceId || !/^[a-f\d]{32}$/i.test(argument)) {
      throw new WorkshopError("arguments");
    }
    traceId = argument;
  }
  const projectName = process.env.PHOENIX_PROJECT_NAME;
  const repoRoot = process.env.REPO_ROOT;
  if (!projectName?.trim() || /[/?#]/.test(projectName)) throw new WorkshopError("project");
  if (!repoRoot || !isAbsolute(repoRoot)) throw new WorkshopError("repo-root");
  const baseUrl = (process.env.PHOENIX_BASE_URL || "http://localhost:6006").replace(/\/+$/, "");
  try {
    const endpoint = new URL(baseUrl);
    if (!["http:", "https:"].includes(endpoint.protocol)) throw new WorkshopError("phoenix-url");
  } catch { throw new WorkshopError("phoenix-url"); }
  return { traceId, projectName, repoRoot, baseUrl, verbose: flags.has("--verbose") };
}

async function snapshotTraceIds(client: PhoenixClient, projectName: string, endTime: string): Promise<string[]> {
  const startsById = new Map<string, number>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    // Phoenix >=13.15.0; includeSpans is deliberately omitted to keep discovery small.
    const page = await getTraces({
      client, project: { projectName }, sort: "start_time", order: "asc", endTime, cursor, limit: 100,
    });
    for (const trace of page.traces) {
      const startTime = Date.parse(trace.start_time);
      if (!/^[a-f\d]{32}$/i.test(trace.trace_id) || !Number.isFinite(startTime)) {
        throw new WorkshopError("trace-discovery-data");
      }
      if (!startsById.has(trace.trace_id)) startsById.set(trace.trace_id, startTime);
    }
    cursor = page.nextCursor || undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new WorkshopError("trace-discovery-pages");
      seenCursors.add(cursor);
    }
  } while (cursor);
  return [...startsById.keys()].sort((first, second) =>
    startsById.get(first)! - startsById.get(second)!);
}

async function loadOneTrace(client: PhoenixClient, settings: Settings, traceId: string): Promise<Trace> {
  const { projectName, repoRoot } = settings;
  const spans: Span[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await getSpans({
      client,
      project: { projectName },
      traceIds: [traceId],
      cursor,
      limit: 100,
    });
    for (const span of page.spans) spans.push(span);
    cursor = page.nextCursor || undefined;
    if (cursor) {
      if (seenCursors.has(cursor)) throw new WorkshopError("trace-pages");
      seenCursors.add(cursor);
    }
  } while (cursor);
  if (spans.length === 0) throw new WorkshopError("trace-empty");

  return {
    client,
    projectName,
    traceId,
    repoRoot,
    spanCount: spans.length,
    agentsPath: resolve(repoRoot, "AGENTS.md"),
    toolCalls: decodeToolCalls(spans, repoRoot),
  };
}

function decodeToolCalls(spans: Span[], repoRoot: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const span of spans) {
    if (span.span_kind !== "TOOL") continue;
    const attributes = asObject(span.attributes);
    const tool = asObject(attributes.tool);
    const nestedInput = asObject(attributes.input);
    const name = String(attributes["tool.name"] ?? tool.name ?? span.name).toLowerCase();
    let action = name;
    if (["view", "read", "read_file", "readfile"].includes(name)) action = "read_file";
    if (["create", "write", "create_file", "write_file"].includes(name)) action = "write_file";
    if (["bash", "shell"].includes(name)) action = "shell";

    const rawInput = attributes["input.value"] ?? nestedInput.value ?? attributes["gen_ai.tool.call.arguments"] ?? null;
    let input: Record<string, unknown> = {};
    try {
      input = asObject(typeof rawInput === "string" ? JSON.parse(rawInput) : rawInput);
    } catch { /* Malformed arguments are not parsed evidence; preserve the raw request. */ }
    const path = input.path ?? input.file_path ?? attributes["tool.file_path"] ?? tool.file_path;
    const resultType = attributes["tool.result_type"] ?? tool.result_type ?? "unknown";
    calls.push({
      name,
      action,
      filePath: typeof path === "string" ? resolve(repoRoot, path) : undefined,
      input,
      rawInput,
      spanId: span.context.span_id,
      startTime: span.start_time,
      endTime: span.end_time,
      resultType,
      successful: resultType === "success" && span.status_code !== "ERROR",
      failed: span.status_code === "ERROR" || ["failure", "error"].includes(String(resultType).toLowerCase()),
    });
  }
  return calls;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export async function saveResult(trace: Trace, evaluator: EvaluatorDescription, result: EvaluationResult) {
  recordEvaluation(trace, result);
  setTraceStage(trace, "saving");
  const saved = await addTraceAnnotation({
    client: trace.client,
    sync: true,
    traceAnnotation: {
      traceId: trace.traceId,
      name: evaluator.name,
      annotatorKind: evaluator.kind,
      ...result,
      metadata: trace.annotationMetadata ? { ...trace.annotationMetadata } : undefined,
    },
  }).catch(cause => { throw new WorkshopError("annotation-save", { cause }); });
  if (!saved) throw new WorkshopError("annotation-id");

  setTraceStage(trace, "verifying");
  let cursor: string | undefined;
  let verified = false;
  const seenCursors = new Set<string>();
  do {
    const response: AnnotationPage = await trace.client.GET("/v1/projects/{project_identifier}/trace_annotations", {
      params: {
        path: { project_identifier: trace.projectName },
        query: { trace_ids: [trace.traceId], include_annotation_names: [evaluator.name], cursor },
      },
    }).catch(cause => { throw new WorkshopError("annotation-readback", { cause }); });
    for (const annotation of response.data?.data ?? []) {
      if (annotation.id === saved.id) verified = true;
    }
    cursor = response.data?.next_cursor || undefined;
    if (cursor && !verified) {
      if (seenCursors.has(cursor)) throw new WorkshopError("annotation-pages");
      seenCursors.add(cursor);
    }
  } while (cursor && !verified);
  if (!verified) throw new WorkshopError("annotation-not-found");

  recordVerifiedSave(trace, saved.id, result);
  return saved.id;
}

export function reportError(error: unknown) {
  console.error(`Batch stopped: ${describeError(error)} Earlier results may remain in Phoenix.`);
  process.exitCode = 1;
}
