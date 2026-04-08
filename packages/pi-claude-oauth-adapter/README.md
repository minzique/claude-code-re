# pi-claude-oauth-adapter

Claude OAuth routing workaround for pi.

It does three things for Anthropic OAuth/subscription sessions:
- strips the `Pi documentation (...)` docs-only section out of the system prompt,
- removes the `You are Claude Code, Anthropic's official CLI for Claude.` identity block,
- reinjects the stripped docs context outside the system prompt when needed so pi-specific help still works.

It also adds the Claude billing header in `before_provider_request` if the installed pi provider version does not already include it.

## Install

### Local path
```bash
pi install /absolute/path/to/pi-claude-oauth-adapter
```

### npm
```bash
pi install npm:pi-claude-oauth-adapter
```

### git
Publish this package from its own repo root or install from a checked-out local path. Git installs work best when the package is the repo root.

## Config

Environment variables:

- `PI_CLAUDE_OAUTH_REINJECT_SCOPE=never|always|pi-only`
  - default: `pi-only`
- `PI_CLAUDE_OAUTH_REINJECT_MODE=prepend-custom-message|append-custom-message|user-reminder|none`
  - default: `prepend-custom-message`
- `PI_CLAUDE_OAUTH_LOG_FILE=/path/to/log.jsonl`
  - optional debug logging
- `PI_CLAUDE_OAUTH_DOCS_FILE=/path/to/pi-docs-only.txt`
  - optional docs fallback override
- `PI_CLAUDE_CODE_VERSION=...`
- `PI_CLAUDE_CODE_ENTRYPOINT=...`
  - optional billing-header overrides

## Recommended defaults

For normal usage, no env vars are required.

If you want the stripped docs context available for every request instead of only pi-related prompts:

```bash
PI_CLAUDE_OAUTH_REINJECT_SCOPE=always pi
```

## Notes

- This extension only activates for `anthropic` models when pi is using OAuth credentials.
- It is designed to work both with already-patched pi builds and older/provider builds that still need the billing header injected at request time.
