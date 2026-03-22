#!/usr/bin/env bun
/**
 * Claude Code Version Checker
 *
 * Polls the GCS distribution bucket for the latest Claude Code version.
 * Compares against the last known version stored in state/latest.txt.
 *
 * Usage:
 *   bun run monitor/check-version.ts          # check and print status
 *   bun run monitor/check-version.ts --json   # output JSON for piping
 *
 * Exit codes:
 *   0 = new version detected (or --json mode)
 *   1 = no change
 *   2 = error
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"

const GCS_BUCKET =
  "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases"

const STATE_DIR = join(dirname(import.meta.dir), "monitor", "state")
const LATEST_FILE = join(STATE_DIR, "latest.txt")
const STABLE_FILE = join(STATE_DIR, "stable.txt")

interface VersionCheck {
  latest: string
  stable: string
  previousLatest: string | null
  previousStable: string | null
  latestChanged: boolean
  stableChanged: boolean
  manifest: any | null
  timestamp: string
}

async function fetchVersion(channel: "latest" | "stable"): Promise<string> {
  const url = `${GCS_BUCKET}/${channel}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${channel}: ${res.status}`)
  return (await res.text()).trim()
}

async function fetchManifest(version: string): Promise<any> {
  const url = `${GCS_BUCKET}/${version}/manifest.json`
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

function readState(file: string): string | null {
  if (!existsSync(file)) return null
  return readFileSync(file, "utf-8").trim()
}

function writeState(file: string, value: string) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, value + "\n")
}

export async function checkVersion(updateState = false): Promise<VersionCheck> {
  const [latest, stable] = await Promise.all([
    fetchVersion("latest"),
    fetchVersion("stable"),
  ])

  const previousLatest = readState(LATEST_FILE)
  const previousStable = readState(STABLE_FILE)
  const latestChanged = previousLatest !== null && previousLatest !== latest
  const stableChanged = previousStable !== null && previousStable !== stable

  let manifest = null
  if (latestChanged || previousLatest === null) {
    manifest = await fetchManifest(latest)
  }

  if (updateState) {
    writeState(LATEST_FILE, latest)
    writeState(STABLE_FILE, stable)
  }

  return {
    latest,
    stable,
    previousLatest,
    previousStable,
    latestChanged,
    stableChanged,
    manifest,
    timestamp: new Date().toISOString(),
  }
}

// CLI entry point
if (import.meta.main) {
  const jsonMode = process.argv.includes("--json")
  const update = process.argv.includes("--update")

  try {
    const result = await checkVersion(update)

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2))
      process.exit(0)
    }

    console.log(`Latest:  ${result.latest}${result.previousLatest ? ` (was ${result.previousLatest})` : " (first check)"}`)
    console.log(`Stable:  ${result.stable}${result.previousStable ? ` (was ${result.previousStable})` : " (first check)"}`)

    if (result.latestChanged) {
      console.log(`\n🆕 NEW VERSION DETECTED: ${result.previousLatest} → ${result.latest}`)
      if (result.manifest) {
        console.log(`   Build date: ${result.manifest.buildDate}`)
        console.log(`   Platforms: ${Object.keys(result.manifest.platforms).join(", ")}`)
      }
      process.exit(0)
    }

    if (result.stableChanged) {
      console.log(`\n📌 STABLE PROMOTED: ${result.previousStable} → ${result.stable}`)
      process.exit(0)
    }

    if (result.previousLatest === null) {
      console.log("\nFirst run — state initialized.")
      if (update) console.log("State saved.")
      process.exit(0)
    }

    console.log("\nNo changes.")
    process.exit(1)
  } catch (err: any) {
    console.error(`Error: ${err.message}`)
    process.exit(2)
  }
}
