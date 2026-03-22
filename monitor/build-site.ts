#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"

const ROOT = dirname(import.meta.dir)
const SIGS_DIR = join(ROOT, "signatures")
const DOCS_DIR = join(ROOT, "docs")

interface VersionData {
  version: string
  signature: any
  diff: string | null
  analysis: string | null
  prevVersion: string | null
  buildDate: string | null
}

function md(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- ~~`(.+?)`~~$/gm, '<div class="item removed">$1</div>')
    .replace(/^- `(.+?)`$/gm, '<div class="item added">$1</div>')
    .replace(/^- (.+)$/gm, '<div class="item">$1</div>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^\|(.+)\|$/gm, (_, row) => {
      const cells = row.split('|').map((c: string) => c.trim()).filter(Boolean)
      return `<tr>${cells.map((c: string) => `<td>${c}</td>`).join('')}</tr>`
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>')
    .replace(/<table>(<tr>.*?<\/tr>)\n?(<tr>.*?<\/tr>)/g, (_, header, sep) => {
      if (sep.includes('---')) return `<table><thead>${header}</thead><tbody>`
      return `<table>${header}${sep}`
    })
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/_([^_\n]+?)_/g, '<em>$1</em>')
  }

function loadVersions(): VersionData[] {
  const sigFiles = readdirSync(SIGS_DIR)
    .filter(f => f.startsWith("v") && f.endsWith(".json") && !f.includes("diff") && !f.includes("analysis"))
    .sort()

  const versions: VersionData[] = []
  for (let i = 0; i < sigFiles.length; i++) {
    const file = sigFiles[i]
    const version = file.replace(/^v/, "").replace(/\.json$/, "")
    const sig = JSON.parse(readFileSync(join(SIGS_DIR, file), "utf-8"))

    const prevVersion = i > 0 ? sigFiles[i - 1].replace(/^v/, "").replace(/\.json$/, "") : null
    const diffFile = prevVersion ? join(SIGS_DIR, `diff-${prevVersion}-to-${version}.md`) : null
    const analysisFile = join(SIGS_DIR, `analysis-${version}.md`)

    const archiveManifest = join(ROOT, "archive", `v${version}`, "binary-manifest.json")
    let buildDate: string | null = null
    if (existsSync(archiveManifest)) {
      try { buildDate = JSON.parse(readFileSync(archiveManifest, "utf-8")).buildDate } catch {}
    }

    versions.push({
      version,
      signature: sig,
      diff: diffFile && existsSync(diffFile) ? readFileSync(diffFile, "utf-8") : null,
      analysis: existsSync(analysisFile) ? readFileSync(analysisFile, "utf-8") : null,
      prevVersion,
      buildDate,
    })
  }

  return versions.reverse()
}

function renderVersionCard(v: VersionData, isLatest: boolean): string {
  const s = v.signature
  const date = v.buildDate ? new Date(v.buildDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Unknown"
  const betas = s.betaFlags?.length || 0
  const flags = s.featureFlags?.length || 0
  const envs = s.envVars?.length || 0
  const events = s.telemetryEvents?.length || 0
  const models = s.modelIds?.length || 0
  const endpoints = s.apiEndpoints?.length || 0

  const diffSections = v.diff ? parseDiffSummary(v.diff) : null

  return `
    <article class="edition ${isLatest ? 'latest' : ''}" id="v${v.version}">
      <div class="edition-header">
        <div class="edition-meta">
          ${isLatest ? '<span class="tag latest-tag">LATEST</span>' : ''}
          ${!v.prevVersion ? '<span class="tag baseline-tag">BASELINE</span>' : ''}
          <time>${date}</time>
        </div>
        <h2>v${v.version}</h2>
        <div class="stats-row">
          <span class="stat">${betas} <em>betas</em></span>
          <span class="stat">${flags} <em>flags</em></span>
          <span class="stat">${envs} <em>env vars</em></span>
          <span class="stat">${events} <em>events</em></span>
          <span class="stat">${models} <em>models</em></span>
          <span class="stat">${endpoints} <em>endpoints</em></span>
        </div>
      </div>

      ${diffSections ? `
      <div class="changes-summary">
        <h3>Changes from v${v.prevVersion}</h3>
        ${diffSections}
      </div>` : ''}

      <details class="section-details">
        <summary>Beta Flags</summary>
        <div class="detail-grid">${(s.betaFlags || []).map((b: any) => `<code>${b.value}</code>`).join('')}</div>
      </details>

      <details class="section-details">
        <summary>Model IDs</summary>
        <div class="detail-grid">${(s.modelIds || []).map((m: string) => `<code>${m}</code>`).join('')}</div>
      </details>

      <details class="section-details">
        <summary>API Endpoints</summary>
        <div class="detail-grid">${(s.apiEndpoints || []).map((e: string) => `<code>${e}</code>`).join('')}</div>
      </details>

      <details class="section-details">
        <summary>HTTP Headers</summary>
        <div class="detail-grid">${(s.headerKeys || []).map((h: string) => `<code>${h}</code>`).join('')}</div>
      </details>

      <details class="section-details">
        <summary>OAuth Scopes</summary>
        <div class="detail-grid">${(s.oauthScopes || []).map((o: string) => `<code>${o}</code>`).join('')}</div>
      </details>

      ${v.analysis ? `
      <details class="section-details analysis-section">
        <summary>AI Analysis</summary>
        <div class="analysis-content">${md(stripFrontMatter(v.analysis))}</div>
      </details>` : ''}
    </article>`
}

function parseDiffSummary(diffMd: string): string {
  const sections: string[] = []
  const catRegex = /^## (.+)$/gm
  let match
  while ((match = catRegex.exec(diffMd)) !== null) {
    const category = match[1]
    const start = match.index + match[0].length
    const nextMatch = catRegex.exec(diffMd)
    const end = nextMatch ? nextMatch.index : diffMd.length
    catRegex.lastIndex = nextMatch ? nextMatch.index : diffMd.length

    const block = diffMd.slice(start, end)
    const added = [...block.matchAll(/^- `(.+?)`$/gm)].map(m => m[1])
    const removed = [...block.matchAll(/^- ~~`(.+?)`~~$/gm)].map(m => m[1])

    if (added.length || removed.length) {
      sections.push(`
        <div class="change-category">
          <h4>${category}</h4>
          ${added.map(a => `<span class="change-item added">+ ${a}</span>`).join('')}
          ${removed.map(r => `<span class="change-item removed">- ${r}</span>`).join('')}
        </div>`)
    }
  }
  return sections.join('')
}

function stripFrontMatter(text: string): string {
  const lines = text.split('\n')
  const start = lines.findIndex(l => l.startsWith('## API request format') || l.startsWith('## New telemetry') || l.startsWith('## New features') || l.startsWith('## Security'))
  return start >= 0 ? lines.slice(start).join('\n') : text
}

function buildSite() {
  const versions = loadVersions()
  if (!versions.length) { console.error("No signatures found"); process.exit(1) }

  mkdirSync(DOCS_DIR, { recursive: true })

  const latest = versions[0]
  const lastUpdated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Claude Code Monitor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#070707;--surface:#0e0e0e;--surface2:#151515;--border:#1e1e1e;
  --text:#a09a8c;--text-bright:#d4cfc0;--text-dim:#5a5548;
  --accent:#b8943f;--accent-dim:#7a6428;
  --red:#9e4040;--green:#4a7a4a;
  --serif:'Instrument Serif',Georgia,serif;
  --sans:'IBM Plex Sans',system-ui,sans-serif;
  --mono:'IBM Plex Mono','SF Mono',monospace;
}
html{background:var(--bg);color:var(--text);font:15px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
body{max-width:960px;margin:0 auto;padding:0 24px 120px}

.masthead{padding:80px 0 48px;border-bottom:2px solid var(--accent);margin-bottom:48px;position:relative}
.masthead::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:var(--border)}
.masthead h1{font:italic 3.2rem/1 var(--serif);color:var(--text-bright);letter-spacing:-0.02em;margin-bottom:8px}
.masthead .subtitle{font:300 0.95rem/1.4 var(--sans);color:var(--text-dim);letter-spacing:0.08em;text-transform:uppercase}
.masthead .dateline{font:400 0.8rem var(--mono);color:var(--accent-dim);margin-top:16px;letter-spacing:0.04em}

.lede{background:var(--surface);border:1px solid var(--border);padding:28px 32px;margin-bottom:48px;position:relative}
.lede::before{content:'LATEST EDITION';font:600 0.65rem var(--mono);color:var(--accent);letter-spacing:0.1em;position:absolute;top:-8px;left:20px;background:var(--bg);padding:0 8px}
.lede h2{font:italic 1.6rem/1.2 var(--serif);color:var(--text-bright);margin-bottom:12px}
.lede p{font-size:0.9rem;color:var(--text)}

.edition{border:1px solid var(--border);margin-bottom:32px;background:var(--surface);position:relative;overflow:hidden}
.edition.latest{border-color:var(--accent-dim)}
.edition.latest::before{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:var(--accent)}

.edition-header{padding:28px 32px 20px;border-bottom:1px solid var(--border)}
.edition-meta{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.edition-meta time{font:400 0.75rem var(--mono);color:var(--text-dim);letter-spacing:0.04em}
.edition-header h2{font:italic 1.8rem/1.1 var(--serif);color:var(--text-bright);letter-spacing:-0.01em}

.tag{font:600 0.6rem var(--mono);letter-spacing:0.08em;padding:2px 8px;border:1px solid;text-transform:uppercase}
.latest-tag{color:var(--accent);border-color:var(--accent-dim)}
.baseline-tag{color:var(--text-dim);border-color:var(--border)}

.stats-row{display:flex;flex-wrap:wrap;gap:16px;margin-top:14px}
.stat{font:500 1.1rem var(--mono);color:var(--text-bright)}
.stat em{font:300 0.72rem var(--sans);color:var(--text-dim);font-style:normal;text-transform:uppercase;letter-spacing:0.06em;margin-left:3px}

.changes-summary{padding:20px 32px;border-bottom:1px solid var(--border);background:var(--surface2)}
.changes-summary h3{font:italic 1rem var(--serif);color:var(--text-dim);margin-bottom:12px}
.change-category{margin-bottom:12px}
.change-category h4{font:500 0.72rem var(--mono);color:var(--accent);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px}
.change-item{display:inline-block;font:400 0.78rem var(--mono);padding:2px 10px;margin:2px 4px 2px 0;border:1px solid var(--border);background:var(--bg)}
.change-item.added{color:#6a9f6a;border-color:#2a4a2a}
.change-item.removed{color:var(--red);border-color:#3a2020;text-decoration:line-through}

.section-details{border-top:1px solid var(--border)}
.section-details summary{padding:14px 32px;font:500 0.78rem var(--mono);color:var(--text-dim);letter-spacing:0.04em;cursor:pointer;user-select:none;transition:color 0.2s}
.section-details summary:hover{color:var(--text)}
.section-details summary::marker{color:var(--accent-dim)}
.section-details[open] summary{color:var(--text-bright);border-bottom:1px solid var(--border)}
.detail-grid{padding:16px 32px 20px;display:flex;flex-wrap:wrap;gap:6px}
.detail-grid code{font:400 0.72rem var(--mono);padding:3px 10px;background:var(--bg);border:1px solid var(--border);color:var(--text);white-space:nowrap}

.analysis-section .analysis-content{padding:24px 32px;font-size:0.88rem;line-height:1.7;color:var(--text)}
.analysis-content h1,.analysis-content h2{font:italic 1.2rem var(--serif);color:var(--text-bright);margin:28px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.analysis-content h3{font:500 0.85rem var(--sans);color:var(--accent);margin:20px 0 8px;letter-spacing:0.02em}
.analysis-content code{font:400 0.78rem var(--mono);padding:1px 6px;background:var(--bg);border:1px solid var(--border)}
.analysis-content pre{background:var(--bg);border:1px solid var(--border);padding:16px;margin:12px 0;overflow-x:auto}
.analysis-content pre code{padding:0;border:none;background:none;font-size:0.76rem;line-height:1.5}
.analysis-content table{border-collapse:collapse;width:100%;margin:12px 0;font-size:0.82rem}
.analysis-content td{padding:6px 12px;border:1px solid var(--border)}
.analysis-content thead td{font-weight:600;color:var(--text-bright);background:var(--surface2)}
.analysis-content strong{color:var(--text-bright)}
.analysis-content em{font-style:italic;color:var(--text-dim)}
.analysis-content .item{padding:2px 0;font-size:0.85rem}
.analysis-content .item.added{color:#6a9f6a}
.analysis-content .item.removed{color:var(--red);text-decoration:line-through}
.analysis-content p{margin:8px 0}
.analysis-content hr,.analysis-content hr+p{display:none}

.footer{margin-top:64px;padding-top:24px;border-top:1px solid var(--border);font:400 0.75rem var(--mono);color:var(--text-dim);display:flex;justify-content:space-between}
.footer a{color:var(--accent-dim);text-decoration:none}

@media(max-width:640px){
  .masthead h1{font-size:2.2rem}
  .edition-header,.changes-summary,.section-details summary,.detail-grid,.analysis-content{padding-left:16px;padding-right:16px}
  .stats-row{gap:10px}
}
</style>
</head>
<body>

<header class="masthead">
  <h1>The Claude Code Monitor</h1>
  <p class="subtitle">Independent Technical Intelligence &mdash; Reverse Engineering the CLI</p>
  <p class="dateline">Last updated ${lastUpdated} &bull; ${versions.length} versions tracked</p>
</header>

<div class="lede">
  <h2>v${latest.version}</h2>
  <p>${latest.diff
    ? `${countPattern(latest.diff, /^\- `/gm)} changes detected from v${latest.prevVersion}. ${latest.analysis ? 'Full AI analysis available below.' : ''}`
    : `Baseline extraction: ${latest.signature.betaFlags?.length} beta flags, ${latest.signature.featureFlags?.length} feature flags, ${latest.signature.envVars?.length} environment variables tracked.`
  }</p>
</div>

${versions.map((v, i) => renderVersionCard(v, i === 0)).join('\n')}

<footer class="footer">
  <span>Automated extraction via bun-demincer &bull; Analysis via Claude</span>
  <a href="https://github.com/minzique/claude-code-re">Source</a>
</footer>

</body>
</html>`

  writeFileSync(join(DOCS_DIR, "index.html"), html)
  console.log(`Site built: ${join(DOCS_DIR, "index.html")}`)
  console.log(`  ${versions.length} versions rendered`)
}

function countPattern(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length
}

buildSite()
