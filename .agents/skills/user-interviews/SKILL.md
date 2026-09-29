---
name: user-interviews
description: Generate user interview scripts and analyze feedback.
---
# SKILL: /user-interviews

## Trigger
Use when the user says `/user-interviews`, "help me talk to users", "draft interview questions", "Mom Test script", or wants to analyze user feedback they've collected.

## Purpose
Generate structured user interview scripts based on the Mom Test framework, and/or analyze raw interview notes to extract signal from noise. The goal is to prevent the founder from collecting false positives.

---

## Two Modes

### MODE A — Generate Interview Script
Triggered when the user wants to prepare for interviews.

### MODE B — Analyze Interview Notes
Triggered when the user pastes raw notes or transcripts from interviews they've already done.

---

## MODE A: Generate Interview Script

### Step 1 — Clarify Context
Ask (all at once):
- What hypothesis are you testing? (One sentence: "I believe [user] struggles with [problem] and would pay for [solution]")
- Who specifically are you interviewing? (Role, company size, context)
- What's the riskiest assumption you're making about this user?

### Step 2 — Generate the Script

Output a script with this exact structure:

**OPENING (2 min)**
Set context, make it about them, not your idea. Example:
> "I'm trying to understand how [target user] handles [domain]. I'm not pitching anything — I just want to learn about your experience. Mind if I ask a few questions?"

**PAST BEHAVIOR QUESTIONS (10 min)**
5–7 questions about what they have actually done, not what they would hypothetically do.

Rules (enforce these):
- Every question must be about the past, not the future ("Tell me about the last time..." not "Would you ever...")
- Never mention your solution
- Never ask "Would you use X?" — it's meaningless
- Avoid leading questions ("Don't you find it annoying when...")

Example questions (adapt to context):
1. Tell me about the last time you had to deal with [problem area]. What happened?
2. How did you handle it? Walk me through exactly what you did.
3. What tools or workarounds did you use? Why those?
4. What was the most frustrating part of that process?
5. Have you ever paid for something to solve this? What was it? Did it work?
6. Who else was involved in that decision?

**DIGGING QUESTIONS (5 min)**
Follow-up probes — use these when an answer is vague:
- "Can you tell me more about that?"
- "What did that cost you — in time, money, or frustration?"
- "What did you do right after that happened?"
- "Has this happened more than once? How often?"

**CLOSING (3 min)**
> "Is there anything about this topic I didn't ask that you think is important?"
> "Do you know anyone else who deals with this problem heavily? Could you intro me?"

**WHAT NOT TO DO (include as a reminder card)**
- ❌ Don't pitch your idea mid-interview
- ❌ Don't ask "would you pay for this?"
- ❌ Don't rescue a bad answer by re-asking it differently
- ❌ Don't interpret silence as agreement

---

## MODE B: Analyze Interview Notes

### Step 1 — Intake
Ask the user to paste their raw notes or summary from each interview (one block per person is fine).

### Step 2 — Classify Each Signal

For every interview, tag each piece of feedback:

| Signal Type | Definition |
|---|---|
| 🟢 **Hard Signal** | Described a specific past behavior, showed money/time spent, or made an unsolicited concrete commitment |
| 🟡 **Soft Signal** | Expressed interest, said "that sounds useful", agreed when asked — but no evidence of action |
| 🔴 **False Positive** | Compliment on the idea, vague future intent ("I'd probably use that"), politeness masking disinterest |

### Step 3 — Cross-Interview Pattern Report

After analyzing all notes, output:

**HARD SIGNALS ACROSS ALL INTERVIEWS**
List only the green signals. Quote directly where possible.

**PATTERNS**
What themes appear in 3+ interviews? These are the real problems.

**WHAT TO IGNORE**
List the soft and false positives explicitly. Name them. Don't let the founder carry these forward.

**HYPOTHESIS STATUS**
- Confirmed / Partially Confirmed / Invalidated — with a one-line reason.

**NEXT STEP**
One specific action: what to test next, or what interview question to add.

---

## Output Rules
- Never say "this is a good sign" about a soft signal — it's not
- Always separate Hard from Soft — mixing them is how founders fool themselves
- If all signals are soft, say: "You have zero hard validation. Do not build yet."
- Be specific about what counts as real validation in this context
