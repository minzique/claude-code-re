#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Classification = "ok" | "extra_usage" | "overloaded" | "other" | "captured";

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  classification: Classification;
}

interface CheckSummary {
  timestamp: string;
  cliPath: string;
  checks: Array<Record<string, unknown>>;
}

const ROOT = dirname(import.meta.dir);
const ARTIFACTS_DIR = join(ROOT, "monitor", "request-shape", "artifacts");
const CAPTURE_SERVER_PATH = join(ROOT, "monitor", "capture-request-shape.ts");
const PROBE_EXTENSION_PATH = join(ROOT, "monitor", "request-shape", "probe-extension.ts");
const DEFAULT_CLI = process.env.PI_OAUTH_CHECK_CLI ?? "pi";
const DEFAULT_MODEL = process.env.PI_OAUTH_CHECK_MODEL ?? "claude-sonnet-4-6";
const MAX_REAL_ATTEMPTS = Number(process.env.PI_OAUTH_CHECK_ATTEMPTS ?? "5");
const RESULT_FILE = join(ARTIFACTS_DIR, "extension-adapter-check.json");

mkdirSync(ARTIFACTS_DIR, { recursive: true });

function classify(output: string): Classification {
  if (output.includes("You're out of extra usage")) return "extra_usage";
  if (output.includes("Overloaded") || output.includes("overloaded_error")) return "overloaded";
  if (/\bok\b/.test(output)) return "ok";
  if (output.includes("capture")) return "captured";
  return "other";
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function spawnAndCollect(args: string[], env: Record<string, string | undefined>): Promise<RunResult> {
  const proc = Bun.spawn(["bash", "-lc", args.map(shellEscape).join(" ")], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    stdout,
    stderr,
    exitCode,
    classification: classify(`${stdout}\n${stderr}`),
  };
}

async function withCaptureServer<T>(
  logFile: string,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  rmSync(logFile, { force: true });
  const port = 20000 + Math.floor(Math.random() * 10000);
  const server = Bun.spawn(["bun", "run", CAPTURE_SERVER_PATH, "--log", logFile, "--port", String(port)], {
    cwd: ROOT,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    await Bun.sleep(750);
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.kill();
    await server.exited;
  }
}

function readCapturedRequest(logFile: string): Record<string, unknown> {
  if (!existsSync(logFile)) throw new Error(`Missing capture log: ${logFile}`);
  const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
  const post = [...lines]
    .map((line) => JSON.parse(line) as Record<string, string>)
    .reverse()
    .find((entry) => entry.method === "POST");
  if (!post) throw new Error(`No POST request found in ${logFile}`);
  return {
    path: post.path,
    headers: post.headers,
    body: JSON.parse(String(post.body)),
  };
}

function buildCliArgs(prompt: string, extraArgs: string[] = []): string[] {
  const cliPrefix = DEFAULT_CLI.endsWith('.js') ? ["node", DEFAULT_CLI] : [DEFAULT_CLI];
  return [
    ...cliPrefix,
    "--provider",
    "anthropic",
    "--model",
    DEFAULT_MODEL,
    "--thinking",
    "off",
    "--no-session",
    ...extraArgs,
    "-p",
    prompt,
  ];
}

async function runRealWithRetries(prompt: string, env: Record<string, string | undefined>, extraArgs: string[] = []) {
  const attempts: RunResult[] = [];
  for (let attempt = 1; attempt <= MAX_REAL_ATTEMPTS; attempt++) {
    const result = await spawnAndCollect(buildCliArgs(prompt, extraArgs), env);
    attempts.push(result);
    if (result.classification !== "overloaded") {
      return { result, attempts, inconclusive: false };
    }
  }
  return {
    result: attempts.at(-1) ?? { stdout: "", stderr: "", exitCode: 1, classification: "other" as const },
    attempts,
    inconclusive: true,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const checks: Array<Record<string, unknown>> = [];

const stripOnly = await runRealWithRetries("Reply with exactly: ok", {
  PI_CLAUDE_OAUTH_REINJECT_SCOPE: "never",
  PI_CLAUDE_OAUTH_REINJECT_MODE: "none",
  PI_CLAUDE_OAUTH_LOG_FILE: join(ARTIFACTS_DIR, "extension-check.strip-only.adapter.jsonl"),
});
const stripOnlyResult = stripOnly.result;
assert(stripOnlyResult.classification !== "extra_usage", `strip-only check failed with extra usage: ${JSON.stringify(stripOnlyResult)}`);
checks.push({
  name: "strip-only-real",
  attempts: stripOnly.attempts,
  inconclusive: stripOnly.inconclusive,
  success: stripOnly.inconclusive ? "inconclusive" : stripOnlyResult.classification === "ok",
});

const captureLogFile = join(ARTIFACTS_DIR, "extension-check.prepend.capture.jsonl");
await withCaptureServer(captureLogFile, async (baseUrl) => {
  const result = await spawnAndCollect(
    buildCliArgs("Reply with exactly: ok", ["-e", PROBE_EXTENSION_PATH]),
    {
      PI_PROBE_BASE_URL: baseUrl,
      PI_CLAUDE_OAUTH_REINJECT_SCOPE: "always",
      PI_CLAUDE_OAUTH_REINJECT_MODE: "prepend-custom-message",
      PI_CLAUDE_OAUTH_LOG_FILE: join(ARTIFACTS_DIR, "extension-check.prepend.adapter.jsonl"),
      PI_PROBE_LOG_FILE: join(ARTIFACTS_DIR, "extension-check.prepend.probe.jsonl"),
    },
  );
  checks.push({ name: "prepend-custom-capture", result, success: true, baseUrl });
});
const captured = readCapturedRequest(captureLogFile);
const capturedBody = captured.body as Record<string, unknown>;
const capturedSystem = Array.isArray(capturedBody.system) ? capturedBody.system : [];
const capturedMessages = Array.isArray(capturedBody.messages) ? capturedBody.messages : [];
assert(capturedSystem.length === 2, `expected 2 system blocks, got ${capturedSystem.length}`);
assert(capturedMessages.length === 2, `expected 2 messages, got ${capturedMessages.length}`);
assert(
  typeof (capturedSystem[1] as Record<string, unknown>).text === "string" &&
    !String((capturedSystem[1] as Record<string, unknown>).text).includes("Pi documentation (read only"),
  "system prompt still contains docs-only section",
);
const firstMessage = capturedMessages[0] as Record<string, unknown>;
const firstContent = Array.isArray(firstMessage.content) ? firstMessage.content : [];
const firstText = firstContent
  .filter((part): part is Record<string, unknown> => typeof part === "object" && part !== null)
  .map((part) => (part.type === "text" ? String(part.text ?? "") : ""))
  .join("\n");
assert(firstMessage.role === "user", "first captured message is not a user message");
assert(firstText.includes("<pi-docs-context>"), "first captured message does not contain pi docs context");
checks.push({
  name: "prepend-custom-capture-assertions",
  captured: {
    path: captured.path,
    systemCount: capturedSystem.length,
    messageCount: capturedMessages.length,
    firstSystem: (capturedSystem[0] as Record<string, unknown>).text,
    secondSystemPreview: String((capturedSystem[1] as Record<string, unknown>).text ?? "").slice(0, 140),
    firstMessagePreview: firstText.slice(0, 140),
  },
  success: true,
});

const piTopic = await runRealWithRetries("What is the main pi documentation path? Reply with the path only.", {
  PI_CLAUDE_OAUTH_REINJECT_SCOPE: "pi-only",
  PI_CLAUDE_OAUTH_REINJECT_MODE: "prepend-custom-message",
  PI_CLAUDE_OAUTH_LOG_FILE: join(ARTIFACTS_DIR, "extension-check.pi-topic.adapter.jsonl"),
});
const piTopicResult = piTopic.result;
assert(piTopicResult.classification !== "extra_usage", `pi-topic routing failed: ${JSON.stringify(piTopicResult)}`);
const piTopicOutput = `${piTopicResult.stdout}${piTopicResult.stderr}`;
if (!piTopic.inconclusive) {
  assert(piTopicOutput.includes("README.md"), `pi-topic prompt did not recover docs path: ${JSON.stringify(piTopicResult)}`);
}
checks.push({
  name: "pi-topic-real",
  attempts: piTopic.attempts,
  inconclusive: piTopic.inconclusive,
  success: piTopic.inconclusive ? "inconclusive" : piTopicOutput.includes("README.md"),
});

const summary: CheckSummary = {
  timestamp: new Date().toISOString(),
  cliPath: DEFAULT_CLI,
  checks,
};
writeFileSync(RESULT_FILE, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
