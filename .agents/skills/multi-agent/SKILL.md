---
name: multi-agent
description: Design and coordinate multi-agent architectures.
---
# SKILL: /multi-agent

## Trigger
Use when the user says `/multi-agent`, "set up multiple Claude instances", "parallel agents", "orchestrate agents", "have one Claude do frontend and another do backend", or asks how to build a multi-agent workflow.

## Purpose
Design and coordinate multi-agent Claude architectures where specialized instances work in parallel or in sequence on distinct task domains. This skill helps the user plan the architecture, define agent roles, handle inter-agent communication, and avoid the common failure modes of multi-agent systems.

---

## When Multi-Agent is Worth It (and When It Isn't)

### Use multi-agent when:
- Tasks can be genuinely parallelized with no shared mutable state (e.g., writing frontend and backend independently against an agreed API contract)
- Specialization matters: different agents can be given different system prompts with tighter focus, reducing distraction from out-of-domain context
- Context windows are filling up: splitting workstreams prevents cross-contamination of context
- Review/critique loops are needed: one agent builds, another audits

### Do NOT use multi-agent when:
- The tasks are deeply interdependent in real-time (agents will block each other constantly)
- You're trying to go faster on a single sequential task — parallelism doesn't help here
- You don't have a clear contract between agents (no defined interface = agents will make incompatible assumptions)
- The overhead of coordination would exceed the value of specialization

---

## Architecture Patterns

### Pattern 1 — Orchestrator + Workers
One orchestrator agent breaks the task into subtasks, dispatches to specialized worker agents, and synthesizes results.

```
User
  └── Orchestrator Claude
        ├── Worker A: Frontend
        ├── Worker B: Backend / API
        ├── Worker C: Database schema
        └── Worker D: Tests
```

**Best for:** Large builds with clear domain separation.
**Risk:** Orchestrator becomes a bottleneck. Worker outputs may be incompatible if the contract isn't explicit.

---

### Pattern 2 — Pipeline (Sequential Agents)
Output of Agent A becomes input of Agent B. Each agent has one responsibility.

```
[Researcher Agent] → [Synthesizer Agent] → [Writer Agent] → [Editor Agent]
```

**Best for:** Workflows where each stage transforms the previous stage's output.
**Risk:** Errors compound — a bad output from stage 1 propagates through the entire chain.

---

### Pattern 3 — Critic Loop
One agent builds. Another reviews and returns feedback. Loop until passing.

```
[Builder Agent] ──→ [Critic Agent]
       ↑________________________|
```

**Best for:** Code review, content QA, security audits.
**Risk:** Infinite loops if the critic's standards are vague or the builder can't resolve the feedback.

---

### Pattern 4 — Independent Parallel + Merge
Multiple agents work simultaneously on non-overlapping scopes. A merge step integrates results.

```
Agent A: Component X ──┐
Agent B: Component Y ──┼──→ [Merge / Integration]
Agent C: Component Z ──┘
```

**Best for:** Parallel feature development, parallel research, parallel document sections.
**Risk:** Merge conflicts if scope boundaries weren't clean.

---

## Implementation Guide

### Step 1 — Define the Contract First

Before any agent writes anything, define the interfaces between agents. Example for a frontend + backend split:

```
API CONTRACT (agreed before any agent starts):
- Endpoint: POST /api/submit
- Request body: { userId: string, data: object }
- Response: { success: boolean, id: string, error?: string }
- Auth: Bearer token in Authorization header
- Error codes: 400 (validation), 401 (auth), 500 (server)
```

Both agents are given this contract in their system prompt. Neither agent invents their own.

---

### Step 2 — Write System Prompts Per Agent

Each agent gets a focused system prompt. Include:
- Role and scope (what this agent does and does NOT do)
- The contract it operates against
- Output format requirements (so the orchestrator or merge step can parse it)
- Explicit "do not" list (prevents agents from drifting into each other's domain)

Example worker system prompt template:
```
You are a [role] agent. Your ONLY job is to [specific task].

You operate against this contract: [paste contract]

Your output must be: [format — e.g., "valid Python with no placeholder functions"]

Do NOT: [list what's out of scope]
Do NOT ask for clarification — make the best decision you can and note your assumptions at the end.
```

---

### Step 3 — Handle Inter-Agent State

Agents don't share memory. Any state that needs to transfer between agents must be explicit. Options:

| Method | When to Use |
|---|---|
| **Direct output passing** | Agent A's output is pasted as Agent B's input. Simple. Works for most cases. |
| **Shared spec document** | A central document (PRD, API contract, schema) both agents reference. Update it explicitly when decisions change. |
| **Structured JSON handoffs** | Agent A outputs JSON; Agent B parses it. Good for programmatic pipelines. |
| **File system** | Agents read/write files. Works in Claude Code with tool access. |

---

### Step 4 — Handle Failures

Multi-agent systems fail silently more often than single-agent systems. Design for this:

- **Validation gate**: After each agent completes, validate its output against the contract before passing it downstream
- **Assumption log**: Each agent appends its assumptions to a shared log — review before merging
- **Explicit completion signal**: Each agent should end with a structured completion block:

```
AGENT COMPLETE
==============
Task: [what I built]
Assumptions made: [list]
Known limitations: [list]
Handoff notes: [anything the next agent needs to know]
```

---

## Common Failure Modes

| Failure | Cause | Fix |
|---|---|---|
| Agents produce incompatible outputs | No shared contract | Define interface before any agent starts |
| One agent duplicates another's work | Unclear scope boundaries | Explicit "do not" lists in system prompts |
| Errors compound silently | No validation between stages | Add validation gates at each handoff |
| Context drift within an agent | Task is too broad | Split further; each agent should have one job |
| Orchestrator becomes confused | Too many worker outputs to reconcile | Enforce structured output formats from workers |

---

## Output of This Skill

When the user asks to set up a multi-agent workflow, produce:

1. **Architecture recommendation** (which pattern fits their use case and why)
2. **Agent roster** (list of agents, each with: name, role, scope, do-not list)
3. **Contracts/interfaces** between agents (written out explicitly)
4. **System prompt template** for each agent
5. **Handoff format** between agents
6. **Failure mode checklist** specific to their architecture

---

## Anti-Patterns to Avoid
- Do NOT design multi-agent systems where agents need to talk to each other in real-time — they can't
- Do NOT skip the contract definition step — it's the most common cause of multi-agent failure
- Do NOT create more agents than necessary — each agent adds coordination overhead
- Do NOT give agents overlapping scope without explicit priority rules for conflicts
