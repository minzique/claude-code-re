# Claude Code Diff: 2.1.81 → 2.1.83

_Generated: 2026-03-25T06:30:55.966Z_

## Beta Flags

### Added
- `advisor-tool-2026-03-01`

## Feature Flags (tengu_*)

### Added
- `tengu_advisor_tool_call`
- `tengu_advisor_tool_interrupted`
- `tengu_borax_j4w`
- `tengu_bridge_repl_v2_cse_shim_enabled`
- `tengu_deep_link_opened`
- `tengu_deep_link_registered`
- `tengu_jade_anvil_4`
- `tengu_kairos_cron_durable`
- `tengu_lapis_finch`
- `tengu_lodestone_enabled`
- `tengu_log_datadog_events`
- `tengu_mcp_large_result_handled`
- `tengu_plugin_hint_detected`
- `tengu_plugin_hint_response`
- `tengu_plugin_official_mkt_git_fallback`
- `tengu_plugin_remote_fetch`
- `tengu_resume_consistency_delta`
- `tengu_sage_compass`
- `tengu_slate_thimble`
- `tengu_snip_resume_filtered`
- `tengu_teammate_default_model_changed`
- `tengu_ultraplan_approved`
- `tengu_ultraplan_create_failed`
- `tengu_ultraplan_failed`
- `tengu_ultraplan_launched`
- `tengu_ultraplan_model`

### Removed
- ~~`tengu_auto_migrate_to_native_attempt`~~
- ~~`tengu_auto_migrate_to_native_failure`~~
- ~~`tengu_auto_migrate_to_native_partial`~~
- ~~`tengu_auto_migrate_to_native_success`~~
- ~~`tengu_auto_migrate_to_native_ui_error`~~
- ~~`tengu_auto_migrate_to_native_ui_shown`~~
- ~~`tengu_auto_migrate_to_native_ui_success`~~
- ~~`tengu_log_segment_events`~~
- ~~`tengu_miraculo_the_bard2`~~
- ~~`tengu_sepia_heron`~~
- ~~`tengu_sepia_heron_applied`~~
- ~~`tengu_swinburne_dune`~~

## Environment Variables

### Added
- `CLAUDE_CODE_DEBUG_REPAINTS`
- `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`
- `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK`
- `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS`
- `CLAUDE_CODE_ENABLE_XAA`
- `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`
- `CLAUDE_CODE_TMUX_TRUECOLOR`
- `CLAUDE_SESSION_INGRESS_TOKEN_FILE`

### Removed
- ~~`DISABLE_AUTO_MIGRATE_TO_NATIVE`~~

## API Endpoints

### Added
- `https://downloads.claude.ai/claude-code-releases/plugins/claude-plugins-official`

## Telemetry Events

### Added
- `tengu_advisor_tool_call`
- `tengu_advisor_tool_interrupted`
- `tengu_borax_j4w`
- `tengu_bridge_repl_v2_cse_shim_enabled`
- `tengu_deep_link_opened`
- `tengu_deep_link_registered`
- `tengu_jade_anvil_4`
- `tengu_kairos_cron_durable`
- `tengu_lapis_finch`
- `tengu_lodestone_enabled`
- `tengu_mcp_large_result_handled`
- `tengu_plugin_hint_detected`
- `tengu_plugin_hint_response`
- `tengu_plugin_official_mkt_git_fallback`
- `tengu_plugin_remote_fetch`
- `tengu_resume_consistency_delta`
- `tengu_sage_compass`
- `tengu_slate_thimble`
- `tengu_snip_resume_filtered`
- `tengu_teammate_default_model_changed`
- `tengu_ultraplan_approved`
- `tengu_ultraplan_create_failed`
- `tengu_ultraplan_failed`
- `tengu_ultraplan_launched`
- `tengu_ultraplan_model`

### Removed
- ~~`tengu_auto_migrate_to_native_attempt`~~
- ~~`tengu_auto_migrate_to_native_failure`~~
- ~~`tengu_auto_migrate_to_native_partial`~~
- ~~`tengu_auto_migrate_to_native_success`~~
- ~~`tengu_auto_migrate_to_native_ui_error`~~
- ~~`tengu_auto_migrate_to_native_ui_shown`~~
- ~~`tengu_auto_migrate_to_native_ui_success`~~
- ~~`tengu_log_segment_events`~~
- ~~`tengu_miraculo_the_bard2`~~
- ~~`tengu_sepia_heron`~~
- ~~`tengu_sepia_heron_applied`~~
- ~~`tengu_swinburne_dune`~~
