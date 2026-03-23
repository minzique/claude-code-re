# Claude Code `/schedule` Command — Full Reverse Engineering Analysis

**Version**: 2.1.81 (new in this version — absent in 2.1.78)
**Date**: 2026-03-23
**Standalone client**: [github.com/minzique/claude-triggers](https://github.com/minzique/claude-triggers)

> **Note**: This analysis documents undocumented, internal Anthropic APIs discovered through reverse engineering. These APIs use beta headers that may change without notice. See the [claude-triggers disclaimer](https://github.com/minzique/claude-triggers#disclaimer) for full legal context.

---

## Executive Summary

The `/schedule` command is a **new feature** in Claude Code 2.1.81 that creates **remote scheduled agents (triggers)** running in Anthropic's cloud infrastructure. It's distinct from the pre-existing local `/loop` + `CronCreate` system. The architecture has two completely separate scheduling systems:

1. **Local Scheduler (Kairos)** — Session-scoped or file-persisted cron jobs that fire prompts into the current REPL. Pre-existing.
2. **Remote Triggers (`/schedule`)** — Cloud-based cron triggers that spawn isolated CCR (Claude Code Remote) sessions on Anthropic's infrastructure. **New in 2.1.81**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER CLI SESSION                      │
├──────────────────────┬──────────────────────────────────┤
│  /schedule command   │  /loop command                   │
│  (XEY registration)  │  (YEY/zEY registration)          │
│         │            │         │                        │
│         ▼            │         ▼                        │
│  RemoteTrigger tool  │  CronCreate tool (Eh)            │
│  (k16 = "Remote      │  CronDelete (ql)                │
│   Trigger")          │  CronList (nf6)                  │
│         │            │         │                        │
│         ▼            │         ▼                        │
│  Anthropic API       │  Kairos Scheduler Engine         │
│  /v1/code/triggers   │  (i8A factory)                   │
│         │            │         │                        │
│         ▼            │         ▼                        │
│  Cloud CCR Session   │  Local REPL prompt injection     │
│  (sandboxed env)     │  (session-scoped or durable)     │
└──────────────────────┴──────────────────────────────────┘
```

---

## System 1: `/schedule` — Remote Triggers (NEW)

### Feature Flags & Gating

```javascript
isEnabled: () => l8("tengu_surreal_dali", false) && X2("allow_remote_sessions")
```

- **`tengu_surreal_dali`** — GrowthBook/Statsig feature flag (default: `false`). Controls visibility of the schedule command.
- **`allow_remote_sessions`** — Organization policy check. Returns `true` if not restricted by admin policy.

### Registration Flow

```
DQq() → registerScheduleRemoteAgentsSkill (XEY)
  └─ Qw({name: "schedule", ...})  // Skill registration framework
```

**Skill definition:**
- **Name**: `schedule`
- **Description**: "Create, update, list, or run scheduled remote agents (triggers) that execute on a cron schedule."
- **Allowed Tools**: `[RemoteTrigger, AskUserQuestion]`
- **User-invocable**: `true`

### `/schedule` Command Flow (XEY)

```
User types: /schedule [args]
  │
  ├─ 1. Auth check: hA()?.accessToken (OAuth only, no API keys)
  │
  ├─ 2. Fetch environments: Gx()
  │     GET {BASE_API_URL}/v1/environment_providers
  │     Headers: Bearer token + x-organization-uuid
  │     Returns: array of {name, environment_id, kind}
  │
  ├─ 3. Auto-create environment if none exist: Ze4("claude-code-default")
  │     POST {BASE_API_URL}/v1/environment_providers/cloud/create
  │     Body: {name, kind: "anthropic_cloud", config: {
  │       environment_type: "anthropic",
  │       cwd: "/home/user",
  │       languages: [{python, 3.11}, {node, 20}],
  │       network_config: {allowed_hosts: [], allow_default_hosts: true}
  │     }}
  │     Beta header: "ccr-byoc-2025-07-29"
  │
  ├─ 4. Git repo detection: Fa()
  │     Parses git remote URL → {host, owner, name}
  │     If GitHub: checks app installation via ke4()
  │
  ├─ 5. MCP connector discovery: $EY(mcpClients)
  │     Filters for type==="connected" && config.type==="claudeai-proxy"
  │     Decodes connector UUIDs from base58 mcpsrv_ prefixed IDs
  │
  ├─ 6. Build system prompt: MEY({timezone, connectors, gitRepo, envs, ...})
  │
  └─ 7. LLM guides user through create/list/update/run workflow
```

### RemoteTrigger Tool ($p_ / k16)

**Tool name**: `"RemoteTrigger"`

**API Endpoints:**

| Action | Method | URL |
|--------|--------|-----|
| `list` | GET | `/v1/code/triggers` |
| `get` | GET | `/v1/code/triggers/{trigger_id}` |
| `create` | POST | `/v1/code/triggers` |
| `update` | POST | `/v1/code/triggers/{trigger_id}` |
| `run` | POST | `/v1/code/triggers/{trigger_id}/run` |

**Request headers:**
```javascript
{
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "ccr-triggers-2026-01-30",  // <-- NEW beta flag
  "x-organization-uuid": orgUuid
}
```

**Create Trigger Body Schema:**
```json
{
  "name": "AGENT_NAME",
  "cron_expression": "0 9 * * 1-5",       // 5-field, UTC, min interval 1h
  "enabled": true,
  "job_config": {
    "ccr": {
      "environment_id": "ENV_ID",
      "session_context": {
        "model": "claude-sonnet-4-6",
        "sources": [
          {"git_repository": {"url": "https://github.com/ORG/REPO"}}
        ],
        "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
      },
      "events": [
        {
          "data": {
            "uuid": "<v4-uuid>",
            "session_id": "",
            "type": "user",
            "parent_tool_use_id": null,
            "message": {
              "content": "PROMPT_HERE",
              "role": "user"
            }
          }
        }
      ]
    }
  },
  "mcp_connections": [                      // Optional
    {
      "connector_uuid": "uuid",
      "name": "server-name",               // [a-zA-Z0-9_-] only
      "url": "https://..."
    }
  ]
}
```

**Update Body**: Partial — any of `name`, `cron_expression`, `enabled`, `job_config`, `mcp_connections`, `clear_mcp_connections`.

**Cannot delete** via API — deletion is only at `https://claude.ai/code/scheduled`.

### Auth Flow

```
hA() → OAuth account store
  └─ accessToken from OAuth flow (claude.ai login, NOT API keys)

AX() → Organization UUID resolution
  └─ Cached in state store OR fetched via GB(accessToken)

gk8() → Auto-retry on 401 (re-authenticates via aW(token))
```

### Environment System

Environments are execution contexts for CCR sessions:

```javascript
// Fetch environments
GET /v1/environment_providers
→ { environments: [{name, environment_id, kind}] }

// Create environment
POST /v1/environment_providers/cloud/create
Body: {
  name: string,
  kind: "anthropic_cloud",
  config: {
    environment_type: "anthropic",
    cwd: "/home/user",
    init_script: null,
    environment: {},
    languages: [{name: "python", version: "3.11"}, {name: "node", version: "20"}],
    network_config: { allowed_hosts: [], allow_default_hosts: true }
  }
}
```

### MCP Connector UUID Decoding

Connector IDs use base58 encoding with `mcpsrv_` prefix:

```javascript
function OEY(id) {
  if (!id.startsWith("mcpsrv_")) return null;
  let encoded = id.slice(7).slice(2);  // strip prefix + 2-char checksum?
  let num = 0n;
  for (let ch of encoded) {
    let idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    num = num * 58n + BigInt(idx);
  }
  let hex = num.toString(16).padStart(32, "0");
  // Format as UUID
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}
// BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
```

---

## System 2: `/loop` + Kairos — Local Scheduler (PRE-EXISTING)

### Feature Flags

```javascript
function Vh() {  // isKairosCronEnabled
  return !env.CLAUDE_CODE_DISABLE_CRON && cV("tengu_kairos_cron", true, 300000);
}
```

Enabled by default (flag defaults to `true`). Can be disabled with `CLAUDE_CODE_DISABLE_CRON=1`.

### Tools

| Tool | Name | Purpose |
|------|------|---------|
| `CronCreate` | `Eh` | Schedule a prompt (recurring or one-shot) |
| `CronDelete` | `ql` | Cancel a scheduled job |
| `CronList` | `nf6` | List active jobs |

### CronCreate Input Schema

```javascript
{
  cron: string,      // 5-field cron expression (local timezone)
  prompt: string,    // Text to inject as user message
  recurring: bool,   // default: true
  durable: bool      // default: false (session-only). true = persist to .claude/scheduled_tasks.json
}
```

### Storage

**Session-only (durable=false):**
- In-memory array: `T8.sessionCronTasks` (via `py6()` getter, `hg8()` push)
- Dies when session ends

**Durable (durable=true):**
- File: `.claude/scheduled_tasks.json`
- Format: `{ tasks: [{ id, cron, prompt, createdAt, recurring?, lastFiredAt? }] }`
- Survives session restarts
- File-watched via chokidar for cross-session sync

### Scheduler Engine (i8A factory)

```javascript
function i8A({
  onFire,            // callback: (prompt) => enqueue into REPL
  onFireTask,        // callback: (task) => fire with agent routing
  isLoading,         // () => bool — don't fire while processing
  assistantMode,     // bool — fire even while loading
  onMissed,          // callback for missed one-shot tasks
  dir,               // optional: custom dir for task file
  lockIdentity,      // optional: custom lock identity
  getJitterConfig,   // () => jitter params
  isKilled,          // () => bool — stop check
  filter             // optional: task filter function
})
```

**Returns**: `{ start(), stop(), getNextFireTime() }`

### Tick Loop

```
Every 1s ($gq = 1000ms):
  │
  ├─ Check isKilled() → abort if true
  ├─ Check isLoading() → skip if busy (unless assistantMode)
  │
  ├─ For each durable task (from file):
  │   ├─ Calculate next fire time with jitter:
  │   │   Recurring: tE1(cron, lastFiredAt ?? createdAt, id, jitterConfig)
  │   │   One-shot:  j_4(cron, createdAt, id, jitterConfig)
  │   ├─ If now >= fireTime: FIRE
  │   │   ├─ Route to agent if task has agentId
  │   │   ├─ Check age expiry (recurringMaxAgeMs = 7 days)
  │   │   ├─ Update lastFiredAt for recurring tasks
  │   │   └─ Delete one-shot tasks after firing
  │   └─ Otherwise: skip, check next
  │
  └─ For each session task (in-memory):
      └─ Same logic but mutations are in-memory
```

### Jitter System

Prevents thundering herd:

```javascript
const Lg = {
  recurringFrac: 0.1,        // Up to 10% of period as jitter
  recurringCapMs: 900000,     // Max 15min jitter
  oneShotMaxMs: 90000,        // Max 90s early for one-shot
  oneShotFloorMs: 0,
  oneShotMinuteMod: 30,       // Only jitter one-shots on :00/:30
  recurringMaxAgeMs: 604800000 // 7 days auto-expiry
};

// Jitter is deterministic based on task ID (first 8 hex chars → float)
function H_4(id) {
  return parseInt(id.slice(0, 8), 16) / 4294967296;
}
```

### File Lock for Cross-Session Safety

```
.claude/scheduled_tasks.lock
Format: { sessionId, pid, acquiredAt }

Acquisition:
  1. Try atomic create
  2. If exists, check if holder PID is alive (JJ6 = process.kill(pid, 0))
  3. If dead, recover stale lock
  4. Retry every 5s until acquired
  5. Heartbeat refresh via setInterval
```

### Prompt Enqueue

When a task fires, it calls:
```javascript
R0({
  value: prompt,       // The scheduled prompt text
  mode: "prompt",
  priority: "later",   // Lower than user input
  isMeta: true,
  workload: AK8        // Marks as scheduled workload
});
```

This injects the prompt into the REPL's input queue, processed when idle.

---

## System 2.5: `/loop` Command

`/loop` is a thin wrapper that parses interval syntax and delegates to `CronCreate`:

```
/loop 5m /babysit-prs
  → Parse: interval=5m, prompt="/babysit-prs"
  → Convert: 5m → "*/5 * * * *"
  → Call CronCreate({cron: "*/5 * * * *", prompt: "/babysit-prs", recurring: true})
  → Also: execute the prompt immediately (don't wait for first cron fire)
```

**Interval parsing priority:**
1. Leading token: `5m /babysit` → interval=5m
2. Trailing "every": `check deploy every 20m` → interval=20m
3. Default: uses `it6` (configurable default interval)

---

## API Surface Summary

### Base URL
```
Production: https://api.anthropic.com
Dev:        http://localhost:3000
```

### Endpoints (Remote Triggers)

| Endpoint | Method | Beta Header | Purpose |
|----------|--------|-------------|---------|
| `/v1/code/triggers` | GET | `ccr-triggers-2026-01-30` | List all triggers |
| `/v1/code/triggers/{id}` | GET | `ccr-triggers-2026-01-30` | Get single trigger |
| `/v1/code/triggers` | POST | `ccr-triggers-2026-01-30` | Create trigger |
| `/v1/code/triggers/{id}` | POST | `ccr-triggers-2026-01-30` | Update trigger |
| `/v1/code/triggers/{id}/run` | POST | `ccr-triggers-2026-01-30` | Run trigger now |

### Endpoints (CCR Sessions)

| Endpoint | Method | Beta Header | Purpose |
|----------|--------|-------------|---------|
| `/v1/sessions` | GET | `ccr-byoc-2025-07-29` | List sessions |
| `/v1/sessions/{id}` | GET | `ccr-byoc-2025-07-29` | Get session |
| `/v1/sessions/{id}/events` | POST | `ccr-byoc-2025-07-29` | Send event |

### Endpoints (Environments)

| Endpoint | Method | Beta Header | Purpose |
|----------|--------|-------------|---------|
| `/v1/environment_providers` | GET | — | List environments |
| `/v1/environment_providers/cloud/create` | POST | `ccr-byoc-2025-07-29` | Create environment |

### Auth Headers (all requests)

```
Authorization: Bearer {oauth_access_token}
Content-Type: application/json
anthropic-version: 2023-06-01
x-organization-uuid: {org_uuid}
```

---

## Key Design Decisions for Porting

### What's Portable (can replicate without Anthropic infra)

1. **Local Kairos scheduler** — Pure client-side cron engine. Fully self-contained:
   - Cron parser (`JQ6`) — 5-field standard cron
   - Next-date calculator (`w_4`) — brute-force minute-by-minute scan
   - Jitter system — deterministic hash-based
   - File persistence — JSON file + lock
   - Tick loop — 1s interval, fire-when-idle

2. **`/loop` command** — Thin parser + CronCreate delegation

3. **Skill registration framework** (`Qw`) — Slash command → LLM prompt injection pattern

### What Requires Backend (Anthropic-specific)

1. **Remote trigger CRUD** — Needs a backend API (`/v1/code/triggers`)
2. **CCR session spawning** — Needs cloud compute infrastructure
3. **Environment management** — Needs environment provisioning system
4. **OAuth flow** — Claude.ai account authentication
5. **MCP connector proxy** — `mcp-proxy.anthropic.com`
6. **GitHub App integration** — For repo access in remote sessions

### Porting Strategy for Pi

To replicate `/schedule` for pi and other harnesses:

1. **Local scheduling** is already fully portable — extract the Kairos engine:
   - Cron parser + evaluator
   - File-backed job store with lock
   - Tick loop with idle detection
   - Jitter configuration

2. **Remote scheduling** needs a substitute backend:
   - Option A: Use GitHub Actions / cron workflows
   - Option B: Cloud Functions (AWS Lambda, Cloudflare Workers) with cron triggers
   - Option C: Self-hosted scheduler (e.g., Temporal, Bull, node-cron-cluster)
   - Option D: Simple VPS with systemd timers

3. **The key abstraction** is the trigger API shape:
   ```
   { name, cron_expression, enabled, job_config: { session_context, events } }
   ```
   This can be backed by any scheduler + any compute target.

4. **Session isolation** — Each trigger run gets:
   - Fresh git checkout
   - Clean environment
   - Its own tool set
   - MCP connections (optional)

---

## Symbol Map (Minified → Readable)

| Symbol | Readable Name | Purpose |
|--------|---------------|---------|
| `XEY` | `registerScheduleRemoteAgentsSkill` | `/schedule` registration |
| `MEY` | `buildSchedulePrompt` | System prompt builder |
| `YEY` | `buildLoopPrompt` | `/loop` prompt builder |
| `zEY` | `registerLoopSkill` | `/loop` registration |
| `k16` | `"RemoteTrigger"` | Tool name constant |
| `$p_` | `RemoteTriggerTool` | Tool implementation |
| `Eh` | `"CronCreate"` | Local cron tool name |
| `ql` | `"CronDelete"` | Local cron delete tool |
| `nf6` | `"CronList"` | Local cron list tool |
| `tg_` | `CronCreateTool` | CronCreate implementation |
| `qp_` | `CronDeleteTool` | CronDelete implementation |
| `Yp_` | `CronListTool` | CronList implementation |
| `i8A` | `createCronScheduler` | Scheduler factory |
| `Gx` | `fetchEnvironments` | GET /v1/environment_providers |
| `Ze4` | `createEnvironment` | POST env create |
| `Fa` | `getRepoInfo` | Git remote parser |
| `ke4` | `checkGithubAccess` | GitHub app check |
| `hA` | `getAuthState` | OAuth token accessor |
| `AX` | `getOrgUUID` | Organization UUID |
| `l8` | `getFeatureFlag` | Feature flag reader |
| `cV` | `getFeatureFlagCached` | Cached flag reader |
| `X2` | `checkPolicyPermission` | Org policy check |
| `Qw` | `registerSkill` | Skill registration |
| `R0` | `enqueuePrompt` | REPL input injection |
| `JQ6` | `parseCron` | Cron expression parser |
| `w_4` | `nextCronDate` | Next fire date calc |
| `tE1` | `nextRecurringFireTime` | Recurring + jitter |
| `j_4` | `nextOneShotFireTime` | One-shot + jitter |
| `Hgq` | `isRecurringTaskAged` | Expiry check |
| `lf6` | `loadTasksFromFile` | Read scheduled_tasks.json |
| `sE1` | `saveTasksToFile` | Write scheduled_tasks.json |
| `hg8` | `addSessionCronTask` | Push to in-memory store |
| `py6` | `getSessionCronTasks` | Read in-memory store |
| `Fy6` | `removeSessionCronTasks` | Remove from memory |
| `l8A` | `acquireSchedulerLock` | File lock acquisition |
| `dt6` | `releaseSchedulerLock` | File lock release |
| `OEY` | `decodeMcpConnectorUuid` | Base58 → UUID |
| `$EY` | `extractMcpConnectors` | Filter connected proxies |
| `jEY` | `formatConnectorsInfo` | Build connectors prompt |
| `HEY` | `sanitizeConnectorName` | Clean name for API |
| `JEY` | `getGitRepoUrl` | Git remote → HTTPS URL |
| `Vh` | `isKairosCronEnabled` | Kairos feature gate |
| `Op_` | `"ccr-triggers-2026-01-30"` | Triggers API beta flag |
| `Lg` | `DEFAULT_JITTER_CONFIG` | Jitter constants |
| `$gq` | `TICK_INTERVAL_MS` | 1000ms tick |
| `okY` | `FILE_WATCH_STABILITY_MS` | 300ms chokidar stability |
| `skY` | `LOCK_RETRY_MS` | 5000ms lock retry |
| `j66` | `DEFAULT_MAX_AGE_DAYS` | 7 days |
| `zHA` | `PROD_CONFIG` | Production API URLs |

---

## Files & Paths

| Path | Purpose |
|------|---------|
| `.claude/scheduled_tasks.json` | Durable cron job store |
| `.claude/scheduled_tasks.lock` | Scheduler lock file |
| `https://claude.ai/code/scheduled` | Web UI for trigger management |
| `https://claude.ai/code/scheduled/{TRIGGER_ID}` | Individual trigger page |
| `https://claude.ai/settings/connectors` | MCP connector setup |
| `https://claude.ai/code/onboarding?magic=github-app-setup` | GitHub app install |

---

## E2E Validation Findings (2026-03-23)

All findings below were verified against the live Anthropic API using a Claude Max account.

### Session Creation Discovery

The `/v1/sessions` POST endpoint rejects events with `type: "user"` inline — it expects `events: []` (empty). Claude Code follows a two-step pattern:

1. `POST /v1/sessions` with `events: []` → returns `{ id, title }`
2. `POST /v1/sessions/{id}/events` with `type: "user"` message → sends the initial prompt

Sending events inline returns:
```json
{"type":"error","error":{"type":"invalid_request","message":"Failed to parse request: events[0]: type field value mismatch: expected \"event\", got \"user\""}}
```

### Session Event Retrieval

`GET /v1/sessions/{id}/events` returns paginated conversation history via `after_id` parameter. Response shape:
```json
{"data": [...events], "has_more": false, "last_event_id": "..."}
```

Event types observed:
- `type: "user"` — user messages with `message.content` as string
- `type: "assistant"` — assistant responses with `message.content` as array of blocks (`text`, `tool_use`, `thinking`)
- `type: "tool_result"` — tool execution results

### Auto-Provisioned GitHub MCP

When a session or trigger references a GitHub repo, the backend auto-attaches a scoped GitHub MCP server:
```json
{
  "mcp_config": {
    "mcpServers": {
      "github": {
        "type": "http",
        "url": "https://api.anthropic.com/v2/ccr-sessions/{cse_id}/github/mcp"
      }
    }
  }
}
```

The session's system prompt is automatically augmented with GitHub integration instructions, including the repo scope restriction.

### Session Lifecycle

Observed status progression: `pending` → `running` → `idle`

- `pending`: Environment being provisioned
- `running`: Agent executing (tool calls, thinking)
- `idle`: Agent finished processing, waiting for follow-up input via `sendSessionEvent()`
- `completed`/`failed`/`stopped`: Terminal states

### Trigger Run Response

`POST /v1/code/triggers/{id}/run` returns the trigger object (not a session ID directly). The spawned session appears in `GET /v1/sessions` with `origin: "force_run_trigger"` and title `"{trigger_name} run"`.

### Verified API Features

| Feature | Endpoint | Status |
|---------|----------|--------|
| List triggers | `GET /v1/code/triggers` | ✓ 200 |
| Create trigger | `POST /v1/code/triggers` | ✓ 200 |
| Get trigger | `GET /v1/code/triggers/{id}` | ✓ 200 |
| Update trigger | `POST /v1/code/triggers/{id}` | ✓ 200 |
| Run trigger | `POST /v1/code/triggers/{id}/run` | ✓ 200 |
| Delete trigger | — | Not available via API |
| List sessions | `GET /v1/sessions` | ✓ 200 |
| Get session | `GET /v1/sessions/{id}` | ✓ 200 |
| Create session | `POST /v1/sessions` | ✓ 200 (events must be empty) |
| Get session events | `GET /v1/sessions/{id}/events` | ✓ 200 (paginated) |
| Send session event | `POST /v1/sessions/{id}/events` | ✓ 200 |
| List environments | `GET /v1/environment_providers` | ✓ 200 |
| GitHub token sync | `GET /api/oauth/organizations/{org}/sync/github/auth` | ✓ 200 |
| GitHub app check | `GET /api/oauth/organizations/{org}/code/repos/{owner}/{repo}` | ✓ 200 |
| OAuth profile | `GET /api/oauth/profile` | ✓ 200 |
| Token refresh | `POST platform.claude.com/v1/oauth/token` | ✓ (direct grant) |
