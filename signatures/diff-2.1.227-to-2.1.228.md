# Claude Code Diff: 2.1.227 → 2.1.228

_Generated: 2026-08-12T01:58:23.917Z_

## Beta Flags

### Added
- `agent-memory-2026-07-22`
- `dreaming-2026-04-21`
- `mcp-tunnels-2026-06-22`

## Feature Flags (tengu_*)

### Added
- `tengu_bg_state_read_recovered`
- `tengu_bridge_recover_stale_epoch`
- `tengu_bridge_unarchive_on_resume`
- `tengu_ccr_reactivation_beat`
- `tengu_ccr_reconnect_beat`
- `tengu_device_bind_attach`
- `tengu_device_tool_refused`
- `tengu_dir_sync_pull`
- `tengu_dir_sync_push`
- `tengu_onyx_sluice`
- `tengu_repl_diff_panel_shown`
- `tengu_willow_crate`

### Removed
- ~~`tengu_bash_prefix`~~
- ~~`tengu_velvet_mallet`~~

## Environment Variables

### Removed
- ~~`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS`~~
- ~~`CLAUDE_CODE_BASE_REFS`~~
- ~~`CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR`~~
- ~~`CLAUDE_CODE_BENCH_LIVE_COUNTS`~~
- ~~`CLAUDE_CODE_BRIEF_UPLOAD`~~
- ~~`CLAUDE_CODE_DATADOG_FLUSH_INTERVAL_MS`~~
- ~~`CLAUDE_CODE_DD_ERROR_TRACKING_FLUSH_INTERVAL_MS`~~
- ~~`CLAUDE_CODE_DECSTBM`~~
- ~~`CLAUDE_CODE_DISABLE_AGENT_VIEW`~~
- ~~`CLAUDE_CODE_DISABLE_CLAUDE_API_SKILL`~~
- ~~`CLAUDE_CODE_DISABLE_CLAUDE_CODE_SKILL`~~
- ~~`CLAUDE_CODE_DISABLE_CRON`~~
- ~~`CLAUDE_CODE_DISABLE_FAST_MODE`~~
- ~~`CLAUDE_CODE_DISABLE_POLICY_SKILLS`~~
- ~~`CLAUDE_CODE_DISABLE_WORKFLOWS`~~
- ~~`CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES`~~
- ~~`CLAUDE_CODE_ENABLE_FEEDBACK_SURVEY_FOR_OTEL`~~
- ~~`CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`~~
- ~~`CLAUDE_CODE_FORCE_SYNC_OUTPUT`~~
- ~~`CLAUDE_CODE_FORK_SUBAGENT`~~
- ~~`CLAUDE_CODE_LOOP_KEEPALIVE`~~
- ~~`CLAUDE_CODE_MAX_RETRIES`~~
- ~~`CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`~~
- ~~`CLAUDE_CODE_NEW_INIT`~~
- ~~`CLAUDE_CODE_PERFORCE_MODE`~~
- ~~`CLAUDE_CODE_PLUGIN_CACHE_DIR`~~
- ~~`CLAUDE_CODE_REPL`~~
- ~~`CLAUDE_CODE_REPO_CHECKOUTS`~~
- ~~`CLAUDE_CODE_RESUME_THRESHOLD_MINUTES`~~
- ~~`CLAUDE_CODE_RESUME_TOKEN_THRESHOLD`~~
- ~~`CLAUDE_CODE_RETRY_WATCHDOG`~~
- ~~`CLAUDE_CODE_SCROLL_SPEED`~~
- ~~`CLAUDE_CODE_SYNC_PLUGINS`~~
- ~~`CLAUDE_CODE_SYNC_PLUGINS_INSTALL_TIMEOUT_MS`~~
- ~~`CLAUDE_CODE_SYNC_PLUGINS_MCP_TIMEOUT_MS`~~
- ~~`CLAUDE_CODE_SYNC_SKILLS`~~
- ~~`CLAUDE_CODE_SYNTAX_HIGHLIGHT`~~
- ~~`CLAUDE_CODE_TERMINAL_MCP_TOOLS`~~
- ~~`CLAUDE_CODE_TEST_FIXTURES_ROOT`~~
- ~~`CLAUDE_CODE_TUI_JUST_SWITCHED`~~
- ~~`CLAUDE_CODE_ULTRAREVIEW_PREFLIGHT_FIXTURE`~~
- ~~`CLAUDE_CODE_WORKFLOWS`~~
- ~~`CLAUDE_COWORK_MEMORY_GUIDELINES`~~
- ~~`CLAUDE_COWORK_MEMORY_PATH_OVERRIDE`~~
- ~~`CLAUDE_INTERNAL_FC_OVERRIDES`~~
- ~~`CLAUDE_PROJECT_UUID`~~
- ~~`CLAUDE_REPL_VARIANT`~~
- ~~`CLAUDE_SUBAGENT_BG_SHELL_MAX_MS`~~

## API Endpoints

### Added
- `https://api.anthropic.com/api/oauth/cri`

## Telemetry Events

### Added
- `tengu_bg_state_read_recovered`
- `tengu_bridge_recover_stale_epoch`
- `tengu_bridge_unarchive_on_resume`
- `tengu_ccr_reactivation_beat`
- `tengu_ccr_reconnect_beat`
- `tengu_device_bind_attach`
- `tengu_device_tool_refused`
- `tengu_dir_sync_pull`
- `tengu_dir_sync_push`
- `tengu_onyx_sluice`
- `tengu_repl_diff_panel_shown`
- `tengu_willow_crate`

### Removed
- ~~`tengu_bash_prefix`~~
- ~~`tengu_velvet_mallet`~~

## HTTP Headers

### Added
- `anthropic-organization-id`
- `anthropic-user-profile-id`
- `x-stainless-helper-method`

## User-Agent Patterns

### Added
- `claude-cli/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.228", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-11T01:33:09Z", GIT_SHA: "4a2077e9c39676b5c335919018dda18f476a7f70", DD_SOURCEMAP_GROUP: "darwin" }.VERSION} (external, ${X.CLAUDE_CODE_ENTRYPOINT ?? "cli"}${e}${t}${n})`
- `claude-code/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.228", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-11T01:33:09Z", GIT_SHA: "4a2077e9c39676b5c335919018dda18f476a7f70", DD_SOURCEMAP_GROUP: "darwin" }.VERSION}`
- `claude-code/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.228", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-11T01:33:09Z", GIT_SHA: "4a2077e9c39676b5c335919018dda18f476a7f70", DD_SOURCEMAP_GROUP: "darwin" }.VERSION}${t}`

### Removed
- ~~`claude-cli/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.227", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-10T18:40:15Z", GIT_SHA: "5ecc7d5389d8b682652d0ea32eadd3e0eb537ee8", DD_SOURCEMAP_GROUP: "darwin" }.VERSION} (external, ${re.CLAUDE_CODE_ENTRYPOINT ?? "cli"}${e}${t}${n})`~~
- ~~`claude-code/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.227", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-10T18:40:15Z", GIT_SHA: "5ecc7d5389d8b682652d0ea32eadd3e0eb537ee8", DD_SOURCEMAP_GROUP: "darwin" }.VERSION}`~~
- ~~`claude-code/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.227", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-10T18:40:15Z", GIT_SHA: "5ecc7d5389d8b682652d0ea32eadd3e0eb537ee8", DD_SOURCEMAP_GROUP: "darwin" }.VERSION}${t}`~~
