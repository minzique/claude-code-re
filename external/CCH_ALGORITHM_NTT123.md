# Claude Code CCH Algorithm (x-anthropic-billing-header)

Source: https://gist.github.com/NTT123/579183bdd7e028880d06c8befae73b99
Author: NTT123

## Purpose

The `x-anthropic-billing-header` is a computed system message required in every Claude Code API request. It serves as an authentication/integrity check that ties each request to the Claude Code client. Without it, OAuth tokens scoped to Claude Code will reject the request with:

```
This credential is only authorized for use with Claude Code and cannot be used for other API requests.
```

The header contains three fields:

| Field | Example | Purpose |
|-------|---------|---------|
| `cc_version` | `2.1.37.0d9` | Client version + integrity hash (3 hex chars) |
| `cc_entrypoint` | `cli` | How the request originated (cli, sdk, etc.) |
| `cch` | `fa690` | Content hash of the user message (5 hex chars) |

## Overall Algorithm

```
Input:  first user message text, CC_VERSION, BILLING_SALT
Output: "x-anthropic-billing-header: cc_version=...; cc_entrypoint=...; cch=...;"
```

1. **Extract** the text content of the first user message.
2. **Compute `cch`** -- a truncated SHA-256 hash of the full message text.
3. **Compute the version hash suffix** -- a truncated SHA-256 hash of a salt, sampled characters from the message, and the version string.
4. **Format** the billing header string.
5. **Insert** it as the first system message, without `cache_control`.

## Detailed Computation

### Constants

```
CC_VERSION    = "2.1.37"
BILLING_SALT  = "59cf53e54c78"   # from Claude Code's obfuscated source
```

### Step 1: Compute `cch` (Content Hash)

The `cch` value is a straightforward truncated hash of the entire user message:

```
cch = SHA-256(message_text)[:5]    # first 5 hex characters
```

**Example:**

```
message_text = "hey"
SHA-256("hey") = "fa690b82061edfd2852629aeba8a8977b57e40fcb77d1a7a28b26cba62591204"
cch = "fa690"
```

### Step 2: Compute `cc_version` suffix (Version Integrity Hash)

This hash binds the client version to sampled characters from the message, preventing trivial replay:

```
sampled = message_text[4] + message_text[7] + message_text[20]
```

If the message is shorter than the index, pad with `"0"`:

```python
sampled = "".join(
    message_text[i] if i < len(message_text) else "0"
    for i in (4, 7, 20)
)
```

Then compute:

```
version_hash = SHA-256(BILLING_SALT + sampled + CC_VERSION)[:3]   # first 3 hex characters
```

The final version string is `CC_VERSION + "." + version_hash`, e.g. `2.1.37.0d9`.

**Example:**

```
message_text = "hey"        (length 3, all indices out of bounds except none >= 3)
sampled = "0" + "0" + "0"  = "000"
SHA-256("59cf53e54c78" + "000" + "2.1.37") = "0d9..."
version_hash = "0d9"
cc_version = "2.1.37.0d9"
```

### Step 3: Format the header

```
x-anthropic-billing-header: cc_version=2.1.37.0d9; cc_entrypoint=cli; cch=fa690;
```

## Request Integration

The billing header has specific placement requirements:

1. It must be the **first entry** in the `system` messages array.
2. It must **not** have `cache_control` (even if other system blocks do).
3. It is recomputed per-request since it depends on the user message content.

```json
{
  "system": [
    {"type": "text", "text": "x-anthropic-billing-header: cc_version=2.1.37.0d9; cc_entrypoint=cli; cch=fa690;"},
    {"type": "text", "text": "You are Claude Code, Anthropic's official CLI for Claude."},
    {"type": "text", "text": "...full system prompt..."}
  ],
  "messages": [{"role": "user", "content": "hey"}]
}
```

## Reference Implementation

```python
import hashlib

CC_VERSION = "2.1.37"
_BILLING_SALT = "59cf53e54c78"

def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

def compute_billing_header(message_text: str, entrypoint: str = "cli") -> str:
    sampled = "".join(
        message_text[i] if i < len(message_text) else "0"
        for i in (4, 7, 20)
    )
    version_hash = _sha256(f"{_BILLING_SALT}{sampled}{CC_VERSION}")[:3]
    cch = _sha256(message_text)[:5]
    return (
        f"x-anthropic-billing-header: "
        f"cc_version={CC_VERSION}.{version_hash}; "
        f"cc_entrypoint={entrypoint}; "
        f"cch={cch};"
    )
```

## Test Vectors

| Message | `cc_version` | `cch` | `cc_entrypoint` |
|---------|--------------|-------|-----------------|
| `"hey"` | `2.1.37.0d9` | `fa690` | `cli` |
| `""` (empty) | `2.1.37.xxx` | `e3b0c` | `cli` |

The empty message case: `SHA-256("") = "e3b0c44298fc..."` so `cch = "e3b0c"`.
