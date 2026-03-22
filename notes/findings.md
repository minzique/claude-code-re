# Undocumented Findings — Claude Code & Desktop RE

## Internal Codenames

| Codename | Description | Source |
|---|---|---|
| **Antspace** | Anthropic's hidden PaaS deployment platform | Go binary (blog) |
| **Baku** | Web app builder (Vite+React+TS) | Go binary (blog) |
| **Tengu** | Telemetry/analytics event prefix (500+ events) | CLI binary |
| **Cowork** | VM-based agent execution in Desktop | Desktop app |
| **Chicago** | Unknown feature (GrowthBook flag gated) | Desktop app |
| **Ion** | Preview environment (`ion-preview.claude.ai`) | Desktop app |
| **Pivot** | Office file integration (`pivot.claude.ai/manifest.xml`) | Desktop app |
| **Teleport** | Session transfer/migration between local and remote | Desktop/CLI |
| **Grove** | Privacy policy/consent system | CLI binary |
| **Coral** | Feature flag (`coral_reef_sonnet`) | CLI binary |
| **PlushRaccoon** | Desktop UI feature (3 option slots, keyboard shortcuts) | Desktop app |
| **QuietPenguin** | Desktop feature flag | Desktop app |
| **LouderPenguin** | Desktop feature flag | Desktop app |
| **SparkleHedgehog** | Desktop prototype (appearance + scale settings) | Desktop app |
| **ChillingSloth** | Desktop feature (enterprise + local variants) | Desktop app |
| **MidnightOwl** | Desktop prototype | Desktop app |
| **PhoenixRisingAgain** | Auto-updater debug override | Desktop app |
| **FloatingAtoll** | Desktop UI element | Desktop app |
| **YukonSilver** | Desktop feature (+ gems variant) | Desktop app |
| **MemoryBalloon** | VM memory management (maxGB, baselineGB, minGB) | Desktop app |

## Desktop VM Infrastructure

The Desktop app downloads **Linux VM images** directly:
```
https://downloads.claude.ai/vms/linux/{arch}/{sha}
```

Also downloads VM hashes for verification:
```
https://downloads.claude.ai/releases/darwin/universal/{version}/vm_hash
```

Desktop runs a local "cowork-vm-service" (Windows named pipe: `\\.\pipe\cowork-vm-service`).
Supports gVisor sandboxing (`coworkNetworkMode: "gvisor" | "auto"`).

## Desktop-Specific URLs

| URL | Purpose |
|---|---|
| `https://downloads.claude.ai/vms/linux/{arch}/{sha}` | VM image downloads |
| `https://downloads.claude.ai/releases/darwin/universal/RELEASES.json` | Desktop update manifest |
| `https://downloads.claude.ai/claude-code-releases` | Claude Code binary releases |
| `https://pivot.claude.ai/manifest.xml` | Office file integration manifest |
| `https://ion-preview.claude.ai` | Preview environment |
| `https://preview.claude.ai` | Preview environment |
| `https://preview.claude.com` | Preview environment (alt domain) |
| `https://beacon.claude-ai.staging.ant.dev` | Staging telemetry beacon |
| `https://claude-ai.staging.ant.dev` | Staging environment |
| `https://console.staging.ant.dev` | Internal staging console |

## Staging/Internal Domains

- `*.staging.ant.dev` — Anthropic staging infrastructure
- `claude-ai.staging.ant.dev` — staging frontend
- `console.staging.ant.dev` — staging console with OAuth callbacks
- `beacon.claude-ai.staging.ant.dev` — staging telemetry

## Desktop API Endpoints

- `GET /api/bootstrap` — App initialization
- `GET /api/desktop/features` — Feature flags
- `POST /api/event_logging/batch` — Telemetry batching
- `GET /api/oauth/profile` — User profile
- `GET /api/organizations/` — Org management
- `GET /api/vms/linux/{arch}/{sha}` — VM image download

## Desktop Feature Flags (from GrowthBook)

The Desktop uses GrowthBook feature flags extensively:
- `nativeQuickEntry`, `quickEntryDictation`
- `plushRaccoon`, `quietPenguin`, `louderPenguin`
- `chillingSlothEnterprise`, `chillingSlothFeat`, `chillingSlothLocal`
- `yukonSilver`, `yukonSilverGems`
- `desktopTopBar`, `ccdPlugins`, `floatingAtoll`

## Enterprise Desktop Settings (managed via MDM/Registry)

- `isDesktopExtensionEnabled` / `isDxtEnabled`
- `isDesktopExtensionDirectoryEnabled`
- `isDesktopExtensionSignatureRequired`
- `isLocalDevMcpEnabled`
- `isClaudeCodeForDesktopEnabled`
- `secureVmFeaturesEnabled`
- `disableAutoUpdates`
- `autoUpdaterEnforcementHours`
- `customDeploymentUrl`

## Model IDs Found in Binary

```
claude-haiku-3-5
claude-haiku-4-5
claude-opus-4-0
claude-opus-4-1
claude-opus-4-20250514
claude-opus-4-5
claude-opus-4-6
claude-sonnet-3-7
claude-sonnet-4-0
claude-sonnet-4-20250514
claude-sonnet-4-5
claude-sonnet-4-6
```

## Beta Headers

```
api-2025-04-14
batches-2024-09-24
byoc-2025-07-29
compact-2026-01-12
counting-2024-11-01
effort-2025-11-24
environments-2025-11-01
management-2025-06-27
mode-2026-01-31 / mode-2026-02-01
oauth-2025-04-20
outputs-2025-11-13 / outputs-2025-12-15
scope-2026-01-05
search-2025-03-05
servers-2025-12-04
skills-2025-10-02
thinking-2025-05-14 / thinking-2026-02-12
tool-2025-10-19
use-2025-11-20
```

## Key API Endpoints (from CLI binary)

```
/v1/batch
/v1/certs
/v1/code/sessions
/v1/complete
/v1/environment_providers
/v1/environments/bridge
/v1/feedback
/v1/files
/v1/logs
/v1/mcp_servers
/v1/messages
/v1/messages/batches
/v1/messages/count_tokens
/v1/models
/v1/oauth/hello
/v1/oauth/token
/v1/security/advisories/bulkExplain
/v1/session_ingress/session/
/v1/sessions
/v1/sessions/ws/
/v1/skills
/v1/toolbox/shttp/mcp/
/v1/traces
```

## Environment Variables (183 total CLAUDE_/ANTHROPIC_)

Notable undocumented ones:
- `CLAUDE_CODE_ENABLE_CFC` — unknown feature
- `CLAUDE_CODE_IS_COWORK` — cowork mode flag
- `CLAUDE_CODE_PLAN_V2_AGENT_COUNT` — plan mode parallelism
- `CLAUDE_CODE_ENABLE_TASKS` — task system
- `CLAUDE_CODE_SM_COMPACT` — session memory compaction
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` — multi-agent teams
- `CLAUDE_CODE_ENVIRONMENT_KIND` — "bridge" mode
- `CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2` — session protocol v2
- `CLAUDE_CODE_USE_CCR_V2` — CCR v2 protocol
- `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` — cowork memory
- `CLAUDE_RPC_TOKEN` — Desktop RPC auth
- `CLAUDE_UPDATER_TOKEN` — Desktop updater auth
- `CLAUDE_DEV_TOOLS` — Desktop dev tools
- `CLAUDE_CDP_AUTH` — Chrome DevTools Protocol auth

## Telemetry Events (500+ `tengu_*` events)

Notable categories:
- `tengu_bridge_*` — Remote control/bridge infrastructure
- `tengu_team_mem_*` — Team memory sync
- `tengu_teleport_*` — Session teleportation
- `tengu_grove_*` — Privacy/consent management
- `tengu_cowork_*` — Desktop VM agent execution
- `tengu_native_*` — Native binary management
- `tengu_binary_*` — Binary download/update
- `tengu_sm_compact_*` — Session memory compaction
- `tengu_agent_*` — Agent teams infrastructure
