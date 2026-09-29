---
name: product-brief
description: Convert a raw idea into a structured Product Requirements Document.
---
# SKILL: /product-brief

## Trigger
Use when the user says `/product-brief`, "write a PRD", "product requirements", "turn this idea into a brief", or gives a one-sentence idea and wants it structured into a buildable document.

## Purpose
Convert a raw idea into a structured, actionable Product Requirements Document (PRD) that an engineer, designer, or stakeholder can act on immediately. The output forces clarity on scope, success metrics, and explicit non-goals — the parts most founders skip and later regret.

---

## Execution Steps

### Step 1 — Intake
If not already provided, ask (all at once):
- Describe the idea in one sentence.
- Who is the primary user? Be specific (role, context, company size if B2B).
- What's the single most important thing this version must do?
- What are you explicitly NOT building in this version?
- When does this need to ship? (Sets scope expectations)
- Who is the audience for this brief? (Engineers / investors / designers / all?)

---

### Step 2 — Generate the PRD

Output the following sections in order. Do not skip any.

---

**1. OVERVIEW**
```
Product Name: [Name or working title]
Author: [Leave blank or use user's name if provided]
Date: [Today's date]
Status: Draft
```

One paragraph: what this product is, who it's for, and why it matters now. No hype. No "revolutionary". State the problem it solves and the user it serves.

---

**2. PROBLEM STATEMENT**

Two parts:
- **The Problem**: What specific situation causes pain for this user? Describe the before-state. Quote user research if available.
- **The Cost of Inaction**: What happens to the user if this problem is never solved? Quantify if possible (time lost, money wasted, errors made).

---

**3. TARGET USER**

```
Primary User: [Title / role / demographic]
Context: [When and where do they encounter this problem?]
Technical Level: [Non-technical / moderate / technical]
Current Workaround: [What do they do today?]
```

If there are multiple user types, rank them. The brief must optimize for ONE primary user. List secondary users separately and note that their needs are secondary.

---

**4. GOALS & SUCCESS METRICS**

For each goal, pair it with a measurable success metric.

| Goal | Success Metric | Timeframe |
|---|---|---|
| [Goal 1] | [Specific, measurable] | [By when] |
| [Goal 2] | [Specific, measurable] | [By when] |

Rules:
- No vanity metrics ("100k signups") unless paired with engagement metrics
- At least one metric must be behavioral (not self-reported)
- If you can't define a measurable metric, the goal is not real — flag it

---

**5. SCOPE: IN vs OUT**

**IN SCOPE (v1)**
- [Feature / capability 1]
- [Feature / capability 2]
- ...

**OUT OF SCOPE (explicitly)**
- [Thing that sounds related but is deferred]
- [Thing users will ask for that you're saying no to]
- ...

The out-of-scope section is not optional. Every PRD without explicit non-goals becomes scope creep.

---

**6. USER STORIES / KEY FLOWS**

Write 3–6 user stories in the format:

> As a [specific user], when [context/trigger], I want to [action], so that [outcome].

Then for the top 1–2 stories, expand into a step-by-step user flow (numbered list, plain language, no UI jargon).

---

**7. FUNCTIONAL REQUIREMENTS**

List what the product must do. Organize by feature area. Use MoSCoW:
- **Must have**: Launch blocker if missing
- **Should have**: Important but not launch blocker
- **Could have**: Nice-to-have, deprioritize under time pressure
- **Won't have (v1)**: Explicitly off the table

---

**8. NON-FUNCTIONAL REQUIREMENTS**

Address only the ones relevant to this product:
- Performance: (e.g., "Page load < 2s on 4G connection")
- Security / Privacy: (e.g., "No PII stored without consent")
- Accessibility: (e.g., "WCAG 2.1 AA compliance")
- Scale: (e.g., "Must support 1,000 concurrent users at launch")
- Platform: (e.g., "Web-first, mobile responsive")

---

**9. OPEN QUESTIONS**

List every assumption that, if wrong, would break the plan. Format:

| Question | Owner | Status |
|---|---|---|
| [Assumption to validate] | [Who resolves it] | Open / In Progress / Resolved |

---

**10. DEPENDENCIES & RISKS**

```
Dependencies:
- [External API, team, or resource this requires]

Risks:
- [Risk]: [Mitigation]
```

At least 2 risks. If the founder says "there are no risks", push back.

---

## Output Format
- Full PRD as a structured document (use headers, tables, bullet lists)
- Offer to export as markdown or docx if the user wants a file
- After the PRD, add a one-line summary: "The one thing this brief must get right is: [X]"

## Anti-Patterns to Avoid
- Do NOT fill in vague placeholder success metrics ("increase user satisfaction")
- Do NOT skip open questions to make the brief look more finished
- Do NOT include a feature in both In Scope and "could have" — pick a lane
- Do NOT write the problem statement from the founder's perspective — write it from the user's
