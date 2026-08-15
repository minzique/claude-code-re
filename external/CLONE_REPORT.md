# Clone Report: Claude Code Reverse Engineering Resources

## Status Summary

### Repository 1: paoloanzn/free-code
**Status:** ❌ FAILED - Repository is disabled
- URL: https://github.com/paoloanzn/free-code
- Error: "Repository 'paoloanzn/free-code' is disabled. Please ask the owner to check their account."
- The repository appears to have been taken down or disabled by GitHub.

### Repository 2: ssslomp CCH signing repo
**Status:** ⚠️ NOT FOUND
- Searched for repositories at https://github.com/ssslomp
- Attempted common names: `cch`, `claude-code-cch`, `claude-code-reverse`
- Result: No public repositories found under this username related to Claude Code or CCH signing
- **Note:** The user may have been referring to someone else's work or a blog post/gist

### Alternative: CCH Algorithm Documentation
**Status:** ✅ SAVED
- Found comprehensive CCH algorithm documentation by **NTT123**
- Source: https://gist.github.com/NTT123/579183bdd7e028880d06c8befae73b99
- Saved to: `CCH_ALGORITHM_NTT123.md`
- This is the most detailed reverse-engineering writeup of the x-anthropic-billing-header

## Successfully Cloned Repositories

### 1. ghuntley/claude-code-source-code-deobfuscation
**URL:** https://github.com/ghuntley/claude-code-source-code-deobfuscation
**Stars:** 938 | **Forks:** 538
**Description:** Cleanroom deobfuscation of the official Claude Code npm package

**Notable Files:**
- `README.md` - Overview and usage
- `package.json` - Project configuration
- `claude-code/` - Deobfuscated source code directory
  - `src/` - TypeScript source files
  - `scripts/` - Build and utility scripts
  - `package.json` - Claude Code package config
  - `tsconfig.json` - TypeScript configuration
- `specs/` - Documentation directory
  - `architecture.md` - System architecture
  - `command_reference.md` - CLI command docs
  - `features.md` - Feature documentation
  - `overview.md` - High-level overview
  - `error_handling.md` - Error handling patterns
  - `performance.md` - Performance considerations

### 2. hitmux/HitCC
**URL:** https://github.com/hitmux/HitCC
**Stars:** 629 | **Forks:** 222
**Description:** Complete reverse-engineering documentation of Claude Code CLI v2.1.84 logic

**Notable Files:**
- `README.md` - Project overview and navigation guide
- `README_zh.md` - Chinese version
- `LICENSE` - CC BY 4.0 license
- `docs/` - Comprehensive documentation (27,170 lines!)
  - `00-overview/` - Scope, evidence, and conventions
  - `01-runtime/` - CLI entry, session management, agent loop
  - `02-execution/` - Tool execution, hooks, permissions, prompt assembly
  - `03-ecosystem/` - MCP, Skill, Plugin, TUI, remote persistence
  - `04-rewrite/` - Rewrite guidance and open questions
  - `05-appendix/` - Glossary and evidence index
- `recovery_tools/` - Python scripts for deobfuscation
  - `extract_js_symbols.py`
  - `format_bundle.py`
  - `js_identifier_tools.py`
  - `js_readability.py`

**Key Features:**
- Most comprehensive documentation set (27k+ lines)
- Organized by runtime topics, not source tree
- Includes confidence ratings and evidence tracking
- Suitable for building alternative implementations

### 3. Prajwalsrinvas/claude-code-reverse-engineering
**URL:** https://github.com/Prajwalsrinvas/claude-code-reverse-engineering
**Stars:** 3 | **Forks:** 1
**Description:** Reverse engineering deep dives into Claude Code's features

**Notable Files:**
- `README.md` - Project overview
- `deep-dives/` - Detailed analysis of specific features
  - `compact/` - Compact mode analysis
  - `insights/` - Various insights and findings
  - `slash-commands/` - Slash command documentation
  - `stats-and-context/` - Statistics and context tracking
- `skill/` - Skill system documentation
  - `README.md` - Skill system overview
  - `REFERENCE.md` - API reference
  - `SKILL.md` - Skill creation guide
  - `scripts/` - Utility scripts

## Additional Resource

### CCH_ALGORITHM_NTT123.md
Complete documentation of the `x-anthropic-billing-header` algorithm:
- Purpose and authentication mechanism
- Step-by-step computation algorithm
- Python reference implementation
- Test vectors and examples
- Constants: `BILLING_SALT = "59cf53e54c78"`, version format: `2.1.37.xxx`

## Recommendations

1. **For CCH signing/billing header:** Use `CCH_ALGORITHM_NTT123.md` - most authoritative source
2. **For comprehensive system understanding:** Start with `HitCC/docs/00-overview/00-index.md`
3. **For clean TypeScript source:** Use `claude-code-source-code-deobfuscation/claude-code/src/`
4. **For feature-specific deep dives:** Check `claude-code-reverse-engineering/deep-dives/`

## Next Steps

If you need the `paoloanzn/free-code` repository:
- Check if there's a fork available
- Contact the repository owner
- Look for cached copies or mirrors

If you need more info from ssslomp:
- They may have published blog posts or gists instead of a full repo
- Check platforms like: Medium, dev.to, personal blog
- Search for "ssslomp claude code" on various platforms
