#!/usr/bin/env bun
/**
 * Full pipeline orchestrator. Chains:
 *   version-check → fetch → bun-demincer → extract-signatures → diff → notify
 *
 * Usage:
 *   bun run monitor/run-pipeline.ts                  # check for new version & process
 *   bun run monitor/run-pipeline.ts --version 2.1.82 # force-process a specific version
 *   bun run monitor/run-pipeline.ts --extract-only   # just re-extract signatures from existing decoded dir
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { checkVersion } from "./check-version"
import { fetchBinary } from "./fetch-binary"
import { extractSignatures } from "./extract-signatures"
import { diffSignatures, formatDiffMarkdown } from "./diff-signatures"
import { notifyNewVersion } from "./notify"
import { analyzeVersion } from "./analyze"
import { archiveVersion } from "./archive"

const ROOT = dirname(import.meta.dir)
const SIGS_DIR = join(ROOT, "signatures")
const DEMINCER_DIR = join(ROOT, "pocs", "bun-demincer")
const BINARIES_DIR = join(ROOT, "binaries")
const STATE_DIR = join(ROOT, "monitor", "state")

async function runDemincer(binaryPath: string, version: string): Promise<string> {
  const workDir = join(DEMINCER_DIR, "work", `v${version}`)
  const extractedDir = join(workDir, "extracted")
  const resplitDir = join(workDir, "resplit")
  const decodedDir = join(workDir, "decoded")

  if (existsSync(decodedDir) && existsSync(join(decodedDir, "manifest.json"))) {
    console.log(`  Decoded modules already exist at ${decodedDir}`)
    return decodedDir
  }

  mkdirSync(workDir, { recursive: true })

  const steps = [
    {
      name: "extract",
      cmd: ["node", join(DEMINCER_DIR, "src", "extract.mjs"), binaryPath, extractedDir + "/"],
      skip: existsSync(join(extractedDir, "manifest.json")),
    },
    {
      name: "resplit",
      cmd: () => {
        const cliJs = join(extractedDir, "src", "entrypoints", "cli.js")
        if (!existsSync(cliJs)) throw new Error(`cli.js not found at ${cliJs}`)
        return ["node", join(DEMINCER_DIR, "src", "resplit.mjs"), cliJs, resplitDir + "/"]
      },
      skip: existsSync(join(resplitDir, "manifest.json")),
    },
    {
      name: "classify vendors",
      cmd: [
        "node", join(DEMINCER_DIR, "src", "match-vendors.mjs"),
        resplitDir + "/",
        "--db", join(DEMINCER_DIR, "data", "vendor-fingerprints-1000.json"),
        "--classify",
      ],
      skip: false,
    },
    {
      name: "copy for deobfuscation",
      cmd: ["cp", "-r", resplitDir + "/", decodedDir],
      skip: existsSync(decodedDir),
    },
    {
      name: "deobfuscate",
      cmd: ["node", join(DEMINCER_DIR, "src", "deobfuscate.mjs"), "--dir", decodedDir + "/"],
      skip: false,
    },
  ]

  for (const step of steps) {
    if (step.skip) {
      console.log(`  [${step.name}] skipped (output exists)`)
      continue
    }
    console.log(`  [${step.name}] running...`)
    const cmd = typeof step.cmd === "function" ? step.cmd() : step.cmd
    const proc = Bun.spawn(cmd, {
      cwd: DEMINCER_DIR,
      stdout: "pipe",
      stderr: "pipe",
    })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`Step "${step.name}" failed (exit ${exitCode}): ${stderr.slice(0, 500)}`)
    }
    const stdout = await new Response(proc.stdout).text()
    const lastLines = stdout.split("\n").filter(Boolean).slice(-3).join("\n")
    console.log(`  [${step.name}] done: ${lastLines}`)
  }

  return decodedDir
}

function findPreviousSignature(currentVersion: string): string | null {
  if (!existsSync(SIGS_DIR)) return null
  const files = readdirSync(SIGS_DIR).filter((f) => f.endsWith(".json") && f.startsWith("v"))
  const sorted = files
    .filter((f) => f !== `v${currentVersion}.json`)
    .sort()
    .reverse()
  return sorted.length > 0 ? join(SIGS_DIR, sorted[0]) : null
}

interface PipelineResult {
  version: string
  isNew: boolean
  decodedDir: string
  signatureFile: string
  diffFile: string | null
  hasChanges: boolean
}

export async function runPipeline(forceVersion?: string): Promise<PipelineResult | null> {
  let version: string

  if (forceVersion) {
    version = forceVersion
    console.log(`Forced version: ${version}`)
  } else {
    console.log("Checking for new version...")
    const check = await checkVersion(true)
    console.log(`  Latest: ${check.latest}, Stable: ${check.stable}`)

    if (!check.latestChanged && check.previousLatest !== null) {
      console.log("  No new version. Done.")
      return null
    }
    version = check.latest
    console.log(`  New version detected: ${version}`)
  }

  const sigFile = join(SIGS_DIR, `v${version}.json`)
  if (existsSync(sigFile) && !forceVersion) {
    console.log(`Signatures already extracted for v${version}. Done.`)
    return {
      version,
      isNew: false,
      decodedDir: "",
      signatureFile: sigFile,
      diffFile: null,
      hasChanges: false,
    }
  }

  console.log(`\nStep 1: Fetching binary for v${version}...`)
  const fetchResult = await fetchBinary(version, "darwin-arm64")
  if (!fetchResult.checksumOk) {
    console.error("  Checksum mismatch! Aborting.")
    return null
  }

  console.log(`\nStep 2: Running bun-demincer pipeline...`)
  const decodedDir = await runDemincer(fetchResult.path, version)

  console.log(`\nStep 3: Extracting signatures...`)
  mkdirSync(SIGS_DIR, { recursive: true })
  const sig = extractSignatures(decodedDir)
  writeFileSync(sigFile, JSON.stringify(sig, null, 2) + "\n")
  console.log(`  Written to ${sigFile}`)

  let diffFile: string | null = null
  let hasChanges = false

  const prevSigFile = findPreviousSignature(version)
  if (prevSigFile) {
    console.log(`\nStep 4: Diffing against ${prevSigFile}...`)
    const prevSig = JSON.parse(readFileSync(prevSigFile, "utf-8"))
    const diff = diffSignatures(prevSig, sig)
    hasChanges = diff.hasChanges

    diffFile = join(SIGS_DIR, `diff-${prevSig.version}-to-${version}.md`)
    writeFileSync(diffFile, formatDiffMarkdown(diff))
    console.log(`  ${diff.summary}`)
    console.log(`  Written to ${diffFile}`)

    console.log(`\nStep 5: Sending notification...`)
    await notifyNewVersion(version, diff)
  } else {
    console.log(`\nStep 4: No previous signature to diff against (first extraction).`)
    console.log(`\nStep 5: Sending notification...`)
    await notifyNewVersion(version)
  }

  const skipAnalysis = process.argv.includes("--no-analysis")
  if (!skipAnalysis) {
    console.log(`\nStep 6: Running agentic analysis...`)
    try {
      await analyzeVersion(version, diffFile || undefined)
    } catch (err: any) {
      console.log(`  ⚠️  Analysis failed: ${err.message}`)
    }
  }

  console.log(`\nStep 7: Archiving version...`)
  try {
    archiveVersion(version)
  } catch (err: any) {
    console.log(`  ⚠️  Archive failed: ${err.message}`)
  }

  console.log(`\n✅ Pipeline complete for v${version}`)
  return { version, isNew: true, decodedDir, signatureFile: sigFile, diffFile, hasChanges }
}

if (import.meta.main) {
  const versionIdx = process.argv.indexOf("--version")
  const forceVersion = versionIdx >= 0 ? process.argv[versionIdx + 1] : undefined
  const extractOnly = process.argv.includes("--extract-only")

  if (extractOnly) {
    const version = forceVersion
    if (!version) {
      console.error("--extract-only requires --version")
      process.exit(1)
    }
    const decodedDir = join(DEMINCER_DIR, "work", `v${version}`, "decoded")
    if (!existsSync(decodedDir)) {
      const fallback = join(DEMINCER_DIR, "work", "decoded")
      if (existsSync(fallback)) {
        console.log(`Using fallback decoded dir: ${fallback}`)
        mkdirSync(SIGS_DIR, { recursive: true })
        const sig = extractSignatures(fallback)
        sig.version = version
        const sigFile = join(SIGS_DIR, `v${version}.json`)
        writeFileSync(sigFile, JSON.stringify(sig, null, 2) + "\n")
        console.log(`Written to ${sigFile}`)
        process.exit(0)
      }
      console.error(`Decoded dir not found: ${decodedDir}`)
      process.exit(1)
    }
    mkdirSync(SIGS_DIR, { recursive: true })
    const sig = extractSignatures(decodedDir)
    const sigFile = join(SIGS_DIR, `v${version}.json`)
    writeFileSync(sigFile, JSON.stringify(sig, null, 2) + "\n")
    console.log(`Written to ${sigFile}`)
    process.exit(0)
  }

  const result = await runPipeline(forceVersion)
  if (!result) process.exit(1)
}
