#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = dirname(import.meta.dir);
const DEFAULT_INPUT = join(ROOT, "monitor", "request-shape", "artifacts", "baseline-default.capture.probe.jsonl");
const FIXTURES_DIR = join(ROOT, "monitor", "request-shape", "fixtures");

const input = process.argv[2] ?? DEFAULT_INPUT;
const lines = readFileSync(input, "utf8").trim().split("\n").filter(Boolean);
const last = JSON.parse(lines.at(-1) ?? "{}");
const prompt = last?.payload?.system?.[2]?.text;
if (typeof prompt !== "string") {
  throw new Error(`Could not find pi prompt in ${input}`);
}

const markerA = "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):";
const markerB = "<available_skills>";

const idxA = prompt.indexOf(markerA);
const idxB = prompt.indexOf(markerB);
if (idxA < 0 || idxB < 0 || idxB <= idxA) {
  throw new Error("Expected prompt markers were not found");
}

const introTools = prompt.slice(0, idxA).trim();
const docsProject = prompt.slice(idxA, idxB).trim();
const skillsContext = prompt.slice(idxB).trim();

mkdirSync(FIXTURES_DIR, { recursive: true });
const outputs = [
  ["pi-intro-tools.txt", introTools],
  ["pi-docs-project.txt", docsProject],
  ["pi-skills-context.txt", skillsContext],
] as const;

for (const [name, text] of outputs) {
  const path = join(FIXTURES_DIR, name);
  writeFileSync(path, `${text}\n`);
  console.log(`wrote ${path}`);
}
