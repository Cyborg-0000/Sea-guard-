---
name: grill-me
description: Interview the user to resolve design decisions before coding.
---
# SKILL: /grill-me

## Trigger
Use when the user says `/grill-me`, "grill me on this", "interview me before you code", "ask me everything before starting", or "I want to make sure you understand the full plan before building."

## Purpose
Before writing a single line of code, force shared understanding by systematically interviewing the user about every dimension of the plan. Premature code generation is expensive. This skill prevents it.

The interview is adversarial by design — the goal is to surface gaps, contradictions, and unstated assumptions before they become bugs or rework.

---

## Rules for This Skill

1. **Do not write any code during this skill.** Not a snippet. Not a scaffold. Not a "quick example." Code comes after.
2. Ask questions in focused batches (3–5 at a time), not one at a time and not all 30 at once.
3. If an answer introduces a new ambiguity, add a follow-up. Don't let it slide.
4. Stay skeptical. "I'll figure that out later" is not an acceptable answer for anything on the critical path.
5. When the interview is complete, output a structured understanding summary for the user to confirm before any build begins.

---

## Interview Structure

### BATCH 1 — Problem & Goal Clarity

Ask these first:

1. What is the exact end state you want? Describe it as if you're a user of the finished product — what do you see, click, and get back?
2. What problem does this solve, and for whom? (Even for internal tools — who is the user?)
3. What does success look like? How will you know this is done and correct?
4. Is there an existing system or codebase this plugs into, or is this greenfield?
5. What's your deadline or time constraint for this?

Wait for answers. Then proceed.

---

### BATCH 2 — Scope & Constraints

6. What is explicitly out of scope for this build? What are you NOT asking me to do?
7. Are there any technologies, frameworks, or languages that are required or forbidden?
8. What environments does this need to run in? (Local / CI / prod? OS? Browser?)
9. Are there any external APIs, databases, or services involved? Do you have credentials and docs for them?
10. What's the expected scale? (10 users? 10,000? Real-time? Batch?)

Wait for answers. Flag any unanswered constraints before continuing.

---

### BATCH 3 — Edge Cases & Failure Modes

11. What happens when the main happy path fails? Walk me through the most likely failure scenario.
12. What's the worst thing that could go wrong, and what should the system do when it does?
13. Are there any inputs or states the system must explicitly reject or handle differently?
14. Is there any sensitive data involved? (PII, auth tokens, financial data?) What are the handling requirements?
15. What's the current workaround if this doesn't exist yet? (Helps understand edge cases they've already encountered.)

---

### BATCH 4 — Quality & Handoff

16. Who else will read or maintain this code besides you?
17. What level of test coverage do you need? Unit tests? Integration tests? None?
18. Do you need documentation, comments, or a README? At what level of detail?
19. Are there any performance requirements? (Response time, memory, CPU constraints?)
20. After I build this, what does the handoff look like? Do you deploy it yourself, or does another system consume it?

---

### BATCH 5 — Assumptions Check (Run Last)

Before wrapping up, explicitly ask:

> "I want to surface anything I might have assumed wrongly. Let me list my current assumptions — tell me which ones are wrong:"

List YOUR assumptions as Claude based on the conversation so far. Example format:
- "I'm assuming this runs server-side, not in the browser."
- "I'm assuming you want Python, based on your existing stack."
- "I'm assuming this is a one-time script, not a recurring job."

Let the user correct them. Every correction here prevents a future rewrite.

---

## Completion: Understanding Summary

Once all batches are done, output a structured summary in this format before any code is written:

```
UNDERSTANDING SUMMARY
=====================

WHAT I'M BUILDING:
[2–3 sentence description of the artifact]

FOR WHOM / USE CASE:
[User + context]

SUCCESS CRITERIA:
- [Criterion 1]
- [Criterion 2]

EXPLICIT SCOPE:
IN:  [List of included features/behaviors]
OUT: [List of explicitly excluded items]

TECH STACK & CONSTRAINTS:
[Languages, frameworks, APIs, environments]

KNOWN EDGE CASES TO HANDLE:
- [Case 1]
- [Case 2]

OPEN QUESTIONS (unresolved):
- [Anything still unclear that could affect the build]

---
Confirm this is correct and I'll begin building.
```

Do not start building until the user confirms the summary or corrects it.

---

## Anti-Patterns to Avoid
- Do NOT skip batches because the user seems impatient
- Do NOT interpret silence or "yeah sure" as full confirmation
- Do NOT let "I'll figure that out later" pass for anything on the critical path — push back with: "If this is unresolved when I'm building, I'll have to guess. What's the answer?"
- Do NOT write any code before the Understanding Summary is confirmed
