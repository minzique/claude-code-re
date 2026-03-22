#!/usr/bin/env bun
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, dirname } from "node:path"

const ROOT = dirname(import.meta.dir)
const ARCHIVE_DIR = join(ROOT, "archive")
const SIGS_DIR = join(ROOT, "signatures")
const DEMINCER_DIR = join(ROOT, "pocs", "bun-demincer")
const BINARIES_DIR = join(ROOT, "binaries")

interface ArchiveManifest {
  version: string
  archivedAt: string
  contents: {
    signature: boolean
    decodedModules: boolean
    binary: boolean
    diff: string | null
    analysis: string | null
    manifest: boolean
  }
  stats: {
    totalModules: number
    appModules: number
    vendorModules: number
    binarySize: number | null
  }
}

function countFiles(dir: string, pattern: RegExp): number {
  if (!existsSync(dir)) return 0
  return readdirSync(dir).filter((f) => pattern.test(f)).length
}

export function archiveVersion(version: string): string {
  const versionDir = join(ARCHIVE_DIR, `v${version}`)
  mkdirSync(versionDir, { recursive: true })

  const manifest: ArchiveManifest = {
    version,
    archivedAt: new Date().toISOString(),
    contents: {
      signature: false,
      decodedModules: false,
      binary: false,
      diff: null,
      analysis: null,
      manifest: false,
    },
    stats: { totalModules: 0, appModules: 0, vendorModules: 0, binarySize: null },
  }

  // 1. Copy signature JSON
  const sigFile = join(SIGS_DIR, `v${version}.json`)
  if (existsSync(sigFile)) {
    cpSync(sigFile, join(versionDir, "signature.json"))
    manifest.contents.signature = true
    console.log(`  ✓ signature.json`)
  }

  // 2. Copy decoded app modules (not vendor — too large, less interesting)
  const decodedSources = [
    join(DEMINCER_DIR, "work", `v${version}`, "decoded"),
    join(DEMINCER_DIR, "work", "decoded"),
  ]
  const decodedDir = decodedSources.find((d) => existsSync(d))
  if (decodedDir) {
    const modulesDir = join(versionDir, "modules")
    mkdirSync(modulesDir, { recursive: true })

    const files = readdirSync(decodedDir).filter((f) => f.endsWith(".js") && !f.startsWith("vendor"))
    let copied = 0
    for (const file of files) {
      const src = join(decodedDir, file)
      if (statSync(src).isFile()) {
        cpSync(src, join(modulesDir, file))
        copied++
      }
    }

    // Also copy manifest.json and graph.json
    for (const meta of ["manifest.json", "graph.json"]) {
      const metaSrc = join(decodedDir, meta)
      if (existsSync(metaSrc)) cpSync(metaSrc, join(modulesDir, meta))
    }

    manifest.contents.decodedModules = true
    manifest.stats.appModules = copied
    manifest.stats.vendorModules = countFiles(join(decodedDir, "vendor"), /\.js$/)
    manifest.stats.totalModules = copied + manifest.stats.vendorModules
    console.log(`  ✓ ${copied} app modules archived (${manifest.stats.vendorModules} vendor skipped)`)
  }

  // 3. Copy binary manifest (not the binary itself — too large for git)
  const binaryManifest = join(BINARIES_DIR, `v${version}-darwin-arm64`, "manifest.json")
  if (existsSync(binaryManifest)) {
    cpSync(binaryManifest, join(versionDir, "binary-manifest.json"))
    manifest.contents.manifest = true
    const bm = JSON.parse(readFileSync(binaryManifest, "utf-8"))
    manifest.stats.binarySize = bm.size || null
    console.log(`  ✓ binary-manifest.json`)
  }

  // 4. Find and copy any existing diff
  const diffs = readdirSync(SIGS_DIR).filter((f) => f.endsWith(".md") && f.includes(`to-${version}`))
  if (diffs.length > 0) {
    cpSync(join(SIGS_DIR, diffs[0]), join(versionDir, "diff.md"))
    manifest.contents.diff = diffs[0]
    console.log(`  ✓ diff.md (${diffs[0]})`)
  }

  // 5. Find and copy any existing analysis
  const analysisFile = join(SIGS_DIR, `analysis-${version}.md`)
  if (existsSync(analysisFile)) {
    cpSync(analysisFile, join(versionDir, "analysis.md"))
    manifest.contents.analysis = `analysis-${version}.md`
    console.log(`  ✓ analysis.md`)
  }

  // 6. Write archive manifest
  writeFileSync(join(versionDir, "archive.json"), JSON.stringify(manifest, null, 2) + "\n")
  console.log(`  ✓ archive.json`)

  return versionDir
}

if (import.meta.main) {
  const version = process.argv[2]
  if (!version) {
    // Archive all versions that have signatures
    if (!existsSync(SIGS_DIR)) {
      console.error("No signatures directory found")
      process.exit(1)
    }
    const versions = readdirSync(SIGS_DIR)
      .filter((f) => f.startsWith("v") && f.endsWith(".json") && !f.includes("diff") && !f.includes("analysis"))
      .map((f) => f.replace(/^v/, "").replace(/\.json$/, ""))
      .sort()

    console.log(`Archiving ${versions.length} versions...\n`)
    for (const v of versions) {
      console.log(`v${v}:`)
      archiveVersion(v)
      console.log()
    }
    console.log("Done.")
  } else {
    console.log(`Archiving v${version}:`)
    const dir = archiveVersion(version)
    console.log(`\nArchived to ${dir}`)
  }
}
