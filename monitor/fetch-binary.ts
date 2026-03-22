#!/usr/bin/env bun
/**
 * Claude Code Binary Fetcher
 *
 * Downloads a specific version's binary for a given platform.
 * Verifies checksum against manifest.
 *
 * Usage:
 *   bun run monitor/fetch-binary.ts 2.1.80                          # darwin-arm64 (default)
 *   bun run monitor/fetch-binary.ts 2.1.80 --platform linux-x64
 *   bun run monitor/fetch-binary.ts 2.1.80 --all                    # all platforms
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"

const GCS_BUCKET =
  "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases"

const BINARIES_DIR = join(dirname(import.meta.dir), "binaries")

const ALL_PLATFORMS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "linux-arm64-musl",
  "linux-x64-musl",
  "win32-x64",
  "win32-arm64",
]

interface FetchResult {
  version: string
  platform: string
  path: string
  size: number
  checksumOk: boolean
}

async function fetchManifest(version: string): Promise<any> {
  const url = `${GCS_BUCKET}/${version}/manifest.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Manifest not found for v${version}: ${res.status}`)
  return res.json()
}

async function sha256(data: ArrayBuffer): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256")
  hash.update(new Uint8Array(data))
  return hash.digest("hex")
}

export async function fetchBinary(
  version: string,
  platform: string,
): Promise<FetchResult> {
  const manifest = await fetchManifest(version)
  const platformInfo = manifest.platforms?.[platform]
  if (!platformInfo) {
    throw new Error(`Platform ${platform} not found in manifest for v${version}`)
  }

  const outDir = join(BINARIES_DIR, `v${version}-${platform}`)
  const binaryName = platformInfo.binary || "claude"
  const outPath = join(outDir, binaryName)

  if (existsSync(outPath)) {
    console.log(`  Already exists: ${outPath}`)
    // Verify checksum of existing
    const existing = await Bun.file(outPath).arrayBuffer()
    const checksum = await sha256(existing)
    return {
      version,
      platform,
      path: outPath,
      size: existing.byteLength,
      checksumOk: checksum === platformInfo.checksum,
    }
  }

  const url = `${GCS_BUCKET}/${version}/${platform}/${binaryName}`
  console.log(`  Downloading ${platform}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)

  const data = await res.arrayBuffer()
  const checksum = await sha256(data)
  const checksumOk = checksum === platformInfo.checksum

  mkdirSync(outDir, { recursive: true })
  writeFileSync(outPath, new Uint8Array(data))

  // Save manifest alongside
  writeFileSync(
    join(outDir, "manifest.json"),
    JSON.stringify({ version, platform, ...platformInfo, downloadedAt: new Date().toISOString() }, null, 2),
  )

  console.log(
    `  ${platform}: ${(data.byteLength / 1024 / 1024).toFixed(1)}MB ${checksumOk ? "✅" : "❌ CHECKSUM MISMATCH"}`,
  )

  return { version, platform, path: outPath, size: data.byteLength, checksumOk }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"))
  const version = args[0]

  if (!version) {
    console.error("Usage: bun run fetch-binary.ts <version> [--platform <p>] [--all]")
    process.exit(1)
  }

  const fetchAll = flags.includes("--all")
  const platformIdx = flags.indexOf("--platform")
  const platforms = fetchAll
    ? ALL_PLATFORMS
    : [platformIdx >= 0 ? flags[platformIdx + 1] : "darwin-arm64"]

  console.log(`Fetching Claude Code v${version}`)

  const results: FetchResult[] = []
  for (const platform of platforms) {
    try {
      results.push(await fetchBinary(version, platform))
    } catch (err: any) {
      console.error(`  ${platform}: ${err.message}`)
    }
  }

  console.log(`\nDone. ${results.length}/${platforms.length} platforms fetched.`)
  if (results.some((r) => !r.checksumOk)) {
    console.error("⚠️  Some checksums failed!")
    process.exit(1)
  }
}
