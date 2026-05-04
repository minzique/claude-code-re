#!/usr/bin/env bun
/**
 * Adapter PR pipeline (v0, manual trigger).
 *
 * Reads the latest signature/diff for a Claude Code version and either:
 *   • prints a classification report (--dry-run, default)
 *   • patches the adapter source for the deterministic slots and writes
 *     a state file under monitor/state/ (--apply, NOT YET implemented)
 *
 * Design: see docs/automation/adapter-pr-pipeline.md
 *
 * Usage:
 *   bun run monitor/prepare-adapter-pr.ts --version 2.1.126
 *   bun run monitor/prepare-adapter-pr.ts --version 2.1.126 --prev 2.1.118
 *   bun run monitor/prepare-adapter-pr.ts --version 2.1.126 --json
 *
 * Exit codes:
 *   0 = success (classification produced, state written if --apply)
 *   1 = adapter assumptions need human review (shape-change found)
 *   2 = inputs missing (signature/diff not found)
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"

const ROOT = dirname(import.meta.dir)
const SIGS_DIR = join(ROOT, "signatures")
const DECODED_BASE = join(ROOT, "pocs", "bun-demincer", "work")
const STATE_DIR = join(ROOT, "monitor", "state")

type SlotStatus = "unchanged" | "bump" | "shape-change" | "unknown"

interface SlotResult {
  slot: string
  status: SlotStatus
  detail: string
  evidence: string[]
}

interface ClassifierReport {
  version: string
  prev: string
  generatedAt: string
  signatureDiff: string
  /** The base version embedded in the diff file (parsed from the first line). */
  signatureDiffBase: string | null
  /** Warnings emitted while building the report (e.g. base mismatch). */
  warnings: string[]
  decodedDir: string
  slots: SlotResult[]
  overallStatus: "clean" | "bump-only" | "needs-review" | "no-data"
  recommendedAdapterVersionBump: "patch" | "minor" | "none"
}

const SLOT_DEFS: Array<{
  slot: string
  hint: string
  evidence: (decodedDir: string) => string[]
  classify: (
    diffMd: string,
    prevSig: any,
    nextSig: any,
    decodedDir: string,
  ) => Pick<SlotResult, "status" | "detail">
}> = [
  {
    slot: "DEFAULT_CLAUDE_CODE_VERSION",
    hint: "Adapter constant in extensions/index.ts",
    evidence: (d) => [join(d, "decoded/4683.js")],
    classify: (_diff, prev, next) => {
      const a = prev?.version
      const b = next?.version
      if (!b) return { status: "unknown", detail: "next signature missing version" }
      if (!a) return { status: "bump", detail: `version=${b} (no prior to compare)` }
      if (a === b) return { status: "unchanged", detail: `version=${b}` }
      return { status: "bump", detail: `version: ${a} → ${b}` }
    },
  },
  {
    slot: "billingHeader.format",
    hint: "x-anthropic-billing-header template",
    evidence: (d) => [join(d, "decoded/2129.js"), join(d, "decoded/4683.js")],
    classify: (diff) => {
      if (/billing.*header|x-anthropic-billing-header/i.test(diff))
        return { status: "shape-change", detail: "billing header mentioned in diff; review evidence" }
      return { status: "unchanged", detail: "no billing-header mention in diff" }
    },
  },
  {
    slot: "rateLimit.headerKeys",
    hint: "anthropic-ratelimit-unified-* keys",
    evidence: (d) => [join(d, "decoded/2490.js")],
    classify: (diff) => {
      if (/anthropic-ratelimit-unified-(fallback|upgrade-paths|representative-claim|overage)/i.test(diff))
        return { status: "shape-change", detail: "rate-limit header set changed; review parser" }
      if (/ratelimit/i.test(diff))
        return { status: "shape-change", detail: "ratelimit token in diff; review" }
      return { status: "unchanged", detail: "no ratelimit mention in diff" }
    },
  },
  {
    slot: "rateLimit.thresholds",
    hint: "five_hour / seven_day threshold constants",
    evidence: (d) => [join(d, "decoded/2491.js")],
    classify: (diff) => {
      if (/five_hour|seven_day|0\.9|0\.72|0\.75|0\.6|0\.5|0\.35|0\.25|0\.15/i.test(diff))
        return { status: "shape-change", detail: "threshold-shaped tokens in diff; review" }
      return { status: "unchanged", detail: "no threshold tokens in diff" }
    },
  },
  {
    slot: "systemPrompt.placement",
    hint: "billing block / identity / cache rules",
    // TODO(automation): Webpack chunk IDs (4682/4687/4688/...) drift across
    // bundle re-splits. Replace with content-addressable matchers when the
    // pipeline starts emitting per-symbol locations.
    evidence: (d) => [
      join(d, "decoded/4682.js"),
      join(d, "decoded/4687.js"),
      join(d, "decoded/4688.js"),
    ],
    classify: (diff) => {
      // Match "system prompt" / "cache_control" / "claude code identity"
      // in code/prose context only. Reject SCREAMING_SNAKE env-var names like
      // CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT by requiring the surrounding chars on
      // either side of "system" / "prompt" not to be uppercase letters or
      // underscores.
      const systemPromptCode = /(?<![A-Z_])system\W{0,3}prompt(?![A-Z_])/i
      if (systemPromptCode.test(diff) || /cache_control\b/i.test(diff) || /claude code identity/i.test(diff))
        return { status: "shape-change", detail: "system prompt cache/identity mentioned in diff; review" }
      return { status: "unchanged", detail: "no system-prompt mention in diff" }
    },
  },
  {
    slot: "oauth.scopes",
    hint: "user:inference and friends",
    evidence: () => [],
    classify: (diff) => {
      if (/user:inference|claude_oauth|oauth\s+scope/i.test(diff))
        return { status: "shape-change", detail: "OAuth scope token in diff; review" }
      return { status: "unchanged", detail: "no OAuth-scope mention in diff" }
    },
  },
  {
    slot: "userAgent",
    hint: "Claude-Code/{ver} user-agent constant",
    evidence: () => [],
    classify: (diff) => {
      if (/claude-code\/\d|user-agent/i.test(diff))
        return { status: "shape-change", detail: "user-agent token in diff; review" }
      return { status: "unchanged", detail: "no user-agent mention in diff" }
    },
  },
]

function parseArgs(argv: string[]): { version?: string; prev?: string; json: boolean; apply: boolean } {
  const out: ReturnType<typeof parseArgs> = { json: false, apply: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--version") out.version = argv[++i]
    else if (a === "--prev") out.prev = argv[++i]
    else if (a === "--json") out.json = true
    else if (a === "--apply") out.apply = true
  }
  return out
}

function readJsonIfExists(path: string): any | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

function findLatestPrev(targetVer: string): string | null {
  // Walk signatures/v*.json and pick the highest version less than target.
  const fs = require("node:fs") as typeof import("node:fs")
  if (!existsSync(SIGS_DIR)) return null
  const versions = fs
    .readdirSync(SIGS_DIR)
    .filter((f: string) => /^v\d+\.\d+\.\d+\.json$/.test(f))
    .map((f: string) => f.replace(/^v|\.json$/g, ""))
    .filter((v: string) => v !== targetVer)
  if (versions.length === 0) return null
  versions.sort((a: string, b: string) => compareSemver(a, b))
  // last < target
  let prev: string | null = null
  for (const v of versions) {
    if (compareSemver(v, targetVer) < 0) prev = v
  }
  return prev
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10))
  const pb = b.split(".").map((n) => parseInt(n, 10))
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

interface DiffLocateResult {
  path: string
  /** Base version parsed from the diff's first line, or null if unparseable. */
  base: string | null
}

function parseDiffBase(path: string): string | null {
  try {
    const first = readFileSync(path, "utf8").split(/\r?\n/, 1)[0] ?? ""
    const m = first.match(/(\d+\.\d+\.\d+)\s*(?:\u2192|->)\s*(\d+\.\d+\.\d+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function locateDiff(prev: string, next: string): DiffLocateResult | null {
  // 1. Best: signatures/diff-{prev}-to-{next}.md (incremental from prev exactly).
  const explicit = join(SIGS_DIR, `diff-${prev}-to-${next}.md`)
  if (existsSync(explicit)) return { path: explicit, base: prev }

  // 2. Next best: any signatures/diff-{base}-to-{next}.md where base is the
  // closest version <= prev (narrower window than the cumulative archive diff).
  const fs = require("node:fs") as typeof import("node:fs")
  if (existsSync(SIGS_DIR)) {
    const candidates = fs
      .readdirSync(SIGS_DIR)
      .map((f: string) => f.match(/^diff-(\d+\.\d+\.\d+)-to-(\d+\.\d+\.\d+)\.md$/))
      .filter((m): m is RegExpMatchArray => m !== null && m[2] === next)
      .map((m) => ({ base: m[1], file: m[0] }))
      .filter((c) => compareSemver(c.base, prev) <= 0)
      .sort((a, b) => compareSemver(b.base, a.base)) // descending: closest base first
    if (candidates[0]) {
      return { path: join(SIGS_DIR, candidates[0].file), base: candidates[0].base }
    }
  }

  // 3. Last resort: archive/v{next}/diff.md (cumulative from a fixed baseline).
  // Read its actual base from the first line so the caller can warn when it
  // doesn't match prev.
  const archive = join(ROOT, "archive", `v${next}`, "diff.md")
  if (existsSync(archive)) return { path: archive, base: parseDiffBase(archive) }

  return null
}

function buildReport(version: string, prev: string): ClassifierReport {
  const located = locateDiff(prev, version)
  const decodedDir = join(DECODED_BASE, `v${version}`, "decoded")
  const warnings: string[] = []

  const diffMd = located ? readFileSync(located.path, "utf8") : ""
  const prevSig = readJsonIfExists(join(SIGS_DIR, `v${prev}.json`))
  const nextSig = readJsonIfExists(join(SIGS_DIR, `v${version}.json`))

  if (located && located.base !== prev) {
    warnings.push(
      `diff base mismatch: requested prev=${prev} but loaded diff covers ${located.base ?? "unknown"}\u2192${version}; classifier matches against a wider surface than expected`,
    )
  }

  const slots: SlotResult[] = SLOT_DEFS.map((def) => {
    const c = def.classify(diffMd, prevSig, nextSig, decodedDir)
    const evidence = def.evidence(decodedDir).filter((p) => existsSync(p))
    if (c.status === "shape-change" && def.evidence(decodedDir).length > 0 && evidence.length === 0) {
      warnings.push(
        `slot ${def.slot} flagged shape-change but expected evidence files were not found in ${decodedDir} (Webpack chunk IDs may have shifted)`,
      )
    }
    return {
      slot: def.slot,
      status: c.status,
      detail: c.detail,
      evidence,
    }
  })

  let overall: ClassifierReport["overallStatus"] = "clean"
  if (!located || !nextSig) overall = "no-data"
  else if (slots.some((s) => s.status === "shape-change")) overall = "needs-review"
  else if (slots.some((s) => s.status === "bump")) overall = "bump-only"

  const bumpKind: ClassifierReport["recommendedAdapterVersionBump"] =
    overall === "needs-review" ? "minor" : overall === "bump-only" ? "patch" : "none"

  return {
    version,
    prev,
    generatedAt: new Date().toISOString(),
    signatureDiff: located?.path ?? "(missing)",
    signatureDiffBase: located?.base ?? null,
    warnings,
    decodedDir,
    slots,
    overallStatus: overall,
    recommendedAdapterVersionBump: bumpKind,
  }
}

function renderText(r: ClassifierReport): string {
  const lines: string[] = []
  lines.push(`Adapter PR classifier — Claude Code v${r.version} (prev v${r.prev})`)
  const diffSuffix = r.signatureDiffBase && r.signatureDiffBase !== r.prev ? `  [base: ${r.signatureDiffBase}]` : ""
  lines.push(`Diff:     ${r.signatureDiff}${diffSuffix}`)
  lines.push(`Decoded:  ${r.decodedDir}`)
  lines.push(`Overall:  ${r.overallStatus}  (recommended adapter bump: ${r.recommendedAdapterVersionBump})`)
  if (r.warnings.length > 0) {
    lines.push("")
    lines.push("Warnings:")
    for (const w of r.warnings) lines.push(`  ! ${w}`)
  }
  lines.push("")
  for (const s of r.slots) {
    const icon = s.status === "unchanged" ? "·" : s.status === "bump" ? "↑" : s.status === "shape-change" ? "!" : "?"
    lines.push(`  ${icon} ${s.slot.padEnd(32)} ${s.status.padEnd(14)} ${s.detail}`)
    for (const ev of s.evidence) lines.push(`        evidence: ${ev}`)
  }
  return lines.join("\n")
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.version) {
    console.error("usage: bun run monitor/prepare-adapter-pr.ts --version 2.1.X [--prev 2.1.Y] [--json] [--apply]")
    process.exit(2)
  }
  const prev = args.prev ?? findLatestPrev(args.version)
  if (!prev) {
    console.error(`No prior signature found before v${args.version}; pass --prev explicitly.`)
    process.exit(2)
  }

  const report = buildReport(args.version, prev)

  // Write state file regardless of mode for re-run detection.
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(
    join(STATE_DIR, `adapter-pr-${args.version}.json`),
    JSON.stringify(report, null, 2),
  )

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(renderText(report))
  }

  if (args.apply) {
    console.error("--apply is not yet implemented; see docs/automation/adapter-pr-pipeline.md")
    process.exit(1)
  }

  if (report.overallStatus === "needs-review") process.exit(1)
  if (report.overallStatus === "no-data") process.exit(2)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
