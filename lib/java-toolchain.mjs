export function javaMajor(output) {
  const match = String(output).match(/(?:version\s+)?"?(\d+)(?:\.(\d+))?/i);
  if (!match) return 0;
  return Number(match[1]) === 1 ? Number(match[2] ?? 0) : Number(match[1]);
}

export function javaToolchainCheck({ java, javac, minimumMajor = 17 }) {
  const runtimeMajor = java.ok ? javaMajor(java.output) : 0;
  const compilerMajor = javac.ok ? javaMajor(javac.output) : 0;
  const compilerRunsOnRuntime = runtimeMajor > 0 && compilerMajor > 0 && compilerMajor <= runtimeMajor;
  const detailSuffix = compilerMajor > runtimeMajor && runtimeMajor > 0
    ? `; javac major ${compilerMajor} exceeds runtime major ${runtimeMajor}`
    : "";
  return {
    name: `Java JDK ${minimumMajor}+ (Java fallback)`,
    ok: java.ok
      && javac.ok
      && runtimeMajor >= minimumMajor
      && compilerMajor >= minimumMajor
      && compilerRunsOnRuntime,
    detail: `${java.output}; ${javac.output}${detailSuffix}`,
  };
}
