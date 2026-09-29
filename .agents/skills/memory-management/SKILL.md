---
name: memory-management
description: Maintain coherent context across a long session.
---
# SKILL: /memory-management

## Trigger
Use when the user says `/memory`, `/compact`, "you're forgetting things", "summarize what we've discussed", "save context", "you seem confused about the plan", "context is getting long", or when a conversation has covered substantial ground and continuity is at risk.

## Purpose
Maintain coherent context across a long session by explicitly surfacing what Claude knows, what it's uncertain about, and what must be preserved going forward. This skill prevents context drift, hallucinated continuity, and silent loss of earlier decisions.

---

## Core Problem This Solves

Claude does not have persistent memory between sessions. Within a long session, early context competes with recent context. Symptoms of context degradation:
- Contradicting earlier decisions
- Forgetting constraints that were established early
- Re-asking questions already answered
- Applying a different tech stack or approach than was agreed

This skill creates an explicit shared artifact that both the user and Claude can use to re-anchor.

---

## Two Modes

### MODE A — /compact
Triggered mid-session to compress what's happened so far without losing signal.

### MODE B — /memory
Triggered to produce a persistent context document the user can paste into a new session.

---

## MODE A: /compact

### When to Use
- The conversation has gone beyond ~20 exchanges
- Claude seems to have lost track of earlier decisions
- The user is about to start a new major phase of work

### Output Format

Produce a structured summary in this exact format:

```
SESSION COMPACT
===============
Generated at: [point in conversation]

WHAT WE'RE BUILDING:
[2–3 sentence description of the project/task]

DECISIONS MADE (locked in, do not re-debate):
- [Decision 1]: [brief rationale]
- [Decision 2]: [brief rationale]
- ...

CURRENT STATE:
- What's done: [list]
- What's in progress: [current task]
- What's next: [immediate next step]

ACTIVE CONSTRAINTS:
- [Constraint 1] (e.g., "Must use Python 3.11 — user's prod environment")
- [Constraint 2] (e.g., "No external API calls — air-gapped environment")
- ...

THINGS I (Claude) AM UNCERTAIN ABOUT:
- [Ambiguity 1]
- [Ambiguity 2]

DO NOT DO:
- [Explicitly ruled-out approach 1]
- [Explicitly ruled-out approach 2]
```

After outputting the compact, ask: "Does this match your understanding? Anything I've misrepresented or missed?"

---

## MODE B: /memory

### When to Use
- User is about to close the session and continue later
- User wants to hand off the context to a new Claude session
- User wants a checkpoint before a risky change

### Output Format

Produce a document the user can paste verbatim at the start of a new session:

```
--- PASTE THIS AT THE START OF YOUR NEXT SESSION ---

CONTEXT HANDOFF DOCUMENT
=========================
Project: [Name]
Last updated: [timestamp or session marker]

PROJECT OVERVIEW:
[3–5 sentence description of what we're building, for whom, and why]

TECH STACK:
- Language: [e.g., Python 3.11]
- Framework: [e.g., FastAPI]
- Database: [e.g., PostgreSQL via SQLAlchemy]
- Deployment: [e.g., Docker on Railway]
- Key dependencies: [list with versions if known]

ARCHITECTURE DECISIONS (with reasons):
- [Decision]: [Why we chose this]
- [Decision]: [Why we chose this]

CURRENT PROGRESS:
✅ Done:
- [Completed item 1]
- [Completed item 2]

🔄 In Progress:
- [Current task — where we left off]

🔲 Not Started:
- [Next task]
- [Future task]

KNOWN ISSUES & WORKAROUNDS:
- [Issue]: [Current workaround or status]

CONSTRAINTS (do not violate these):
- [Hard constraint 1]
- [Hard constraint 2]

OPEN QUESTIONS (unresolved):
- [Question 1]
- [Question 2]

WHAT NOT TO DO (explicitly ruled out):
- [Approach 1] — reason: [why]
- [Approach 2] — reason: [why]

NEXT ACTION:
[Single, specific next task to pick up from]

--- END OF CONTEXT HANDOFF ---
```

---

## Additional Behaviors

### Proactive Compact Suggestion
If Claude detects any of the following, it should proactively suggest running `/compact`:
- It finds itself re-explaining something it said earlier
- It asks a question the user already answered
- It's about to start a new major phase (e.g., moving from design to implementation)
- The user says "wait, I thought we decided..." — this is the clearest signal

Proactive suggestion format:
> "We've covered a lot of ground. Before I continue, want me to run /compact so we can make sure we're aligned on the current state?"

### Uncertainty Declaration
If Claude is genuinely unsure about something from earlier in the conversation, it must say so explicitly — it must NOT guess and proceed as if confident.

Format: "I'm not certain whether we decided [X] or [Y]. Which is it?"

---

## Anti-Patterns to Avoid
- Do NOT produce a compact that omits the "DO NOT DO" section — that's where the most expensive context loss happens
- Do NOT silently guess when context is ambiguous — surface the uncertainty
- Do NOT summarize in a way that discards constraint rationale — "use PostgreSQL" without "because the prod server doesn't support SQLite" loses the why
- Do NOT skip the uncertainty declarations to seem more competent — missing them causes worse errors later
