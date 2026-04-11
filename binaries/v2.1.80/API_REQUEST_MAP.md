# Claude Code v2.1.80 — API Request Shape & Fingerprinting Map

Reverse-engineered from the native darwin-arm64 Bun binary using [bun-demincer](https://github.com/vicnaum/bun-demincer). 4777 modules extracted, 3074 app code modules identified. Cross-referenced with live traffic via intercept proxy (`ANTHROPIC_BASE_URL` override).

Source files referenced below use bun-demincer module IDs (e.g. `0747.js`).

---

## 1. User-Agent String

```
claude-cli/<VERSION> (external, <ENTRYPOINT><SDK_SUFFIX><CLIENT_SUFFIX><WORKLOAD_SUFFIX>)
```

Components:
- `ENTRYPOINT`: `process.env.CLAUDE_CODE_ENTRYPOINT ?? "cli"` — values: `cli`, `vscode`, `jetbrains`, `agent-sdk`, `sdk-cli`
- `SDK_SUFFIX`: if `CLAUDE_AGENT_SDK_VERSION` set → `, agent-sdk/<version>`
- `CLIENT_SUFFIX`: if `CLAUDE_AGENT_SDK_CLIENT_APP` set → `, client-app/<app>`
- `WORKLOAD_SUFFIX`: if workload set (AsyncLocalStorage) → `, workload/<name>` (e.g. `workload/cron`)

Observed in live traffic with `-p` flag: `claude-cli/2.1.80 (external, sdk-cli)` (not `cli` — the `-p` print mode uses `sdk-cli` entrypoint).

## 2. Default Headers (all requests)

```
x-app: cli
User-Agent: claude-cli/2.1.80 (external, <entrypoint>)
anthropic-version: 2023-06-01
anthropic-dangerous-direct-browser-access: true
```

Stainless SDK headers (added by `@anthropic-ai/sdk`):
```
x-stainless-arch: arm64
x-stainless-lang: js
x-stainless-os: MacOS
x-stainless-package-version: 0.74.0
x-stainless-retry-count: 0
x-stainless-runtime: node
x-stainless-runtime-version: v24.13.1
x-stainless-timeout: 600
```

### Auth-specific headers

**OAuth path**:
```
Authorization: Bearer <accessToken>
anthropic-beta: oauth-2025-04-20  (included in beta list)
```

**API key path**:
```
x-api-key: <apiKey>
```

## 3. Beta Headers — Complete Logic

Source: module `2018.js` function `FDq()`. All beta string constants defined in `0743.js`.

### Available beta flags (v2.1.80)

| Variable | Beta String | Condition |
|----------|------------|-----------|
| `E4T` | `claude-code-20250219` | Always, unless model is haiku |
| `XP` | `oauth-2025-04-20` | Only for OAuth auth (`a8()`) |
| `Za` | `context-1m-2025-08-07` | Only when model ID contains `[1m]` suffix |
| `Ov8` | `interleaved-thinking-2025-05-14` | Unless `DISABLE_INTERLEAVED_THINKING` env; model must support thinking |
| `zv8` | `redact-thinking-2026-02-12` | firstParty + thinking + `tengu_quiet_hollow` + showThinkingSummaries !== true |
| `b4T` | `context-management-2025-06-27` | firstParty + (`USE_API_CONTEXT_MANAGEMENT` OR `tengu_marble_anvil`) |
| `Na` | `structured-outputs-2025-12-15` | Model supports structured outputs + `tengu_tool_pear` flag |
| `x4T` | `tool-examples-2025-10-29` | firstParty + `tengu_scarf_coffee` flag |
| `b8q` | `web-search-2025-03-05` | vertex + model supports web search, OR foundry |
| `sS_` | `prompt-caching-scope-2026-01-05` | Always for firstParty |
| - | `ANTHROPIC_BETAS` env var | User-provided custom betas, comma-separated |

### Bedrock beta filtering

Source: module `0744.js`, set `I8q`.

Bedrock strips these betas before sending:
- `interleaved-thinking-2025-05-14`
- `context-1m-2025-08-07`
- `tool-search-tool-2025-10-19`
- `tool-examples-2025-10-29`

### Beta builder pseudocode (clean)

```js
function buildBetas(modelId) {
  const betas = []
  const isHaiku = canonicalize(modelId).includes("haiku")
  const platform = getPlatform() // "firstParty" | "bedrock" | "vertex" | "foundry"
  const isFirstParty = platform === "firstParty"

  if (!isHaiku)                        betas.push("claude-code-20250219")
  if (isOAuth())                       betas.push("oauth-2025-04-20")
  if (modelId.match(/\[1m\]/i))        betas.push("context-1m-2025-08-07")
  if (!env.DISABLE_INTERLEAVED_THINKING && supportsThinking(modelId))
                                       betas.push("interleaved-thinking-2025-05-14")
  if (isFirstParty && supportsThinking(modelId) && !showThinkingSummaries && flag("tengu_quiet_hollow"))
                                       betas.push("redact-thinking-2026-02-12")
  if (isFirstParty && (env.USE_API_CONTEXT_MANAGEMENT || flag("tengu_marble_anvil")))
                                       betas.push("context-management-2025-06-27")
  if (supportsStructuredOutputs(modelId) && flag("tengu_tool_pear"))
                                       betas.push("structured-outputs-2025-12-15")
  if (isFirstParty && flag("tengu_scarf_coffee"))
                                       betas.push("tool-examples-2025-10-29")
  if (platform === "vertex" && supportsWebSearch(modelId))
                                       betas.push("web-search-2025-03-05")
  if (platform === "foundry")          betas.push("web-search-2025-03-05")
  if (isFirstParty)                    betas.push("prompt-caching-scope-2026-01-05")
  if (env.ANTHROPIC_BETAS)             betas.push(...env.ANTHROPIC_BETAS.split(","))

  return betas
}
```

### Critical finding: `context-1m` is OPT-IN, not automatic

The `context-1m-2025-08-07` beta is ONLY added when the model ID contains a `[1m]` suffix (e.g. `claude-opus-4-6[1m]`). It is NOT automatically sent for 4.6 models.

The context window *size* calculation (`jD()` in `2016.js`) does check model capabilities, but the beta *header* is only triggered by the explicit `[1m]` user opt-in.

## 4. Context Window Logic

Source: module `2016.js`.

### `jD(modelId, activeBetas)` — returns context window size

```js
function getContextWindow(modelId, activeBetas) {
  if (has1mSuffix(modelId))                      return 1_000_000
  const modelInfo = getModelInfo(modelId)         // from cached model list
  if (modelInfo?.max_input_tokens >= 100_000) {
    if (modelInfo.max_input_tokens > 200_000 && disable1mContext())
      return 200_000
    return modelInfo.max_input_tokens
  }
  if (activeBetas?.includes("context-1m-2025-08-07") && supports1mContext(modelId))
    return 1_000_000
  if (isCoralReefSonnet(modelId))                return 1_000_000
  return 200_000  // default
}
```

### `CAq(modelId)` — which models support 1M context

```js
function supports1mContext(modelId) {
  if (env.CLAUDE_CODE_DISABLE_1M_CONTEXT) return false
  const canonical = canonicalize(modelId)
  return canonical.includes("claude-sonnet-4") || canonical.includes("opus-4-6")
}
```

Models that get 1M: any `claude-sonnet-4*` (4.0, 4.5, 4.6) and `claude-opus-4-6`.

### `UDq(modelId)` — coral_reef_sonnet gate

```js
function isCoralReefSonnet(modelId) {
  if (env.CLAUDE_CODE_DISABLE_1M_CONTEXT) return false
  if (has1mSuffix(modelId)) return false
  if (!canonicalize(modelId).includes("sonnet-4-6")) return false
  return clientData("coral_reef_sonnet") === "true"
}
```

This is the special Sonnet 4.6 gate that reads from `client_data`. When `coral_reef_sonnet` is `"true"` in the user's client data, Sonnet 4.6 gets 1M context automatically WITHOUT the `[1m]` suffix.

### Output token limits — `Io(modelId)`

| Model Pattern | Default Output | Upper Limit |
|--------------|---------------|-------------|
| `opus-4-6` | 64,000 | 128,000 |
| `sonnet-4-6` | 32,000 | 128,000 |
| `opus-4-5`, `sonnet-4*`, `haiku-4*` | 32,000 | 64,000 |
| `opus-4-1`, `opus-4` | 32,000 | 32,000 |
| `claude-3-opus` | 4,096 | 4,096 |
| `claude-3-sonnet` | 8,192 | 8,192 |
| `claude-3-haiku` | 4,096 | 4,096 |
| `3-5-sonnet`, `3-5-haiku` | 8,192 | 8,192 |
| `3-7-sonnet` | 32,000 | 64,000 |
| default | 32,000 | 64,000 |

If the model's info from the API has `max_tokens >= 4096`, that overrides the upper limit.

## 5. `client_data` Endpoint

Source: module `0747.js`.

### Endpoint
```
GET <BASE_API_URL>/api/oauth/claude_cli/client_data
```

### Request
```
Authorization: Bearer <accessToken>
Content-Type: application/json
User-Agent: claude-cli/2.1.80 (external, cli)
```

### Prerequisites
- Must be OAuth subscriber (`a8()`)
- Must have `user:profile` scope (`Ok()`)
- Not disabled by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`

### Response
```json
{"client_data": {}}
```

Returns an empty object for standard accounts. Known fields (from code analysis):
- `coral_reef_sonnet`: `"true"` — enables automatic 1M context for Sonnet 4.6

### Caching
Cached in `clientDataCache` within local settings. Only refetched when the cache is stale. The `Dv8()` function handles cache persistence:

```js
async function fetchAndCacheClientData() {
  const data = await fetchClientData()
  const cached = getSettings().clientDataCache
  if (deepEqual(cached?.data, data)) return data  // no change
  persistSettings(s => ({ ...s, clientDataCache: { data, timestamp: Date.now() } }))
  return data
}
```

### Lookup
```js
function getClientDataField(key) {
  const value = getSettings().clientDataCache?.data?.[key]
  return typeof value === "string" ? value : null
}
```

## 6. Billing / Attribution Header

```
x-anthropic-billing-header: cc_version=2.1.80.<modelId>; cc_entrypoint=<entrypoint>; cch=00000; cc_workload=<workload>;
```

Gated by `tengu_attribution_header` (default: `true`) and `CLAUDE_CODE_ATTRIBUTION_HEADER !== "false"`.

Live traffic observation: the billing header is embedded in the **first system prompt block** as plain text, not as an HTTP header:
```
system[0].text = "x-anthropic-billing-header: cc_version=2.1.80.a46; cc_entrypoint=sdk-cli; cch=00000;"
```

### Update: CCH Signing (April 2026)

The `cch=00000` value in npm-distributed builds is a placeholder. The compiled Bun binary contains native Zig code that computes a real hash:

```
cch = SHA-256(first_user_message_text)[:5]
version_suffix = SHA-256(BILLING_SALT + sampled_chars + version)[:3]
BILLING_SALT = "59cf53e54c78"
sampled_chars = message[4] + message[7] + message[20]  (pad with '0' if short)
```

Server-side enforcement was added in late March 2026. Invalid cch= values now result in rejection for fast mode access. See `notes/cch-signing-analysis.md` for the full algorithm and references.

## 7. System Prompt Identity Strings

Three valid identity prefixes:
```
"You are Claude Code, Anthropic's official CLI for Claude."
"You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK."
"You are a Claude agent, built on Anthropic's Claude Agent SDK."
```

Server-side validation checks for one of these prefixes in system prompts for OAuth sessions.

## 8. Model Capability Checks

Source: module `2018.js` helper functions.

### `Sh6(modelId)` — supports interleaved thinking
```js
// firstParty: anything NOT claude-3-*
// bedrock/vertex: claude-opus-4* or claude-sonnet-4*
```

### `pOK(modelId)` — supports context management
```js
// firstParty: NOT claude-3-*
// bedrock/vertex: claude-opus-4* or claude-sonnet-4* or claude-haiku-4*
```

### `fK_(modelId)` — supports structured outputs
```js
// firstParty or foundry only
// claude-sonnet-4-6, claude-sonnet-4-5, claude-opus-4-1, claude-opus-4-5, claude-opus-4-6, claude-haiku-4-5
```

### `mOK(modelId)` — supports web search
```js
// claude-opus-4* or claude-sonnet-4* or claude-haiku-4*
```

## 9. Feature Flags (tengu_* system)

Feature flags are checked via `Tq(flagName, defaultValue)`. Fetched from Anthropic's backend (likely GrowthBook CDN at `cdn.growthbook.io`).

| Flag | Default | Effect |
|------|---------|--------|
| `tengu_attribution_header` | `true` | Enables billing header |
| `tengu_marble_anvil` | `false` | Enables context management beta |
| `tengu_tool_pear` | checked via `IO()` | Enables structured outputs beta |
| `tengu_scarf_coffee` | `false` | Enables tool examples beta |
| `tengu_quiet_hollow` | `false` | Enables thinking redaction |
| `tengu_penguins_off` | `null` | Fast mode control |
| `tengu_amber_flint` | `true` | Agent teams |
| `tengu_grey_wool` | `true` | Unknown |
| `tengu_grey_step2` | varies | Unknown |
| `tengu_coral_fern` | `false` | Team memory directories |
| `tengu_herring_clock` | `false` | Team memory sync |
| `tengu_paper_halyard` | `false` | Unknown |
| `tengu_marble_sandcastle` | `false` | Fast mode native binary check |
| `tengu_plan_mode_interview_phase` | `false` | Plan mode |
| `tengu_pewter_ledger` | `null` | Unknown |
| `tengu_mcp_elicitation` | `false` | MCP elicitation support |
| `tengu_auto_mode_config` | `{}` | Auto mode allowed models |
| `tengu_amber_quartz_disabled` | `false` | Unknown |
| `tengu_passport_quail` | `false` | Memory extraction mode |
| `tengu_swinburne_dune` | `false` | Memory mode variant |
| `tengu_turtle_carbon` | `true` | Unknown |
| `tengu_granite_whisper` | `false` | Repo text file size tracking |
| `tengu_startup_perf` | - | Telemetry-only |
| `tengu_fast_mode_fallback_triggered` | - | Telemetry-only |
| `tengu_ripgrep_eagain_retry` | - | Telemetry-only |
| `tengu_file_operation` | - | Telemetry-only |
| `tengu_org_penguin_mode_fetch_failed` | - | Telemetry-only |

## 10. API Endpoints

| Purpose | URL |
|---------|-----|
| Messages | `https://api.anthropic.com/v1/messages` |
| Client data | `<BASE_API_URL>/api/oauth/claude_cli/client_data` |
| OAuth token | `https://console.anthropic.com/v1/oauth/token` |
| API key creation | `https://api.anthropic.com/api/oauth/claude_cli/create_api_key` |
| Metrics | `https://api.anthropic.com/api/claude_code/metrics` |
| Feedback | `https://api.anthropic.com/api/claude_cli_feedback` |
| Transcripts | `https://api.anthropic.com/api/claude_code_shared_session_transcripts` |
| Feature flags | `https://cdn.growthbook.io` |
| Binary dist | `https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases` |
| Desktop (macOS) | `https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect` |
| Desktop (Windows) | `https://claude.ai/api/desktop/win32/x64/exe/latest/redirect` |
| MCP Proxy | `https://mcp-proxy.anthropic.com` |
| Platform | `https://platform.claude.com` |
| Staging API | `https://api-staging.anthropic.com` |

## 11. Environment Variables

Extracted from the binary. Variables that affect API behavior:

| Variable | Effect |
|----------|--------|
| `ANTHROPIC_BASE_URL` | Override API base URL |
| `ANTHROPIC_API_KEY` | API key auth |
| `ANTHROPIC_BETAS` | Custom beta headers (comma-separated) |
| `ANTHROPIC_CUSTOM_HEADERS` | Custom request headers |
| `API_TIMEOUT_MS` | Request timeout (default: 600000) |
| `CLAUDE_CODE_ENTRYPOINT` | User-agent entrypoint (default: `cli`) |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` | Disable 1M context window |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Skip client_data fetch |
| `CLAUDE_CODE_ATTRIBUTION_HEADER` | Set to `false` to disable billing header |
| `CLAUDE_CODE_USE_BEDROCK` | Use Bedrock provider |
| `CLAUDE_CODE_USE_VERTEX` | Use Vertex provider |
| `CLAUDE_CODE_USE_FOUNDRY` | Use Foundry provider |
| `CLAUDE_CODE_ADDITIONAL_PROTECTION` | Adds `x-anthropic-additional-protection: true` |
| `CLAUDE_CODE_CONTAINER_ID` | Remote container ID header |
| `CLAUDE_CODE_REMOTE_SESSION_ID` | Remote session ID header |
| `CLAUDE_CODE_PROXY_RESOLVES_HOSTS` | Proxy configuration |
| `CLAUDE_AGENT_SDK_VERSION` | Agent SDK version in user-agent |
| `CLAUDE_AGENT_SDK_CLIENT_APP` | Client app name in user-agent |
| `DISABLE_INTERLEAVED_THINKING` | Skip interleaved thinking beta |
| `USE_API_CONTEXT_MANAGEMENT` | Force context management beta |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | Proxy settings |

## 12. Live Traffic Capture (via intercept proxy)

Captured by routing `ANTHROPIC_BASE_URL=http://localhost:8877` through a Bun reverse proxy.

### Haiku 4.5 request (`-p` mode)

```
POST /v1/messages
anthropic-beta: oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,claude-code-20250219
anthropic-version: 2023-06-01
authorization: Bearer sk-ant-oat01-...
content-type: application/json
user-agent: claude-cli/2.1.80 (external, sdk-cli)
x-app: cli
```

Body summary:
```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 32000,
  "stream": true,
  "system": [3 blocks, 27143 chars],
  "messages": [1 message],
  "tools": [26 tools],
  "thinking": {"budget_tokens": 31999, "type": "enabled"}
}
```

**Notable**: `claude-code-20250219` IS present despite haiku model — the `-p`/sdk-cli entrypoint may have different beta logic than interactive mode, or the haiku exclusion only applies to the interactive CLI path.

**Notable**: `context-management-2025-06-27` is present — this means `tengu_marble_anvil` is `true` for this account or `USE_API_CONTEXT_MANAGEMENT` is set.

**Notable**: `context-1m-2025-08-07` is NOT present — confirming it's opt-in only via `[1m]` suffix.

### Second request (auto-compact)

After the streaming response, the CLI sent a second non-streaming request with `max_tokens: 21333` and received a JSON response containing `context_management` field — confirming context management is active.

## 13. bun-demincer Module Map

Key modules for API/auth/beta behavior:

| Module | Original Symbol | Purpose |
|--------|----------------|---------|
| `0743.js` | - | All beta flag string constants |
| `0744.js` | `lc` | Platform detection (`U8()`), `ANTHROPIC_BASE_URL` validation |
| `0747.js` | `OD` | `client_data` fetch, cache, `coral_reef_sonnet` gate |
| `2016.js` | `dDq` | 1M context window logic, output token limits, model info cache |
| `2018.js` | `bk` | **Beta header builder** (`FDq()`), bedrock filter, agent teams check |

## 14. opencode-claude-auth Plugin Gap Analysis

### What the plugin sends correctly
- ✅ `oauth-2025-04-20`
- ✅ `interleaved-thinking-2025-05-14`
- ✅ `claude-code-20250219` (for non-haiku)
- ✅ `context-1m-2025-08-07` (for 4.6+ models, with fallback retry)
- ✅ System prompt identity prefix
- ✅ `x-app: cli`
- ✅ Billing header
- ✅ User-agent fingerprint

### What the plugin does NOT send (but the CLI does)
- ❌ `prompt-caching-scope-2026-01-05` — always sent by CLI for firstParty
- ❌ `context-management-2025-06-27` — sent when `tengu_marble_anvil` is enabled
- ❌ `redact-thinking-2026-02-12` — sent when `tengu_quiet_hollow` is enabled
- ❌ `structured-outputs-2025-12-15` — sent when `tengu_tool_pear` is enabled

### What the plugin does differently
- ⚠️ `context-1m-2025-08-07` — plugin sends it automatically for 4.6+ models; CLI only sends it with `[1m]` suffix
- ⚠️ Version in user-agent — plugin uses `DEFAULT_CC_VERSION` which should track latest

### Recommended changes
1. **Add `prompt-caching-scope-2026-01-05`** — safe, always sent by CLI for firstParty
2. **`context-1m` behavior** — current plugin approach (auto for 4.6+) is arguably better than CLI's (opt-in only), since 1M is now GA. Keep as-is.
3. **Consider `context-management-2025-06-27`** — depends on whether OpenCode's own context management conflicts
