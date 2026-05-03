# Claude Code RE v2.1.126 refresh and adapter automation

## Purpose / Big Picture

Minzi wants the Claude Code reverse-engineering work and the `pi-claude-oauth-adapter` extension cleaned up so the current release data is live, the adapter matches the latest observed Claude Code request/rate-limit shapes, and future Claude Code major updates can mostly drive themselves. After this work, a reviewer should be able to see a PR containing the extracted Claude Code release diff, generated analysis, adapter updates if needed, and agent review notes, then only do a final human review before merge.

## Progress

- [x] (2026-05-03 11:54Z) Inventory initial unpublished state across Claude Code RE and adapter worktrees.
- [x] (2026-05-03 11:59Z) Run the Claude Code RE pipeline for latest Claude Code and archive the signature/diff/site outputs.
- [x] (2026-05-03 12:05Z) Compare latest extracted shapes against adapter assumptions and update adapter code/tests/docs (in dotfiles-agents PR #30, adapter 0.1.4).
- [x] (2026-05-03 12:08Z) Validate the adapter through Pi's package extension loading path and a live/non-destructive smoke (TS strict + npm pack dry-run + live `pi -p` smoke with v2.1.126 billing header observed).
- [~] Clean publication state: push repo work, publish or unblock `pi-claude-oauth-adapter@0.1.3+`, and point live Pi config at the intended package source.
  - [x] (2026-05-03 12:13Z) Pushed `claude-code-re` PR #53 + `dotfiles-agents` PR #30.
  - [ ] **BLOCKED**: npm publish for `pi-claude-oauth-adapter@0.1.4`. `~/.npmrc` token (`npm_DoBc...`, 2026-04-17) returns 401. Needs human `npm login` or fresh classic token.
- [x] (2026-05-03 12:16Z) Design and scaffold the automated Pi PR pipeline for extraction → diff → analysis → adapter PR → agent review (`docs/automation/adapter-pr-pipeline.md` + `monitor/prepare-adapter-pr.ts` v0 classifier; tested against v2.1.126).
- [ ] Standalone repo split for `pi-claude-oauth-adapter` (`minzique/pi-claude-oauth-adapter`).

## Surprises & Discoveries

- `~/Developer/claude-code-re` was on `main`, ahead of `origin/main` by one commit (`44dce62 feat: v2.1.114 extraction + auth system handoff doc`) with many untracked artifacts including `archive/v2.1.118/`, `signatures/v2.1.118.json`, `signatures/diff-2.1.98-to-2.1.118.md`, `monitor/request-shape/`, `binaries/`, and `pocs/`.
- `monitor/check-version.ts --json` reports latest Claude Code `2.1.126` and stable `2.1.118`; local monitor state still thought latest `2.1.114` and stable `2.1.98`.
- Pipeline run `bun run monitor/run-pipeline.ts --version 2.1.126 --no-analysis` succeeded: 3505 modules loaded, v2.1.126 signature written, diff against v2.1.98 written, notification printed because Telegram env was unset, and archive files written. `bun run monitor/build-site.ts` then rebuilt `docs/index.html` with 26 versions rendered.
- `monitor/build-site.ts` rewrote `docs/index.html` from the prior Astro-shaped generated output into the monitor script's standalone HTML shape, producing a large diff. Verify this is intended before committing the site output.
- `~/Developer/dotfiles-agents` already contains the adapter `0.1.3` commits on `main` (`8ce008d`, `21dfabe`), but npm `pi-claude-oauth-adapter` is still published at `0.1.2`.
- The old worktree `~/Developer/dotfiles-agents-oauth-health-status` is on a stale branch whose upstream is gone; its commits are equivalent to merged main commits but with different hashes.
- Local `~/Developer/dotfiles-agents/home/.pi/agent/settings.json` has user-machine config drift (default provider/model/changelog version); avoid mixing that into adapter commits.

## Decision Log

- Decision: create feature branch `feat/v2-1-126-adapter-automation` in `~/Developer/claude-code-re` before new work. Rationale: workspace has unpublished main changes, and project conventions say real work should not commit directly to `main`.
- Decision: keep long-form task detail in `/Users/minzi/Developer/.pi/todos/019deda9-1591-726c-a42d-7484fb62195a.md`. Rationale: the shared todo board must stay one-line per workstream.

## Outcomes & Retrospective

(fill when complete)

## Context and Orientation

Primary reverse-engineering repo: `/Users/minzi/Developer/claude-code-re`.

Important files in the reverse-engineering repo:

- `monitor/run-pipeline.ts` orchestrates Claude Code release processing. It checks the latest release, downloads a binary, runs `pocs/bun-demincer`, extracts signatures, writes `signatures/v{version}.json`, writes a markdown diff under `signatures/`, optionally runs agent analysis, and archives to `archive/v{version}/`.
- `monitor/extract-signatures.ts` defines the current static signature schema: beta flags, feature flags, env vars, endpoints, telemetry events, model IDs, system prompt prefixes, user-agent patterns, OAuth scopes, header keys, billing header format strings, and internal codenames.
- `monitor/build-site.ts` generates the GitHub Pages dashboard under `docs/`.
- `monitor/request-shape/` currently holds untracked request-shape capture artifacts. Treat captures as evidence, but do not blindly commit raw sensitive payloads.
- `signatures/v2.1.118.json` and `signatures/diff-2.1.98-to-2.1.118.md` are untracked outputs from a prior run.

Adapter package currently lives inside dotfiles:

- Source package: `/Users/minzi/Developer/dotfiles-agents/packages/pi-claude-oauth-adapter`.
- Core extension file: `/Users/minzi/Developer/dotfiles-agents/packages/pi-claude-oauth-adapter/extensions/index.ts`.
- Package metadata: `/Users/minzi/Developer/dotfiles-agents/packages/pi-claude-oauth-adapter/package.json`.
- Live Pi config: `/Users/minzi/.pi/agent/settings.json` and repo-managed source `/Users/minzi/Developer/dotfiles-agents/home/.pi/agent/settings.json`.

Terms:

- "Claude Code RE" means the `claude-code-re` repository that tracks reverse-engineered Claude Code binary signatures.
- "adapter" means the Pi extension package `pi-claude-oauth-adapter`, which makes Pi's Anthropic OAuth traffic look enough like Claude Code to use Claude Code OAuth accounts and surfaces quota/rate-limit status.
- "request shape" means the observable fields of Anthropic API requests sent by Claude Code: headers, billing header components, user-agent/version strings, system/custom message placement, rate-limit fields, and related environment-driven behavior.
- "standalone repo" means a new or split repository where the adapter is the root package, instead of a package embedded under `dotfiles-agents/packages/`.
- "Pi PR pipeline" means automation that runs with Pi agents to extract a new Claude Code release, diff it against the previous release, analyze whether adapter assumptions changed, edit the adapter if needed, open a PR, and attach reviewer feedback.

## Plan of Work

First, stabilize the current evidence. Run the existing Claude Code RE pipeline for v2.1.126 with analysis disabled if the full agent analysis path is not reliable, then rebuild the site. The result should be committed as release evidence: new binary manifest as appropriate, new signature JSON, diff markdown, archive files, and dashboard updates. Sensitive raw request captures must be inspected before commit.

Second, inspect the v2.1.126 diff and the decoded modules around billing headers, auth refresh, quota/rate-limit handling, and message/request construction. Compare those findings to the adapter constants and parsing logic in `extensions/index.ts`. Update only the assumptions that are demonstrably stale.

Third, validate the adapter. At minimum run package checks, TypeScript-compatible loading if available, `pi` extension package smoke, and a live non-destructive prompt that verifies the adapter loads and reports sane status without leaking secrets. Keep validation commands and outputs in this plan.

Fourth, clean publication state. Determine whether npm publishing is blocked by package ownership/auth or by the old unscoped package. Either publish the current unscoped package if auth is fixed, or prepare the move to a scoped standalone package with repository metadata changed accordingly. Do not leave live config pointing at an unpublished package.

Fifth, design/scaffold the autonomous PR loop. Add a script or workflow that can run the pipeline, summarize the diff, invoke Pi for adapter-impact analysis, create/update a branch, and prepare PR review artifacts. The first version can be manually triggered; the important outcome is that future major Claude Code updates produce a reviewable PR instead of loose local files.

## Concrete Steps

Run from `/Users/minzi/Developer/claude-code-re` unless noted.

1. Confirm state:

   ```bash
   git status --short --branch
   bun run monitor/check-version.ts --json
   ```

   Expected: branch `feat/v2-1-126-adapter-automation`; latest `2.1.126`; stable `2.1.118`.

2. Run pipeline:

   ```bash
   bun run monitor/run-pipeline.ts --version 2.1.126 --no-analysis
   bun run monitor/build-site.ts
   ```

   Expected: `signatures/v2.1.126.json`, a new `signatures/diff-...-to-2.1.126.md`, `archive/v2.1.126/`, and updated `docs/index.html`.

3. Inspect adapter-impact signatures:

   ```bash
   grep -R "cc_version=\|x-anthropic-billing-header\|rateLimitType\|overage\|CLAUDE_CODE_SUBSCRIPTION_TYPE" -n pocs/bun-demincer/work/v2.1.126/decoded | head -80
   ```

   Expected: enough module evidence to verify whether adapter constants/parsers changed.

4. In `/Users/minzi/Developer/dotfiles-agents`, update package source only if needed:

   ```bash
   cd /Users/minzi/Developer/dotfiles-agents
   git status --short --branch
   npm --prefix packages/pi-claude-oauth-adapter run check
   npm pack --prefix packages/pi-claude-oauth-adapter --dry-run
   ```

   Expected: no unrelated settings drift staged; package contents include `extensions`, README, changelog.

5. Live smoke after package source is selected:

   ```bash
   pi --version
   PI_CLAUDE_OAUTH_DEBUG=1 pi -p "Say OK and mention whether the Claude OAuth adapter status is visible."
   ```

   Expected: command completes or returns a known quota message; no secrets printed.

6. Publication/live checks:

   ```bash
   npm view pi-claude-oauth-adapter version --json
   npm whoami
   npm publish --dry-run /path/to/package-or-standalone
   ```

   Expected: dry-run succeeds before any real publish.

## Validation and Acceptance

Acceptance criteria:

- `claude-code-re` has v2.1.126 signatures, diff, archive, and rebuilt dashboard ready for PR/merge.
- Adapter source either needs no change with evidence, or has focused changes tied to v2.1.126 request-shape evidence.
- Adapter package checks and dry pack pass.
- A live Pi smoke confirms the extension still loads and does not leak secrets.
- npm/live package state is no longer ambiguous: either `0.1.3+` is published, or a documented blocker and standalone repo migration PR exists.
- The automated Pi PR pipeline has a concrete runnable entry point or workflow stub.

## Idempotence and Recovery

- `monitor/run-pipeline.ts --version` is mostly idempotent: it skips existing decoded directories and rewrites signature/diff outputs. If a run fails, rerun the same command after fixing the failing stage.
- If `bun-demincer` output is corrupt, remove only `pocs/bun-demincer/work/v2.1.126/` and rerun the pipeline.
- If raw captures contain secrets, do not commit them; move them to a local ignored evidence folder or redact before committing.
- If npm publish fails, preserve `npm whoami`, `npm owner ls`, and error output in a blocker note; do not keep bumping versions blindly.
- If live Pi smoke hits quota/rate limits, treat that as a valid adapter-path result only if the status output is sanitized and matches expected Claude quota semantics.
