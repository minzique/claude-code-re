# Claude Code Diff: 2.1.226 → 2.1.227

_Generated: 2026-08-11T01:47:15.912Z_

## Feature Flags (tengu_*)

### Added
- `tengu_auto_mode_worktree_fast_path`
- `tengu_bash_command_clamp_denied`
- `tengu_bracken_sluice`
- `tengu_bridge_placeholder_used_session`
- `tengu_ccr_idle_heartbeat`
- `tengu_cleanup_throttle_marker`
- `tengu_cobalt_plinth_moss`
- `tengu_dead_probe_adopt_ticks_token`
- `tengu_dead_probe_bg_legacy_op`
- `tengu_dead_probe_include_coauthored_by`
- `tengu_dead_probe_iterm2_crash_restore`
- `tengu_dead_probe_legacy_local_settings`
- `tengu_dead_probe_legacy_plugin_tip_counts`
- `tengu_dead_probe_legacy_progress_bridge`
- `tengu_device_bash_cancelled`
- `tengu_device_bash_failed`
- `tengu_device_bash_output_limit`
- `tengu_device_bash_refused`
- `tengu_device_bash_served`
- `tengu_device_bash_timed_out`
- `tengu_device_bind_failed`
- `tengu_device_bind_prepared`
- `tengu_device_bind_skipped`
- `tengu_dir_sync_mode_prompt`
- `tengu_dir_sync_mode_prompt_shown`
- `tengu_dir_sync_mode_prompt_skipped`
- `tengu_dir_sync_mode_set`
- `tengu_dir_sync_worker_base`
- `tengu_dir_sync_worker_pull`
- `tengu_dir_sync_worker_push`
- `tengu_dir_sync_worker_rehome`
- `tengu_goal_proposal_decided`
- `tengu_goal_proposed`
- `tengu_headless_fatal_error`
- `tengu_lantern_wick_mode`
- `tengu_loggia_roster`
- `tengu_marlin_porch`
- `tengu_mcp_connect_timeout_retry`
- `tengu_model_proposed_goals_changed`
- `tengu_org_memory_project_switch`
- `tengu_propose_goal`
- `tengu_remote_autocompact_state_adopted`
- `tengu_scalable_quiche`
- `tengu_sorrel_trellis_weir`
- `tengu_ultrareview_post`
- `tengu_ultrareview_post_enabled`

### Removed
- ~~`tengu_basalt_meadow`~~
- ~~`tengu_lantern_wick`~~
- ~~`tengu_render_glyph_cardinality`~~
- ~~`tengu_velvet_cascade`~~
- ~~`tengu_xterm_atlas_reset`~~

## Environment Variables

### Added
- `CLAUDE_BRIDGE_REATTACH_NO_BACKFILL`
- `CLAUDE_BRIDGE_REATTACH_OWNER_ACCT`
- `CLAUDE_BRIDGE_REATTACH_OWNER_ORG`
- `CLAUDE_CODE_DECSTBM`

### Removed
- ~~`CLAUDE_CODE_COMMIT_LOG`~~
- ~~`CLAUDE_CODE_DEBUG_LOGS_DIR`~~

## Telemetry Events

### Added
- `tengu_auto_mode_worktree_fast_path`
- `tengu_bash_command_clamp_denied`
- `tengu_bracken_sluice`
- `tengu_bridge_placeholder_used_session`
- `tengu_ccr_idle_heartbeat`
- `tengu_cleanup_throttle_marker`
- `tengu_cobalt_plinth_moss`
- `tengu_dead_probe_adopt_ticks_token`
- `tengu_dead_probe_bg_legacy_op`
- `tengu_dead_probe_include_coauthored_by`
- `tengu_dead_probe_iterm2_crash_restore`
- `tengu_dead_probe_legacy_local_settings`
- `tengu_dead_probe_legacy_plugin_tip_counts`
- `tengu_dead_probe_legacy_progress_bridge`
- `tengu_device_bash_cancelled`
- `tengu_device_bash_failed`
- `tengu_device_bash_output_limit`
- `tengu_device_bash_refused`
- `tengu_device_bash_served`
- `tengu_device_bash_timed_out`
- `tengu_device_bind_failed`
- `tengu_device_bind_prepared`
- `tengu_device_bind_skipped`
- `tengu_dir_sync_mode_prompt`
- `tengu_dir_sync_mode_prompt_shown`
- `tengu_dir_sync_mode_prompt_skipped`
- `tengu_dir_sync_mode_set`
- `tengu_dir_sync_worker_base`
- `tengu_dir_sync_worker_pull`
- `tengu_dir_sync_worker_push`
- `tengu_dir_sync_worker_rehome`
- `tengu_goal_proposal_decided`
- `tengu_goal_proposed`
- `tengu_headless_fatal_error`
- `tengu_lantern_wick_mode`
- `tengu_loggia_roster`
- `tengu_marlin_porch`
- `tengu_mcp_connect_timeout_retry`
- `tengu_model_proposed_goals_changed`
- `tengu_org_memory_project_switch`
- `tengu_propose_goal`
- `tengu_remote_autocompact_state_adopted`
- `tengu_scalable_quiche`
- `tengu_sorrel_trellis_weir`
- `tengu_ultrareview_post`
- `tengu_ultrareview_post_enabled`

### Removed
- ~~`tengu_basalt_meadow`~~
- ~~`tengu_lantern_wick`~~
- ~~`tengu_render_glyph_cardinality`~~
- ~~`tengu_velvet_cascade`~~
- ~~`tengu_xterm_atlas_reset`~~

## HTTP Headers

### Added
- `anthropic-ratelimit-unified-5h-reset`
- `anthropic-ratelimit-unified-5h-surpassed-threshold`
- `anthropic-ratelimit-unified-5h-utilization`
- `anthropic-ratelimit-unified-7d-reset`
- `anthropic-ratelimit-unified-7d-surpassed-threshold`
- `anthropic-ratelimit-unified-7d-utilization`

## User-Agent Patterns

### Added
- `claude-cli/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.227", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-10T18:40:15Z", GIT_SHA: "5ecc7d5389d8b682652d0ea32eadd3e0eb537ee8", DD_SOURCEMAP_GROUP: "darwin" }.VERSION} (external, ${re.CLAUDE_CODE_ENTRYPOINT ?? "cli"}${e}${t}${n})`
- `claude-code/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.227", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-10T18:40:15Z", GIT_SHA: "5ecc7d5389d8b682652d0ea32eadd3e0eb537ee8", DD_SOURCEMAP_GROUP: "darwin" }.VERSION}`
- `claude-code/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.227", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-10T18:40:15Z", GIT_SHA: "5ecc7d5389d8b682652d0ea32eadd3e0eb537ee8", DD_SOURCEMAP_GROUP: "darwin" }.VERSION}${t}`

### Removed
- ~~`claude-cli/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.226", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-08T00:42:40Z", GIT_SHA: "e140b3281c1e8d834468889bd0a5c3fd2f15507c", DD_SOURCEMAP_GROUP: "darwin" }.VERSION} (external, ${te.CLAUDE_CODE_ENTRYPOINT ?? "cli"}${e}${t}${n})`~~
- ~~`claude-code/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.226", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-08T00:42:40Z", GIT_SHA: "e140b3281c1e8d834468889bd0a5c3fd2f15507c", DD_SOURCEMAP_GROUP: "darwin" }.VERSION}`~~
- ~~`claude-code/${{ ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues", PACKAGE_URL: "@anthropic-ai/claude-code", README_URL: "https://code.claude.com/docs/en/overview", VERSION: "2.1.226", FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues", BUILD_TIME: "2026-08-08T00:42:40Z", GIT_SHA: "e140b3281c1e8d834468889bd0a5c3fd2f15507c", DD_SOURCEMAP_GROUP: "darwin" }.VERSION}${t}`~~

## Billing Header Format

### Added
- `x-anthropic-billing-header: cc_version=${o}; cc_entrypoint=${i};${a}${c}${u}${p}${m}`

### Removed
- ~~`x-anthropic-billing-header: cc_version=${n}; cc_entrypoint=${o};${s}${l}${c}${u}`~~
