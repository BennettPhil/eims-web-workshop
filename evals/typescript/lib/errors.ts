// Safe diagnostics only: never print provider messages, bodies, headers, URLs or trace content.
const descriptions = {
  arguments: "Invalid command arguments. Use zero or one 32-character TRACE_ID and only --send-to-judge / --verbose, without duplicate flags.",
  project: "Set PHOENIX_PROJECT_NAME to a non-empty project name without /, ? or #.",
  "repo-root": "Set REPO_ROOT to the absolute path of the repository.",
  "phoenix-url": "Set PHOENIX_BASE_URL to a valid HTTP or HTTPS Phoenix base URL.",
  "trace-discovery": "Could not list the project's traces.",
  "trace-discovery-data": "Phoenix returned an invalid trace ID or start time during trace discovery.",
  "trace-discovery-pages": "Trace discovery repeated a page cursor. No further pages were requested.",
  "trace-load": "Could not load the selected trace's spans.",
  "trace-empty": "No spans were found for this trace in PHOENIX_PROJECT_NAME. Check the project and TRACE_ID.",
  "trace-pages": "Loading the trace repeated a page cursor. Incomplete evidence was not evaluated.",
  "annotation-save": "Could not save the evaluation annotation in Phoenix.",
  "annotation-id": "Phoenix did not return an annotation ID. The save could not be verified.",
  "annotation-readback": "Could not read back the saved annotation. It may exist in Phoenix; inspect it before retrying.",
  "annotation-not-found": "The saved annotation was not found during readback. It may exist in Phoenix; inspect it before retrying.",
  "annotation-pages": "Annotation readback repeated a page cursor. The save was not verified.",
  "judge-model": "Set PHOENIX_JUDGE_MODEL to a supported built-in provider:model selector and configure that provider in Phoenix.",
  "judge-credentials": "Phoenix has no OpenAI provider key. Store OPENAI_API_KEY in Phoenix Secrets, then retry one trace.",
  "judge-version": "The Phoenix judge requires server >=19.16.0. Check Phoenix connectivity and version.",
  "judge-evidence": "This trace's tool evidence exceeds 60,000 characters. Use a smaller completed trace; this trace was not sent to the judge.",
  "judge-stream": "The judge stream failed, was incomplete or used an unsupported format.",
  "judge-empty": "The judge completed without a usable text answer.",
  "judge-truncated": "The judge did not finish normally; its answer may be truncated or filtered. No evaluation was saved for this trace.",
  "judge-output-size": "The judge answer exceeded the 60,000-character limit. No evaluation was saved for this trace.",
  "judge-timeout": "The judge request timed out. Check Phoenix and the model provider before retrying.",
  "participant-todo": "Complete the TODO in your-eval.ts before running it. No placeholder result was saved.",
} as const;

export type WorkshopErrorCode = keyof typeof descriptions;

export class WorkshopError extends Error {
  readonly code: WorkshopErrorCode;
  constructor(code: WorkshopErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = "WorkshopError";
    this.code = code;
  }
}

// Exact legacy messages are converted to fixed guidance, never copied into the output.
const legacyCodes = new Map<string, WorkshopErrorCode>([
  ["Invalid Phoenix judge model", "judge-model"],
  ["Phoenix judge capability unavailable", "judge-version"],
  ["Judge evidence is oversized", "judge-evidence"],
  ["TODO: implement your own rule before saving any result", "participant-todo"],
]);

function property(value: unknown, key: string): unknown {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") return undefined;
  try { return Reflect.get(value, key); } catch { return undefined; }
}

function errorChain(error: unknown): unknown[] {
  const pending = [error];
  const seen = new Set<unknown>();
  const chain: unknown[] = [];
  for (let index = 0; index < pending.length && chain.length < 8; index++) {
    const current = pending[index];
    if (current == null || seen.has(current)) continue;
    seen.add(current);
    chain.push(current);
    pending.push(property(current, "cause"), property(current, "lastError"));
  }
  return chain;
}

function httpReason(status: number): string {
  const reasons: Record<number, string> = {
    400: "Request rejected. Check Phoenix's server logs for the configuration or parameter error.",
    401: "Authentication rejected. Check Phoenix access or the model provider credentials saved in Phoenix.",
    403: "Access denied. Check Phoenix permissions and the model provider's API/model permissions.",
    404: "Requested resource or model was not found. Check the Phoenix project, endpoint and selected model.",
    408: "The request timed out. Check Phoenix and the model provider before retrying.",
    422: "The request did not match Phoenix's expected format. Check the installed versions and request configuration.",
    429: "A rate or quota limit was reached. Check the provider's quota/billing and rate limits before retrying.",
    502: "Phoenix or an upstream gateway could not complete the provider request. Check Phoenix's server logs for the underlying cause.",
    504: "A gateway or upstream request timed out. Check Phoenix's server logs before retrying.",
  };
  return `HTTP ${status}: ${reasons[status] ?? (status >= 500
    ? "Phoenix or its model provider reported a server error. Check Phoenix's server logs."
    : "The request failed. Check Phoenix's server logs.")}`;
}

function sdkReason(chain: unknown[]): string | undefined {
  const missingKeyMessage = "An API key is required for OpenAI models. Set the OPENAI_API_KEY environment variable or store it in Phoenix secrets.";
  for (const error of chain) {
    if (property(error, "message") === missingKeyMessage) return descriptions["judge-credentials"];
    // One known server error only. Never include parsed data or arbitrary response text in output.
    const body = property(error, "name") === "AI_APICallError" ? property(error, "responseBody") : undefined;
    if (typeof body === "string" && body.length <= 4_096) {
      try {
        if (property(property(JSON.parse(body), "error"), "message") === missingKeyMessage) {
          return descriptions["judge-credentials"];
        }
      } catch { /* Unrecognized response bodies remain private. */ }
    }
  }
  for (const error of chain) {
    const status = property(error, "statusCode") ?? property(error, "status");
    if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) return httpReason(status);
  }
  const names = chain.map(error => property(error, "name"));
  const codes = chain.map(error => property(error, "code"));
  if (names.includes("TimeoutError") || names.includes("APITimeoutError")
    || codes.some(code => typeof code === "string" && ["ETIMEDOUT", "ESOCKETTIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(code))) {
    return "The request timed out. Check Phoenix and the model provider before retrying.";
  }
  if (names.includes("AI_NoObjectGeneratedError")) return "The judge returned no usable JSON answer matching the allowed label and explanation schema.";
  if (names.includes("AI_JSONParseError")) return "The judge response was not valid JSON.";
  if (names.includes("AI_TypeValidationError")) return "The model response did not match the expected JSON schema.";
  if (names.includes("AI_UnsupportedModelVersionError")) return "The judge model is incompatible with the AI SDK. Reinstall the pinned dependencies.";
  if (names.includes("AI_InvalidPromptError")) return "The evaluator prompt is invalid. Check the prompt definition in check-verification.ts.";
  if (names.includes("AbortError")) return "The request was cancelled before it completed.";
  if (codes.some(code => typeof code === "string" && ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code))) {
    return "Could not connect to Phoenix or its model provider. Check the address, network and TLS configuration.";
  }
  if (names.includes("AI_APICallError")) return "The judge request could not be completed. Check Phoenix connectivity and its server logs.";
  return undefined;
}

export function describeError(error: unknown): string {
  const chain = errorChain(error);
  let local: string | undefined;
  for (const item of chain) {
    const code = property(item, "code");
    if (property(item, "name") === "WorkshopError" && typeof code === "string" && Object.hasOwn(descriptions, code)) {
      local = descriptions[code as WorkshopErrorCode];
      continue;
    }
    const message = property(item, "message");
    const legacy = typeof message === "string" ? legacyCodes.get(message) : undefined;
    if (legacy) local = descriptions[legacy];
  }
  const reason = sdkReason(chain);
  return [local, reason].filter(Boolean).join(" ")
    || "The evaluation failed for an unclassified reason. Check Phoenix's server logs; raw error details are hidden to protect trace data and credentials.";
}
