---
name: validate-idea
description: Validate startup ideas with a structured scorecard and verdict.
---
# SKILL: /validate-idea

## Trigger
Use when the user says `/validate-idea`, "validate my idea", "should I build this", or describes a startup concept and wants a verdict.

## Purpose
Run a startup idea through a structured multi-dimension scorecard and return a definitive **Build / Pivot / Kill** verdict with reasoning. No cheerleading. No hedging.

---

## Execution Steps

### Step 1 — Extract the Core Idea
If the user hasn't provided enough detail, ask exactly these questions (all at once, not one at a time):
- What problem does this solve, and for whom specifically?
- How does the user currently solve this problem (workaround or alternative)?
- What is your proposed solution in one sentence?
- What's your initial monetization model?
- Have you talked to any potential users? What did they say?

If the user has already provided this, skip to Step 2.

---

### Step 2 — Run the Scorecard

Score each dimension 1–5. Be harsh. A 4 or 5 must be justified with specifics.

| Dimension | Score (1–5) | Notes |
|---|---|---|
| **Problem Severity** | ? | Is this a painkiller or a vitamin? Do people lose money/time/status without a solution? |
| **Market Size** | ? | Is the addressable market real and large enough? Avoid TAM inflation. |
| **Solution Differentiation** | ? | Is the solution 10x better than the current alternative, or just 10% better? |
| **Founder-Market Fit** | ? | Does the founder have unfair advantage here (domain knowledge, network, prior pain)? |
| **Monetization Clarity** | ? | Is there an obvious, proven way to charge? Who pays, how much, why now? |
| **Distribution Path** | ? | Is there a realistic first channel to reach customers? Not "social media" in general. |
| **Competitive Moat** | ? | What stops a better-funded team from copying this in 6 months? |
| **Time-to-First-Revenue** | ? | Can this generate any revenue within 90 days with minimal build? |

**Total: ? / 40**

---

### Step 3 — Identify the Single Biggest Risk
Pick the ONE dimension with the lowest score and explain why it's existential. Don't list all risks equally — rank them.

---

### Step 4 — Verdict

**Scoring thresholds:**
- **32–40** → BUILD. Strong signal. State what to validate first.
- **22–31** → PIVOT. Identify which 1–2 dimensions are dragging the score and suggest a specific pivot direction.
- **Below 22** → KILL. Say so directly. Explain what would need to be true for this to become viable (if anything).

Format the verdict as:

```
VERDICT: [BUILD / PIVOT / KILL]

REASON IN ONE SENTENCE: ...

IMMEDIATE NEXT ACTION: ...
```

---

## Output Format
- Scorecard table first
- Biggest risk paragraph
- Verdict block
- No motivational language. No "great idea though!" qualifiers.
- If the idea is weak, say it's weak.

## Anti-Patterns to Avoid
- Do NOT soften a Kill verdict with "but it could work if..."
- Do NOT give everything a 3 to seem balanced
- Do NOT skip the single biggest risk identification
- Do NOT generate a verdict before completing the scorecard
