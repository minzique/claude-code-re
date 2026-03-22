#!/usr/bin/env bun
/**
 * Agentic analysis — feeds diff + key changed modules to claude -p
 * to generate human-readable analysis of what changed and why it matters.
 *
 * Also runs targeted extraction prompts for specific areas of interest:
 *   - Request format changes (headers, betas, auth)
 *   - New telemetry / tracking
 *   - New feature flags and their likely purpose
 *   - Security-relevant changes
 *
 * Usage:
 *   bun run monitor/analyze.ts <version> [--diff <diff.md>]
 *   bun run monitor/analyze.ts 2.1.81 --diff signatures/diff-2.1.80-to-2.1.81.md
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"

const ROOT = dirname(import.meta.dir)
const SIGS_DIR = join(ROOT, "signatures")
const DEMINCER_DIR = join(ROOT, "pocs", "bun-demincer")

interface AnalysisPrompt {
  name: string
  focus: string
  modulePatterns: RegExp[]
  prompt: string
}

const ANALYSIS_PROMPTS: AnalysisPrompt[] = [
  {
    name: "request-format",
    focus: "API request format, headers, beta flags, auth changes",
    modulePatterns: [/beta|oauth|auth|header|billing|user.?agent/i],
    prompt: `Analyze these Claude Code CLI modules for changes to the API request format.
Focus on:
- Beta header construction logic (which betas are sent, under what conditions)
- Auth headers (OAuth vs API key paths)
- Billing/attribution headers
- User-agent string construction
- Any new headers or modified header logic

Output a concise technical summary of the request format. Note anything that changed from the previous version.`,
  },
  {
    name: "telemetry",
    focus: "New telemetry events, tracking, data collection",
    modulePatterns: [/telemetry|metric|event|track|log.*batch/i],
    prompt: `Analyze these Claude Code CLI modules for telemetry and tracking.
Focus on:
- New telemetry event names (tengu_* pattern)
- What data is collected with each event
- Any new tracking endpoints or collection mechanisms
- Privacy-relevant changes

Output a concise inventory of new tracking. Flag anything privacy-sensitive.`,
  },
  {
    name: "features",
    focus: "New features, feature flags, capabilities",
    modulePatterns: [/feature|flag|config|tengu/i],
    prompt: `Analyze these Claude Code CLI modules for new features and capabilities.
Focus on:
- New feature flags (tengu_* names) and what they gate
- New CLI commands or options
- New tool definitions
- New model capabilities or model-gated behavior
- Environment variables that control new features

Output a concise summary of new capabilities. Infer the likely purpose of each feature flag from context.`,
  },
  {
    name: "security",
    focus: "Security-relevant changes, auth, permissions, sandboxing",
    modulePatterns: [/security|permission|sandbox|inject|exec|spawn|shell/i],
    prompt: `Analyze these Claude Code CLI modules for security-relevant changes.
Focus on:
- Changes to command execution (execSync, spawn, shell usage)
- Permission model changes
- Sandbox/isolation changes
- Auth token handling
- Input validation or sanitization changes
- New attack surface

Output a concise security assessment. Flag anything that introduces or mitigates risk.`,
  },
]

function findRelevantModules(
  decodedDir: string,
  diff: any,
  prompt: AnalysisPrompt,
): string[] {
  if (!existsSync(decodedDir)) return []

  const files = readdirSync(decodedDir).filter((f) => f.endsWith(".js") && !f.startsWith("vendor"))
  const relevant: string[] = []

  for (const file of files) {
    const code = readFileSync(join(decodedDir, file), "utf-8")
    if (prompt.modulePatterns.some((p) => p.test(code)) && code.length < 50000) {
      relevant.push(file)
    }
  }

  return relevant.slice(0, 20)
}

function buildAnalysisContext(
  version: string,
  decodedDir: string,
  diffContent: string | null,
  relevantModules: string[],
): string {
  let context = `# Claude Code v${version} — Analysis Context\n\n`

  if (diffContent) {
    context += `## Diff from previous version\n\n${diffContent}\n\n`
  }

  const sig = join(SIGS_DIR, `v${version}.json`)
  if (existsSync(sig)) {
    const sigData = JSON.parse(readFileSync(sig, "utf-8"))
    context += `## Signature Summary\n`
    context += `- Beta flags: ${sigData.betaFlags?.length || 0}\n`
    context += `- Feature flags: ${sigData.featureFlags?.length || 0}\n`
    context += `- Env vars: ${sigData.envVars?.length || 0}\n`
    context += `- Endpoints: ${sigData.apiEndpoints?.length || 0}\n`
    context += `- Telemetry events: ${sigData.telemetryEvents?.length || 0}\n`
    context += `- Model IDs: ${(sigData.modelIds || []).join(", ")}\n\n`
  }

  context += `## Key Modules\n\n`
  for (const file of relevantModules.slice(0, 10)) {
    const code = readFileSync(join(decodedDir, file), "utf-8")
    const truncated = code.length > 8000 ? code.slice(0, 8000) + "\n\n... [truncated]" : code
    context += `### ${file}\n\`\`\`js\n${truncated}\n\`\`\`\n\n`
  }

  return context
}

async function runClaudeAnalysis(
  promptText: string,
  context: string,
  outputFile: string,
): Promise<string> {
  const fullPrompt = `${promptText}\n\n---\n\n${context}`

  // Write prompt to temp file to avoid shell escaping issues
  const tmpFile = join(ROOT, ".tmp-analysis-prompt.md")
  writeFileSync(tmpFile, fullPrompt)

  console.log(`    Running claude -p (context: ${(fullPrompt.length / 1024).toFixed(0)}KB)...`)

  const proc = Bun.spawn(
    ["claude", "-p", "--model", "claude-sonnet-4-6", "--max-turns", "1"],
    {
      stdin: Bun.file(tmpFile),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "cli" },
    },
  )

  const output = await new Response(proc.stdout).text()
  const exitCode = await proc.exited

  // Clean up
  try { require("fs").unlinkSync(tmpFile) } catch {}

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    console.log(`    ⚠️  claude exited ${exitCode}: ${stderr.slice(0, 200)}`)
    return `[Analysis failed: exit ${exitCode}]\n${stderr.slice(0, 500)}`
  }

  console.log(`    ✓ ${(output.length / 1024).toFixed(0)}KB response`)
  return output
}

export async function analyzeVersion(
  version: string,
  diffFile?: string,
): Promise<string> {
  const decodedSources = [
    join(DEMINCER_DIR, "work", `v${version}`, "decoded"),
    join(DEMINCER_DIR, "work", "decoded"),
  ]
  const decodedDir = decodedSources.find((d) => existsSync(d))
  if (!decodedDir) {
    console.error(`No decoded modules found for v${version}`)
    return ""
  }

  const diffContent = diffFile && existsSync(diffFile) ? readFileSync(diffFile, "utf-8") : null

  let fullAnalysis = `# Claude Code v${version} — Automated Analysis\n\n`
  fullAnalysis += `_Generated: ${new Date().toISOString()}_\n\n`

  if (diffContent) {
    fullAnalysis += `## Version Diff\n\n${diffContent}\n\n---\n\n`
  }

  for (const analysisPrompt of ANALYSIS_PROMPTS) {
    console.log(`  [${analysisPrompt.name}] Finding relevant modules...`)
    const modules = findRelevantModules(decodedDir, null, analysisPrompt)
    console.log(`    ${modules.length} modules matched`)

    if (modules.length === 0) {
      fullAnalysis += `## ${analysisPrompt.focus}\n\nNo relevant modules found.\n\n`
      continue
    }

    const context = buildAnalysisContext(version, decodedDir, diffContent, modules)
    const analysis = await runClaudeAnalysis(analysisPrompt.prompt, context, "")

    fullAnalysis += `## ${analysisPrompt.focus}\n\n${analysis}\n\n---\n\n`
  }

  const outputFile = join(SIGS_DIR, `analysis-${version}.md`)
  writeFileSync(outputFile, fullAnalysis)
  console.log(`\nFull analysis written to ${outputFile}`)

  return outputFile
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const flags = process.argv.slice(2)
  const version = args[0]

  if (!version) {
    console.error("Usage: bun run analyze.ts <version> [--diff <diff.md>]")
    process.exit(1)
  }

  const diffIdx = flags.indexOf("--diff")
  const diffFile = diffIdx >= 0 ? flags[diffIdx + 1] : undefined

  console.log(`Analyzing Claude Code v${version}...`)
  await analyzeVersion(version, diffFile)
}
