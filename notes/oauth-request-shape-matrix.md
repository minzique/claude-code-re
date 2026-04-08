# Claude OAuth request-shape matrix

Date: 2026-04-08

## Goal
Find the smallest Anthropic OAuth request shape that keeps pi on subscription routing without unnecessary Claude identity bleed.

## Harness
### Files
- `monitor/capture-request-shape.ts`
- `monitor/probe-matrix.ts`
- `monitor/extract-pi-prompt-sections.ts`
- `monitor/request-shape/probe-extension.ts`
- `monitor/request-shape/fixtures/official-sdk-base.txt`
- `monitor/request-shape/fixtures/pi-*.txt`
- artifacts under `monitor/request-shape/artifacts/`

### Official CLI capture
```bash
cd /Users/minzi/Developer/claude-code-re
bun run monitor/probe-matrix.ts capture-official
```

### Direct-shell pi probe pattern
Authoritative for now when verifying the patched local build:
```bash
cd /Users/minzi/Developer/claude-code-re
PI_PROBE_LOG_FILE=monitor/request-shape/artifacts/manual-real.probe.jsonl \
pi --provider anthropic --model claude-sonnet-4-6 --thinking off --no-session \
  -e ./monitor/request-shape/probe-extension.ts \
  -p 'Reply with exactly: ok'
```

## Key findings
### Official Claude CLI print-mode system blocks captured
1. billing header
2. `You are a Claude agent, built on Anthropic's Claude Agent SDK.`
3. official Agent SDK base prompt

Current local CLI capture landed at:
- `monitor/request-shape/artifacts/official-cli-capture.json`

### Minimal accepted shapes found
These were accepted by the real API in direct pi tests:
- `billing + short neutral system prompt`
- `billing + Agent SDK identity + official SDK base prompt`
- `billing + Agent SDK identity + official SDK base prompt + tiny neutral tail`
- `billing + Agent SDK identity + official SDK base prompt + single pi-branded tail line`
- `billing + pi prompt without the pi docs-only section`
- `billing + Agent SDK identity + pi prompt without the pi docs-only section`
- `billing + Agent SDK identity + official SDK base prompt + pi prompt without the pi docs-only section`

### Rejected shapes found
These consistently routed to extra usage:
- default patched pi payload
- `billing + pi prompt with identity line removed`
- `billing + Agent SDK identity + full pi prompt`
- `billing + Agent SDK identity + full pi prompt + no tools`
- `billing + Agent SDK identity + official SDK base prompt + full pi prompt`
- `billing + Agent SDK identity + official SDK base prompt + pi docs-only section`
- `billing + Agent SDK identity + official SDK base prompt + pi docs/project section`
- `billing + Agent SDK identity + official SDK base prompt + pi docs without the “when asked about” bullet`

## Strongest conclusion so far
The smallest working pi-native shape found so far is:
- billing header
- **no Claude/SDK identity prompt block required**
- pi system prompt with the **`Pi documentation (...)` section removed**

This was validated two ways:
1. extension-based payload replacement against the real API
2. source patch in `pi-mono` with a default real `pi` run returning `ok`

## Extension-first workaround now exists
Installable package:
- `/Users/minzi/Developer/claude-code-re/packages/pi-claude-oauth-adapter`
- entrypoint: `/Users/minzi/Developer/claude-code-re/packages/pi-claude-oauth-adapter/extensions/index.ts`
- package README: `/Users/minzi/Developer/claude-code-re/packages/pi-claude-oauth-adapter/README.md`

Current extension behavior for Anthropic OAuth runs:
- `before_agent_start`: strip the pi docs-only section from the system prompt
- `context`: optionally reintroduce the removed docs section through a **non-system** path
  - supported reinjection modes:
    - `prepend-custom-message` (default)
    - `append-custom-message`
    - `user-reminder`
    - `none`
- `before_provider_request`:
  - add the Claude billing header if the installed pi provider build does not already include it
  - remove the Claude Code identity block
  - strip any docs-only residue from system blocks as a final safeguard

Relevant env knobs:
- `PI_CLAUDE_OAUTH_REINJECT_SCOPE=never|always|pi-only` (default `pi-only`)
- `PI_CLAUDE_OAUTH_REINJECT_MODE=prepend-custom-message|append-custom-message|user-reminder|none`
- `PI_CLAUDE_OAUTH_LOG_FILE=/path/to/jsonl`
- `PI_CLAUDE_OAUTH_DOCS_FILE=/path/to/pi-docs-only.txt`

### Verified extension results
#### On pristine upstream pi 0.65.2
A clean install at:
- `/Users/minzi/Developer/pi-stock-0.65.2`

was tested with:
```bash
node /Users/minzi/Developer/pi-stock-0.65.2/node_modules/@mariozechner/pi-coding-agent/dist/cli.js \
  --provider anthropic --model claude-opus-4-6 --thinking xhigh --no-session \
  -e /Users/minzi/Developer/claude-code-re/packages/pi-claude-oauth-adapter/extensions/index.ts \
  -p 'Reply with exactly: ok'
```
and returned `ok`.

The adapter log on pristine upstream 0.65.2 proved the extension added the missing billing header:
- `billingAdded: true`
- `systemBefore`: identity + full pi prompt
- `systemAfter`: billing header + pi prompt without docs-only section

#### Global install on this machine
Global pi settings now include:
- `../../Developer/claude-code-re/packages/pi-claude-oauth-adapter`

Current default `pi` command now points to a clean local stock install:
- `/Users/minzi/.bun/bin/pi`
- symlink target: `/Users/minzi/Developer/pi-stock-0.65.2/node_modules/@mariozechner/pi-coding-agent/dist/cli.js`

Fresh checks from `~` with no `-e` flag now succeed:
1. `pi --provider anthropic --model claude-opus-4-6 --thinking xhigh --no-session -p 'Reply with exactly: ok'` -> `ok`
2. `pi --provider anthropic --model claude-opus-4-6 --thinking xhigh --no-session -p 'What is the main pi documentation path? Reply with the path only.'`
   -> `/Users/minzi/Developer/pi-stock-0.65.2/node_modules/@mariozechner/pi-coding-agent/README.md`

### Reproducible extension check
- script: `/Users/minzi/Developer/claude-code-re/monitor/check-claude-oauth-adapter.ts`
- make target: `make oauth-adapter-check`
- latest artifact: `/Users/minzi/Developer/claude-code-re/monitor/request-shape/artifacts/extension-adapter-check.json`

What it currently verifies:
1. strip-only extension path does not route to extra-usage
2. prepend-custom-message capture shape has:
   - 2 system blocks
   - docs context in a non-system user message
3. pi-topic prompt can still recover the main pi docs path

## Current source patch direction
Worktree:
- `/Users/minzi/Developer/pi-mono-claude-oauth-billing`

Patched file:
- `packages/ai/src/providers/anthropic.ts`

Current source behavior for OAuth Anthropic requests:
- keep billing header
- strip the pi docs-only section out of `context.systemPrompt`
- stop injecting the `You are Claude Code, Anthropic's official CLI for Claude.` identity block

Focused regression test:
- `packages/ai/test/anthropic-oauth-request-shape.test.ts`

Manual validation after rebuild:
```bash
cd /Users/minzi/Developer/claude-code-re
pi --provider anthropic --model claude-sonnet-4-6 --thinking off --no-session -p 'Reply with exactly: ok'
```
returned:
```text
ok
```

## Important caveat
`monitor/probe-matrix.ts` is useful for fixtures/spec generation and many probe runs, but after the source patch the spawned `pi` path is still showing a mismatch in some baseline runs compared to direct-shell invocation.

Observed discrepancy:
- direct-shell `pi ... -e ./monitor/request-shape/probe-extension.ts` shows the patched 2-block payload and succeeds/overloads normally
- some `probe-matrix.ts run baseline-default --mode real` runs still record the old 3-block payload and extra-usage failure

Treat the **direct-shell invocation + probe log** as authoritative until that runner discrepancy is fixed.

## Next actions
1. Prototype an **extension-first** workaround instead of assuming the forked `pi-mono` patch is the final answer.
   - Strip the offending docs-only section from the system prompt in `before_agent_start` or `before_provider_request`.
   - Reintroduce the removed content through a non-system path if possible (custom injected message, transformed context, or other hook) and probe whether routing still succeeds.
2. Stabilize `monitor/probe-matrix.ts` so spawned pi runs match direct-shell behavior.
3. Clean `pi-mono` diffs (`package-lock.json`, `packages/ai/src/models.generated.ts`) before commit if they are not required.
4. Add monitor-side drift detection that compares upstream signature/prompt markers against the accepted local adapter shape.
5. Only commit/push the `pi-mono` patch as the maintained fallback if the extension path cannot preserve enough behavior.
