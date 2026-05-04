# Adapter PR pipeline

Status: design (v0). Implementation lives in `monitor/prepare-adapter-pr.ts`.

## Purpose

Make Claude Code release tracking _almost_ self-driving for the
`pi-claude-oauth-adapter` extension. Each new Claude Code release should
produce one reviewable PR that contains:

1. Extracted release evidence (signatures + diff + dashboard).
2. A focused adapter change if and only if the diff implies one.
3. Agent-written analysis notes attached to the PR.
4. Triggers for at least two automated reviewers (Claude / Pi).

The human's only required step is final review and merge.

## Stages

```
┌─────────────────┐  monitor/run-pipeline.ts
│ 1. extract      │  → signatures/v{ver}.json
│                 │  → signatures/diff-{prev}-to-{ver}.md
│                 │  → archive/v{ver}/*
└────────┬────────┘
         │
┌────────▼────────┐  monitor/prepare-adapter-pr.ts (this doc)
│ 2. classify     │  Walks the diff + decoded modules and decides
│   (advisory)    │  whether any adapter-relevant slot changed:
│                 │   • billingHeader.format / salt / sample
│                 │   • rateLimit.headers / thresholds / fallback
│                 │   • systemPrompt placement / cache rules
│                 │   • OAuth scopes / refresh path
│                 │   • user-agent / version constants
└────────┬────────┘
         │
┌────────▼────────┐  monitor/prepare-adapter-pr.ts
│ 3. patch        │  Deterministic edits the script can do alone:
│                 │   • bump DEFAULT_CLAUDE_CODE_VERSION
│                 │   • bump package.json version (patch)
│                 │   • prepend CHANGELOG entry
│                 │   • update README "What's new" stub
│                 │  Anything beyond this is left as TODOs in the PR
│                 │  body so a human/agent fills them in.
└────────┬────────┘
         │
┌────────▼────────┐  gh pr create
│ 4. open PR      │  Title: "fix(pi-claude-oauth-adapter): sync to
│                 │  Claude Code {ver}"
│                 │  Body: classifier output + diff link + checklist
└────────┬────────┘
         │
┌────────▼────────┐  Existing reviewer workflows
│ 5. review       │  • dotfiles-agents Claude PR Review (live)
│                 │  • dotfiles-agents Pi PR Review (gated, optional)
│                 │  • dotfiles-agents Codex PR Review (gated, optional)
└─────────────────┘
```

## Trigger model

**v0 (manual)**: a human runs

```bash
bun run monitor/prepare-adapter-pr.ts --version 2.1.X
```

after `monitor/run-pipeline.ts` for the same version. This proves the
classifier + patch logic before automating anything that touches
production branches.

**v1 (cron + nudge)**: a launchd/cron timer runs

```bash
# planned shape (--auto + --apply not yet implemented; see Non-goals)
bun run monitor/run-pipeline.ts && \
bun run monitor/prepare-adapter-pr.ts --auto --apply
```

once a day. If `check-version` reports a new release, the script runs
the full pipeline and opens a PR. `--auto` will infer the version from
monitor state, `--apply` will perform the deterministic patch + branch +
`gh pr create`. The human is notified via the existing
`monitor/notify.ts` channel (Telegram if configured) plus the
GitHub PR notification.

**v2 (agent loop)**: the PR opens with `@claude` mentioned in the body
and a "todo: classify" checklist. The Claude reviewer fills in the
adapter changes itself, comments back, and the human merges. At this
point the agent reviewer is doing work, not just review, so we should
gate it behind a label like `agent:may-edit`.

## Classifier inputs

Source of truth is the diff `signatures/diff-{prev}-to-{ver}.md` plus
selected files under `pocs/bun-demincer/work/v{ver}/decoded/`.

The classifier walks signature fields and grep-matches in decoded
modules:

| Adapter slot              | Signature field(s)                                   | Decoded module hint                                  |
|---------------------------|------------------------------------------------------|------------------------------------------------------|
| `DEFAULT_CLAUDE_CODE_VERSION` | `version`                                        | `decoded/4683.js` (`VERSION:` literal)               |
| Billing header format     | `billingHeader.format`, `salt`, `sampleChars`        | `decoded/2129.js` (`x-anthropic-billing-header`)     |
| Rate-limit header keys    | `rateLimit.headerKeys`                               | `decoded/2490.js` (`anthropic-ratelimit-unified-*`)  |
| Rate-limit thresholds     | `rateLimit.thresholds`                               | `decoded/2491.js`                                    |
| Fallback / upgrade-paths  | `rateLimit.fallback`, `rateLimit.upgradePaths`       | `decoded/2490.js` (`rl_` fallback)                   |
| System prompt placement   | `systemPrompt.cacheBlock`, `systemPrompt.identity`   | `decoded/4682.js`, `4687.js`, `4688.js`              |
| OAuth scopes              | `oauth.scopes`                                       | (varies; matched by literal `user:inference`)        |
| User-agent prefix         | `userAgent`                                          | (constant in entry module)                           |

For each slot the classifier emits:

- `unchanged` — no PR action.
- `bump` — value changed but shape compatible (e.g. version, salt).
  Patch automatically.
- `shape-change` — type/structure changed. Do NOT patch; flag in PR
  body as `requires human review`.

## Output contract

### Current (v0, ships in this PR)

`monitor/prepare-adapter-pr.ts` writes:

- A tabular classifier report to stdout (or JSON with `--json`).
- A state file at `monitor/state/adapter-pr-{ver}.json` capturing the
  full report so re-runs are idempotent.
- Exit code: `0` clean / bump-only, `1` needs human review, `2` no
  data (signature/diff missing).

That is the entire v0 surface. The script does **not** touch any other
repo or open any PR.

### Planned (v1+, behind `--apply`)

When `--apply` is wired up, the script will additionally:

- Create a branch in the adapter-source repo (currently
  `dotfiles-agents/packages/pi-claude-oauth-adapter`).
- Make a single commit per slot category
  (`fix(adapter): bump DEFAULT_CLAUDE_CODE_VERSION to {ver}`, etc.) so
  reviewers can see intent commit-by-commit.
- Open a PR via `gh pr create` whose body contains:
  - link to `signatures/diff-{prev}-to-{ver}.md`
  - classifier table (slot → status → evidence path)
  - checklist of follow-ups for `shape-change` slots
  - copy of the live smoke command for the reviewer to run

## Non-goals (v0)

- **No autonomous merge**. Human approves.
- **No agent-driven shape-change patches**. Those still require a
  thinking pass; they generate a PR but with empty diffs in the slot
  files plus checklist items.
- **No changes to `monitor/run-pipeline.ts`**. The pipeline stays a
  pure extraction tool; this script is downstream.

## Open questions

1. Where should the adapter live by the time v1 ships? Standalone
   `minzique/pi-claude-oauth-adapter` is the leading candidate; the
   script currently assumes the dotfiles path and will need a
   `--repo-path` flag.
2. Does `gh pr create` work cleanly from a launchd-launched process?
   May need `GH_TOKEN` env (no keychain) and a working `git` identity.
3. Should the classifier consume `archive/v{ver}/diff.md` instead of
   `signatures/diff-{prev}-to-{ver}.md`? They are similar but archive
   is more stable.

## Related

- Active exec plan: `docs/exec-plans/active/claude-code-re-adapter-automation.md`
- Adapter source: `dotfiles-agents/packages/pi-claude-oauth-adapter`
- Live reviewers: see `dotfiles-agents/.github/workflows/{claude,pi,codex}-pr-review.yml`
