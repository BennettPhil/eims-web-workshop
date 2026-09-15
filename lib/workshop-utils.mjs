import { createHash } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function loadConfig() {
  const raw = await fs.readFile(path.join(repoRoot, "workshop.config.json"), "utf8");
  return JSON.parse(raw);
}

export async function getScenario(name) {
  const config = await loadConfig();
  const canonicalName = config.scenarioAliases?.[name] ?? name;
  const scenario = config.scenarios[canonicalName];
  if (!scenario) {
    const choices = [...Object.keys(config.scenarios), ...Object.keys(config.scenarioAliases ?? {})];
    throw new Error(`Unknown scenario '${name}'. Choose: ${choices.join(", ")}`);
  }
  return { ...scenario, name: canonicalName };
}

export function resolveRepoPath(relativePath) {
  const resolved = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository: ${relativePath}`);
  }
  return resolved;
}

export async function copyDirectory(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

function pathIsInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function inspectTree(root, { ignoredNames = new Set() } = {}) {
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    return { files: [], unsafeEntries: [". (workspace root is not a real directory)"] };
  }
  const realRoot = await fs.realpath(root);
  const files = [];
  const unsafeEntries = [];

  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (ignoredNames.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(root, fullPath);
      const stat = await fs.lstat(fullPath);
      if (stat.isSymbolicLink()) {
        unsafeEntries.push(`${relativePath} (symbolic link)`);
        continue;
      }
      if (!stat.isDirectory() && !stat.isFile()) {
        unsafeEntries.push(`${relativePath} (special filesystem entry)`);
        continue;
      }
      const realPath = await fs.realpath(fullPath);
      if (!pathIsInside(realRoot, realPath)) {
        unsafeEntries.push(`${relativePath} (resolved path escapes workspace)`);
        continue;
      }
      if (stat.isDirectory()) await walk(fullPath);
      if (stat.isFile()) files.push(relativePath);
    }
  }

  await walk(root);
  return { files: files.sort(), unsafeEntries: unsafeEntries.sort() };
}

export async function listFiles(root) {
  const inspected = await inspectTree(root, {
    ignoredNames: new Set([".git", ".venv", "node_modules", "runs", "tmp", "dist"]),
  });
  if (inspected.unsafeEntries.length > 0) {
    throw new Error(`Unsafe filesystem entries: ${inspected.unsafeEntries.join(", ")}`);
  }
  return inspected.files;
}

export async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function hashDirectory(root) {
  const hash = createHash("sha256");
  for (const relativePath of await listFiles(root)) {
    hash.update(relativePath);
    for await (const chunk of createReadStream(path.join(root, relativePath))) hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function writeRegularFile(filePath, contents, { append = false } = {}) {
  const parentStat = await fs.lstat(path.dirname(filePath));
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error(`Refusing unsafe evidence directory: ${path.dirname(filePath)}`);
  }
  let existing = null;
  try {
    existing = await fs.lstat(filePath);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1) {
      throw new Error(`Refusing non-regular or multiply linked evidence file: ${path.basename(filePath)}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const flags = fsConstants.O_WRONLY
    | noFollow
    | (append ? fsConstants.O_APPEND : 0)
    | (existing ? 0 : fsConstants.O_CREAT | fsConstants.O_EXCL);
  const handle = await fs.open(filePath, flags, 0o600);
  try {
    const stat = await handle.stat();
    const identityChanged = existing && (existing.dev !== stat.dev || existing.ino !== stat.ino);
    if (!stat.isFile() || stat.nlink !== 1 || identityChanged) {
      throw new Error(`Refusing non-regular or multiply linked evidence file: ${path.basename(filePath)}`);
    }
    if (!append) await handle.truncate(0);
    await handle.writeFile(contents);
  } finally {
    await handle.close();
  }
}

export async function createReviewSnapshot(root, {
  maxFileBytes = 128 * 1024,
  maxTotalTextBytes = 1024 * 1024,
} = {}) {
  const snapshot = {};
  let capturedTextBytes = 0;
  for (const relativePath of await listFiles(root)) {
    const filePath = path.join(root, relativePath);
    const stat = await fs.stat(filePath);
    const digest = await hashFile(filePath);
    if (stat.size > maxFileBytes) {
      snapshot[relativePath] = { kind: "omitted", size: stat.size, digest, reason: "file-size-limit" };
      continue;
    }
    if (capturedTextBytes + stat.size > maxTotalTextBytes) {
      snapshot[relativePath] = { kind: "omitted", size: stat.size, digest, reason: "snapshot-size-limit" };
      continue;
    }
    const contents = await fs.readFile(filePath);
    if (contents.includes(0)) {
      snapshot[relativePath] = { kind: "binary", size: stat.size, digest };
      continue;
    }
    capturedTextBytes += stat.size;
    snapshot[relativePath] = { kind: "text", size: stat.size, digest, text: contents.toString("utf8") };
  }
  return snapshot;
}

function patchLines(value) {
  const normalized = value.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) lines.pop();
  return lines;
}

function patchRange(count) {
  return count === 0 ? "0,0" : `1,${count}`;
}

export function renderReviewPatch(before, after, { maxChars = Number.POSITIVE_INFINITY } = {}) {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const sections = [];
  for (const relativePath of paths) {
    const oldEntry = before[relativePath];
    const newEntry = after[relativePath];
    if (oldEntry?.digest === newEntry?.digest) continue;
    const oldLabel = oldEntry ? `a/${relativePath}` : "/dev/null";
    const newLabel = newEntry ? `b/${relativePath}` : "/dev/null";
    if ((oldEntry && oldEntry.kind !== "text") || (newEntry && newEntry.kind !== "text")) {
      sections.push(`--- ${oldLabel}\n+++ ${newLabel}\nBinary or size-limited file changed: ${relativePath}\n`);
      continue;
    }
    const oldLines = patchLines(oldEntry?.text ?? "");
    const newLines = patchLines(newEntry?.text ?? "");
    const body = [
      ...oldLines.map((line) => `-${line}`),
      ...newLines.map((line) => `+${line}`),
    ].join("\n");
    sections.push(
      `--- ${oldLabel}\n+++ ${newLabel}\n@@ -${patchRange(oldLines.length)} +${patchRange(newLines.length)} @@\n${body}\n`,
    );
  }
  const patch = sections.length ? sections.join("\n") : "No file changes.\n";
  if (!Number.isFinite(maxChars) || patch.length <= maxChars) return patch;
  return `${patch.slice(0, maxChars)}\n[change.patch truncated at ${maxChars} characters]\n`;
}

async function collectTree(source, targetPrefix, output) {
  const stat = await fs.stat(source);
  if (stat.isFile()) {
    output.set(targetPrefix, source);
    return;
  }
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(targetPrefix, entry.name);
    if (entry.isDirectory()) await collectTree(sourcePath, targetPath, output);
    if (entry.isFile()) output.set(targetPath, sourcePath);
  }
}

export async function expectedWorkspaceFiles(mappings) {
  const expected = new Map();
  for (const mapping of mappings) await collectTree(mapping.source, mapping.target, expected);
  return expected;
}

function credentialFinding(relativePath, text) {
  const findings = [];
  if (path.basename(relativePath).startsWith(".env") || /secret|credential/i.test(relativePath)) {
    findings.push(`${relativePath} (credential-shaped path)`);
  }
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s@]+@/i,
    /\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)["']?\s*[:=]\s*["']?(?!\[?redacted\]?|placeholder|example|change[-_ ]?me)[^\s"']{8,}/i,
    /\bAKIA[0-9A-Z]{16}\b/,
  ];
  if (patterns.some((pattern) => pattern.test(text))) findings.push(`${relativePath} (credential-shaped content)`);
  return findings;
}

export async function auditWorkspace({ workspace, expectedFiles, mutablePaths }) {
  const mutable = new Set(mutablePaths);
  let inspected;
  try {
    inspected = await inspectTree(workspace);
  } catch (error) {
    return { passed: false, evidence: `Workspace tree could not be inspected: ${error.message}` };
  }
  const actual = inspected.files;
  const unexpected = actual.filter((relativePath) => !expectedFiles.has(relativePath));
  const missingExpected = [...expectedFiles.keys()].filter((relativePath) => !actual.includes(relativePath));
  const changedProtected = [];
  const credentialFindings = [];
  for (const relativePath of actual) {
    const actualPath = path.join(workspace, relativePath);
    const expectedPath = expectedFiles.get(relativePath);
    if (!expectedPath) continue;
    if (expectedPath && !mutable.has(relativePath)) {
      if (await hashFile(actualPath) !== await hashFile(expectedPath)) changedProtected.push(relativePath);
    }
    const stat = await fs.stat(actualPath);
    if (stat.size > 1024 * 1024) {
      credentialFindings.push(`${relativePath} (file exceeds 1 MiB audit limit)`);
      continue;
    }
    const contents = await fs.readFile(actualPath);
    if (!contents.includes(0)) credentialFindings.push(...credentialFinding(relativePath, contents.toString("utf8")));
  }
  const passed = inspected.unsafeEntries.length === 0
    && unexpected.length === 0
    && missingExpected.length === 0
    && changedProtected.length === 0
    && credentialFindings.length === 0;
  const details = [
    inspected.unsafeEntries.length ? `unsafe entries: ${inspected.unsafeEntries.join(", ")}` : "",
    unexpected.length ? `unexpected: ${unexpected.join(", ")}` : "",
    missingExpected.length ? `missing expected: ${missingExpected.join(", ")}` : "",
    changedProtected.length ? `changed protected: ${changedProtected.join(", ")}` : "",
    credentialFindings.length ? `credentials: ${credentialFindings.join(", ")}` : "",
  ].filter(Boolean);
  return { passed, evidence: passed ? "Allowlist, protected files and credential scan passed" : details.join("; ") };
}

export function timestampId() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

export function redactText(value) {
  return String(value)
    .replace(/-----BEGIN ((?:RSA |EC |OPENSSH )?PRIVATE KEY)-----[\s\S]*?-----END \1-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/("[A-Z0-9_-]*(?:KEY|TOKEN|PASSWORD|SECRET)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[REDACTED]"')
    .replace(/('[A-Z0-9_-]*(?:KEY|TOKEN|PASSWORD|SECRET)'\s*:\s*)'(?:\\.|[^'\\])*'/gi, "$1'[REDACTED]'")
    .replace(/([A-Z0-9_-]*(?:KEY|TOKEN|PASSWORD|SECRET))\s*[=:]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/\S+/gi, "DATABASE_URL=[REDACTED]");
}

export function redactCommand(parts) {
  const redacted = [];
  let redactNext = false;
  for (const part of parts) {
    if (redactNext) {
      redacted.push("[REDACTED]");
      redactNext = false;
      continue;
    }
    if (/^--?(?:api[-_]?key|access[-_]?token|token|password|secret)$/i.test(part)) {
      redacted.push(part);
      redactNext = true;
      continue;
    }
    redacted.push(redactText(part));
  }
  return redacted;
}

export async function createFileManifest(root, { excludePrefixes = [] } = {}) {
  const excluded = excludePrefixes.map((prefix) => path.normalize(prefix).replaceAll("\\", "/").replace(/^\.\//, ""));
  const manifest = {};
  for (const relativePath of await listFiles(root)) {
    const normalized = relativePath.replaceAll("\\", "/");
    if (excluded.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) continue;
    manifest[relativePath] = await hashFile(path.join(root, relativePath));
  }
  return manifest;
}

export function diffFileManifests(before, after) {
  const beforePaths = new Set(Object.keys(before));
  const afterPaths = new Set(Object.keys(after));
  return {
    added: [...afterPaths].filter((item) => !beforePaths.has(item)).sort(),
    modified: [...afterPaths].filter((item) => beforePaths.has(item) && before[item] !== after[item]).sort(),
    deleted: [...beforePaths].filter((item) => !afterPaths.has(item)).sort(),
  };
}

export function moduleUrl(relativePath) {
  return pathToFileURL(resolveRepoPath(relativePath)).href;
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
