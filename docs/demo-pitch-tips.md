# Demo & Pitch Tips — from the conversation with Michael (Tefula)

Notes for the pitch after talking with Michael about the demo. He uses skills himself,
so he already *gets* the problem — the bar is making it land fast and feel exciting. The
big through-line: **frame the product as an enabler, not a defensive tool.**

## 1. Reframe: defensive → enabler (the #1 note)

Don't lead with "we protect against prompt injection." Lead with the **velocity it unlocks**.

- His framing, roughly: *"If I don't have to worry about security, how much faster can I
  go? I can have a hundred skills running and not care about prompt injection — this just
  frees me up. That's when people get excited."*
- He noted that security / governance startups always pitch *"we need to protect, we need
  to protect"* — but to a customer that's an obscure, hard sell. The stronger angle:
  **what does removing the worry ENABLE?** → install more skills fearlessly, move faster,
  save time.
- Back foot (defensive) vs front foot (opportunity) — **be on the front foot.** Bring the
  opportunity to life and get people excited about it.

## 2. Show the knock-on effect — make the stakes visceral

He pushed on *why it matters*, beyond "injection = bad":

- "What's the knock-on effect of a prompt injection in a skill? Are there *other* knock-on
  effects? Why does that matter?"
- His example: imagine an injected skill quietly reroutes your payment transactions to a
  malicious endpoint → time lost unwinding it → **bank account drained → nightmare.**
- Takeaway: in the demo, don't just show a flagged string — show the **cascading
  real-world damage** an injected skill would cause, *then* the relief of it being caught.

## 3. Clarity — distill to the essence

- Clarity of the problem is a primary success factor for a short demo. **Distill it to the
  essence.**
- One crisp, agent-user-framed problem sentence. He understands it because he uses skills;
  make sure *anyone* does, in one line.

## 4. What he's judging

- **Speed** — what you built in 7 hours, given everyone has coding agents (how ambitious).
- **Demo quality** — compressed, but still polished and whole.
- **Problem / opportunity clarity.**

## 5. Format & logistics

- **3 min demo + 2 min Q&A.**
- He very likely **won't ask questions unless something's burning** → the 3-minute demo has
  to **fully stand on its own**; don't rely on Q&A to fill gaps.
- Follow-up at **4:00**.

## 6. Concrete demo implications (proposed)

1. **Open on the opportunity:** "Run 100 community skills fearlessly and ship faster" →
   then reveal the gate is what makes that safe. Security as the *unlock*, not the brake.
2. **Nightmare → relief beat (live):** point the gate at a real skills repo
   (`github.com/jenz-ai/agent-skills`) → a skill that exfiltrates creds / injects the agent
   gets **blocked (403)**; the legit ones flow through. Name the damage it *would* have
   done, then show the green path.
3. **One-sentence problem:** "Every skill you install is unreviewed code + prompts running
   inside your agent — we audit them and only let the safe ones through."
4. **Self-contained 3-min run** — no dependence on Q&A.

---
*Engine-side proof points already verified for the demo: benign → `safe`, malicious →
`malicious` + findings + OWASP/MITRE crosswalk, and the gate returns `403` (no files) on
anything not `safe`. A real external repo audits 8/8 correctly — including a skill that
tries to prompt-inject the auditor itself, which is still blocked (the host computes the
verdict on evidence, so the skill can't talk its way past the gate).*
