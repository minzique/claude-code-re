#!/usr/bin/env bun
/**
 * Signature Extractor — greps decoded bun-demincer modules for
 * betas, feature flags, endpoints, env vars, telemetry, and model checks.
 * Outputs a structured JSON snapshot for diffing between versions.
 *
 * Usage:
 *   bun run monitor/extract-signatures.ts <decoded-dir> [--out <file>]
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

interface Signature {
  version: string
  extractedAt: string
  betaFlags: BetaFlag[]
  featureFlags: FeatureFlag[]
  envVars: string[]
  apiEndpoints: string[]
  telemetryEvents: string[]
  modelIds: string[]
  systemPromptPrefixes: string[]
  userAgentPatterns: string[]
  oauthScopes: string[]
  headerKeys: string[]
  billingHeaderFormat: string[]
  internalCodenames: string[]
}

interface BetaFlag {
  value: string
  sourceModule: string
}

interface FeatureFlag {
  name: string
  defaultValue: string | null
  sourceModule: string
}

function readAllModules(dir: string): Map<string, string> {
  const modules = new Map<string, string>()
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js") || file.startsWith("vendor")) continue
    const path = join(dir, file)
    try {
      modules.set(file, readFileSync(path, "utf-8"))
    } catch {}
  }
  return modules
}

function extractBetaFlags(modules: Map<string, string>): BetaFlag[] {
  const betas = new Map<string, string>()
  // Pattern 1: string constants like "context-1m-2025-08-07"
  const betaRegex = /["']([a-z][\w-]*-\d{4}-\d{2}-\d{2})["']/g
  // Pattern 2: variable assignments with beta strings
  for (const [file, code] of modules) {
    for (const match of code.matchAll(betaRegex)) {
      const val = match[1]
      if (!betas.has(val)) betas.set(val, file)
    }
  }
  return Array.from(betas.entries())
    .map(([value, sourceModule]) => ({ value, sourceModule }))
    .sort((a, b) => a.value.localeCompare(b.value))
}

function extractFeatureFlags(modules: Map<string, string>): FeatureFlag[] {
  const flags = new Map<string, FeatureFlag>()
  // tengu_* patterns: Tq("tengu_xxx", default) or flag("tengu_xxx") or IO("tengu_xxx")
  const flagRegex = /["'](tengu_[\w]+)["'](?:\s*,\s*([^)]{1,30}))?/g
  for (const [file, code] of modules) {
    for (const match of code.matchAll(flagRegex)) {
      const name = match[1]
      const defaultVal = match[2]?.trim().replace(/['"]/g, "") || null
      if (!flags.has(name)) {
        flags.set(name, { name, defaultValue: defaultVal, sourceModule: file })
      }
    }
  }
  return Array.from(flags.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function extractEnvVars(modules: Map<string, string>): string[] {
  const vars = new Set<string>()
  // process.env.CLAUDE_* or process.env.ANTHROPIC_*
  const envRegex = /process\.env\.((?:CLAUDE|ANTHROPIC|API_|DISABLE_|USE_API_|HTTPS?_PROXY|NO_PROXY)[\w]*)/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(envRegex)) {
      vars.add(match[1])
    }
  }
  return Array.from(vars).sort()
}

function extractApiEndpoints(modules: Map<string, string>): string[] {
  const endpoints = new Set<string>()
  // URL paths: /v1/messages, /api/oauth/*, etc.
  const pathRegex = /["'](\/(?:v1|api)\/[\w/._-]+)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(pathRegex)) {
      endpoints.add(match[1])
    }
  }
  // Full URLs
  const urlRegex = /["'](https:\/\/(?:api|console|cdn|storage|downloads|mcp-proxy|platform)[\w.-]*\.(?:anthropic\.com|claude\.(?:ai|com)|growthbook\.io|googleapis\.com)[\/\w.-]*)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(urlRegex)) {
      endpoints.add(match[1])
    }
  }
  return Array.from(endpoints).sort()
}

function extractTelemetryEvents(modules: Map<string, string>): string[] {
  const events = new Set<string>()
  // tengu_* telemetry event names (usually in function calls)
  const telRegex = /["'](tengu_[\w]+)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(telRegex)) {
      events.add(match[1])
    }
  }
  return Array.from(events).sort()
}

function extractModelIds(modules: Map<string, string>): string[] {
  const models = new Set<string>()
  const modelRegex = /["'](claude-(?:opus|sonnet|haiku)-[\w.-]+)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(modelRegex)) {
      models.add(match[1])
    }
  }
  return Array.from(models).sort()
}

function extractSystemPrompts(modules: Map<string, string>): string[] {
  const prompts: string[] = []
  const promptRegex = /["'](You are (?:Claude Code|a Claude agent)[^"']{0,200})["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(promptRegex)) {
      if (!prompts.includes(match[1])) prompts.push(match[1])
    }
  }
  return prompts.sort()
}

function extractUserAgentPatterns(modules: Map<string, string>): string[] {
  const patterns: string[] = []
  const uaRegex = /["'](claude-(?:cli|code)\/[^"']+)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(uaRegex)) {
      const val = match[1]
      if (!patterns.includes(val)) patterns.push(val)
    }
  }
  return patterns.sort()
}

function extractOAuthScopes(modules: Map<string, string>): string[] {
  const scopes = new Set<string>()
  const scopeRegex = /["']((?:user|org|admin):[\w:]+)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(scopeRegex)) {
      scopes.add(match[1])
    }
  }
  return Array.from(scopes).sort()
}

function extractHeaderKeys(modules: Map<string, string>): string[] {
  const headers = new Set<string>()
  const headerRegex = /["'](x-(?:app|anthropic|claude|stainless|client)[\w-]*)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(headerRegex)) {
      headers.add(match[1])
    }
  }
  // Also anthropic-* headers
  const anthRegex = /["'](anthropic-[\w-]+)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(anthRegex)) {
      headers.add(match[1])
    }
  }
  return Array.from(headers).sort()
}

function extractBillingFormat(modules: Map<string, string>): string[] {
  const formats: string[] = []
  const fmtRegex = /["'](cc_version=[^"']+)["']/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(fmtRegex)) {
      if (!formats.includes(match[1])) formats.push(match[1])
    }
  }
  // Also template literal patterns
  const tmplRegex = /`(cc_version=\$\{[^`]+)`/g
  for (const [, code] of modules) {
    for (const match of code.matchAll(tmplRegex)) {
      if (!formats.includes(match[1])) formats.push(match[1])
    }
  }
  return formats
}

function extractCodenames(modules: Map<string, string>): string[] {
  const names = new Set<string>()
  // Look for internal service names
  const patterns = [
    /["'](antspace|baku|tengu|cowork|teleport|grove|pivot|ion|coral)["']/gi,
    /["'](PlushRaccoon|QuietPenguin|LouderPenguin|SparkleHedgehog|ChillingSloth|MidnightOwl|FloatingAtoll|YukonSilver|MemoryBalloon|PhoenixRisingAgain)["']/g,
  ]
  for (const [, code] of modules) {
    for (const pat of patterns) {
      for (const match of code.matchAll(pat)) {
        names.add(match[1])
      }
    }
  }
  return Array.from(names).sort()
}

function detectVersion(dir: string): string {
  // Try to find version from the code itself
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js")) continue
    const code = readFileSync(join(dir, file), "utf-8")
    const vMatch = code.match(/claude-cli\/([\d.]+)/)
    if (vMatch) return vMatch[1]
  }
  // Fallback: extract from directory path
  const match = dir.match(/v?([\d.]+)/)
  return match?.[1] || "unknown"
}

export function extractSignatures(decodedDir: string): Signature {
  console.log(`Reading modules from ${decodedDir}...`)
  const modules = readAllModules(decodedDir)
  console.log(`  ${modules.size} modules loaded`)

  const version = detectVersion(decodedDir)
  console.log(`  Detected version: ${version}`)

  console.log("  Extracting beta flags...")
  const betaFlags = extractBetaFlags(modules)
  console.log(`    ${betaFlags.length} found`)

  console.log("  Extracting feature flags...")
  const featureFlags = extractFeatureFlags(modules)
  console.log(`    ${featureFlags.length} found`)

  console.log("  Extracting env vars...")
  const envVars = extractEnvVars(modules)
  console.log(`    ${envVars.length} found`)

  console.log("  Extracting API endpoints...")
  const apiEndpoints = extractApiEndpoints(modules)
  console.log(`    ${apiEndpoints.length} found`)

  console.log("  Extracting telemetry events...")
  const telemetryEvents = extractTelemetryEvents(modules)
  console.log(`    ${telemetryEvents.length} found`)

  console.log("  Extracting model IDs...")
  const modelIds = extractModelIds(modules)
  console.log(`    ${modelIds.length} found`)

  console.log("  Extracting system prompts...")
  const systemPromptPrefixes = extractSystemPrompts(modules)
  console.log(`    ${systemPromptPrefixes.length} found`)

  console.log("  Extracting user-agent patterns...")
  const userAgentPatterns = extractUserAgentPatterns(modules)
  console.log(`    ${userAgentPatterns.length} found`)

  console.log("  Extracting OAuth scopes...")
  const oauthScopes = extractOAuthScopes(modules)
  console.log(`    ${oauthScopes.length} found`)

  console.log("  Extracting header keys...")
  const headerKeys = extractHeaderKeys(modules)
  console.log(`    ${headerKeys.length} found`)

  console.log("  Extracting billing format...")
  const billingHeaderFormat = extractBillingFormat(modules)
  console.log(`    ${billingHeaderFormat.length} found`)

  console.log("  Extracting internal codenames...")
  const internalCodenames = extractCodenames(modules)
  console.log(`    ${internalCodenames.length} found`)

  return {
    version,
    extractedAt: new Date().toISOString(),
    betaFlags,
    featureFlags,
    envVars,
    apiEndpoints,
    telemetryEvents,
    modelIds,
    systemPromptPrefixes,
    userAgentPatterns,
    oauthScopes,
    headerKeys,
    billingHeaderFormat,
    internalCodenames,
  }
}

if (import.meta.main) {
  const dir = process.argv[2]
  if (!dir) {
    console.error("Usage: bun run extract-signatures.ts <decoded-dir> [--out <file>]")
    process.exit(1)
  }

  const outIdx = process.argv.indexOf("--out")
  const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : null

  const sig = extractSignatures(dir)

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(sig, null, 2) + "\n")
    console.log(`\nWritten to ${outFile}`)
  } else {
    console.log(JSON.stringify(sig, null, 2))
  }
}
