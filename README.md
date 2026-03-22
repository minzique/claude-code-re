# Claude Code Monitor

Automated reverse engineering and change tracking for the Claude Code CLI.

We extract, deobfuscate, and diff every release of the CLI binary to track changes in API format, feature flags, telemetry, model support, and internal architecture. When something changes, we know about it.

**[Live dashboard](https://minzique.github.io/claude-code-re/)** · **[Research](https://minzique.github.io/claude-code-re/research/)**

## What this does

The CLI ships as a single native binary compiled with [Bun](https://bun.sh/docs/bundler/executables). We crack it open with [bun-demincer](https://github.com/vicnaum/bun-demincer), yielding ~3,000 JavaScript modules per release. A custom signature extractor greps those modules for patterns — beta flags, `tengu_*` feature flags, `process.env.*` references, API endpoints, HTTP headers, model IDs, OAuth scopes — and outputs a structured JSON snapshot that can be diffed between versions.

## Pipeline

```
check-version → fetch-binary → bun-demincer → extract-signatures → diff → analyze → archive → notify
```

| Script | What it does |
|--------|-------------|
| `monitor/check-version.ts` | Polls GCS bucket for new releases |
| `monitor/fetch-binary.ts` | Downloads + SHA256 verifies binaries |
| `monitor/extract-signatures.ts` | Greps decoded modules for 12 categories |
| `monitor/diff-signatures.ts` | Compares snapshots, outputs markdown/telegram |
| `monitor/analyze.ts` | Runs `claude -p` for deeper analysis on 4 areas |
| `monitor/archive.ts` | Snapshots everything per-version |
| `monitor/notify.ts` | Telegram alerts on changes |
| `monitor/run-pipeline.ts` | Orchestrates the full chain |
| `monitor/build-site.ts` | Generates the Astro dashboard |

## Quick start

```bash
cd monitor

# Check for new version
make check

# Full pipeline on a specific version
make pipeline-version VERSION=2.1.81

# Just rebuild the site
make site

# Install cron (every 6 hours)
make cron-install
```

## What we track per version

- Beta flags (27 as of v2.1.81)
- Feature flags / telemetry events (784 flags, 786 events)
- Environment variables (217)
- API endpoints (25)
- Model IDs (19)
- HTTP headers (21)
- OAuth scopes (6)
- System prompt prefixes
- Internal codenames

## Research

Original findings from binary analysis are on the [research page](https://minzique.github.io/claude-code-re/research/). Covers API request format, beta header assembly logic, context window decision tree, the `client_data` feature gate, billing attribution, the `tengu_*` flag system, internal codenames, and the Desktop VM architecture.

## Related work

- [AprilNEA's blog post](https://aprilnea.me/en/blog/reverse-engineering-claude-code-antspace) on Claude Code Web internals (Firecracker VMs, environment-manager, Antspace)
- [bun-demincer](https://github.com/vicnaum/bun-demincer) by vicnaum — the extraction tool that makes this possible
