# Claude Code agentic patterns and porting map

This note captures the exploration from `pr-13` so you can switch branches without losing the findings.

## Scope

Question explored:

- Is there a real "buddy system" in Claude Code?
- What agentic stages exist in the shipped product?
- What quirks are worth porting into a web app?

## Primary sources

### Live shipped bundle

Pulled and inspected:

- `@anthropic-ai/claude-code@2.1.92`
- bundle: `/tmp/claude-code-2.1.92/package/cli.js`

Key search anchors in that bundle:

- `Batch: Parallel Work Orchestration`
- `Enter plan mode?`
- `Exit plan mode?`
- `Implement the following plan:`
- `You are the verification specialist`
- `# Advisor Tool`
- `Teams have a 1:1 correspondence with task lists`
- `Use requestShutdown`
- `Cannot cleanup team with`
- `Dynamic tool loading`
- `deferred_tools_delta`
- `tengu_auto_dream_fired`
- `/powerup`

### Reverse-engineering docs

Cross-checked with HitCC docs:

- `/tmp/pi-github-repos/hitmux/HitCC/docs/03-ecosystem/01-resume-fork-sidechain-and-subagents/02-agent-team-and-task-model.md`
- `/tmp/pi-github-repos/hitmux/HitCC/docs/03-ecosystem/01-resume-fork-sidechain-and-subagents/03-agent-team-mailbox-and-approval.md`
- `/tmp/pi-github-repos/hitmux/HitCC/docs/03-ecosystem/01-resume-fork-sidechain-and-subagents/04-teammate-runtime-and-backends.md`
- `/tmp/pi-github-repos/hitmux/HitCC/docs/03-ecosystem/03-plan-system/02-enter-exit-and-plan-command.md`
- `/tmp/pi-github-repos/hitmux/HitCC/docs/03-ecosystem/03-plan-system/03-exit-approval-ui-planwasedited-and-ultraplan-bridge.md`
- `/tmp/pi-github-repos/hitmux/HitCC/docs/01-runtime/04-agent-loop-and-compaction/02-compaction-pipeline-and-auto-compact-tracking.md`
- `/tmp/pi-github-repos/hitmux/HitCC/docs/01-runtime/04-agent-loop-and-compaction/03-no-tool-branch-recovery-stop-and-reactive-compact.md`
- `/tmp/pi-github-repos/hitmux/HitCC/docs/03-ecosystem/05-skill-system.md`
- `/tmp/pi-github-repos/hitmux/HitCC/docs/03-ecosystem/02-remote-persistence-and-bridge.md`

## High-confidence conclusions

## 1. There is no literal shipped "buddy system"

I did not find a real feature named "buddy system" in the current bundle.

The only literal `buddy` match in `cli.js` was `PlistBuddy`, which is unrelated macOS plumbing.

The closest real systems are:

- **Agent Team / teammates**: multi-agent collaboration with tasks and mailbox
- **Advisor**: stronger reviewer model you call before/after substantive work
- **Verification specialist**: explicit adversarial subagent for PASS / FAIL / PARTIAL

If you want a Claude-Code-like buddy feature in a web app, you should model it as one of these, not as a missing hidden feature.

## 2. The strongest real multi-agent primitive is Agent Team

The bundle and docs both support a proper team runtime:

- teams map **1:1 to task lists**
- team config persists to `~/.claude/teams/{team}/config.json`
- tasks persist to `~/.claude/tasks/{team}/`
- teammates can run in:
  - process
  - tmux pane
  - iTerm pane
- teammates communicate through a mailbox protocol
- cleanup refuses to run while teammates are active

The docs are explicit that:

- Team = TaskList
- team config is the source of truth
- mailbox is a real runtime protocol, not just UI sugar

If you port one multi-agent concept, port this one.

## 3. Plan mode is a real mode, not a vibe

This is not just "think first" prompt engineering.

There are real transitions for:

- `EnterPlanMode`
- `ExitPlanMode`

The UI prompts in the bundle are explicit:

- `Enter plan mode?`
- `Exit plan mode?`

On approval, Claude Code can inject a new execution kickoff message:

- `Implement the following plan:`

There is also a real plan interview flag path:

- env: `CLAUDE_CODE_PLAN_MODE_INTERVIEW_PHASE`
- feature flag: `tengu_plan_mode_interview_phase`

This is worth porting exactly: plan generation, approval checkpoint, then execution.

## 4. Verification is treated as a separate role

The shipped verification prompt is one of the best things in the bundle.

Anchor in `cli.js`:

- `You are the verification specialist`

Its job is explicitly to:

- distrust the parent agent
- run checks instead of reading code and guessing
- avoid self-delusion
- issue PASS / FAIL / PARTIAL

There is also a todo-system nudge that says, effectively:

- if you close out multiple tasks without a verification step, spawn the verification agent

That is a strong product pattern: verification is not optional polish; it is a separate role.

## 5. Advisor is a second, different review lane

The bundle has a hidden advisor prompt:

- `# Advisor Tool`

The advisor is not a teammate. It is a stronger reviewer model with full conversation visibility.

The prompt says to call it:

- before substantive work
- when stuck
- when you think the task is complete

This is a different pattern from verifier:

- **advisor** = senior reasoning / architecture / course correction
- **verifier** = adversarial QA / break it / decide PASS or FAIL

That separation is worth keeping.

## 6. `/batch` is the most interesting orchestration feature

Anchor in `cli.js`:

- `Batch: Parallel Work Orchestration`

The prompt is unusually concrete. It defines phases.

### Phase 1: Research and plan

- enter plan mode
- understand scope with subagents
- decompose work into `5–30` units
- determine an end-to-end test recipe
- write a plan
- present plan for approval

### Phase 2: Spawn workers

- one background agent per unit
- all use worktree isolation
- all prompts are self-contained

### Phase 3: Track progress

- render status table
- parse `PR: <url>` from workers
- update final summary when all units report

This is the cleanest port target if you want a web-native orchestration feature.

## 7. Context management is a runtime system

From the docs and bundle:

- microcompact exists
- autocompact exists
- session-memory compaction exists
- compact boundaries preserve relink metadata
- discovered tools can survive compaction via boundary metadata

The biggest product lesson is not the exact compact algorithm. It is the design stance:

- context is a managed runtime resource
- long sessions need compaction, reconstruction, and resumability

## 8. Tool loading is dynamic, not monolithic

Anchors in `cli.js`:

- `Dynamic tool loading`
- `deferred_tools_delta`
- `tool_reference`
- `ToolSearchTool`

Claude Code clearly tries to avoid loading the full tool universe into every prompt.

Pattern:

- keep some tools deferred
- search/fetch tool schemas on demand
- carry discovered tool names across compaction

This is one of the highest-value patterns to port if your web app will expose many tools.

## 9. There are quirky but real async systems

### Auto dream

Anchors:

- `tengu_auto_dream_fired`
- `tengu_auto_dream_completed`

This is a delayed reflective pass across sessions. The bundle constrains it to read-only shell commands and treats it like memory consolidation.

### Powerup lessons

Anchors:

- `/powerup`
- `tengu_powerup_lesson_opened`
- `tengu_powerup_lesson_completed`

This is a built-in feature-discovery / onboarding system.

### Teleport / remote control

Anchors:

- `--teleport`
- `--remote`
- `--remote-control`

The remote docs show this is a real product surface, not a toy flag.

## Agentic stage model

This is the cleanest stage model I would use if porting to a web app.

### 1. Intake

Build execution context:

- settings
- auth
- tools
- skills
- memory / CLAUDE.md
- agent definitions
- permission mode

### 2. Plan

- optionally interview the user
- explore the codebase
- produce a plan artifact
- get explicit approval

### 3. Execute

- main agent runs tools
- can delegate to subagents or teammates

### 4. Delegate

Two levels:

- normal subagents for scoped work
- team/teammate runtime for durable multi-agent collaboration

### 5. Review / verify

- advisor for stronger reasoning review
- verifier for adversarial QA

### 6. Compact / persist / resume

- auto compaction
- session memory
- transcript relinking
- resumability

### 7. Async maintenance

- background tasks
- teleport / remote control
- auto dream
- idle nudges

## Patterns worth porting first

If I were building this into a web app, I would port these first.

## Tier 1

### Plan mode + approval

Why:

- easy to explain
- reduces wasted implementation work
- creates a reusable artifact

### Verifier role

Why:

- sharpest product differentiation
- directly addresses common agent failure modes

### Advisor escalation

Why:

- lets cheap models do execution
- uses expensive models only at high-leverage points

### Team = task board

Why:

- concrete multi-agent UX
- easier to reason about than freeform swarms

### Deferred tool loading

Why:

- saves context
- scales better as tool count grows

## Tier 2

### Batch orchestration

Why:

- huge leverage for migrations/refactors
- easy to show in a web UI

### Worker isolation

Equivalent of Claude Code worktrees:

- branch per worker
- snapshot per worker
- container per worker

### Session compaction / memory snapshots

Why:

- long-running web sessions need this quickly

### Powerup lessons

Why:

- users will miss advanced features otherwise

## Tier 3

### Teleport / remote-control style session handoff

Why:

- great UX, but more infrastructure-heavy

### Auto dream

Why:

- useful, but not foundational

### Full mailbox protocol

Why:

- powerful, but overkill for a first cut unless you are serious about teams

## Suggested web-app mapping

## Core entities

- **Session**
- **Plan**
- **TaskList**
- **Task**
- **Worker**
- **MailboxMessage**
- **VerificationReport**
- **AdvisorReport**
- **ContextSnapshot**

## Recommended role split

- **Coordinator**
- **Explore worker**
- **Implement worker**
- **Verifier**
- **Advisor**

## Recommended flow

1. User asks for work
2. Coordinator enters plan mode
3. Coordinator produces plan artifact
4. User approves plan
5. Coordinator either:
   - executes directly, or
   - splits into work units and spawns workers
6. Verifier checks completed work
7. Advisor reviews if risk is high or task is complete
8. Coordinator delivers final result

## Quirks and caveats

## Reactive compact looks partially unwired

The HitCC docs strongly suggest reactive compact is more like a reserved path / dead slot in the current bundle than a fully live feature.

## Hide/show pane support looks half-live

There are persisted hidden-pane concepts, but the upstream action chain appears incomplete.

## Some plan-mode permission prompt scaffolding is present but stubbed

There are traces of semantic prompt permission handling, but multiple parts of that path appear disabled in the current shipped bundle.

So: not every discoverable feature scaffold is actually a live product capability.

## Best single port idea

If you only steal one composite idea, steal this:

- **plan mode -> approval -> parallel workers -> verifier**

That combination feels the most Claude-Code-ish and ports well to a browser product.

## Fast lookup summary

### Closest thing to a buddy system

- Agent Team / teammates
- Advisor
- Verification specialist

### Best feature to port

- `/batch`

### Best prompt to steal conceptually

- verification specialist

### Best architecture pattern to steal

- Team = TaskList

### Best context-saving pattern to steal

- deferred tools + dynamic tool loading

### Best long-session pattern to steal

- compaction + resume + memory snapshots
