# Claude Code Diff: 2.1.85 → 2.1.86

_Generated: 2026-03-28T00:35:00.325Z_

## Feature Flags (tengu_*)

### Added
- `tengu_compact_line_prefix_killswitch`
- `tengu_extract_memories_error`
- `tengu_file_read_dedup`
- `tengu_mcp_oauth_flow_failure`
- `tengu_overage_credit_upsell_shown`
- `tengu_plugin_command_failed`
- `tengu_plugin_enabled_for_session`
- `tengu_plugin_load_failed`
- `tengu_read_dedup_killswitch`
- `tengu_sessions_elevated_auth_enforcement`

## Environment Variables

### Added
- `CLAUDE_LOCAL_OAUTH_CONSOLE_BASE`
- `CLAUDE_TRUSTED_DEVICE_TOKEN`

## API Endpoints

### Added
- `https://api.anthropic.com/api/oauth/claude_cli/create_api_key`
- `https://api.anthropic.com/api/oauth/claude_cli/roles`
- `https://mcp-proxy.anthropic.com`
- `https://platform.claude.com/oauth/authorize`
- `https://platform.claude.com/oauth/code/callback`
- `https://platform.claude.com/v1/oauth/token`

## Telemetry Events

### Added
- `tengu_compact_line_prefix_killswitch`
- `tengu_extract_memories_error`
- `tengu_file_read_dedup`
- `tengu_mcp_oauth_flow_failure`
- `tengu_overage_credit_upsell_shown`
- `tengu_plugin_command_failed`
- `tengu_plugin_enabled_for_session`
- `tengu_plugin_load_failed`
- `tengu_read_dedup_killswitch`
- `tengu_sessions_elevated_auth_enforcement`

## OAuth Scopes

### Added
- `user:file_upload`
- `user:sessions:claude_code`
