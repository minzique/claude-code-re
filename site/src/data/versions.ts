import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SIGS = join(process.cwd(), "..", "signatures");
const ARCHIVE = join(process.cwd(), "..", "archive");

export interface VersionData {
  version: string;
  date: string;
  signature: Signature;
  diff: string | null;
  analysis: string | null;
  prevVersion: string | null;
}

export interface Signature {
  betaFlags: { value: string; sourceModule: string }[];
  featureFlags: { name: string; defaultValue: string | null; sourceModule: string }[];
  envVars: string[];
  apiEndpoints: string[];
  telemetryEvents: string[];
  modelIds: string[];
  systemPromptPrefixes: string[];
  headerKeys: string[];
  oauthScopes: string[];
}

export function loadVersions(): VersionData[] {
  const sigFiles = readdirSync(SIGS)
    .filter((f) => f.startsWith("v") && f.endsWith(".json") && !f.includes("diff") && !f.includes("analysis"))
    .sort();

  const versions: VersionData[] = [];

  for (let i = 0; i < sigFiles.length; i++) {
    const file = sigFiles[i];
    const version = file.replace(/^v/, "").replace(/\.json$/, "");
    const sig = JSON.parse(readFileSync(join(SIGS, file), "utf-8"));

    const prevVersion = i > 0 ? sigFiles[i - 1].replace(/^v/, "").replace(/\.json$/, "") : null;
    const diffFile = prevVersion ? join(SIGS, `diff-${prevVersion}-to-${version}.md`) : null;
    const analysisFile = join(SIGS, `analysis-${version}.md`);

    const archiveManifest = join(ARCHIVE, `v${version}`, "binary-manifest.json");
    let date = "Unknown";
    if (existsSync(archiveManifest)) {
      try {
        const m = JSON.parse(readFileSync(archiveManifest, "utf-8"));
        const bd = m.buildDate || m.downloadedAt;
        if (bd) date = new Date(bd).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      } catch {}
    }

    versions.push({
      version,
      date,
      signature: sig,
      diff: diffFile && existsSync(diffFile) ? readFileSync(diffFile, "utf-8") : null,
      analysis: existsSync(analysisFile) ? readFileSync(analysisFile, "utf-8") : null,
      prevVersion,
    });
  }

  return versions.reverse();
}

export function parseDiff(diffMd: string): { category: string; added: string[]; removed: string[] }[] {
  const sections: { category: string; added: string[]; removed: string[] }[] = [];
  const parts = diffMd.split(/^## /gm).filter(Boolean);

  for (const part of parts) {
    const lines = part.split("\n");
    const category = lines[0]?.trim();
    if (!category || category.startsWith("Claude Code Diff") || category.startsWith("_")) continue;

    const added = lines.filter((l) => l.match(/^- `[^~]/)).map((l) => l.replace(/^- `(.+)`$/, "$1"));
    const removed = lines.filter((l) => l.includes("~~")).map((l) => l.replace(/^- ~~`(.+?)`~~$/, "$1"));

    if (added.length || removed.length) sections.push({ category, added, removed });
  }
  return sections;
}
