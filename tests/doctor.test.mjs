import assert from "node:assert/strict";
import test from "node:test";
import { javaMajor, javaToolchainCheck } from "../lib/java-toolchain.mjs";
import { collectDoctorChecks, main, supportedWorkshopNode } from "../scripts/doctor.mjs";

test("the current workshop requires Node 24.11+ LTS", () => {
  assert.equal(supportedWorkshopNode("24.11.0"), true);
  assert.equal(supportedWorkshopNode("v24.13.0"), true);
  for (const version of ["22.18.0", "23.9.0", "24.10.0", "25.0.0", "unknown"]) {
    assert.equal(supportedWorkshopNode(version), false, version);
  }
});

test("default doctor checks only the current Node, Docker and Copilot setup", async () => {
  const commands = [];
  const checks = await collectDoctorChecks({
    nodeVersion: "24.13.0",
    runVersion: async (command) => {
      commands.push(command);
      return { ok: true, output: command === "copilot" ? "GitHub Copilot CLI 2.1.0" : "29.0.0" };
    },
  });
  assert.deepEqual(commands, ["docker", "copilot"]);
  assert.equal(checks.length, 3);
  assert.ok(checks.every((check) => check.ok));
  assert.doesNotMatch(JSON.stringify(checks), /Python|Java|\.env|1\.0\.80/);
});

test("default doctor reports missing Docker and Copilot without requiring the legacy version", async () => {
  const checks = await collectDoctorChecks({
    nodeVersion: "24.13.0",
    runVersion: async () => ({ ok: false, output: "not found" }),
  });
  assert.equal(checks[0].ok, true);
  assert.equal(checks[1].ok, false);
  assert.equal(checks[2].ok, false);
});

test("doctor rejects unknown and duplicate flags before checking the machine", async () => {
  await assert.rejects(main(["--billing"]), /Usage:/);
  await assert.rejects(main(["--legacy", "--legacy"]), /Usage:/);
});

test("Java version parsing supports modern and legacy version formats", () => {
  assert.equal(javaMajor('openjdk version "21.0.8" 2025-07-15 LTS'), 21);
  assert.equal(javaMajor('java version "1.8.0_451"'), 8);
  assert.equal(javaMajor("javac 17.0.12"), 17);
});

test("doctor rejects javac newer than the Java runtime", () => {
  const result = javaToolchainCheck({
    java: { ok: true, output: 'openjdk version "17.0.12"' },
    javac: { ok: true, output: "javac 21.0.8" },
  });
  assert.equal(result.ok, false);
  assert.match(result.detail, /javac major 21 exceeds runtime major 17/i);
});

test("doctor accepts an older supported compiler on a newer runtime", () => {
  const result = javaToolchainCheck({
    java: { ok: true, output: 'openjdk version "21.0.8"' },
    javac: { ok: true, output: "javac 17.0.12" },
  });
  assert.equal(result.ok, true);
});
