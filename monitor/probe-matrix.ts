#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface ProbeSpec {
  name: string;
  systemStrategy?: "keep" | "replace";
  system?: Array<{ text: string } | { file: string } | { current: "billing" | "identity" | "prompt" | "all" | "all_after_billing" | "all_after_identity" }>;
  dropTools?: boolean;
  keepTools?: string[];
}

interface MatrixVariant {
  name: string;
  description: string;
  spec?: ProbeSpec;
}

const ROOT = dirname(import.meta.dir);
const ARTIFACTS_DIR = join(ROOT, "monitor", "request-shape", "artifacts");
const FIXTURES_DIR = join(ROOT, "monitor", "request-shape", "fixtures");
const EXTENSION_PATH = join(ROOT, "monitor", "request-shape", "probe-extension.ts");
const CAPTURE_SERVER_PATH = join(ROOT, "monitor", "capture-request-shape.ts");
const RESULTS_FILE = join(ARTIFACTS_DIR, "results.jsonl");
const PROMPT = "Reply with exactly: ok";
const PI_BASE_ARGS = [
  "--provider", "anthropic",
  "--model", "claude-sonnet-4-6",
  "--thinking", "off",
  "--no-session",
  "-e", EXTENSION_PATH,
  "-p", PROMPT,
];
const SDK_IDENTITY = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";

mkdirSync(ARTIFACTS_DIR, { recursive: true });
mkdirSync(FIXTURES_DIR, { recursive: true });

const variants: MatrixVariant[] = [
  { name: "baseline-default", description: "Current patched pi payload with no body mutation." },
  {
    name: "custom-short-system",
    description: "Replace default prompt with a tiny neutral system prompt. Mirrors the known-good custom system behavior.",
    spec: {
      name: "custom-short-system",
      systemStrategy: "replace",
      system: [{ current: "billing" }, { text: "Answer in one short sentence." }],
    },
  },
  {
    name: "pi-prompt-no-identity",
    description: "Keep pi prompt but drop the Claude Code identity line.",
    spec: {
      name: "pi-prompt-no-identity",
      systemStrategy: "replace",
      system: [{ current: "billing" }, { current: "prompt" }],
    },
  },
  {
    name: "sdk-identity-plus-pi-prompt",
    description: "Swap Claude Code identity for Agent SDK identity, keep the pi prompt.",
    spec: {
      name: "sdk-identity-plus-pi-prompt",
      systemStrategy: "replace",
      system: [{ current: "billing" }, { text: SDK_IDENTITY }, { current: "prompt" }],
    },
  },
  {
    name: "sdk-identity-plus-pi-prompt-no-tools",
    description: "Same as sdk-identity-plus-pi-prompt but with tools removed.",
    spec: {
      name: "sdk-identity-plus-pi-prompt-no-tools",
      systemStrategy: "replace",
      system: [{ current: "billing" }, { text: SDK_IDENTITY }, { current: "prompt" }],
      dropTools: true,
    },
  },
  {
    name: "pi-without-docs-no-sdk",
    description: "Billing + pi prompt with docs-only section removed, no SDK identity/base prompt.",
    spec: {
      name: "pi-without-docs-no-sdk",
      systemStrategy: "replace",
      system: [{ current: "billing" }, { file: join(FIXTURES_DIR, "pi-without-docs.txt") }],
    },
  },
  {
    name: "sdk-identity-plus-pi-without-docs",
    description: "Billing + Agent SDK identity + pi prompt with docs-only section removed.",
    spec: {
      name: "sdk-identity-plus-pi-without-docs",
      systemStrategy: "replace",
      system: [{ current: "billing" }, { text: SDK_IDENTITY }, { file: join(FIXTURES_DIR, "pi-without-docs.txt") }],
    },
  },
  {
    name: "sdk-identity-plus-official-base",
    description: "Billing + Agent SDK identity + captured official SDK base prompt.",
    spec: {
      name: "sdk-identity-plus-official-base",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-neutral-tail",
    description: "Billing + Agent SDK identity + official SDK base prompt + tiny neutral tail block.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-neutral-tail",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { text: "Answer in one short sentence." },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-oneliner",
    description: "Billing + Agent SDK identity + official SDK base prompt + a single pi-branded tail line.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-oneliner",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { text: "You are operating inside pi, a coding agent harness." },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-intro-tools",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi intro/tools section.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-intro-tools",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-intro-tools.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-docs-project",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi docs/project section.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-docs-project",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-project.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-docs-only",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi docs-only section.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-docs-only",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-only.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-docs-header-paths",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi docs header/path bullets.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-docs-header-paths",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-header-paths.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-docs-instructions",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi docs instruction bullets.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-docs-instructions",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-instructions.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-docs-split-blocks",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi docs header/path and instruction bullets as separate blocks.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-docs-split-blocks",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-header-paths.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-instructions.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-docs-when-asked",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi docs when-asked bullet only.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-docs-when-asked",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-when-asked.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-docs-when-asked-plus-instructions",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi docs when-asked plus instruction bullets.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-docs-when-asked-plus-instructions",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-when-asked-plus-instructions.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-docs-paths-no-when-asked",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi docs without the when-asked bullet.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-docs-paths-no-when-asked",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-docs-paths-no-when-asked.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-project-context-only",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi project-context-only section.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-project-context-only",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-project-context-only.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-skills-context",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi skills/context section.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-skills-context",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-skills-context.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-without-docs",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi prompt with the docs-only section removed.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-without-docs",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "pi-without-docs.txt") },
      ],
    },
  },
  {
    name: "sdk-identity-plus-official-base-plus-pi-prompt",
    description: "Billing + Agent SDK identity + official SDK base prompt + pi prompt appended.",
    spec: {
      name: "sdk-identity-plus-official-base-plus-pi-prompt",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { current: "prompt" },
      ],
    },
  },
  {
    name: "sdk-full-chain-plus-pi-prompt",
    description: "Billing + Agent SDK identity + official SDK base prompt + official session guidance + pi prompt.",
    spec: {
      name: "sdk-full-chain-plus-pi-prompt",
      systemStrategy: "replace",
      system: [
        { current: "billing" },
        { text: SDK_IDENTITY },
        { file: join(FIXTURES_DIR, "official-sdk-base.txt") },
        { file: join(FIXTURES_DIR, "official-sdk-session.txt") },
        { current: "prompt" },
      ],
    },
  },
];

function usage(): never {
  console.error(`Usage:
  bun run monitor/probe-matrix.ts list
  bun run monitor/probe-matrix.ts capture-official
  bun run monitor/probe-matrix.ts emit <variant>
  bun run monitor/probe-matrix.ts run <variant> [--mode real|capture]\n`);
  process.exit(1);
}

function getVariant(name: string): MatrixVariant {
  const variant = variants.find((entry) => entry.name === name);
  if (!variant) {
    console.error(`Unknown variant: ${name}`);
    process.exit(1);
  }
  if (variant.spec) {
    for (const source of variant.spec.system ?? []) {
      if ("file" in source && !existsSync(source.file)) {
        console.error(`Variant ${name} requires missing fixture: ${source.file}`);
        process.exit(1);
      }
    }
  }
  return variant;
}

function writeSpec(variant: MatrixVariant): string | undefined {
  if (!variant.spec) return undefined;
  const specPath = join(ARTIFACTS_DIR, "specs", `${variant.name}.json`);
  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, JSON.stringify(variant.spec, null, 2) + "\n");
  return specPath;
}

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function spawnAndCollect(cmd: string[], env: Record<string, string | undefined>) {
  const proc = Bun.spawn(["bash", "-lc", cmd.map(shellEscape).join(" ")], {
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
  return { stdout, stderr, exitCode };
}

function classifyRun(output: string): string {
  if (output.includes("You're out of extra usage")) return "extra_usage";
  if (/\bok\b/.test(output)) return "ok";
  if (output.includes("capture")) return "captured";
  if (output.includes("overloaded_error") || output.includes("Overloaded")) return "overloaded";
  return "other";
}

function appendResult(result: Record<string, unknown>) {
  writeFileSync(RESULTS_FILE, `${existsSync(RESULTS_FILE) ? readFileSync(RESULTS_FILE, "utf8") : ""}${JSON.stringify(result)}\n`);
}

function readProbeSummary(logFile: string): Record<string, unknown> | null {
  if (!existsSync(logFile)) return null;
  const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
  if (lines.length === 0) return null;
  const last = JSON.parse(lines.at(-1) ?? "{}");
  return {
    specName: last.specName,
    before: last.before,
    after: last.after,
  };
}

async function withCaptureServer<T>(logFile: string, fn: () => Promise<T>): Promise<T> {
  rmSync(logFile, { force: true });
  mkdirSync(dirname(logFile), { recursive: true });
  const server = Bun.spawn(["bun", "run", CAPTURE_SERVER_PATH, "--log", logFile], {
    cwd: ROOT,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    await Bun.sleep(750);
    return await fn();
  } finally {
    server.kill();
    await server.exited;
  }
}

function extractCapturedRequest(logFile: string): Record<string, unknown> | null {
  if (!existsSync(logFile)) return null;
  const lines = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean);
  const post = [...lines].map((line) => JSON.parse(line) as Record<string, string>).reverse().find((entry) => entry.method === "POST");
  if (!post) return null;
  const body = JSON.parse(String(post.body));
  return {
    path: post.path,
    userAgent: post.headers ? (post.headers as Record<string, string>)["user-agent"] : undefined,
    beta: post.headers ? (post.headers as Record<string, string>)["anthropic-beta"] : undefined,
    toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
    system: Array.isArray(body.system) ? body.system.map((block: { text?: string }, index: number) => ({ index, text: block.text ?? "" })) : [],
    body,
  };
}

async function captureOfficial() {
  const logFile = join(ARTIFACTS_DIR, "official-cli-capture.jsonl");
  const artifactFile = join(ARTIFACTS_DIR, "official-cli-capture.json");
  const result = await withCaptureServer(logFile, () =>
    spawnAndCollect(
      ["claude", "-p", PROMPT],
      {
        ANTHROPIC_BASE_URL: "http://127.0.0.1:8765",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
    ),
  );
  const captured = extractCapturedRequest(logFile);
  const artifact = { captured, result };
  writeFileSync(artifactFile, JSON.stringify(artifact, null, 2) + "\n");

  const system = Array.isArray(captured?.body?.system) ? (captured?.body?.system as Array<{ text?: string }>) : [];
  if (system[2]?.text) writeFileSync(join(FIXTURES_DIR, "official-sdk-base.txt"), `${system[2].text}\n`);
  if (system[3]?.text) writeFileSync(join(FIXTURES_DIR, "official-sdk-session.txt"), `${system[3].text}\n`);

  console.log(`wrote ${artifactFile}`);
  if (system[2]?.text) console.log(`wrote ${join(FIXTURES_DIR, "official-sdk-base.txt")}`);
  if (system[3]?.text) console.log(`wrote ${join(FIXTURES_DIR, "official-sdk-session.txt")}`);
}

async function runVariant(name: string, mode: "real" | "capture") {
  const variant = getVariant(name);
  const specPath = writeSpec(variant);
  const probeLogFile = join(ARTIFACTS_DIR, `${variant.name}.${mode}.probe.jsonl`);
  rmSync(probeLogFile, { force: true });
  const env = {
    PI_PROBE_LOG_FILE: probeLogFile,
    ...(specPath ? { PI_PROBE_SPEC_FILE: specPath } : {}),
  };

  let captured: Record<string, unknown> | null = null;
  let output: { stdout: string; stderr: string; exitCode: number };

  if (mode === "capture") {
    const captureLogFile = join(ARTIFACTS_DIR, `${variant.name}.capture.jsonl`);
    output = await withCaptureServer(captureLogFile, () =>
      spawnAndCollect(["pi", ...PI_BASE_ARGS], {
        ...env,
        PI_PROBE_BASE_URL: "http://127.0.0.1:8765",
      }),
    );
    captured = extractCapturedRequest(captureLogFile);
  } else {
    output = await spawnAndCollect(["pi", ...PI_BASE_ARGS], env);
  }

  const summary = {
    timestamp: new Date().toISOString(),
    variant: variant.name,
    description: variant.description,
    mode,
    exitCode: output.exitCode,
    classification: classifyRun(`${output.stdout}\n${output.stderr}`),
    stdout: output.stdout,
    stderr: output.stderr,
    captured,
    probe: readProbeSummary(probeLogFile),
    probeLogFile,
    specPath,
  };
  appendResult(summary);
  console.log(JSON.stringify(summary, null, 2));
}

const [command, arg] = process.argv.slice(2);
if (!command) usage();

if (command === "list") {
  for (const variant of variants) {
    console.log(`${variant.name}\t${variant.description}`);
  }
} else if (command === "capture-official") {
  await captureOfficial();
} else if (command === "emit") {
  if (!arg) usage();
  const variant = getVariant(arg);
  const specPath = writeSpec(variant);
  console.log(specPath ?? `${variant.name} has no spec`);
} else if (command === "run") {
  if (!arg) usage();
  const mode = (getArg("--mode") ?? "real") as "real" | "capture";
  if (mode !== "real" && mode !== "capture") usage();
  await runVariant(arg, mode);
} else {
  usage();
}
