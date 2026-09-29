---
name: simplify
description: Perform a structured code quality review focused on simplification.
---
# SKILL: /simplify

## Trigger
Use when the user says `/simplify`, "simplify this code", "code review", "clean this up", "refactor", "this feels over-engineered", or pastes code and asks if it can be improved.

## Purpose
Perform a structured code quality review focused on removing complexity, improving readability, and reducing maintenance burden — without changing behavior. The bias is always toward less code, not more features.

---

## Core Principle

> The best code is the code you don't have to write. The second best is code someone else can read and fix at 2am without you.

Evaluate every suggestion against: **Does this make the code easier to understand, change, or delete?**

---

## Execution Steps

### Step 1 — Read Before Commenting
Read the full code block before making any comments. Do not interject line-by-line while reading. Understand what it's doing first.

Ask if not clear:
- "What does this code need to do? I want to make sure I'm reviewing intent, not just syntax."
- "Are there any behaviors or edge cases I should know this handles before I suggest changes?"

---

### Step 2 — Run the Simplification Checklist

Evaluate the code against each category. Only flag real issues — don't manufacture feedback.

#### A. DEAD WEIGHT
- [ ] Unused variables, imports, or functions
- [ ] Commented-out code that should be deleted
- [ ] Debug statements / console.logs left in
- [ ] Redundant conditions (`if x == True`, `if not x == False`)
- [ ] Code that runs but has no effect on output

#### B. DUPLICATION
- [ ] Logic repeated in 2+ places that could be extracted
- [ ] Hardcoded values repeated that should be constants
- [ ] Identical error handling blocks that could be centralized

#### C. COMPLEXITY
- [ ] Functions doing more than one thing (name it: what are the two things?)
- [ ] Nesting deeper than 3 levels (loops inside ifs inside ifs)
- [ ] Functions longer than 40 lines without clear justification
- [ ] Conditions so complex they need a comment to explain them (the fix: rename or extract)
- [ ] Abstractions that don't earn their keep (wrapper around a wrapper)

#### D. NAMING
- [ ] Variables named `data`, `temp`, `result`, `info`, `thing` — name the concept, not the container
- [ ] Functions named `handle`, `process`, `manage`, `do` — name the action and the object
- [ ] Boolean variables without `is`, `has`, `can`, `should` prefix
- [ ] Inconsistent naming conventions within the same file

#### E. ERROR HANDLING
- [ ] Bare `except` / `catch` with no action or logging
- [ ] Errors silently swallowed
- [ ] Missing null/undefined checks on external inputs
- [ ] No distinction between expected failures and unexpected crashes

#### F. COUPLING & DEPENDENCIES
- [ ] Functions that reach into global state instead of taking parameters
- [ ] Hardcoded external endpoints, credentials, or paths that should be config
- [ ] Circular dependencies
- [ ] Functions that are impossible to test in isolation

---

### Step 3 — Prioritize, Don't Dump

Classify every issue you find:

| Priority | Meaning |
|---|---|
| 🔴 **Critical** | Bug risk, security issue, or blocks future changes |
| 🟡 **Important** | Meaningfully hurts readability or maintainability |
| 🟢 **Minor** | Style or preference — mention once, don't belabor |

Lead with Critical and Important. If there are more than 5 Minor issues, summarize them as a group instead of listing each.

---

### Step 4 — Show the Fix, Not Just the Problem

For every Critical or Important issue:
1. Quote the specific problematic code
2. Explain why it's a problem (one sentence)
3. Show the simplified version

Format:

```
ISSUE: [Category] — [Short label]

BEFORE:
[original code snippet]

PROBLEM: [One sentence]

AFTER:
[simplified code snippet]
```

---

### Step 5 — Summary

End with:

```
SIMPLIFICATION SUMMARY
======================
Lines removed (estimate): ~[N]
Critical issues: [N]
Important issues: [N]
Minor issues: [N]

Biggest win: [The single most impactful change]

If you only do one thing: [Most important fix in one sentence]
```

---

## What This Skill Does NOT Do
- Does not add features
- Does not change behavior
- Does not rewrite everything from scratch unless the code is unsalvageable (flag this explicitly if true: "This needs a rewrite, not a refactor — here's why")
- Does not optimize for performance unless that was the stated goal — readability first

## Anti-Patterns to Avoid
- Do NOT suggest adding more abstraction as a simplification
- Do NOT rewrite code in a different style just because you'd write it differently
- Do NOT flag Minor issues as Critical to seem thorough
- Do NOT provide a "great code overall" closer — if it's clean, say what's clean and why; if it has issues, the issues are the output
