# PR text: package Claude OAuth adapter as a reusable pi extension

## Title
feat: package Claude OAuth adapter as a reusable pi extension

## Summary
This packages the Claude OAuth request-shape workaround as an installable pi extension instead of relying on a maintained `pi-mono` fork.

What it does for Anthropic OAuth sessions:
- strips the `Pi documentation (...)` docs-only section from the system prompt
- removes the `You are Claude Code, Anthropic's official CLI for Claude.` identity block
- reintroduces the stripped docs context outside the system prompt when needed so pi-specific prompts still work
- injects the Claude billing header if the installed pi provider build does not already include it

## Why
Anthropic OAuth routing was fingerprint-sensitive. The default pi system prompt shape could trigger:
- `You're out of extra usage...`

The smallest stable working shape found by the probe matrix was:
- Claude billing header
- pi system prompt without the docs-only section
- optional docs reinjection outside `system`

That makes an extension-first fix preferable to a long-lived fork.

## Included
- request-shape capture/probe harness
- extracted prompt fixtures for discriminating matrix tests
- installable package: `packages/pi-claude-oauth-adapter`
- adapter verification script + make target
- findings doc covering the matrix and accepted shapes

## Validation
### Stock pi 0.65.2 + extension
- `Reply with exactly: ok` -> `ok`
- `What is the main pi documentation path? Reply with the path only.` -> correct README path

### Monitor check
- `cd monitor && bun run check-claude-oauth-adapter.ts`
- verifies:
  1. strip-only path does not route to extra-usage
  2. prepend-custom-message capture shape has 2 system blocks + non-system docs context
  3. pi-topic prompt still resolves the docs path

### Publish smoke test
- `cd packages/pi-claude-oauth-adapter && npm pack --dry-run`

## Install
```bash
pi install npm:pi-claude-oauth-adapter
```

Or from a local checkout:
```bash
pi install /absolute/path/to/packages/pi-claude-oauth-adapter
```

## Follow-ups
- optionally split the package into its own repo if git-based install should work directly without npm
- decide whether to keep or discard the old local `pi-mono` fallback branch now that stock pi + extension works
