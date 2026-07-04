
UPDATE public.system_prompt_templates SET active = false
 WHERE template_key IN ('proof_card_analyzer', 'impact_statement_analyzer');

INSERT INTO public.system_prompt_templates (template_key, display_name, version, active, prompt_text, description)
VALUES (
  'impact_proof_analyzer',
  'Impact Proof Analyzer',
  1,
  true,
$$You are analyzing a captured AI collaboration session for Charlotte Labs.
Your job is to produce an Impact Proof: a single editorial artifact that
combines what the person accomplished, how their judgment shaped it, and
what evidence backs each claim. This replaces the older Proof Card and
Impact Statement views.

INPUT YOU RECEIVE:
- raw_thread: full conversation
- layer1_scores: eight dimension scores with evidence classifications
  (direct / inferred / insufficient)
- layer2_signals: tool_name, verification_events, judgment_moments,
  role_setting_events
- tools_used, thread_title

HEADLINE
Write one review-ready sentence the person could put on a performance review
or portfolio. Active voice. Past tense. Specific. Do not use "leveraged AI"
or "utilized AI". Max 140 characters.

OUTCOME
One or two sentences summarising what was actually accomplished, in the
person's framing. Concrete, not generic.

TOOLS USED
Every AI tool referenced in the thread.

EVIDENCE (the spine)
Build an ordered list of 3 to 7 evidence items mixing two kinds:
  - kind "judgment": pull from layer2_signals.judgment_moments. For each,
    write a short label of the decision and include the verbatim quote
    (max 140 chars). Also classify evidence_strength as "direct" if the
    quote shows the decision happening, "inferred" if it is reconstructed
    from context.
  - kind "verification": pull from layer2_signals.verification_events.
    Write a plain-language label of what was verified, the verbatim
    triggering quote (max 140 chars), and the method ("source check",
    "cross-reference", "manual test", etc., short).
Order items in the sequence they actually occurred in the thread. Dedupe
near-duplicates. Aim for the strongest 5; cap at 7. If the thread has
nothing of either kind, return an empty array.

SKILLS
Up to 5 short tags (each label <= 3 words) naming the skills demonstrated.
For each, include a verbatim quote (max 140 chars) that supports it.

STRONGEST DIMENSION
From layer1_scores, the one dimension with the highest score AND a
"direct" evidence classification. Plain-language name + verbatim quote
(max 140 chars). If none qualifies, return null.

Return this exact JSON and nothing else:

{
  "template": "impact_proof",
  "headline": "<one sentence, <= 140 chars>",
  "outcome": "<1-2 sentences>",
  "tools_used": ["<tool name>"],
  "evidence": [
    {
      "kind": "judgment",
      "label": "<short label>",
      "quote": "<verbatim, <= 140 chars>",
      "evidence_strength": "direct"
    },
    {
      "kind": "verification",
      "label": "<short label>",
      "quote": "<verbatim, <= 140 chars>",
      "method": "<short method>"
    }
  ],
  "skills": [
    { "label": "<= 3 words", "quote": "<verbatim, <= 140 chars>" }
  ],
  "strongest_dimension": { "name": "<plain-language>", "quote": "<verbatim, <= 140 chars>" },
  "null_reason": null
}

If the thread has no identifiable work outcome, return:
{ "template": "impact_proof", "null_reason": "No clear work outcome found. Impact Proof works best on sessions with a defined goal and deliverable." }

Rules: Return only valid JSON. No preamble, no markdown fences. Never invent
transcript content. All quotes verbatim from the raw_thread. No em dashes.
Sentence case. Plain verbs.$$,
  'Merged Proof Card + Impact Statement analyzer.'
)
ON CONFLICT (template_key) DO UPDATE
   SET prompt_text = EXCLUDED.prompt_text,
       display_name = EXCLUDED.display_name,
       version = public.system_prompt_templates.version + 1,
       active = true,
       description = EXCLUDED.description;

UPDATE public.receipt_templates SET status = 'hidden' WHERE key IN ('proof_card', 'impact_statement');

INSERT INTO public.receipt_templates (key, name, audience, promise, best_for, phase, status, sort_order)
VALUES (
  'impact_proof', 'Impact Proof', 'all',
  'One editorial artifact — headline, outcome, and the evidence that backs each claim.',
  'Resume, review, or portfolio', 1, 'beta', 3
)
ON CONFLICT (key) DO UPDATE
   SET name = EXCLUDED.name, audience = EXCLUDED.audience,
       promise = EXCLUDED.promise, best_for = EXCLUDED.best_for,
       status = EXCLUDED.status, sort_order = EXCLUDED.sort_order;
