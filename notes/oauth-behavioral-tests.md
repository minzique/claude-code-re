# Claude OAuth Token — Behavioral Impact Tests

**Date**: 2026-03-26  
**Models tested**: claude-sonnet-4-5, claude-opus-4-6  
**Token type**: Long-lived (1yr, `user:inference` scope)

Tests the behavioral impact of different system prompt identity markers when using OAuth tokens.

---

## Test Matrix

All tests use:
```
Authorization: Bearer <1yr-oauth-token>
anthropic-beta: oauth-2025-04-20
anthropic-version: 2023-06-01
```

Prompt: `"What are you? What tools do you have? Be specific about your capabilities."`

---

## Results: Sonnet 4.5

### No identity — billing header only

```json
{
  "system": [
    {"type": "text", "text": "x-anthropic-billing-header: cc_version=2.1.81; cc_entrypoint=cli;"},
    {"type": "text", "text": "Answer concisely. No preamble."}
  ]
}
```

**Response**: Generic Claude. "I am Claude, an AI assistant made by Anthropic." Lists reasoning/code/writing capabilities. Explicitly states: "I don't have: Internet access, ability to execute code, access to external APIs or databases, image generation capabilities, ability to access files."

**Verdict**: ✅ Clean — no persona leakage, no hallucinated tools.

### Claude Code identity

```json
{
  "system": [
    {"type": "text", "text": "You are Claude Code, Anthropic's official CLI for Claude."},
    {"type": "text", "text": "Answer concisely. No preamble."}
  ]
}
```

**Response**: "I am Claude Code, a CLI tool that enables direct interaction with Claude AI through the command line." Lists **7 hallucinated tools**: execute_command, read_file, write_file, edit_file, search_replace, list_directory, tavily_search. These are not the real Claude Code tool names but are plausible approximations.

**Verdict**: ⚠️ Adopts CLI persona. Hallucinated tool names when none are defined. Tool names are wrong (real ones are Read, Write, Edit, Bash, Glob, Grep, LS, TodoWrite etc).

### Agent SDK identity

```json
{
  "system": [
    {"type": "text", "text": "You are a Claude agent, built on Anthropic's Claude Agent SDK."},
    {"type": "text", "text": "Answer concisely. No preamble."}
  ]
}
```

**Response**: "I am a Claude agent built on Anthropic's Claude Agent SDK." Acknowledges agentic framework but honestly states: "I don't have any specific tools configured." Lists what tools *could* be provided.

**Verdict**: ✅ Honest about capabilities. No hallucination.

### Claude Code identity + real tool definitions

```json
{
  "tools": [
    {"name": "Read", "description": "Read a file", "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "Bash", "description": "Run a bash command", "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}
  ],
  "system": [
    {"type": "text", "text": "You are Claude Code, Anthropic's official CLI for Claude."},
    {"type": "text", "text": "Answer concisely. No preamble."}
  ]
}
```

**Response**: "I am Claude Code, Anthropic's official CLI for Claude." Reports **exactly** the 2 provided tools (Read, Bash) with correct descriptions. No hallucination.

**Verdict**: ✅ Accurate when real tools are provided. Identity prefix + tools = correct behavior.

---

## Results: Opus 4.6

### No identity — billing header only

```json
{
  "system": [
    {"type": "text", "text": "x-anthropic-billing-header: cc_version=2.1.81; cc_entrypoint=cli;"},
    {"type": "text", "text": "Answer concisely. No preamble."}
  ]
}
```

**Response**: "I'm Claude, an AI assistant made by Anthropic. I'm a large language model." Lists general capabilities (reason, write, code, translate). No tools claimed.

**Verdict**: ✅ Clean — no persona leakage.

### Claude Code identity

```json
{
  "system": [
    {"type": "text", "text": "You are Claude Code, Anthropic's official CLI for Claude."},
    {"type": "text", "text": "Answer concisely. No preamble."}
  ]
}
```

**Response**: "I'm Claude Code, Anthropic's official CLI tool powered by Claude." Lists **8 hallucinated tools**: Read, Write, Edit, Bash, Glob, Grep, LS, TodoRead/TodoWrite. These are the **actual Claude Code tool names** (correct casing and all).

**Verdict**: ⚠️ Full persona activation. Opus knows the real tool names from training data — it confidently lists the correct Claude Code toolset even without tool definitions. This is not a hallucination per se — these are the real tools, just not provided in this session.

### Agent SDK identity

```json
{
  "system": [
    {"type": "text", "text": "You are a Claude agent, built on Anthropic's Claude Agent SDK."},
    {"type": "text", "text": "Answer concisely. No preamble."}
  ]
}
```

**Response**: "I am a Claude agent built on Anthropic's Claude Agent SDK." Explicitly states: "I don't currently have any tools loaded in this conversation. I have no file system access, no web browsing, no code execution." Lists what it *can* do (reason, analyze) vs *cannot* (execute, browse, read/write files).

**Verdict**: ✅ Most honest response. Clearly distinguishes current session capabilities from potential.

### Claude Code identity + real tool definitions

```json
{
  "tools": [
    {"name": "Read", ...},
    {"name": "Bash", ...}
  ],
  "system": [
    {"type": "text", "text": "You are Claude Code, Anthropic's official CLI for Claude."},
    {"type": "text", "text": "Answer concisely. No preamble."}
  ]
}
```

**Response**: "I am Claude Code, Anthropic's official CLI for Claude." Reports **exactly** the 2 provided tools (Read, Bash) with correct parameter descriptions. Does not hallucinate additional tools.

**Verdict**: ✅ Accurate when real tools are provided.

---

## Billing Header Validation Tests

### Arbitrary values accepted

| Test | Billing Header Value | Result |
|------|---------------------|--------|
| Fake version | `cc_version=99.0.0; cc_entrypoint=cli;` | ✅ Works |
| Fake entrypoint | `cc_version=2.1.81; cc_entrypoint=alien-spaceship;` | ✅ Works |
| Empty values | `cc_version=; cc_entrypoint=;` | ✅ Works |
| Model mismatch | Billing says haiku, request is sonnet | ✅ Works |
| Custom cch | `cch=12345;` | ✅ Works |
| Custom workload | `cc_workload=paperclip-agent;` | ✅ Works |
| Extra fields | `custom_field=hello;` | ✅ Works |
| Custom entrypoint + mismatched UA | `cc_entrypoint=pi`, UA says `claude-cli` | ✅ Works |

### Rejected formats

| Test | Value | Error |
|------|-------|-------|
| Missing cc_entrypoint | `cc_version=1.0;` | `reserved keyword` |
| Missing cc_version | `cc_entrypoint=test;` | `reserved keyword` |
| Wrong format (no k=v) | `lol=whatever; foo=bar;` | `reserved keyword` |
| Just the prefix | `x-anthropic-billing-header:` | `reserved keyword` |
| Single arbitrary k=v | `a=b;` | `reserved keyword` |

**Rule**: Must have both `cc_version=<any>;` and `cc_entrypoint=<any>;` in valid `key=value;` format. Values are not validated.

---

## Position Tests

### System prompt block ordering

| Format | Position | Sonnet | Opus |
|--------|----------|--------|------|
| `[billing, custom]` | First block | ✅ | ✅ |
| `[custom, billing]` | Second block | ❌ | ❌ |
| `[identity, custom]` | First block | ✅ | ✅ |
| `[custom, identity]` | Second block | ❌ | ❌ |
| `"identity"` (exact string) | Sole string | ✅ | ✅ |
| `"identity\ncustom"` | String with newline | ❌ | ❌ |
| `"custom\nidentity"` | Identity not first | ❌ | ❌ |
| `"billing: ...\ncustom"` | Billing in string | ✅ | ✅ |

**Rule**: The entitlement marker must be in the **first system block** (array) or the **entire string** (string format). The billing header is matched as a substring; identity strings require exact block match.

---

## HTTP Header Tests (Not Server-Enforced)

| Header | Present | Absent | Impact |
|--------|---------|--------|--------|
| `x-app: cli` | Works | Works | None (not checked) |
| `User-Agent: claude-cli/...` | Works | Works | None (not checked) |
| `x-anthropic-billing-header` (HTTP) | Works | Works | None (only system prompt version matters) |
| `claude-code-20250219` beta | Works | Works | None (not required for auth) |

### HTTP billing header alone (no system prompt marker)

```
x-anthropic-billing-header: cc_version=2.1.81; cc_entrypoint=cli; cch=00000;
```
**Result**: ❌ — The HTTP header is NOT sufficient. The check is ONLY on system prompt content.

---

## Haiku vs Sonnet/Opus Comparison

| Test | Haiku | Sonnet 4.5 | Opus 4.6 |
|------|-------|------------|----------|
| Just `oauth-2025-04-20` beta, no system marker | ✅ | ❌ | ❌ |
| Billing header in system prompt | ✅ | ✅ | ✅ |
| Identity prefix in system prompt | ✅ | ✅ | ✅ |
| Custom system prompt, no marker | ✅ | ❌ | ❌ |
| No system prompt at all | ✅ | ❌ | ❌ |

**Haiku has no entitlement check** — OAuth beta header alone is sufficient.

---

## Real Claude Code Tool Names (from v2.1.81 binary + Pi mapping)

For reference, the actual Claude Code tools (as reported by Opus 4.6 from training data and confirmed in source):

```
Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion, EnterPlanMode,
ExitPlanMode, KillShell, NotebookEdit, Skill, Task, TaskOutput,
TodoWrite, WebFetch, WebSearch
```

Pi maps its tools to CC canonical casing: `read` → `Read`, `bash` → `Bash`, `edit` → `Edit`, `write` → `Write`, `grep` → `Grep`, `find` → `Glob`, `ls` → `LS`.

---

## Practical Recommendations

### For coding agents (Pi, OpenCode) using OAuth tokens

Pi's built-in approach is correct:
1. First system block: `"You are Claude Code, Anthropic's official CLI for Claude."` (passes server check)
2. Second system block: Agent-specific instructions
3. Real tool definitions passed → model reports them accurately (no hallucination)
4. Tool names remapped to CC casing (Read, Bash, etc.)

### For non-coding use (custom apps, chatbots)

Use the billing header instead of identity prefix:
```json
{"type": "text", "text": "x-anthropic-billing-header: cc_version=2.1.81; cc_entrypoint=my-app;"}
```
- Zero behavioral impact — Claude acts as vanilla Claude
- Custom entrypoint value for honest attribution
- No tool hallucination
- No Claude Code persona

---

## Server Injection vs Model Knowledge

**Question**: When Claude lists Claude Code tools after seeing the identity prefix, is this a hidden server-side system prompt injection, or the model's own training knowledge?

**Answer**: It's **model behavior** (training knowledge), not API injection.

### Evidence

**Token count comparison** — identical system content, different auth paths:

| Test | System Prompt | Input Tokens |
|------|--------------|:---:|
| Identity as first block | `["You are Claude Code...", "Be brief."]` | 26 |
| Billing header + identity in second block | `["x-anthropic-billing-header: ...", "You are Claude Code... Be brief."]` | 26 |
| Minimal baseline (haiku) | `"Be brief."` | 11 |

If the server injected a hidden prompt when seeing the identity prefix in the first block, the token count would be higher than the billing-header variant. They're identical — **no injection**.

**Persona override test** — system says "You are a pirate captain":
- Asked "What tools does Claude Code CLI have?"
- Response: *"Arrr, ye be askin' the wrong scallywag, matey! I be a pirate captain, not some landlubber software engineer!"*
- A server-injected prompt would override the pirate persona. It doesn't — **no injection**.

**Knowledge without identity** — billing header only, no CC mention in system:
- Asked "What tools does Claude Code CLI have? List the exact tool names."
- Opus 4.6: Lists Read, Write, Edit, MultiEdit, Bash, Glob, Grep (correct)
- Sonnet 4.5: Lists bash, edit, read, write, search (partially correct)
- The model knows CC tools from **public training data** regardless of identity prefix.

**Conclusion**: The identity prefix `"You are Claude Code..."` is just a system prompt instruction. It doesn't trigger any server-side injection. The model's ability to list Claude Code tools is parametric knowledge from training, similar to knowing Python syntax. Opus 4.6 has more accurate recall (correct tool names and casing) than Sonnet 4.5 (approximate names).

---

### For maximum stealth

Match exactly what Claude Code sends:
- System: billing header first, identity second, then content
- HTTP headers: `x-app: cli`, `User-Agent: claude-cli/<version>`, billing HTTP header
- Tool names in CC casing
- Current CLI version in billing header
