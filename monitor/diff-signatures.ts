#!/usr/bin/env bun
/**
 * Signature Diff — compares two version snapshots and outputs
 * a human-readable changelog of what changed.
 *
 * Usage:
 *   bun run monitor/diff-signatures.ts signatures/v2.1.80.json signatures/v2.1.82.json
 */

import { readFileSync, writeFileSync } from "node:fs"

interface DiffResult {
  oldVersion: string
  newVersion: string
  timestamp: string
  hasChanges: boolean
  sections: DiffSection[]
  summary: string
}

interface DiffSection {
  category: string
  added: string[]
  removed: string[]
  changed: string[]
}

function diffArrays(old: string[], cur: string[]): { added: string[]; removed: string[] } {
  const oldSet = new Set(old)
  const curSet = new Set(cur)
  return {
    added: cur.filter((x) => !oldSet.has(x)),
    removed: old.filter((x) => !curSet.has(x)),
  }
}

function diffObjects(
  old: Array<{ name: string; [k: string]: any }>,
  cur: Array<{ name: string; [k: string]: any }>,
  keyField = "name",
): { added: string[]; removed: string[]; changed: string[] } {
  const oldMap = new Map(old.map((o) => [o[keyField], o]))
  const curMap = new Map(cur.map((c) => [c[keyField], c]))

  const added = [...curMap.keys()].filter((k) => !oldMap.has(k))
  const removed = [...oldMap.keys()].filter((k) => !curMap.has(k))
  const changed: string[] = []

  for (const [key, curVal] of curMap) {
    const oldVal = oldMap.get(key)
    if (oldVal && JSON.stringify(oldVal) !== JSON.stringify(curVal)) {
      changed.push(`${key}: ${JSON.stringify(oldVal)} → ${JSON.stringify(curVal)}`)
    }
  }

  return { added, removed, changed }
}

export function diffSignatures(oldSig: any, newSig: any): DiffResult {
  const sections: DiffSection[] = []

  // Beta flags — only compare the value, not sourceModule
  const oldBetas = (oldSig.betaFlags || []).map((b: any) => b.value)
  const newBetas = (newSig.betaFlags || []).map((b: any) => b.value)
  const betaDiff = diffArrays(oldBetas, newBetas)
  if (betaDiff.added.length || betaDiff.removed.length) {
    sections.push({ category: "Beta Flags", ...betaDiff, changed: [] })
  }

  // Feature flags — compare name + defaultValue, ignore sourceModule
  const oldFlags = (oldSig.featureFlags || []).map((f: any) => f.name)
  const newFlags = (newSig.featureFlags || []).map((f: any) => f.name)
  const flagDiff = diffArrays(oldFlags, newFlags)
  if (flagDiff.added.length || flagDiff.removed.length) {
    sections.push({ category: "Feature Flags (tengu_*)", ...flagDiff, changed: [] })
  }

  // Env vars
  const envDiff = diffArrays(oldSig.envVars || [], newSig.envVars || [])
  if (envDiff.added.length || envDiff.removed.length) {
    sections.push({ category: "Environment Variables", ...envDiff, changed: [] })
  }

  // API endpoints
  const endpointDiff = diffArrays(oldSig.apiEndpoints || [], newSig.apiEndpoints || [])
  if (endpointDiff.added.length || endpointDiff.removed.length) {
    sections.push({ category: "API Endpoints", ...endpointDiff, changed: [] })
  }

  // Telemetry events
  const telDiff = diffArrays(oldSig.telemetryEvents || [], newSig.telemetryEvents || [])
  if (telDiff.added.length || telDiff.removed.length) {
    sections.push({ category: "Telemetry Events", ...telDiff, changed: [] })
  }

  // Model IDs
  const modelDiff = diffArrays(oldSig.modelIds || [], newSig.modelIds || [])
  if (modelDiff.added.length || modelDiff.removed.length) {
    sections.push({ category: "Model IDs", ...modelDiff, changed: [] })
  }

  // System prompts
  const promptDiff = diffArrays(
    oldSig.systemPromptPrefixes || [],
    newSig.systemPromptPrefixes || [],
  )
  if (promptDiff.added.length || promptDiff.removed.length) {
    sections.push({ category: "System Prompt Prefixes", ...promptDiff, changed: [] })
  }

  // Headers
  const headerDiff = diffArrays(oldSig.headerKeys || [], newSig.headerKeys || [])
  if (headerDiff.added.length || headerDiff.removed.length) {
    sections.push({ category: "HTTP Headers", ...headerDiff, changed: [] })
  }

  // OAuth scopes
  const scopeDiff = diffArrays(oldSig.oauthScopes || [], newSig.oauthScopes || [])
  if (scopeDiff.added.length || scopeDiff.removed.length) {
    sections.push({ category: "OAuth Scopes", ...scopeDiff, changed: [] })
  }

  // Codenames
  const codenameDiff = diffArrays(
    oldSig.internalCodenames || [],
    newSig.internalCodenames || [],
  )
  if (codenameDiff.added.length || codenameDiff.removed.length) {
    sections.push({ category: "Internal Codenames", ...codenameDiff, changed: [] })
  }

  const hasChanges = sections.length > 0
  const totalAdded = sections.reduce((s, sec) => s + sec.added.length, 0)
  const totalRemoved = sections.reduce((s, sec) => s + sec.removed.length, 0)
  const totalChanged = sections.reduce((s, sec) => s + sec.changed.length, 0)

  const summary = hasChanges
    ? `${oldSig.version} → ${newSig.version}: ${totalAdded} added, ${totalRemoved} removed, ${totalChanged} changed across ${sections.length} categories`
    : `${oldSig.version} → ${newSig.version}: No changes detected`

  return {
    oldVersion: oldSig.version,
    newVersion: newSig.version,
    timestamp: new Date().toISOString(),
    hasChanges,
    sections,
    summary,
  }
}

export function formatDiffMarkdown(diff: DiffResult): string {
  if (!diff.hasChanges) return `# No Changes\n\n${diff.summary}\n`

  const lines = [`# Claude Code Diff: ${diff.oldVersion} → ${diff.newVersion}`, ""]
  lines.push(`_Generated: ${diff.timestamp}_`, "")

  for (const section of diff.sections) {
    lines.push(`## ${section.category}`, "")

    if (section.added.length) {
      lines.push("### Added")
      for (const item of section.added) lines.push(`- \`${item}\``)
      lines.push("")
    }

    if (section.removed.length) {
      lines.push("### Removed")
      for (const item of section.removed) lines.push(`- ~~\`${item}\`~~`)
      lines.push("")
    }

    if (section.changed.length) {
      lines.push("### Changed")
      for (const item of section.changed) lines.push(`- ${item}`)
      lines.push("")
    }
  }

  return lines.join("\n")
}

export function formatDiffTelegram(diff: DiffResult): string {
  if (!diff.hasChanges) return `✅ Claude Code ${diff.newVersion} — no API changes`

  const lines = [`🔔 <b>Claude Code ${diff.oldVersion} → ${diff.newVersion}</b>`, ""]

  for (const section of diff.sections) {
    lines.push(`<b>${section.category}</b>`)
    for (const item of section.added) lines.push(`  ➕ <code>${item}</code>`)
    for (const item of section.removed) lines.push(`  ➖ <code>${item}</code>`)
    for (const item of section.changed) lines.push(`  🔄 ${item}`)
    lines.push("")
  }

  return lines.join("\n")
}

if (import.meta.main) {
  const [oldFile, newFile] = process.argv.slice(2)
  if (!oldFile || !newFile) {
    console.error("Usage: bun run diff-signatures.ts <old.json> <new.json> [--markdown] [--telegram]")
    process.exit(1)
  }

  const oldSig = JSON.parse(readFileSync(oldFile, "utf-8"))
  const newSig = JSON.parse(readFileSync(newFile, "utf-8"))
  const diff = diffSignatures(oldSig, newSig)

  if (process.argv.includes("--markdown")) {
    console.log(formatDiffMarkdown(diff))
  } else if (process.argv.includes("--telegram")) {
    console.log(formatDiffTelegram(diff))
  } else {
    console.log(JSON.stringify(diff, null, 2))
  }
}
