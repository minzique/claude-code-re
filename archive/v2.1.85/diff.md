# Claude Code Diff: 2.1.84 → 2.1.85

_Generated: 2026-03-27T00:37:37.460Z_

## Feature Flags (tengu_*)

### Added
- `tengu_birch_trellis`
- `tengu_builtin_mcp_toggle`
- `tengu_compact_ptl_retry`
- `tengu_disable_keepalive_on_econnreset`
- `tengu_review_bughunter_config`
- `tengu_review_overage_dialog_shown`
- `tengu_review_overage_low_balance`
- `tengu_review_overage_not_enabled`
- `tengu_review_remote_launched`
- `tengu_review_remote_teleport_failed`
- `tengu_tree_sitter_load`
- `tengu_tree_sitter_parse_abort`
- `tengu_tree_sitter_shadow`

### Removed
- ~~`tengu_grey_wool`~~
- ~~`tengu_permission_explainer`~~
- ~~`tengu_tst_kx7`~~

## Environment Variables

### Added
- `CLAUDE_CODE_COMMIT_LOG`
- `CLAUDE_CODE_PWSH_PARSE_TIMEOUT_MS`
- `CLAUDE_LOCAL_OAUTH_API_BASE`
- `CLAUDE_LOCAL_OAUTH_APPS_BASE`

## API Endpoints

### Added
- `/v1/code/upstreamproxy/ws`

### Removed
- ~~`https://api.anthropic.com/api/oauth/claude_cli/create_api_key`~~
- ~~`https://api.anthropic.com/api/oauth/claude_cli/roles`~~
- ~~`https://mcp-proxy.anthropic.com`~~
- ~~`https://platform.claude.com/oauth/authorize`~~
- ~~`https://platform.claude.com/oauth/code/callback`~~
- ~~`https://platform.claude.com/v1/oauth/token`~~

## Telemetry Events

### Added
- `tengu_birch_trellis`
- `tengu_builtin_mcp_toggle`
- `tengu_compact_ptl_retry`
- `tengu_disable_keepalive_on_econnreset`
- `tengu_review_bughunter_config`
- `tengu_review_overage_dialog_shown`
- `tengu_review_overage_low_balance`
- `tengu_review_overage_not_enabled`
- `tengu_review_remote_launched`
- `tengu_review_remote_teleport_failed`
- `tengu_tree_sitter_load`
- `tengu_tree_sitter_parse_abort`
- `tengu_tree_sitter_shadow`

### Removed
- ~~`tengu_grey_wool`~~
- ~~`tengu_permission_explainer`~~
- ~~`tengu_tst_kx7`~~

## OAuth Scopes

### Removed
- ~~`user:file_upload`~~
- ~~`user:sessions:claude_code`~~
