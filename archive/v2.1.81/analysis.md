# Claude Code v2.1.81 — Automated Analysis

_Generated: 2026-03-21T17:24:06.976Z_

## Version Diff

# Claude Code Diff: 2.1.80 → 2.1.81

_Generated: 2026-03-21T17:14:32.552Z_

## Beta Flags

### Added
- `ccr-triggers-2026-01-30`

## Feature Flags (tengu_*)

### Added
- `tengu_auto_dream_toggled`
- `tengu_brief_mode_enabled`
- `tengu_defer_caveat_m9k`
- `tengu_harbor_permissions`
- `tengu_mcp_channel_flags`
- `tengu_mcp_channel_gate`
- `tengu_mcp_channel_message`
- `tengu_message_actions_enter`
- `tengu_oauth_token_refresh_completed`
- `tengu_relink_walk_broken`
- `tengu_review_remote_launched`
- `tengu_review_remote_precondition_failed`
- `tengu_review_remote_teleport_failed`
- `tengu_slate_heron`
- `tengu_tern_alloy`
- `tengu_time_based_microcompact`
- `tengu_voice_silent_drop_replay`

## Environment Variables

### Added
- `CLAUDE_CODE_USE_POWERSHELL_TOOL`

## Telemetry Events

### Added
- `tengu_auto_dream_toggled`
- `tengu_brief_mode_enabled`
- `tengu_defer_caveat_m9k`
- `tengu_harbor_permissions`
- `tengu_mcp_channel_flags`
- `tengu_mcp_channel_gate`
- `tengu_mcp_channel_message`
- `tengu_message_actions_enter`
- `tengu_relink_walk_broken`
- `tengu_review_remote_launched`
- `tengu_review_remote_precondition_failed`
- `tengu_review_remote_teleport_failed`
- `tengu_slate_heron`
- `tengu_tern_alloy`
- `tengu_time_based_microcompact`
- `tengu_voice_silent_drop_replay`



---

## API request format, headers, beta flags, auth changes

## Claude Code v2.1.81 — API Request Format Analysis

### Beta Header Construction

Betas are assembled via `NuT()` in **4411.js** and sent as `anthropic_beta` in the request body (SDK converts to `anthropic-beta` header):

```js
// NuT() merges CLAUDE_CODE_EXTRA_BODY betas with passed betas, deduplicating
if (q.anthropic_beta && Array.isArray(q.anthropic_beta)) {
  q.anthropic_beta = [...K, ...R.filter($ => !K.includes($))];
} else q.anthropic_beta = _;
```

**Change from 2.1.80:** `ccr-triggers-2026-01-30` added — 27 total beta flags. Per-model betas still resolved via `oN(model)`. The `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` env var suppresses non-essential betas.

### Auth Headers

Two paths — both redacted in logs by `FU()` in **1311.js** (`x-api-key` and `authorization` → `***`):

- **API key path**: `x-api-key` header
- **OAuth path**: `authorization: Bearer <token>` 

**Change:** `tengu_oauth_token_refresh_completed` telemetry event added — OAuth refresh flow now emits a completion event. The `tengu_harbor_permissions` flag suggests new permission gating around auth scope.

### Metadata / Attribution

`k__()` in **4411.js** constructs `metadata.user_id` as a hash of `device_id + account_uuid + session_id`:

```js
user_id: I_({ ..._, device_id: vV(), account_uuid: dR()?.accountUuid ?? "", session_id: vT() })
```

`CLAUDE_CODE_EXTRA_METADATA` env var allows additional fields to be merged in. No changes here from 2.1.80.

### Prompt Cache Headers

`nB()` constructs `cache_control` objects. `Xq$()` gates the `ttl: "1h"` option:
- Bedrock: requires `ENABLE_PROMPT_CACHING_1H_BEDROCK=true`
- Claude.ai: requires Pro subscription + not in overage + query source in allowlist (`tengu_prompt_cache_1h_config`)

No changes from 2.1.80.

### Streaming Helper Header

From **1340.js**, streaming requests append:
```
X-Stainless-Helper-Method: stream
```

No changes.

### New MCP Channel Headers

`tengu_mcp_channel_flags`, `tengu_mcp_channel_gate`, `tengu_mcp_channel_message` are new feature flags — these gate MCP connection behavior but don't appear to modify HTTP headers directly. The `hEq()` function in **3094.js** parses `Header-Name: value` strings for custom MCP server headers (unchanged).

---

**Summary of changes affecting wire format:**
| Area | Change |
|---|---|
| `anthropic-beta` | `ccr-triggers-2026-01-30` added |
| OAuth | Token refresh now tracked via telemetry (`tengu_oauth_token_refresh_completed`) |
| Other headers | No changes detected |


---

## New telemetry events, tracking, data collection

## v2.1.81 Telemetry Inventory

### New Events (16 total)

| Event | Likely Purpose | Privacy Risk |
|---|---|---|
| `tengu_mcp_channel_message` | Messages through MCP channels | **HIGH** — may capture message metadata/content |
| `tengu_harbor_permissions` | Permission decisions for "harbor" feature | **MEDIUM** — tool names, possibly file paths (see `blocked_path` in `can_use_tool` handler in 4662.js) |
| `tengu_review_remote_launched` | Remote code review session start | **MEDIUM** — repo/code context sent remotely |
| `tengu_review_remote_precondition_failed` | Remote review precondition check failures | Low-medium — captures what check failed |
| `tengu_review_remote_teleport_failed` | Session/context transfer failure for remote review | Low-medium |
| `tengu_relink_walk_broken` | Filesystem relink traversal failure | Low-medium — error context may include file paths |
| `tengu_voice_silent_drop_replay` | Voice input drop/replay events | Low-medium — voice session metadata |
| `tengu_mcp_channel_flags` | MCP channel config flags at runtime | Low |
| `tengu_mcp_channel_gate` | MCP channel access gate decisions | Low |
| `tengu_auto_dream_toggled` | Auto-dream mode toggle | Low — UI state |
| `tengu_brief_mode_enabled` | Brief/compact response mode activation | Low — UI state |
| `tengu_message_actions_enter` | User enters message actions UI | Low — UI interaction |
| `tengu_time_based_microcompact` | Time-triggered conversation compaction | Low — timing data |
| `tengu_defer_caveat_m9k` | Opaque — caveat/warning deferral | Unknown |
| `tengu_slate_heron` | Opaque codename | Unknown |
| `tengu_tern_alloy` | Opaque codename | Unknown |

Note: `tengu_oauth_token_refresh_completed` is in Feature Flags but **not** in Telemetry Events — it's a gate, not a fired event.

---

### Data Collection Context (from modules)

**`k__()` in 4411.js** — sent with every API request:
```js
{ user_id: JSON({ device_id, account_uuid, session_id }) }
```
Existing behavior, but note `account_uuid` + `device_id` + `session_id` are all bundled as a single `user_id` field.

**`tengu_headless_latency`** (existing, 3036.js) — fields: `turn_number`, `time_to_first_response_ms`, `time_to_query_start_ms`, `query_overhead_ms`, `checkpoint_count`, `entrypoint`.

---

### Privacy Flags

1. **`tengu_mcp_channel_message`** — MCP tool calls carry file contents, shell output, etc. Even metadata (channel ID, message type, size) is sensitive in enterprise contexts.

2. **`tengu_harbor_permissions`** — The `can_use_tool` handler (4662.js) already captures `tool_name`, `blocked_path`, `decision_reason`. If `tengu_harbor_permissions` echoes similar fields, file paths are in the payload.

3. **Remote review triad** (`tengu_review_remote_*`) — A new remote review capability is being instrumented. Three events covering launch, precondition failure, and "teleport" failure. The feature itself (sending code to a remote endpoint) is the privacy concern, not just the telemetry.

4. **Three opaque events** (`tengu_defer_caveat_m9k`, `tengu_slate_heron`, `tengu_tern_alloy`) — cannot determine payloads from the provided modules. Worth monitoring in future diffs.

5. **`CLAUDE_CODE_USE_POWERSHELL_TOOL`** — new env var enabling PowerShell as a tool. Any PowerShell commands executed would flow through existing `PreToolUse`/`PostToolUse` hooks and bash-command telemetry.


---

## New features, feature flags, capabilities

## Claude Code v2.1.81 — New Capabilities Summary

### Feature Flags (tengu_*)

| Flag | Inferred Purpose |
|---|---|
| `tengu_auto_dream_toggled` | Auto-enables "dream mode" (extended thinking/planning) based on some condition |
| `tengu_brief_mode_enabled` | Compact/terse response mode — shorter outputs by default |
| `tengu_defer_caveat_m9k` | Defers or suppresses certain model caveats (likely for m9k/Sonnet 4 variant) |
| `tengu_harbor_permissions` | New permission system ("Harbor") — likely the upcoming redesigned trust/permissions flow |
| `tengu_mcp_channel_flags` / `tengu_mcp_channel_gate` / `tengu_mcp_channel_message` | MCP channel feature: gated flag, entry gate, and messaging — likely MCP server communication channels or a new MCP transport layer |
| `tengu_message_actions_enter` | Enter key triggers message actions (UI interaction change) |
| `tengu_oauth_token_refresh_completed` | Tracks OAuth token refresh lifecycle — telemetry for auth reliability |
| `tengu_relink_walk_broken` | Detects broken symlinks during worktree/project relinking |
| `tengu_review_remote_launched` / `tengu_review_remote_precondition_failed` / `tengu_review_remote_teleport_failed` | Remote code review feature ("teleport") — launches review sessions remotely; tracks failures |
| `tengu_slate_heron` | Codename for a new UI theme or model variant ("slate" + "heron" = design experiment) |
| `tengu_tern_alloy` | Another codename — likely a model or runtime variant pairing |
| `tengu_time_based_microcompact` | Time-triggered auto-compaction of conversation context |
| `tengu_voice_silent_drop_replay` | Voice mode: silently drops and replays audio segments (latency/quality fix) |

### Beta Flags
- `ccr-triggers-2026-01-30` — CCR (likely "Claude Code Review") trigger rules, date-versioned beta flag

### Environment Variables
- `CLAUDE_CODE_USE_POWERSHELL_TOOL` — Enables a PowerShell-specific tool (new Windows/WSL tool for shell execution, distinct from Bash)

### Key Observations

1. **Remote Review** is the biggest new surface: three telemetry events (`launched`, `precondition_failed`, `teleport_failed`) suggest a feature where Claude Code can review code on a remote machine/session, with "teleport" as the transport mechanism.

2. **MCP Channels** (`mcp_channel_flags/gate/message`) points to a new structured communication layer between MCP servers and Claude Code — possibly bidirectional channels rather than just tool calls.

3. **Harbor Permissions** appears to be a rearchitected permissions system (replacing or extending the existing trust dialog seen in `4716.js`).

4. **Brief Mode** + **Time-based Microcompact** together suggest work on keeping context windows lean automatically.

5. **PowerShell tool** (`CLAUDE_CODE_USE_POWERSHELL_TOOL`) signals first-class Windows support beyond WSL — a separate tool definition for PowerShell alongside Bash.


---

## Security-relevant changes, auth, permissions, sandboxing

## Security Assessment: Claude Code v2.1.81

### New Attack Surface

**`CLAUDE_CODE_USE_POWERSHELL_TOOL` (new env var)**
New execution backend. PowerShell has different quoting rules and injection vectors than bash. No code shown, but enabling this likely opens a new command execution path — needs review for injection hygiene parity with the bash tool.

**`tengu_harbor_permissions` (new flag)**
Name suggests a permissions model change. No implementation shown, but permission model changes are high-value from an attacker's perspective. Monitor what this gates.

**`tengu_oauth_token_refresh_completed` (new flag + telemetry)**
New OAuth token refresh flow. Suggests token lifecycle changes. Auth token handling changes warrant scrutiny — specifically whether refresh tokens are logged or exposed in telemetry.

---

### Permission Model

**4662.js — `createCanUseTool`**
The permission decision flow is: local policy check → race between hook decision and SDK permission request. Hook wins if it returns first. This is existing behavior, but the race is worth noting: a malicious hook that responds faster than the SDK request could silently allow or deny operations. No change here, but `tengu_harbor_permissions` may alter this flow.

**4662.js — `update_environment_variables` message type**
```js
if (T.type === "update_environment_variables") {
  for (let [q, K] of Object.entries(T.variables)) process.env[q] = K;
  return;
}
```
This allows the input stream to mutate `process.env` directly. An attacker who can inject into the stdin stream can set arbitrary env vars — including `PATH`, `NODE_PATH`, or any API key variables. This is existing behavior but high-severity if stdin is not fully trusted.

**3282.js — `JG_` env var allowlist**
The `PG_` allowlist filters which env vars get passed as "shell settings" vs "user env vars." Notably `CLAUDE_CODE_USE_POWERSHELL_TOOL` is **not in the allowlist** — meaning it must be set externally rather than via project config. This is correct behavior, but verify it's enforced consistently.

---

### Sandbox/Isolation

**4534.js — `SandboxViolationStore`**
```js
if (!z8.isSandboxingEnabled()) return;
let j = z8.getSandboxViolationStore();
```
UI-only component showing sandbox block count. The sandbox status check is at the UI layer only — sandboxing must be enforced deeper. No regression visible here.

---

### Trust Dialog (4716.js)

The trust dialog (`$5$`) gates home directory detection:
```js
let r = gq8.homedir() === MT();
```
If the user's CWD *is* the home directory, `XV_(true)` sets a different trust state vs. `YH(H5$)`. The distinction matters — accepting trust in `$HOME` is a much broader grant than a project dir. This logic exists in prior versions; no change visible.

**Skill/plugin Bash access check (`j5$`, `w5$`)**:
```js
_.allowedTools?.some(z5$)
// z5$: _ === b6 || _.startsWith(b6 + "(")
```
Checks whether loaded skills/plugins request Bash tool access. Flagged in the trust dialog. This is defensive behavior, not a regression.

---

### Teleport / Remote Session (4722.js)

New flags: `tengu_review_remote_launched`, `tengu_review_remote_precondition_failed`, `tengu_review_remote_teleport_failed`, `tengu_relink_walk_broken`

The `GS9` component lists and resumes remote Claude Code sessions. Auth error classification in `L5$` correctly catches `/login`, `403`, `oauth`, and `not authenticated` strings. No obvious bypass, but the remote session feature expands the attack surface — a compromised session listed here could be selected and resumed.

---

### Input Handling (4662.js)

`processLine` calls `process.exit(1)` on parse errors:
```js
} catch (T) {
  console.error(`Error parsing streaming input line: ${_}: ${T}`);
  process.exit(1);
}
```
Malformed input kills the process. This is a DoS vector if stdin can be influenced externally (e.g., in piped/SDK modes). Existing behavior, not new.

---

### Summary Table

| Item | Risk | Status |
|------|------|--------|
| `CLAUDE_CODE_USE_POWERSHELL_TOOL` | Medium — new execution backend, injection surface unknown | New, no impl shown |
| `tengu_harbor_permissions` | Medium — unknown permissions change | New, needs tracking |
| `update_environment_variables` via stdin | High — arbitrary `process.env` mutation | Existing, not new |
| OAuth token refresh flag | Low-Medium — depends on implementation | New |
| Remote session teleport | Low-Medium — expands session attack surface | New feature area |
| PowerShell not in env allowlist | Mitigating | Correct |
| Sandbox UI display | None | No change |
| Trust dialog home dir check | Low — existing logic | No change |

**Bottom line:** No critical new vulnerabilities visible in the shown code. The `update_environment_variables` stdin handler remains the most significant existing risk. Watch `tengu_harbor_permissions` — name implies permissions model change but no implementation was included. The PowerShell tool addition is the largest unknown new attack surface.


---

