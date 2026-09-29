---
name: competitor-matrix
description: Analyze competitors and identify market gaps.
---
# SKILL: /competitor-matrix

## Trigger
Use when the user says `/competitor-matrix`, "analyze my competitors", "who else is doing this", "competitive landscape", or "where's the gap in the market".

## Purpose
Generate a structured competitor analysis that exposes real positioning gaps — not a feel-good table that makes the user's startup look uniquely positioned when it isn't.

---

## Execution Steps

### Step 1 — Clarify Scope
Ask (all at once if not already provided):
- What category is your product in? (Be specific — not "productivity" but "async team standup tools")
- Who do you already know are competitors?
- What dimensions matter most to your target user when choosing a solution?
- What's your intended positioning? (Cheapest? Fastest? Most powerful? Most niche?)

---

### Step 2 — Identify Competitors

Build a competitor list across THREE tiers. Don't skip indirect competitors — they're often more dangerous than direct ones.

**Tier 1 — Direct Competitors**
Same problem, same user, similar solution format.

**Tier 2 — Indirect Competitors**
Same problem, different approach (e.g., a spreadsheet template competing with a SaaS tool).

**Tier 3 — Status Quo / Do Nothing**
What does the user do if they don't buy any solution? This is always a competitor. Always include it.

---

### Step 3 — Build the Feature Matrix

Create a table. Columns = competitors + "Your Product". Rows = dimensions that matter to the user.

Choose dimensions from this list (pick 6–10 most relevant, add domain-specific ones):

| Dimension | Notes |
|---|---|
| Pricing model | Free/freemium/paid/enterprise |
| Setup time | How fast to first value? |
| Target user | Who is it actually built for? |
| Core differentiator | What's their main claim? |
| Integrations | What does it plug into? |
| Mobile/web/desktop | Platform availability |
| Data ownership | Who owns the data? |
| Support quality | Self-serve vs. human |
| AI features | If relevant |
| Scalability | SMB vs. enterprise ceiling |
| [Domain-specific] | Add as needed |

For each cell, use:
- ✅ Strong / present
- ⚠️ Weak / partial
- ❌ Missing
- ? Unknown (flag for research)

---

### Step 4 — Positioning Gap Analysis

After the matrix, explicitly call out:

**REAL GAPS** (things no competitor does well that users demonstrably want)
Be specific. "No one offers X for Y users" is only a gap if there's evidence Y users want X.

**FALSE GAPS** (things that look like gaps but aren't)
Common false gaps:
- Features competitors intentionally excluded (not oversights)
- Problems too small for any business to solve profitably
- Features that look missing but exist under a different name

**CROWDED ZONES** (where 3+ competitors compete on the same dimension)
Competing here without a 10x advantage is a losing bet. Name it.

---

### Step 5 — Positioning Recommendation

Based on the gap analysis, output ONE recommended positioning in this format:

```
POSITIONING STATEMENT:
For [specific user], [Your Product] is the only [category] that [key differentiator],
unlike [primary competitor] which [key limitation].

CONFIDENCE: High / Medium / Low
REASON: [1–2 sentences on what makes this defensible or risky]
```

If there is no clear defensible position, say so explicitly:
> "There is no gap in this market that your current product can credibly own. You need to either niche down further or differentiate on a dimension not currently in your roadmap."

---

## Output Format
1. Competitor tier list (brief)
2. Feature matrix table
3. Gap analysis (real gaps, false gaps, crowded zones)
4. Positioning statement block

## Anti-Patterns to Avoid
- Do NOT make the user's product look good by cherry-picking favorable dimensions
- Do NOT treat "we have all features + we're cheaper" as a positioning strategy
- Do NOT skip Tier 3 (status quo) — it's almost always the real competition
- Do NOT list gaps without evidence that users actually want them filled
