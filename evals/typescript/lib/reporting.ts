// Terminal bookkeeping only. Evaluation still happens in the learner's native evaluator.
import type { EvaluationResult } from "@arizeai/phoenix-evals";

export const traceReport = Symbol("traceReport");
export type Report = {
  name: string; projectName: string; phoenixURL: string; verbose: boolean;
  total?: number; attempted: number; evaluated: number; saved: number; skipped: number;
  scoreSum: number; scored: number; labels: Map<string, number>; review: string[];
  active?: { traceId: string; stage: string }; printed: boolean;
};
type ReportedTrace = { traceId: string; [traceReport]?: Report };

export function createReport(name: string, projectName: string, baseURL: string, verbose: boolean): Report {
  const url = new URL(baseURL);
  url.username = ""; url.password = ""; url.search = ""; url.hash = "";
  return { name, projectName, phoenixURL: url.toString(), verbose,
    attempted: 0, evaluated: 0, saved: 0, skipped: 0, scoreSum: 0, scored: 0,
    labels: new Map(), review: [], printed: false };
}

export function setReportTotal(report: Report, total: number) {
  report.total = total;
  console.log(`${display(report.name)} | project ${display(report.projectName)} | ${total} trace(s)`);
}

export function startTrace(report: Report, traceId: string) {
  report.attempted++;
  report.active = { traceId, stage: "loading" };
}

export function setTraceStage(trace: ReportedTrace, stage: string) {
  const active = trace[traceReport]?.active;
  if (active) active.stage = stage;
}

export function recordSkipped(trace: ReportedTrace) {
  const report = trace[traceReport];
  if (!report) return;
  report.skipped++;
  console.log(`[${report.attempted}/${report.total}] ${trace.traceId} SKIPPED: no usable tool requests`);
  report.active = undefined;
}

export function recordEvaluation(trace: ReportedTrace, result: EvaluationResult) {
  const report = trace[traceReport];
  if (!report) return;
  report.evaluated++;
  if (typeof result.label === "string") {
    report.labels.set(result.label, (report.labels.get(result.label) ?? 0) + 1);
  }
  const scored = typeof result.score === "number" && Number.isFinite(result.score);
  if (scored) { report.scoreSum += result.score!; report.scored++; }
  if ((!scored || result.score! <= 0) && report.review.length < 5) report.review.push(trace.traceId);
}

export function recordVerifiedSave(
  trace: ReportedTrace & { spanCount: number; toolCalls: unknown[] },
  annotationId: string,
  result: EvaluationResult,
) {
  const report = trace[traceReport];
  if (report) report.saved++;
  if (!report || report.verbose) {
    console.log(JSON.stringify({ traceId: trace.traceId, spans: trace.spanCount,
      tools: trace.toolCalls.length, annotationId, ...result }, null, 2));
  } else {
    const score = typeof result.score === "number" && Number.isFinite(result.score) ? result.score : "unscored";
    console.log(`[${report.attempted}/${report.total}] ${trace.traceId} ${display(result.label ?? "NO_LABEL")} score=${score} saved`);
  }
  if (report) report.active = undefined;
}

export function finishReport(report: Report, completed: boolean) {
  if (report.printed) return;
  report.printed = true;
  const unprocessed = report.total === undefined ? "unknown" : Math.max(0, report.total - report.attempted);
  console.log(`Summary: ${display(report.name)} | project ${display(report.projectName)}`);
  console.log(`Evaluated: ${report.evaluated} | Saved (verified): ${report.saved} | Skipped: ${report.skipped} | Errors: ${completed ? 0 : 1} | Unprocessed: ${unprocessed}`);
  const labelCounts = [];
  for (const [label, count] of report.labels) labelCounts.push(`${display(label)}=${count}`);
  console.log(`Labels (evaluated): ${labelCounts.join(", ") || "none"}`);
  const mean = report.scored ? Number((report.scoreSum / report.scored).toFixed(3)) : "not available";
  console.log(`Mean score (evaluated): ${mean} (${report.scored}/${report.evaluated} scored)`);
  if (report.review.length) console.log(`Review trace IDs: ${report.review.join(", ")}`);
  if (!completed) console.log(`Stopped: ${report.active?.traceId ?? "trace discovery"} (${report.active?.stage ?? "loading"})`);
  console.log(`Phoenix: ${report.phoenixURL}`);
}

function display(value: string) {
  return value.replace(/[\r\n\t\x00-\x1f\x7f]/g, " ");
}
