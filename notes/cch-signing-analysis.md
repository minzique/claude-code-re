# CCH Signing System — Complete Analysis

## Timeline
- **Mid-March 2026**: We identified cch= in billing header during bun binary RE (minzique/claude-code-re). Noted cch=00000 in npm builds, suspected fingerprinting, documented in API_REQUEST_MAP.md and research site
- **Late March 2026**: Claude Code source leaked via npm .map file exposure
- **April 1 2026**: ssslomp reverse-engineered the Zig-compiled signing algorithm; paoloanzn (free-code fork) integrated it
- **April 1 2026**: NTT123 published clean algorithm documentation with test vectors (gist: github.com/NTT123/579183bdd7e028880d06c8befae73b99)

## Algorithm (from NTT123's gist)
- **BILLING_SALT** = '59cf53e54c78' (extracted from obfuscated Bun binary Zig code)
- **cch** = SHA-256(first_user_message_text)[:5] (first 5 hex chars)
- **version suffix**: sample chars at indices [4, 7, 20] from message (pad with '0'), then SHA-256(salt + sampled + version)[:3]
- **Full format**: `x-anthropic-billing-header: cc_version=<ver>.<hash>; cc_entrypoint=<entrypoint>; cch=<hash>;`
- **Injected as system[0].text**, NOT as HTTP header, no cache_control

## Why cch=00000 Worked Before
- npm distributed versions compute cch in JavaScript, which sends 00000
- The compiled Bun binary has native Zig code that computes the real hash
- Server-side enforcement was added later — initially the values weren't validated
- Our behavioral tests (oauth-behavioral-tests.md) confirmed arbitrary values were accepted at the time

## Server-Side Enforcement (Current)
- **Wrong/missing cch → rejection**: 'Fast mode is currently available in research preview in Claude Code. It is not yet available via API.'
- This gates access to fast mode (Opus 4.6 at 2.5x speed, $30/$150 per MTok)
- **Gate chain**: cch validation → tengu_penguins_off → native binary check → provider check → org status

## Fast Mode
- **NOT a separate model** — same Opus 4.6, different billing/rate tier
- **Toggle**: /fast command or fastMode: true in settings
- **2.5x faster, 2x cost** ($30/$150 vs $15/$75 per MTok)
- **First-party Anthropic API only** (no Bedrock, Vertex, Foundry)
- **tengu_penguins_off**: nullable string flag, when set returns reason for disabling
- Auto-fallback to standard Opus on quota exhaustion

## Prompt Cache Breakage Bug (Issue #40652)
- CLI does find-and-replace of cch= values across ALL message content per request
- Since hash changes per-request, historical tool results containing cch= get mutated
- This permanently invalidates prompt cache — cache_read drops, never recovers
- Silently wastes ~50K tokens per turn in broken sessions
- **Contagious**: investigating a broken session can infect the investigating session

## References
- NTT123 gist: https://gist.github.com/NTT123/579183bdd7e028880d06c8befae73b99
- paoloanzn/free-code (DMCA'd): https://github.com/paoloanzn/free-code
- Cache breakage: https://github.com/anthropics/claude-code/issues/40652
- Our original research: site/src/pages/research.astro #billing section
- Our behavioral tests: notes/oauth-behavioral-tests.md
- Our API map: binaries/v2.1.80/API_REQUEST_MAP.md section 6
- HitCC docs: external/hitmux/HitCC/docs/
- Local algorithm doc: external/CCH_ALGORITHM_NTT123.md
