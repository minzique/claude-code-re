# Claude Code 2.1.226 — extraction re-run + `pi-claude-oauth-adapter` sync analysis

Date: 2026-08-08 · Analyst: pi session (claude-code-re)
Binary: `2.1.226`, build `2026-08-08T00:42:40Z`, sha `e140b328…`, darwin-arm64 266.7 MB
Previous extraction: `2.1.126` (2026-05-04) — 100 releases / ~3 months of drift.

## 1. Pipeline run

```
bun run monitor/run-pipeline.ts --version 2.1.226 --no-analysis
bun run monitor/diff-signatures.ts signatures/v2.1.126.json signatures/v2.1.226.json --markdown
bun run monitor/prepare-adapter-pr.ts --version 2.1.226 --prev 2.1.126
```

Artifacts:
- `signatures/v2.1.226.json`
- `signatures/diff-2.1.225-to-2.1.226.md` (canonical pipeline diff after the semver fix)
- `signatures/diff-2.1.126-to-2.1.226.md` (explicit three-month adapter-drift window)
- `archive/v2.1.226/*` (5112 app modules; canonical diff is 2.1.225 → 2.1.226)
- `pocs/bun-demincer/work/v2.1.226/decoded/`
- monitor state updated: `latest=2.1.226`, `stable=2.1.220` (was `2.1.114` / `2.1.98`)

Counts 2.1.126 → 2.1.226: modules 3.0k → 5112 · beta flags 33 → 43 · feature flags 1072 → 1785 ·
env vars 317 → 265 (naming churn, not shrinkage) · API endpoints 29 → 63 · model ids 21 → 22 ·
oauth scopes 6 → 13 · header keys 26 → 45.

Classifier verdict: `needs-review` (bump `DEFAULT_CLAUDE_CODE_VERSION`, shape-change on
`rateLimit.headerKeys` and `oauth.scopes`). The manual pass below is much richer.

### Monitor bugs found while running

1. **`findPreviousSignature()` sorts signature files lexicographically**
   (`monitor/run-pipeline.ts`), so `v2.1.98.json` beats `v2.1.126.json` and the auto-diff
   compared 2.1.226 against **2.1.98**. Same root cause as the recorded warning in
   `monitor/state/adapter-pr-2.1.126.json`. Needs a semver-aware sort.
2. **`userAgentPatterns` and `billingHeaderFormat` extractors return 0 hits** — the two
   categories the adapter actually depends on are blind. Both are trivially greppable
   (`claude-cli/${…}`, `x-anthropic-billing-header: cc_version=`).
3. **`prepare-adapter-pr.ts` evidence paths are hardcoded module IDs** (`2129.js`, `2490.js`,
   `4682.js`…). Chunk IDs shifted; classifier warns "evidence files not found". Should grep by
   literal instead of by chunk id.

## 2. Ground truth for the adapter (from decoded 2.1.226)

| Concern | Module | Reality in 2.1.226 |
|---|---|---|
| Version constant | `2295.js`, `1478.js` | `VERSION: "2.1.226"` |
| Billing hash | `2295.js` (`DOs`) | **unchanged**: `sha256(salt + chars[4,7,20] + version).slice(0,3)`, salt `59cf53e54c78` |
| Billing header text | `1478.js` (`eyo`) | `x-anthropic-billing-header: cc_version=${ver}.${hash}; cc_entrypoint=${ep};${cch}${workload}${subagent}${prev_req}` |
| Identity block | `2212.js` (`iko`) | unchanged interactive string; SDK variants exist |
| User-agent | `1460.js` (`Hwe`) | `claude-cli/2.1.226 (external, cli)` + optional `, agent-sdk/x`, `, client-app/x`, `, workload/x` |
| Client headers | `4914.js` | `x-app: cli` \| `cli-bg`, `User-Agent`, `X-Claude-Code-Session-Id`, optional `x-claude-code-agent-id` / `-parent-agent-id`, `x-client-request-id` |
| Rate-limit parse | `2275.js` (`y7u`) | see §3 |
| Warning config | `2276.js` (`uey`,`dey`) | thresholds **unchanged**; claim map gains `7d_oi` |
| Limit labels/messages | `2274.js`, `2275.js` (`kUt`) | changed, see §3 |
| Quota probe | `2275.js` (`fey`) | `POST /v1/messages`, small-fast model, `max_tokens:1`, `"quota"`, betas from `G_e(model)` |
| Usage API | `2273.js` (`YHe`) | `GET /api/oauth/usage` (5 s timeout, `refreshOAuth: true`) |

### Billing header details
- `cch=00000;` is emitted only when `provider === firstParty && baseUrl is api.anthropic.com`
  (or `vertex`). The adapter emits it unconditionally.
- New optional fields: ` cc_is_subagent=true;` (non-main sessions) and
  ` cc_prev_req=<clientRequestId>;` (first-party only).
- Whole header suppressed by `CLAUDE_CODE_ATTRIBUTION_HEADER` env gate.
- `cc_entrypoint` defaults to `unknown` in CC (`CLAUDE_CODE_ENTRYPOINT ?? "unknown"`);
  adapter uses `pi`, which is deliberate and fine.

## 3. Rate-limit surface drift (biggest gap)

New headers since 2.1.126 (all absent from the adapter's parser):

```
anthropic-ratelimit-unified-overage-in-use
anthropic-ratelimit-unified-overage-utilization
anthropic-ratelimit-unified-overage-surpassed-threshold
anthropic-ratelimit-unified-overage-period
anthropic-ratelimit-unified-overage-period-monthly-utilization
anthropic-ratelimit-unified-overage-period-channel-utilization
anthropic-ratelimit-unified-grace-status
anthropic-ratelimit-unified-grace-5h-utilization
anthropic-ratelimit-unified-grace-7d-utilization
anthropic-usage-limit            (request header: "extended")
```

- New claim type `seven_day_overage_included` (`7d_oi`) — surpassed-threshold map is now
  `{5h→five_hour, 7d→seven_day, 7d_oi→seven_day_overage_included, overage→overage}`.
- New state fields: `overageInUse`, `overagePeriodMonthly`, `overagePeriodChannel`,
  `surpassedThreshold`, `rateLimitGraceActive`.
- **Grace window** (`w7u`): if `grace-status` present and `max(grace-5h, grace-7d) > 0`,
  CC latches a grace mode and injects the system notice
  `[Usage limit reached — grace window active. Wrap up: finish or checkpoint; don't start
  subagents or long work.]`. Requests that opt in send `anthropic-usage-limit: extended`
  (gated on `tengu_lantern_spool` + a cached extra-usage-disabled reason).
- Labels (`kUt`): `overage` is now **"usage credit limit"** (adapter says "extra usage");
  added `seven_day_overage_included → "Fable 5 limit"`. `seven_day_sonnet` still collapses to
  "weekly limit" for pro/enterprise (adapter already matches).
- Rejected-message text: `out_of_credits` → **"You're out of usage credits"** (adapter says
  "You're out of extra usage"). New disabled reasons handled: `org_level_disabled_until`,
  `org_spend_cap_reached`, `seat_tier_level_disabled`, `seat_tier_zero_credit_limit`,
  `org_service_level_disabled`, `member_level_disabled`, `member_zero_credit_limit`,
  `group_zero_credit_limit`, plus the `credits_required` error-body path (`mPs`).
- Warning messages can now carry a trailing lever hint: `· /upgrade to keep using Claude Code`
  (five_hour on pro/max) or `· Run /usage-credits …` (team/enterprise).
- Warning thresholds and the 5h/7d windows are **unchanged** — adapter's table is still correct.

## 4. Other adapter-relevant changes

- **Betas** (`1464.js`, `4918.js`): `claude-code-20250219` is **not** sent for haiku models
  (`if (!modelIncludesHaiku) push(claude_code)`). The adapter's quota probe uses
  `claude-haiku-4-5` *with* `claude-code-20250219` → fingerprint mismatch vs real CC.
  New betas in the auto-set: `prompt-caching-scope-2026-01-05`,
  `mid-conversation-system-2026-04-07` (opus-5 / sonnet-5 class), `per-turn-control-2026-07-01`,
  `extended-cache-ttl-2025-04-11`, `thinking-token-count-2026-05-13`,
  `server-side-fallback-2026-06-01/07-01`, `fallback-credit-2026-06-01`,
  `auto-mode-classifier-2026-07-16`. OAuth beta string unchanged (`oauth-2025-04-20`).
- **Models**: added `claude-opus-4-8`, `claude-opus-5`, `claude-sonnet-5`; removed
  `claude-haiku-3-5`, `claude-sonnet-3-7`. `claude-haiku-4-5` (adapter quota model) still valid.
- **OAuth scopes** now: `user:inference`, `user:profile`, `user:file_upload`, `user:mcp_servers`,
  `user:sessions:claude_code`, `org:create_api_key` + new `user:ccr_inference`, `user:plugins`,
  `user:projects:read/write`, `user:design:read/write`, `user:office`. Inference path unchanged.
- **`GET /api/oauth/usage`** returns a full utilization document
  (`five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `seven_day_oauth_apps`,
  `cinder_cove`, `extra_usage{is_enabled,monthly_limit,used_credits,utilization,currency,disabled_reason}`,
  `limits[]` with `kind/group/percent/resets_at/scope`). Cheaper and richer than the adapter's
  synthetic `max_tokens:1` message probe, and it does not burn a request against the quota.
- Internal codenames added: `Cowork`, `Teleport` (plus existing grove/ion/coral).

## 5. Proposed adapter changes (`dotfiles-agents/packages/pi-claude-oauth-adapter`, 0.1.4)

P0 — parity, low risk
1. `DEFAULT_CLAUDE_CODE_VERSION` `2.1.126` → `2.1.226`.
2. `user-agent` → `claude-cli/${version} (external, ${entrypoint})` on the quota probe
   (and document that inference-path UA belongs to `@earendil-works/pi-ai`).
3. Drop `anthropic-beta: claude-code-20250219` from the haiku quota probe (keep
   `oauth-2025-04-20`) to match CC's beta assembly.
4. Only emit ` cch=00000;` when the base URL is `api.anthropic.com`.

P1 — rate-limit correctness
5. Add `7d_oi` / `seven_day_overage_included` to the surpassed-threshold claims and the label map
   (`"Fable 5 limit"`).
6. Parse `overage-in-use`, `overage-utilization`, `overage-period-{monthly,channel}-utilization`,
   `overage-surpassed-threshold` into the state object.
7. Update messages: `overage` label → `"usage credit limit"`; `out_of_credits` →
   `"You're out of usage credits"`; handle the new `overageDisabledReason` values.
8. Grace window: parse `grace-status` + `grace-5h/7d-utilization`, expose a
   `rateLimitGraceActive` footer state (and optionally the CC wrap-up system notice).

P2 — nice to have
9. Replace/augment the quota probe with `GET /api/oauth/usage` (no quota burn, richer data);
   keep the message probe as fallback for non-first-party base URLs.
10. Optionally send `X-Claude-Code-Session-Id` and `x-client-request-id` on the probe.
11. Consider `cc_is_subagent=true` when Pi runs a subagent session.

## 6. Follow-ups for the monitor itself

- Semver sort in `findPreviousSignature()`.
- Implement the `userAgentPatterns` + `billingHeaderFormat` extractors (they are the adapter's
  two load-bearing slots and currently always report "unchanged" because they see nothing).
- Make `prepare-adapter-pr.ts` locate evidence by literal grep, not by hardcoded chunk id.
- Re-run cadence: 100 releases of drift is too much; wire the cron/launchd job (`make cron-install`)
  or the planned `--auto --apply` PR path.
