# Claude Code OAuth — Long-Lived Token Generation

**Version**: 2.1.81  
**Date**: 2026-03-25  
**Discovery**: Reverse engineering of `/install-github-app` command flow

---

## Summary

Claude Code can generate **1-year OAuth access tokens** for headless/CI use. This is how `/install-github-app` creates the `CLAUDE_CODE_OAUTH_TOKEN` GitHub Actions secret. The mechanism is a standard OAuth2 PKCE flow with a custom `expires_in` parameter in the token exchange.

---

## How It Works

### Normal Claude Code Login
- Requests scopes: `user:inference user:profile user:sessions:claude_code user:mcp_servers user:file_upload`
- Token expires in ~10 hours (28800s)
- Refresh token rotates on each use (single-use)

### `/install-github-app` Flow
- Requests scope: `user:inference` only (`inferenceOnly: true`)
- Passes `expires_in: 31536000` (365 days) in the token exchange
- Stores result as `CLAUDE_CODE_OAUTH_TOKEN` in GitHub secrets
- **No refresh token needed** — the access token itself lasts 1 year

### Key Constraint
The `expires_in` parameter is **rejected** if the scope includes `user:sessions:claude_code`. Only `user:inference` (and likely `user:profile`) allow long expiry. This is enforced server-side.

---

## OAuth Endpoints

| Endpoint | URL |
|----------|-----|
| Authorization | `https://claude.ai/oauth/authorize` |
| Token Exchange | `https://claude.ai/v1/oauth/token` |
| Client Metadata | `https://claude.ai/oauth/claude-code-client-metadata` |

**Client ID**: `9d1c250a-e61b-44d9-88ed-5944d1962f5e` (Claude Code public client)  
**Auth method**: `none` (public client, no client secret)

Note: `platform.claude.com` is used for organization/console accounts. Personal claude.ai accounts use `claude.ai` endpoints.

---

## Token Exchange Request

```http
POST https://claude.ai/v1/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "<auth_code>",
  "redirect_uri": "http://localhost:<port>/callback",
  "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  "code_verifier": "<pkce_verifier>",
  "state": "<state>",
  "expires_in": 31536000
}
```

### Response
```json
{
  "token_type": "Bearer",
  "access_token": "sk-ant-oat01-...",
  "expires_in": 31536000,
  "scope": "user:inference",
  "organization": { "uuid": "...", "name": "..." },
  "account": { "uuid": "...", "email_address": "..." }
}
```

---

## Refresh Token Behavior

- Refresh tokens **rotate on every use** — using one invalidates the previous
- The refresh endpoint is `https://claude.ai/v1/oauth/token` with `grant_type: refresh_token`
- Refresh token format: `sk-ant-ort01-...`
- Access token format: `sk-ant-oat01-...`
- **For long-lived tokens, no refresh is needed** — the access token itself is valid for 1 year

### Refresh Request (for reference)
```http
POST https://claude.ai/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<token>&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e
```

⚠️ **Warning**: Each refresh invalidates the previous refresh token. If you refresh via curl, your local Claude Code installation will lose its auth and require `/login` again.

---

## Scopes

| Scope | Normal Login | Long-Lived | Description |
|-------|:---:|:---:|---|
| `user:inference` | ✓ | ✓ | API calls (messages, completions) |
| `user:profile` | ✓ | ✗ | Read user profile |
| `user:sessions:claude_code` | ✓ | ✗ | **Blocks long expiry** |
| `user:mcp_servers` | ✓ | ✗ | MCP server access |
| `user:file_upload` | ✓ | ✗ | File uploads |
| `org:create_api_key` | Console only | ✗ | Create API keys (org accounts) |

---

## Manual Token Generation

### Prerequisites
- A Claude Max/Pro subscription (personal claude.ai account)
- A browser to complete the OAuth flow

### Steps

1. **Generate PKCE parameters**
```bash
VERIFIER=$(python3 -c "import secrets; print(secrets.token_urlsafe(96)[:128])")
CHALLENGE=$(echo -n "$VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
STATE=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
```

2. **Open the authorization URL** (scope: `user:inference` only)
```
https://claude.ai/oauth/authorize?code=true
  &client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e
  &response_type=code
  &redirect_uri=http://localhost:18234/callback
  &scope=user:inference
  &code_challenge=<CHALLENGE>
  &code_challenge_method=S256
  &state=<STATE>
```

3. **Authenticate in browser**, copy the callback URL:
```
http://localhost:18234/callback?code=<CODE>&state=<STATE>
```

4. **Exchange for 1-year token**
```bash
curl -X POST "https://claude.ai/v1/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "<CODE>",
    "redirect_uri": "http://localhost:18234/callback",
    "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    "code_verifier": "<VERIFIER>",
    "state": "<STATE>",
    "expires_in": 31536000
  }'
```

5. **Use the token** as `ANTHROPIC_OAUTH_TOKEN` env var or in the `Authorization: Bearer` header.

### Automated Script

See [`create-long-lived-token.py`](../scripts/create-long-lived-token.py) for a self-contained script that handles the full flow.

---

## How `CLAUDE_CODE_OAUTH_TOKEN` Is Consumed

When Claude Code (or the GH Action) sees `CLAUDE_CODE_OAUTH_TOKEN` in the environment, it **bypasses all OAuth refresh logic** and treats it as a static credential:

```javascript
// Module 2097 — S8() credential resolver
if (process.env.CLAUDE_CODE_OAUTH_TOKEN)
  return {
    accessToken: process.env.CLAUDE_CODE_OAUTH_TOKEN,
    refreshToken: null,      // No refresh — static token
    expiresAt: null,          // No expiry tracking
    scopes: ["user:inference"], // Hardcoded inference-only
    subscriptionType: null,
    rateLimitTier: null,
  };
```

The credential is then passed to the bundled Anthropic SDK as `authToken`, which sends it as `Authorization: Bearer` (never `x-api-key`).

### Auth Resolution Priority (Module 2096 — `ML()`)

```
1. ANTHROPIC_AUTH_TOKEN env var (if not in _DT/restricted mode)
2. CLAUDE_CODE_OAUTH_TOKEN env var          ← long-lived token path
3. CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR  ← CCR (remote) path
4. CCR_OAUTH_TOKEN_FILE                     ← CCR fallback
5. apiKeyHelper                             ← managed key from /login
6. claude.ai OAuth (keychain/credentials)   ← interactive login
7. none → error
```

### Auth Resolution for API Keys (Module 2096 — `PH()`)

```
1. ANTHROPIC_API_KEY env var (if approved or in CI)
2. apiKeyHelper (managed via /login)
3. Stored custom API key
4. none
```

When an API key is found, it's sent via `x-api-key` header. When an OAuth token is found, it's sent via `Authorization: Bearer`. Both hit the same `api.anthropic.com/v1/messages` endpoint.

---

## Source Modules (v2.1.81)

| Module | Contains |
|--------|----------|
| `0393.js` | OAuth config (`r8()`), endpoint URLs, scope constants |
| `0394.js` | Prod/staging/local config values, scope assignments (`G38`, `z6T`, `meT`) |
| `2015.js` | Token exchange (`CPq`), refresh (`Kp_`), API key creation (`EPq`), auth URL builder (`tfT`) |
| `2032.js` | OAuth token file descriptor reading (`ZYT`), CCR token resolution |
| `2096.js` | Auth source resolution (`ML()` for OAuth, `PH()` for API keys), priority chain |
| `2097.js` | Credential object construction (`S8()`), `CLAUDE_CODE_OAUTH_TOKEN` → static credential |
| `3061.js` | Low-level OAuth2 token request (generic, used by MCP OAuth too) |
| `3117.js` | Credential storage, error handling for expired/invalid refresh tokens |
| `3139.js` | `startOAuthFlow()` — PKCE flow orchestrator |
| `4047.js` | `TR9` — GitHub Actions setup (workflow files, secret creation) |
| `4048.js` | `RR9` — OAuth flow UI component for `/install-github-app` |
| `4049.js` | `/install-github-app` command — calls `startOAuthFlow({inferenceOnly: true, expiresIn: 31536000})` |

### Anthropic SDK (Open Source)

The TypeScript SDK ships full source at `@anthropic-ai/sdk` ([github.com/anthropics/anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript), MIT license, v0.80.0).

Auth implementation in `src/client.ts`:

```typescript
// Constructor reads both env vars
constructor({
  apiKey = readEnv('ANTHROPIC_API_KEY') ?? null,
  authToken = readEnv('ANTHROPIC_AUTH_TOKEN') ?? null,
  ...
})

// Both can be set simultaneously — both headers are sent
async authHeaders(opts) {
  return buildHeaders([await this.apiKeyAuth(opts), await this.bearerAuth(opts)]);
}

async apiKeyAuth(opts) {
  if (this.apiKey == null) return undefined;
  return buildHeaders([{ 'X-Api-Key': this.apiKey }]);
}

async bearerAuth(opts) {
  if (this.authToken == null) return undefined;
  return buildHeaders([{ Authorization: `Bearer ${this.authToken}` }]);
}

// Validation requires at least one auth method
validateHeaders({ values, nulls }) {
  if (values.get('x-api-key') || values.get('authorization')) return;
  // ... throws if neither is set
}
```

The SDK **does not** handle OAuth flows, token refresh, or billing headers — those are Claude Code CLI concerns. The SDK is a thin HTTP client that sends whatever auth you give it.

### Claude Code Action (Open Source)

The GitHub Action ([github.com/anthropics/claude-code-action](https://github.com/anthropics/claude-code-action), MIT) handles auth via environment variables:

```yaml
# action.yml — both are optional, one is required
inputs:
  anthropic_api_key:     # → ANTHROPIC_API_KEY env var
  claude_code_oauth_token: # → CLAUDE_CODE_OAUTH_TOKEN env var
```

The action itself doesn't do any auth — it passes the env vars through to the Claude Code CLI, which resolves them via the priority chain in module 2096.

### Key Constants
```javascript
// Scopes
CONSOLE_OAUTH_SCOPES (G38) = ["org:create_api_key", "user:profile"]
CLAUDE_AI_OAUTH_SCOPES (z6T) = ["user:profile", "user:inference", "user:sessions:claude_code", "user:mcp_servers", "user:file_upload"]
ALL_OAUTH_SCOPES (meT) = union of G38 + z6T

// Prod config (k38)
TOKEN_URL = "https://platform.claude.com/v1/oauth/token"  // console/org
API_KEY_URL = "https://api.anthropic.com/api/oauth/claude_cli/create_api_key"
CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

// Claude.ai personal accounts use claude.ai/v1/oauth/token (not platform.claude.com)
```

---

## API Key vs OAuth Token — Wire-Level Differences

The Anthropic API accepts two authentication methods. They hit the **same API endpoints** (`api.anthropic.com/v1/messages`) but authenticate differently at the HTTP header level.

### API Key Auth (`sk-ant-api03-...`)
```http
POST /v1/messages HTTP/1.1
Host: api.anthropic.com
x-api-key: sk-ant-api03-...
anthropic-version: 2023-06-01
Content-Type: application/json
```
- Obtained from console.anthropic.com (requires a paid API account with credits)
- Billed per-token from your API credit balance
- No expiry (until revoked)
- No special beta headers required

### OAuth Token Auth (`sk-ant-oat01-...`)
```http
POST /v1/messages HTTP/1.1
Host: api.anthropic.com
Authorization: Bearer sk-ant-oat01-...
anthropic-beta: oauth-2025-04-20
anthropic-version: 2023-06-01
x-app: cli
user-agent: claude-cli/2.1.81 (external, cli)
x-anthropic-billing-header: cc_version=2.1.81.<model>; cc_entrypoint=cli; cch=00000;
Content-Type: application/json
```
- Obtained via OAuth flow (uses your Claude Max/Pro subscription)
- Billed against your subscription usage limits (not API credits)
- `x-api-key` header is **explicitly removed** when using OAuth
- Requires `anthropic-beta: oauth-2025-04-20` header
- Requires `x-app: cli` and Claude CLI user-agent for billing routing
- Requires `x-anthropic-billing-header` for entitlement tracking

### Token Format Prefixes
| Prefix | Type | Example |
|--------|------|---------|
| `sk-ant-api03-` | API key (console) | Never expires, API credit billing |
| `sk-ant-oat01-` | OAuth access token | Expires (10h default, up to 1yr), subscription billing |
| `sk-ant-ort01-` | OAuth refresh token | Single-use, rotates on each refresh |

### Anthropic SDK Behavior

The official `@anthropic-ai/sdk` handles both automatically:

```javascript
// API key → sends x-api-key header
new Anthropic({ apiKey: "sk-ant-api03-..." })

// OAuth token → sends Authorization: Bearer header
new Anthropic({ authToken: "sk-ant-oat01-..." })
```

Environment variables:
- `ANTHROPIC_API_KEY` → sets `apiKey` → sends `x-api-key`
- `ANTHROPIC_AUTH_TOKEN` → sets `authToken` → sends `Authorization: Bearer`

Pi uses `ANTHROPIC_OAUTH_TOKEN` (mapped to `ANTHROPIC_AUTH_TOKEN` internally), which takes precedence over `ANTHROPIC_API_KEY`.

### What `user:inference` Scope Allows

The scope controls what the OAuth token can do server-side. The actual API call format is identical — the scope is checked by Anthropic's backend, not by header differences.

| Capability | `user:inference` | Full scopes |
|-----------|:---:|:---:|
| `/v1/messages` (completions) | ✓ | ✓ |
| `/v1/messages` with tools | ✓ | ✓ |
| `/v1/messages` streaming | ✓ | ✓ |
| Session management (CCR) | ✗ | ✓ |
| MCP server proxy access | ✗ | ✓ |
| File uploads | ✗ | ✓ |
| Profile read | ✗ | ✓ |
| Custom `expires_in` (1yr) | ✓ | ✗ |

For headless agent use (which only needs completions), `user:inference` is sufficient.

---

## Server-Side Validation (Empirically Tested)

The Anthropic API server performs **three layers of validation** for OAuth tokens. These were determined by systematic header/body stripping against the production API.

### Layer 1: OAuth Beta Gate (all models)

```
anthropic-beta: oauth-2025-04-20
```

**Required for ALL OAuth requests.** Without it, the server returns:
```json
{"error": {"type": "authentication_error", "message": "OAuth authentication is currently not supported."}}
```

### Layer 2: Entitlement Verification (Sonnet, Opus — not Haiku)

For non-Haiku models, the server inspects the **system prompt** for an entitlement marker. Without it, the server returns a generic `{"error": {"type": "invalid_request_error", "message": "Error"}}`.

**Two paths to satisfy this check:**

#### Path A: Billing Header in System Prompt

The billing header must be in a **key=value; format** with at least `cc_version` and `cc_entrypoint` keys:

```json
{"type": "text", "text": "x-anthropic-billing-header: cc_version=<any>; cc_entrypoint=<any>;"}
```

**What the server validates:**
- Must have both `cc_version` and `cc_entrypoint` keys — either alone is rejected
- Must be valid `key=value;` format — malformed payloads trigger: `"x-anthropic-billing-header is a reserved keyword and may not be used in the system prompt."`

**What the server does NOT validate:**
- `cc_version` value — `99.0.0`, empty string, anything works. No version checking.
- `cc_entrypoint` value — `alien-spaceship`, `pi-agent`, anything works.
- `cch` value — any string, or omit entirely.
- `cc_workload` — accepts arbitrary values, or omit.
- Model consistency — billing says `haiku` but request is `sonnet`: works.
- Extra fields — `custom_field=hello;` accepted.
- Correlation with HTTP headers — billing says `entrypoint=pi`, User-Agent says `claude-cli`: works.

#### Path B: Identity Prefix in System Prompt

One of three exact strings:

| Identity | String |
|----------|--------|
| CLI | `You are Claude Code, Anthropic's official CLI for Claude.` |
| SDK | `You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.` |
| Agent | `You are a Claude agent, built on Anthropic's Claude Agent SDK.` |

**NOT sufficient:** `"You are Claude Code."` (partial — rejected)

#### Position Rules (Critical)

The entitlement marker must be in the **first system block**:

| Format | Placement | Works? |
|--------|-----------|--------|
| `system: [{ text: "<marker>" }, { text: "custom" }]` | First block | ✓ |
| `system: [{ text: "custom" }, { text: "<marker>" }]` | Second block | ✗ |
| `system: "<marker>"` | Exact string match | ✓ |
| `system: "<marker>\ncustom text"` | String with extra content | ✗ |
| `system: "custom\n<marker>"` | Marker not at start | ✗ |

The billing header (Path A) is more lenient — it can appear as a substring within a larger text block. Identity strings (Path B) must be the **complete and sole text** of the first system block or the entire string.

### Layer 3: Standard Auth

The `Authorization: Bearer <token>` header must contain a valid, non-expired OAuth access token.

### Fingerprinting Analysis

**Server-enforced (blocking):**
- `anthropic-beta: oauth-2025-04-20` — must be present as HTTP header
- System prompt first block — must contain valid billing header or exact identity string

**Not server-enforced (non-blocking, but likely logged):**

| Signal | Real CLI Value | Spoofable? | Detection Risk |
|--------|---------------|-----------|----------------|
| `cc_version` | `2.1.81` (real version) | ✓ any value accepted | Low — but fake versions correlatable |
| `cc_entrypoint` | `cli`, `claude-code-github-action`, `sdk-ts` | ✓ any value accepted | **Medium** — unknown values are obvious |
| `User-Agent` | `claude-cli/2.1.81 (external, cli)` | ✓ not checked | Low — but absence is a signal |
| `x-app` | `cli` | ✓ not checked | Low |
| `x-anthropic-billing-header` (HTTP) | Present with same values as system prompt | ✓ not checked | Low — but absence is a signal |
| Tool schemas | Claude Code's specific tool names | Partial — tool names visible in request | **High** — different tools = obvious |
| System prompt structure | billing first, identity second, then content | ✓ order is flexible | Low |
| `cch` field | `00000` (hardcoded in CLI) | ✓ any value | Low |

**Recommended approach for third-party tools:**
```
x-anthropic-billing-header: cc_version=2.1.81; cc_entrypoint=<your_app_name>;
```
Use a **real CLI version** (reduces version-mismatch signals) and an **honest entrypoint name** (transparent, reduces ToS risk from impersonation). The server accepts arbitrary entrypoint values — there is no allowlist.

### Minimum Required Headers/Body by Model

| | Haiku | Sonnet/Opus |
|---|---|---|
| `Authorization: Bearer` | ✓ | ✓ |
| `anthropic-beta: oauth-2025-04-20` | ✓ | ✓ |
| `anthropic-version: 2023-06-01` | ✓ | ✓ |
| System prompt with billing/identity | ✗ | **✓** (first block) |
| `x-app: cli` (HTTP header) | ✗ | ✗ |
| `User-Agent: claude-cli/...` | ✗ | ✗ |
| `x-anthropic-billing-header` (HTTP) | ✗ | ✗ |
| `claude-code-20250219` beta | ✗ | ✗ |

### Why the opencode-claude-auth Plugin Spoofs Headers

The plugin adds the identity prefix, billing header, and Claude CLI user-agent because:
1. **System prompt identity** — required for Sonnet/Opus to pass Layer 2 (must be first block)
2. **Billing header in system prompt** — alternative to identity; also used for analytics/billing routing
3. **User-Agent/x-app** — not server-validated but may affect rate limiting tiers or analytics bucketing
4. **Tool name prefixing** (`mcp_` prefix) — OpenCode tool names differ from Claude Code; unclear if server validates tool schemas

### GitHub Actions Implications

The `claude-code-action` GH Action runs the actual Claude Code CLI binary, which naturally includes all required headers, billing markers, and system prompt identity. The `CLAUDE_CODE_OAUTH_TOKEN` env var is consumed by the CLI exactly like a normal OAuth session — the CLI handles all server-side validation requirements automatically.

For **third-party tools** (Pi, OpenCode, custom scripts) using OAuth tokens directly, you **must** include one of the identity/billing markers in the system prompt for Sonnet/Opus models. The billing header approach is recommended as it allows custom entrypoint identification without impersonating Claude Code.

---

## Security Notes

- The long-lived token has **`user:inference` scope only** — it cannot create sessions, access MCP servers, or upload files.
- Token format `sk-ant-oat01-` is distinguishable from API keys (`sk-ant-api03-`) and refresh tokens (`sk-ant-ort01-`).
- There is no revocation endpoint documented. Changing your password or deauthorizing via claude.ai settings may invalidate tokens.
- The `expires_in` parameter in the auth code exchange is a **client hint** — the server enforces scope-based limits.
- OAuth tokens using `user:inference` scope bill against your **subscription** (Max/Pro), not API credits. This means subscription rate limits apply.

---

## Appendix — v2.1.114 Auth Mapping (Deep-Read Verified)

**Date**: 2026-04-20  
**Modules read in full**: `0526.js`, `0527.js`, `1955.js`, `1956.js`, `1209.js`, `1210.js`, `3402.js`, `0944.js`, `0124.js`, `4976.js`, `4835.js`, `4539.js`, `2115.js`, `2114.js`

This appendix supersedes older/manual examples elsewhere in this file where they differ from the v2.1.114 source, especially token-endpoint and refresh-request-body details.

### OAuth/API-Key Resolution Priority

#### Auth source resolution for OAuth-capable requests

`1955.js` `tV()` resolves the source; `1956.js` `e8()` materializes the credential; `1210.js` `DR_()` handles the CCR file-descriptor/well-known-file path.

Important caveat: `tV()` is broader than `e8()`. It can report `apiKeyHelper` as the active auth source even though `1956.js` `e8()` does not materialize `apiKeyHelper` into an OAuth credential object.

1. `ANTHROPIC_AUTH_TOKEN`, but only when `!lv_()` (`1955.js` `lv_()` treats `CLAUDE_CODE_REMOTE` and `CLAUDE_CODE_ENTRYPOINT === "claude-desktop"` as disqualifiers)
2. `CLAUDE_CODE_OAUTH_TOKEN`
3. `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` via `1210.js` `DR_()`
4. CCR well-known OAuth-token file via `1210.js` `DR_()` fallback
5. `apiKeyHelper`, again only when `!lv_()`
6. persisted `claudeAiOauth` from `H1().read()` / `H1().readAsync()`, but only if `1955.js` `Fb(scopes)` still passes (`user:inference` present)
7. none

`1955.js` `mD()` is the higher-level gate. It disables this first-party Anthropic auth path when Bedrock/Vertex/Foundry/Anthropic-AWS/Mantle is selected, or when competing env/helper/file-descriptor auth is active outside remote/desktop mode. Special case: when `ANTHROPIC_UNIX_SOCKET` is set, `mD()` reduces to `!!process.env.CLAUDE_CODE_OAUTH_TOKEN`.

#### API key path

`1955.js` `n$()` is branchy rather than a single unconditional chain. In the normal path, the verified order is:

1. `ANTHROPIC_API_KEY`, when it is not suppressed by `OR()` and either:
   - `0124.js` `UBH()` is true (non-interactive, non-VSCode sessions), or
   - the key hash is already approved in `w_().customApiKeyResponses.approved`
2. CCR API key via `1210.js` `a06()` (`CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR` or its well-known-file fallback)
3. `apiKeyHelper`
4. stored `/login managed key` via `1956.js` `OkH()`:
   - helper stdout / macOS Keychain lookup (`security find-generic-password`)
   - fallback `w_().primaryApiKey`
5. none

Console OAuth does not persist as long-lived OAuth state. `3402.js` `ZDH()` calls `1209.js` `n06()` to mint/store an API key when `1955.js` `Fb(scopes)` is false.

### Credential Sources and Storage

- `1956.js` `e8()` turns `CLAUDE_CODE_OAUTH_TOKEN` into a static credential with `refreshToken: null`, `expiresAt: null`, `scopes: ["user:inference"]`, and no subscription/rate-limit metadata.
- `1956.js` `e8()` gives the same static shape to `1210.js` `DR_()` results. These are inference-only, non-refreshing credentials.
- `1955.js` `TkH()` only persists OAuth tokens when both conditions hold:
  1. `1955.js` `Fb(scopes)` is true (`user:inference` present)
  2. both `refreshToken` and `expiresAt` exist
- The persisted payload is `claudeAiOauth = { accessToken, refreshToken, expiresAt, scopes, subscriptionType, rateLimitTier }` (`1955.js` `TkH()`).
- `1955.js` `pC4()` checks `mtimeMs` for `path.join(s6(), ".credentials.json")` when refresh logic runs and clears the in-memory OAuth cache if it changed. `1955.js` `arH()` reads the same file asynchronously via `H1().readAsync()`.
- `1210.js` `fwq()` reads FD-backed tokens from `/dev/fd/<n>`. In remote mode, a successful FD read is also persisted to a well-known file under `/home/claude/.claude/remote` for subprocess reuse (`1210.js` `o06()`).
- Account/profile metadata is not only stored in the token blob. `3402.js` `ZDH()` and `1209.js` `wR_()` populate `oauthAccount` via `eGH()` / `U_()` with account UUID, org UUID, email, display name, billing type, and subscription timestamps. `rateLimitTier` remains on the OAuth credential/blob rather than app-state `oauthAccount`.

### Token Exchange and Refresh Flow

1. `1209.js` `zR_()` chooses the auth URL:
   - console: `t8().CONSOLE_AUTHORIZE_URL`
   - Claude AI: `t8().CLAUDE_AI_AUTHORIZE_URL`
   It switches scopes between `[wb]` (`user:inference`) for inference-only flows and `CY6` for full flows, and chooses localhost vs manual redirect.
2. `1209.js` `Q06()` exchanges the auth code with a JSON `POST` to `t8().TOKEN_URL`. `expires_in` is only sent when the caller supplied it.
3. `3402.js` `ZDH()` installs the result:
   - resets prior auth state (`hq_()`)
   - stores account info via `eGH()`
   - persists refreshable Claude AI tokens via `TkH()`
   - always tries `l06()` role fetch
   - if this is Claude AI auth (`Fb(scopes)`), it stays on OAuth
   - otherwise it creates/stores an API key via `n06()`
4. `1955.js` `fO()` / `xE6()` perform proactive refresh:
   - `pC4()` invalidates stale cache on `.credentials.json` `mtimeMs` changes
   - `1209.js` `Ad()` treats tokens as expired 5 minutes early
   - only refreshable Claude AI tokens continue (`refreshToken` present and `Fb(scopes)` true)
   - takes a directory lock with `yY(s6())`
   - retries `ELOCKED` up to 5 times with 1-2s jitter
   - re-reads tokens under the lock (`arH()`)
   - calls `1209.js` `MlH()`
   - persists via `TkH()`
5. `1209.js` `MlH()` also uses a JSON `POST` to `t8().TOKEN_URL`, not form-encoded data. It requests a scope string, optionally requests `expires_in`, computes `expiresAt`, and backfills profile/billing metadata via `wR_()` when cached account info is incomplete.

### 401 Recovery Flow

`1955.js` `Ap()` deduplicates recovery per failed access token with `Map bE6`; the real logic is `1955.js` `BC4()`:

1. clear caches (`KkH()`)
2. re-read credentials from disk (`arH()`)
3. if there is no refresh token:
   - ask `0124.js` `CXH()` for an SDK callback
   - if present, invoke it
   - if it returns a different token, set `process.env.CLAUDE_CODE_OAUTH_TOKEN = <new token>`, clear cache, emit `tengu_oauth_401_sdk_callback_refreshed`, return `true`
   - if it returns `null` or the same token, recovery fails
4. otherwise, if disk already contains a different access token than the failed one, assume another process refreshed it and return `true` (`tengu_oauth_401_recovered_from_keychain`)
5. otherwise force refresh via `fO(0, true)`

### SDK OAuth Refresh Callback Path

This is new in v2.1.114 and is split across four modules:

- `0124.js` `s76()` / `CXH()` store and retrieve a process-global callback in app state.
- `4976.js` `xs5()` registers that callback only when both conditions hold:
  - `EH(process.env.CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH)` is truthy
  - `mE6.has(process.env.CLAUDE_CODE_ENTRYPOINT ?? "")`, where `mE6` is defined in `1956.js` as `{ "claude-desktop", "local-agent", "claude-vscode" }`
- The registered callback is `() => z.requestOAuthTokenRefresh()` where `z` is the SDK structured-IO transport.
- `4835.js` `requestOAuthTokenRefresh()` sends `{ subtype: "oauth_token_refresh" }` to the SDK host, applies a 30s timeout via `AbortSignal.timeout(eQ5)`, and returns `.accessToken`.
- `1955.js` `BC4()` only consumes this callback when the local credential has no refresh token (static env/FD/host-supplied token cases).

Adjacent path: `4539.js` exposes `getOAuthToken: async () => e8()?.accessToken ?? ""` to the Claude-in-Chrome bridge. That is token retrieval, not the 401 refresh callback.

### Refresh-Token-Only Login Path

`3402.js` `nF1()` now short-circuits browser login when `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` is set.

Required env:
- `CLAUDE_CODE_OAUTH_REFRESH_TOKEN`
- `CLAUDE_CODE_OAUTH_SCOPES` (space-separated; the command exits immediately if missing)

Flow:
1. split scopes from `CLAUDE_CODE_OAUTH_SCOPES`
2. log `tengu_login_from_refresh_token`
3. call `1209.js` `MlH(refreshToken, { scopes, expiresIn: sTH })`
4. install with `ZDH()`
5. validate org policy with `1955.js` `ja()`
6. mark onboarding complete and log `tengu_oauth_success`

Important nuance: the code *requests* `expiresIn: 31536000` (`0526.js` `LONG_LIVED_OAUTH_TOKEN_TTL_SECONDS`), but the server still decides whether that TTL is accepted for the requested scope set.

### Proxy Auth Helper Path

This is auth-adjacent, not Anthropic OAuth. `0944.js` `H2_()` exists to produce `Proxy-Authorization` material for outbound HTTP clients.

Verified behavior:
- gated by `CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER === "1"` (`0944.js` `i$H()`)
- helper command comes from the separate proxy-auth-helper config object stored in `JGH.helper` via `0944.js` `WX6()`
- project/local helpers are blocked until workspace trust is accepted (`0944.js` `Q8q()` + `JGH.trustAccepted()`)
- cache TTL is `CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS` or 300000 ms by default (`0944.js` `L84()`)
- helper env includes `CLAUDE_CODE_PROXY_URL`, `CLAUDE_CODE_PROXY_HOST`, and optional `CLAUDE_CODE_PROXY_AUTHENTICATE`
- failures return the last cached value when available; success updates `U8H`
- `0944.js` `d8H()` threads the resulting header into Bun fetch options, while `XX6()` / `EQH()` / `PGH()` wire it into Bun, Axios, undici, and AWS SDK clients

### Billing Header / Identity Changes Relevant to Auth

- `2115.js` `wN_()` now owns billing-header construction:
  - `cc_version=2.1.114.<suffix>`
  - `cc_entrypoint=${process.env.CLAUDE_CODE_ENTRYPOINT ?? "unknown"}`
  - `cch=00000` unless the provider is Bedrock / Anthropic AWS / Mantle
  - optional `cc_workload=<workload>` from `1956.js` `sv_()` / `tv_()` AsyncLocalStorage
- `2115.js` `zN_()` centralizes the three identity strings used in system prompts and selects between them:
  - CLI: `qI6` (default, and also for Vertex)
  - SDK: `joq` when `isNonInteractive && hasAppendSystemPrompt`
  - Agent: `Doq` for other non-interactive SDK/agent sessions
- `1956.js` `CT()` now identifies itself as `claude-code/2.1.114`.
- `0527.js` `Ob8` changes the Claude AI authorize URL to `https://claude.com/cai/oauth/authorize`, but `CLAUDE_AI_ORIGIN` remains `https://claude.ai`.

### Concrete Changes vs the v2.1.81 Note

1. `0527.js` moves Claude AI authorization from `claude.ai/oauth/authorize` to `claude.com/cai/oauth/authorize`; token exchange/refresh stay on `https://platform.claude.com/v1/oauth/token`.
2. `3402.js` adds a first-party refresh-token bootstrap path via `CLAUDE_CODE_OAUTH_REFRESH_TOKEN`.
3. `0124.js` + `4976.js` + `4835.js` + `1955.js` add the SDK-host refresh callback path for static OAuth tokens.
4. `0944.js` adds a dedicated proxy-auth-helper subsystem with trust gating and TTL caching.
5. `1955.js` `BC4()` is materially richer than the older refresh-or-fail model: no-refresh-token cases try the SDK callback, while refreshable cases try disk token replacement before forced refresh.
6. `2115.js` splits billing-header/identity construction into its own module and adds `cc_workload`.
7. The v2.1.114 CLI source uses JSON bodies for both `Q06()` and `MlH()`. The older appendix's form-urlencoded refresh example is not what this client emits.
8. Console OAuth is still just a bootstrap to a stored API key; the refreshable long-lived state lives only on the Claude AI path.
9. `0526.js` `getOauthConfig()` / `t8()` adds an allowlisted `CLAUDE_CODE_CUSTOM_OAUTH_URL` path plus `CLAUDE_CODE_OAUTH_CLIENT_ID` override support.

### Remaining Gaps From This Pass

- I verified storage/watcher behavior directly from `1955.js`, `1956.js`, and `1210.js`, but I did not remap the helper symbols behind `H1()`, `s6()`, or `yY()` to their exact module numbers in v2.1.114.
- `1955.js` `n$()` still contains one decompiled branch rendered as `if (EH(false))`; I did not recover the original guard symbol, so the normal-path API-key chain above is the verified part.
