// Start Copilot with its built-in OpenTelemetry exporter pointed at local Phoenix.
// Settings apply to this child process only. No hook installation or global edits.
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";

const [directory, ...copilotArguments] = process.argv.slice(2);
if (!directory || !statSync(resolve(directory), { throwIfNoEntry: false })?.isDirectory()) {
  console.error("Usage: npm run copilot:traced -- /path/to/task-repository [Copilot options]");
  process.exit(1);
}

const endpoint = "http://127.0.0.1:6006";
console.log(`Copilot traces → ${endpoint} | project ai_workshop | prompts and tool content enabled`);
const child = spawn("copilot", copilotArguments, {
  cwd: resolve(directory),
  stdio: "inherit",
  env: {
    ...process.env,
    COPILOT_OTEL_ENABLED: "true",
    COPILOT_OTEL_EXPORTER_TYPE: "otlp-http",
    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${endpoint}/v1/traces`,
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
    OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/protobuf",
    OTEL_RESOURCE_ATTRIBUTES: "openinference.project.name=ai_workshop",
    OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: "true",
  },
});
child.on("error", () => {
  console.error("Could not start Copilot. Check that copilot --version works in this terminal.");
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
