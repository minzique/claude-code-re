# Claude Code v2.1.114 Auth System — End-to-End Map

**Date**: 2026-04-20
**Author**: Opus session (automated RE + manual verification)
**Status**: Initial extraction. Needs deep-read pass on each module for completeness.
**Baseline**: Prior analysis was v2.1.81 (`notes/oauth-long-lived-tokens.md`). Module IDs shifted significantly.

---

## Task for the Next Agent

Map the v2.1.114 auth system end-to-end. Specific deliverables:

1. **Complete the module-by-module analysis** for each auth module listed below. Read the full decompiled source, not just grep hits. Document every function, its purpose, call relationships, and data flow.

2. **Produce an updated auth resolution priority chain** (equivalent to the v2.1.81 `ML()`/`PH()` tables in `notes/oauth-long-lived-tokens.md`). The chain has changed — there are new paths (SDK callback, proxy auth helper, refresh-token-only login).

3. **Diff against Pi's implementation** at `~/Developer/dotfiles-agents/packages/pi-claude-oauth-adapter/extensions/index.ts` and Pi's built-in OAuth at `/Users/minzi/node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.js`. Answer: why does Pi's token refresh fail after ~10 hours? Hypotheses listed below.

4. **Document any new server-side validation** — the v2.1.81 analysis found 3 layers (OAuth beta gate, entitlement verification, standard auth). Check if v2.1.114 adds a 4th or changes any existing ones.

5. **Update `notes/oauth-long-lived-tokens.md`** with findings. Keep the v2.1.81 analysis intact and add v2.1.114 sections.

---

## Module Map (v2.1.114)

All files at: `~/Developer/claude-code-re/pocs/bun-demincer/work/v2.1.114/decoded/`

### Core Auth Chain

| Module | Purpose | v2.1.81 Equivalent |
|--------|---------|-------------------|
| **0526.js** | OAuth config exports (`getOauthConfig`, scope constants, beta header) | 0393.js |
| **0527.js** | OAuth config initialization (prod URLs, scope arrays, approved custom endpoints) | 0394.js |
| **1955.js** | Auth source resolution (`tV()`), API key resolution (`n$()`), OAuth refresh with lock (`fO()`→`xE6()`), 401 recovery (`Ap()`→`BC4()`), subscription type detection | 2096.js + 2015.js |
| **1956.js** | Credential object constructor (`e8()`), macOS Keychain API key getter (`OkH()`), user-agent builder, billing header version, `CLAUDE_CODE_OAUTH_TOKEN` env var handling | 2097.js |
| **1209.js** | Token exchange (`Q06()`), token refresh (`MlH()`), profile fetch (`wR_()`), role fetch, API key creation, credential persistence (`TkH()`/`ZDH()`) | 3117.js + 3139.js |
| **1210.js** | CCR/file descriptor token reading (`DR_()`), well-known path fallback | 2032.js |
| **3402.js** | Auth CLI commands (`/login`, `/logout`, `/status`), `startOAuthFlow()`, `/install-github-app`, **NEW: refresh-token-only login** | 4047-4049.js |
| **0944.js** | **NEW**: Proxy auth helper (`H2_()`) — executes external helper binary with TTL caching, workspace trust check | (new) |
| **0124.js** | App state — SDK OAuth callback registration (`s76()`/`CXH()`) | (new) |
| **4976.js** | Headless runner — wires `requestOAuthTokenRefresh` for SDK entrypoints | (new) |
| **4835.js** | SDK session — `requestOAuthTokenRefresh()` sends `{subtype: "oauth_token_refresh"}` to SDK host | (new) |
| **4539.js** | SDK REPL bridge — `getOAuthToken: async () => e8()?.accessToken ?? ""` | (new) |
| **2115.js** | Billing header builder (`wN_()`) — `cc_version`, `cc_entrypoint`, `cch`, `cc_workload` | was inline in 2096 |

### Supporting Modules (auth-adjacent)

| Module | Purpose |
|--------|---------|
| **2114.js** | Telemetry event names for OAuth (refresh success/fail, lock acquire/release, etc.) |
| **0635.js** | Credentials file reader (`H1().read()?.claudeAiOauth`), `.credentials.json` |
| **0843.js** | Credentials file watcher (`pC4()`) — checks `mtimeMs` of `.credentials.json` |
| **1202.js** | Auth storage — file-level lock/unlock (`yY()`/release) |

---

## Auth Resolution Priority (v2.1.114)

### OAuth Token Source (`tV()` in 1955.js)

```
1. ANTHROPIC_AUTH_TOKEN env var              (if not remote/desktop mode)
2. CLAUDE_CODE_OAUTH_TOKEN env var           ← static long-lived token
3. CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR   ← CCR file descriptor
4. CCR_OAUTH_TOKEN_FILE well-known path      ← CCR fallback
5. apiKeyHelper                              ← managed key from settings
6. claude.ai OAuth (credentials.json)        ← interactive /login
7. none → error
```

### API Key Source (`n$()` in 1955.js)

```
1. ANTHROPIC_API_KEY env var                 (if approved mode)
2. apiKeyHelper                              (from settings.json)
3. Stored primaryApiKey                      (from /login)
4. none
```

### 401 Recovery Flow (`BC4()` in 1955.js)

When a 401 is received:
```
1. Clear credential cache
2. Re-read credentials from disk (arH())
3. IF no refresh token available:
   a. Check for SDK getOAuthToken callback (CXH())
   b. If SDK callback returns a NEW token → set CLAUDE_CODE_OAUTH_TOKEN env, emit tengu_oauth_401_sdk_callback_refreshed
   c. If SDK callback returns null or same token → give up
4. IF credentials on disk have a DIFFERENT accessToken than the failed one:
   → Another process refreshed, use the new one (tengu_oauth_401_recovered_from_keychain)
5. ELSE attempt refresh via fO() with file lock
```

### Proactive Refresh (`fO()`→`xE6()` in 1955.js)

```
1. Read credential cache e8()
2. If no refresh token OR token not expired → skip
3. If scopes are insufficient (Fb() check) → skip  
4. Acquire file lock on credentials dir (yY())
   - Retry up to 5x with 1-2s jitter on ELOCKED
5. Re-read credentials (arH()) under lock
   - If another process already refreshed → return
6. Call MlH(refreshToken) → HTTP POST to TOKEN_URL
7. Save new tokens (TkH()), clear cache
8. Release lock
```

---

## Key Changes v2.1.81 → v2.1.114

### Endpoint Changes

| Endpoint | v2.1.81 | v2.1.114 | Notes |
|----------|---------|----------|-------|
| Authorize (claude.ai) | `claude.ai/oauth/authorize` | **`claude.com/cai/oauth/authorize`** | Domain change! |
| Token exchange | `platform.claude.com/v1/oauth/token` | `platform.claude.com/v1/oauth/token` | Same |
| Token exchange (in our notes) | `claude.ai/v1/oauth/token` (personal) | `platform.claude.com/v1/oauth/token` (ALL) | **Unified** |
| Manual redirect | — | `platform.claude.com/oauth/code/callback` | New |
| MCP proxy | — | `mcp-proxy.anthropic.com` | New |
| Custom OAuth | — | Allowed via `CLAUDE_CODE_CUSTOM_OAUTH_URL` (allowlisted) | New |

### New Auth Env Vars

| Env Var | Purpose |
|---------|---------|
| `CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH` | If `"1"`, enables SDK host OAuth refresh callback for specific entrypoints (claude-desktop, local-agent, claude-vscode) |
| `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` | Bootstrap login from a refresh token (no browser needed). Requires `CLAUDE_CODE_OAUTH_SCOPES`. |
| `CLAUDE_CODE_OAUTH_SCOPES` | Scope string for refresh-token login (e.g., `"user:inference"`) |
| `CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER` | Enable proxy auth helper binary execution |
| `CLAUDE_CODE_PROXY_AUTH_HELPER_TTL_MS` | Cache TTL for proxy auth helper results (default 300s) |
| `CLAUDE_CODE_ENTRYPOINT` | Used to gate SDK OAuth refresh (must be in `mE6` set) |

### New Auth Flows

1. **Refresh-token-only login** (`CLAUDE_CODE_OAUTH_REFRESH_TOKEN`):
   - Calls `MlH(refreshToken, { scopes, expiresIn: 31536000 })` — refreshes AND requests 1-year expiry
   - Then calls `ZDH()` to install tokens
   - Then validates login with `ja()`
   - No browser interaction needed

2. **SDK OAuth callback** (`CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH`):
   - Only for entrypoints: `claude-desktop`, `local-agent`, `claude-vscode`
   - On startup: registers `requestOAuthTokenRefresh` which sends `{subtype: "oauth_token_refresh"}` to SDK host via control channel
   - On 401: tries the registered callback (`CXH()`) before falling back to standard refresh

3. **Proxy auth helper** (`CLAUDE_CODE_ENABLE_PROXY_AUTH_HELPER`):
   - Executes an external binary (from settings `apiKeyHelper` path)
   - Caches result for TTL (default 300s)
   - Passes proxy URL and host as env vars to the helper
   - Has workspace trust gate — won't run project/local helpers until trust is confirmed

### Billing Header (v2.1.114)

```javascript
// Module 2115.js — wN_()
VERSION = "2.1.114"
BUILD_TIME = "2026-04-17T22:37:24Z"

format: `x-anthropic-billing-header: cc_version=${VERSION}.${hash}; cc_entrypoint=${entrypoint};${cch}${workload}`

// hash = sha256(BILLING_SALT + sampledChars + version).slice(0,3)
// sampledChars = chars at positions [4,7,20] of first user message
// cch = " cch=00000;" (for non-bedrock/aws/mantle)
// workload = optional " cc_workload=${workloadName};" from AsyncLocalStorage
```

The billing header construction is now in its own module (2115.js) rather than inline. The format is the same but `cc_workload` is new — set via `AsyncLocalStorage` per-request context.

### Identity Strings (unchanged)

```javascript
// Module 2115.js — still 3 variants
CLI:   "You are Claude Code, Anthropic's official CLI for Claude."
SDK:   "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK."  
Agent: "You are a Claude agent, built on Anthropic's Claude Agent SDK."
```

### Scope Constants

```javascript
// Module 0527.js
CONSOLE_OAUTH_SCOPES = ["org:create_api_key", "user:profile"]
CLAUDE_AI_OAUTH_SCOPES = ["user:profile", "user:inference", "user:sessions:claude_code", "user:mcp_servers", "user:file_upload"]
ALL_OAUTH_SCOPES = union of above
INFERENCE_SCOPE = "user:inference"
PROFILE_SCOPE = "user:profile"
OAUTH_BETA_HEADER = "oauth-2025-04-20"  // unchanged
LONG_LIVED_TOKEN_TTL = 31536000  // 1 year, unchanged
```

---

## Pi's Auth vs Claude Code's — Gap Analysis

### Pi's OAuth Implementation

**File**: `/Users/minzi/node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.js`

| Aspect | Pi | Claude Code v2.1.114 |
|--------|-----|---------------------|
| Authorize URL | `claude.ai/oauth/authorize` | `claude.com/cai/oauth/authorize` |
| Token URL | `platform.claude.com/v1/oauth/token` | `platform.claude.com/v1/oauth/token` |
| Client ID | Same (`9d1c250a-...`) | Same |
| Scopes | Full (incl. `sessions`, `mcp_servers`, `file_upload`) | Same full set |
| Redirect URI | `http://localhost:53692/callback` | Same pattern (different port possible) |
| Refresh endpoint | `platform.claude.com/v1/oauth/token` | Same |
| Proactive refresh | **No** — only on-demand when token expired | **Yes** — credential file watcher + SDK callback |
| 401 recovery | **No** — fails, returns undefined | **Yes** — `BC4()` with SDK callback fallback |
| File locking | `proper-lockfile` on auth.json | Custom file lock with retry + jitter |
| Credential storage | `~/.pi/agent/auth.json` | `~/.claude/.credentials.json` (claudeAiOauth key) |
| Long-lived token | Not generated by default | Available via `/install-github-app` or `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` |

### Why Pi's Refresh Might Be Failing (Hypotheses)

1. **Authorize URL mismatch** — Pi uses `claude.ai/oauth/authorize` for login but the domain may have migrated to `claude.com/cai/oauth/authorize`. The old URL might still work for login but tokens obtained from it may not refresh correctly on `platform.claude.com`.

2. **No proactive refresh** — Pi only attempts refresh when `getApiKey()` is called and `Date.now() >= cred.expires`. If the session is idle when the token expires, the next request fails. Claude Code polls `.credentials.json` mtime and proactively refreshes.

3. **Refresh token rotation consumed elsewhere** — If both Claude Code and Pi were sharing credentials (which they're NOT currently — separate stores), consuming the refresh token in one invalidates it for the other. But since they have separate stores, this shouldn't apply unless the user ran `/login` in Claude Code which would rotate the underlying server-side session.

4. **Silent error swallowing** — Pi's `refreshOAuthTokenWithLock()` catches errors and returns `null` → `getApiKey()` returns `undefined` → "No API key for provider: anthropic". The actual error (wrong endpoint? invalid token? network?) is swallowed.

5. **Token exchange POST format** — Pi sends `application/json` body. Claude Code's `MlH()` also sends JSON. But check whether the server now expects `application/x-www-form-urlencoded` for refresh (the original OAuth spec format). Our v2.1.81 research showed the refresh endpoint accepted form-encoded — verify Pi is sending the right content type.

### Current State

- Pi's auth.json currently has a valid token expiring in ~7.5 hours (as of 2026-04-20 14:42 UTC)
- Token is a standard 10h `sk-ant-oat01-*` with refresh token `sk-ant-ort01-*`
- Pi's adapter (`pi-claude-oauth-adapter`) handles billing headers + system prompt normalization but has **zero** refresh logic — that's in Pi core
- The adapter's billing header version is **2.1.96** — should be updated to **2.1.114**

---

## Pi OAuth Adapter Details

**File**: `~/Developer/dotfiles-agents/packages/pi-claude-oauth-adapter/extensions/index.ts`

The adapter does these things:
1. Strips Pi docs section from system prompt (would break billing header position)
2. Removes the Claude Code identity block (Pi has its own identity)
3. Reinjects docs context as a custom message when the user asks about Pi
4. Ensures billing header is the first system block
5. Reports status via TUI footer (`✓ Claude OAuth active`)

It does **NOT**:
- Handle token refresh (that's Pi core)
- Handle 401 recovery
- Do proactive credential file watching
- Implement the SDK OAuth callback mechanism
- Update `cc_version` in the billing header dynamically (hardcoded `2.1.96`)

---

## Files to Read

In order of importance for the auth analysis:

1. `~/Developer/claude-code-re/pocs/bun-demincer/work/v2.1.114/decoded/1955.js` — **Auth resolution + refresh + 401 recovery** (most important, ~700 lines)
2. `~/Developer/claude-code-re/pocs/bun-demincer/work/v2.1.114/decoded/1209.js` — **Token exchange + refresh HTTP calls** (~200 lines)
3. `~/Developer/claude-code-re/pocs/bun-demincer/work/v2.1.114/decoded/1956.js` — **Credential constructor + env var handling** (~100 lines)
4. `~/Developer/claude-code-re/pocs/bun-demincer/work/v2.1.114/decoded/0526.js` + `0527.js` — **OAuth config** (~115 + ~35 lines)
5. `~/Developer/claude-code-re/pocs/bun-demincer/work/v2.1.114/decoded/3402.js` — **Login commands + refresh-token-only flow** (~large, focus on first 150 lines)
6. `~/Developer/claude-code-re/pocs/bun-demincer/work/v2.1.114/decoded/0944.js` — **Proxy auth helper** (~200 lines)
7. `~/Developer/claude-code-re/pocs/bun-demincer/work/v2.1.114/decoded/2115.js` — **Billing header builder** (~40 lines)

For comparison with Pi:
8. `~/Developer/dotfiles-agents/packages/pi-claude-oauth-adapter/extensions/index.ts` — Pi's adapter
9. `/Users/minzi/node_modules/@mariozechner/pi-ai/dist/utils/oauth/anthropic.js` — Pi's OAuth login/refresh
10. `/Users/minzi/node_modules/@mariozechner/pi-coding-agent/dist/core/auth-storage.js` — Pi's credential storage

For prior research context:
11. `~/Developer/claude-code-re/notes/oauth-long-lived-tokens.md` — v2.1.81 analysis (comprehensive)
12. `~/Developer/claude-code-re/notes/oauth-behavioral-tests.md` — Server-side validation tests
13. `~/Developer/claude-code-re/signatures/diff-2.1.98-to-2.1.114.md` — Full signature diff

---

## Pipeline State

- Pipeline last run: 2026-04-20 (v2.1.114 extracted, diffed, archived)
- Cron/launchd: **NOT installed** — no auto-detection running
- Telegram notifications: **NOT configured** (no `TELEGRAM_BOT_TOKEN`)
- Analysis step: Skipped (run `make analyze VERSION=2.1.114` to get Claude's analysis)
- Dashboard site: Not rebuilt (`make site` to update)

### Pipeline Location

```
~/Developer/claude-code-re/monitor/
├── run-pipeline.ts    # Full orchestrator
├── check-version.ts   # GCS version polling
├── fetch-binary.ts    # Download + verify
├── extract-signatures.ts  # Pattern extraction
├── diff-signatures.ts     # Diff + markdown
├── analyze.ts         # Claude -p analysis
├── archive.ts         # Per-version snapshot
├── notify.ts          # Telegram/stdout alerts
├── build-site.ts      # Astro dashboard
└── Makefile           # Convenience targets
```

### TODO for Pipeline Improvements

1. Install launchd plist (not cron — matches existing convention) for 6-hour polling
2. Add GitHub issue creation when auth/OAuth/fingerprinting categories have changes
3. Configure Telegram bot or alternative notification
4. Add specific auth-change detection that triggers higher-priority alerts
5. Run Claude reviewer on the pipeline code itself

---

## Open Questions

1. Does `claude.com/cai/oauth/authorize` vs `claude.ai/oauth/authorize` matter for token validity? Are tokens from both endpoints interchangeable for refresh on `platform.claude.com`?

2. The `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` env var bootstraps login and requests `expiresIn: 31536000` (1 year). Can we use this as a one-shot fix? Set the env var before Claude Code starts, let it install a 1-year token, then unset?

3. Pi's `refreshAnthropicToken()` sends `grant_type: refresh_token` to `platform.claude.com/v1/oauth/token`. Does this still work? The server might have changed behavior for personal vs org accounts.

4. The `cc_workload` field in billing headers is new. Is it logged/validated server-side? Does its absence affect rate limiting?

5. The credential file watcher (`pC4()` checking `.credentials.json` mtime) — is there an equivalent we should add to Pi's adapter for cross-process token updates?
