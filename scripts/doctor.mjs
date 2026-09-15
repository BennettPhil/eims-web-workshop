import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { javaToolchainCheck } from "../lib/java-toolchain.mjs";
import { listFiles, repoRoot } from "../lib/workshop-utils.mjs";

async function version(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    const chunks = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, output: "timed out" });
    }, 5_000);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", () => finish({ ok: false, output: "not found" }));
    child.on("close", (code) => finish({
      ok: code === 0,
      output: Buffer.concat(chunks).toString().trim().split("\n")[0],
    }));
  });
}

export function supportedWorkshopNode(version) {
  const [major, minor] = version.replace(/^v/, "").split(".").map(Number);
  return major === 24 && minor >= 11;
}

// Default checks cover the current coding workshop. Legacy checks are opt-in.
export async function collectDoctorChecks({
  legacy = false,
  nodeVersion = process.versions.node,
  runVersion = version,
} = {}) {
  const checks = [{
    name: "Node.js 24.11+ LTS",
    ok: supportedWorkshopNode(nodeVersion),
    detail: nodeVersion,
  }];
  const docker = await runVersion("docker", ["version", "--format", "{{.Server.Version}}"]);
  checks.push({
    name: "Docker engine",
    ok: docker.ok,
    detail: docker.ok ? `server ${docker.output}` : `${docker.output}; start Docker before the Phoenix exercise`,
  });
  const copilot = await runVersion("copilot", ["--version"]);
  const copilotVersion = copilot.output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] ?? "";
  checks.push({
    name: legacy ? "Legacy pinned GitHub Copilot CLI" : "GitHub Copilot CLI",
    ok: copilot.ok && (!legacy || copilotVersion === "1.0.80"),
    detail: legacy && copilot.ok ? `v${copilotVersion || "unknown"}; expected v1.0.80` : copilot.output,
  });
  if (!legacy) return checks;

  // Historical Billing/fixture delivery checks. These are not current workshop prerequisites.
  const python = await runVersion("python3", ["--version"]);
  const pythonVersion = python.output.match(/\b(\d+)\.(\d+)(?:\.\d+)?\b/);
  const pythonMajor = Number(pythonVersion?.[1] ?? 0);
  const pythonMinor = Number(pythonVersion?.[2] ?? 0);
  checks.push({
    name: "Python 3.10–3.14",
    ok: python.ok && pythonMajor === 3 && pythonMinor >= 10 && pythonMinor <= 14,
    detail: python.ok ? python.output : "not found",
  });
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  const slidev = await fs.readFile(path.join(repoRoot, "node_modules/@slidev/cli/package.json"), "utf8")
    .then((contents) => JSON.parse(contents)).catch(() => null);
  checks.push({
    name: "Pinned Slidev runtime",
    ok: slidev?.version === packageJson.devDependencies["@slidev/cli"],
    detail: slidev ? `v${slidev.version}` : "not installed; run npm ci",
  });
  let chromiumPath = "";
  try {
    const { chromium } = await import("playwright-chromium");
    const executable = chromium.executablePath();
    await fs.access(executable);
    chromiumPath = executable;
  } catch {}
  checks.push({
    name: "Chromium exporter runtime",
    ok: Boolean(chromiumPath),
    detail: chromiumPath ? path.basename(chromiumPath) : "not available; run npm ci",
  });
  const java = await runVersion("java", ["-version"]);
  const javac = await runVersion("javac", ["-version"]);
  checks.push(javaToolchainCheck({ java, javac }));
  const envFiles = (await listFiles(repoRoot)).filter((relativePath) =>
    path.basename(relativePath).startsWith(".env") && path.basename(relativePath) !== ".env.example");
  checks.push({
    name: "Legacy shareable-kit check: no local .env files",
    ok: envFiles.length === 0,
    detail: envFiles.length ? "Local configuration exists; exclude it from any shared kit. This is expected for current local evals." : "only placeholder .env.example files may be shared",
  });
  return checks;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--legacy")) {
    throw new Error("Usage: npm run doctor [-- --legacy]");
  }
  const legacy = args.includes("--legacy");
  console.log(legacy ? "Legacy Billing and fixture checks" : "Coding workshop setup");
  const checks = await collectDoctorChecks({ legacy });
  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
