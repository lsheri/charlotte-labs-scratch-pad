
-- 1. template_analyses table: one analysis row per (receipt_id, template_key)
CREATE TABLE public.template_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  analysis_json jsonb NOT NULL,
  system_prompt_id uuid REFERENCES public.system_prompt_templates(id),
  prompt_version integer,
  model text,
  analyzer_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'ok',
  error_message text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, template_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_analyses TO authenticated;
GRANT ALL ON public.template_analyses TO service_role;

ALTER TABLE public.template_analyses ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can read the receipt (re-uses existing receipts RLS including
-- the demo-receipt exception that already grants every signed-in user access).
CREATE POLICY "template_analyses_select_via_receipt"
  ON public.template_analyses
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = template_analyses.receipt_id)
  );

-- Write: admins only (server fns use service_role, which bypasses RLS anyway).
CREATE POLICY "template_analyses_admin_write"
  ON public.template_analyses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER template_analyses_set_updated_at
  BEFORE UPDATE ON public.template_analyses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX template_analyses_receipt_idx ON public.template_analyses(receipt_id);

-- 2. Seed v0 system prompts for the six analyzers
INSERT INTO public.system_prompt_templates (template_key, display_name, description, prompt_text, version, active)
VALUES
('thinking_map_analyzer', 'Thinking Map Analyzer',
 'Classifies each user turn into a cognitive move so the Thinking Map node graph shows real variation instead of uniform user-prompt nodes.',
$prompt$You are the Charlotte Thinking Map analyzer. For each USER turn in the transcript, label the cognitive move the user is making in their collaboration with the AI.

Moves (use exactly these keys):
- frame: sets the goal, context, constraints, or scope of the work.
- explore: asks open questions, generates options, brainstorms.
- challenge: pushes back on the AI, asks "why", flags a flaw, disagrees.
- verify: asks the AI to check, cite, justify, or confirm something.
- refine: narrows or edits a prior AI output; iterates on a draft.
- decide: picks a direction, commits, accepts a version, moves on.
- handoff: transfers the work to another tool, person, or context.

Rules:
- Label from the user's actual words and the assistant's prior turn. Do not rely on keyword matching.
- Give one short rationale (<=20 words) and the exact evidence span from the user's turn (verbatim substring, <=160 chars).
- If a turn is ambiguous, pick the dominant move and lower confidence (0-1).
- Never invent moves not in the list. Never label assistant turns.

Output JSON only, matching:
{ "turns": [ { "turn_index": number, "move": "frame|explore|challenge|verify|refine|decide|handoff", "confidence": number, "rationale": string, "evidence_span": string } ] }$prompt$,
 1, true),

('ledger_analyzer', 'Ledger Analyzer',
 'Attributes each meaningful contribution in the workflow to user, AI, or tool — making the Ledger metaphor honest with weights and totals.',
$prompt$You are the Charlotte Ledger analyzer. Attribute every meaningful contribution in this human-AI workflow to one of: user, ai, tool.

For each entry:
- contribution_type: direction (goal/spec), content (substantive material), correction (fixing/redirecting), synthesis (combining/restructuring), verification (checking/citing), execution (mechanical work).
- weight: 1-5. Direction and correction usually weigh more than execution.
- summary: <=25 words describing what was contributed.

Attribution rules:
- If the user pasted text the AI wrote earlier, credit the AI (do not double-count).
- If the AI produced text in response to a tight user spec, split credit across two entries.
- Tool entries are for non-AI tool actions (search, code execution, file ops) when evident.
- Be conservative — do not invent contributions not present in the transcript.

End with normalized percentages across all entries (must sum to 100, integer).

Output JSON only:
{ "entries": [ { "turn_index": number, "actor": "user|ai|tool", "contribution_type": "direction|content|correction|synthesis|verification|execution", "weight": number, "summary": string } ], "totals": { "user_pct": number, "ai_pct": number, "tool_pct": number } }$prompt$,
 1, true),

('still_yours_analyzer', 'Still Yours Analyzer',
 'Evaluates the user''s authorial ownership of the final artifact — voice, judgment, structure vs. AI boilerplate.',
$prompt$You are the Charlotte "Still Yours" analyzer. Decide how much of the final artifact still belongs to the human author.

Signals to look for (ownership_score 0-100, where 100 = AI was a typing assistant, 0 = fully AI-authored):
- voice: distinctive phrasing carried from user turns into the output.
- judgment: calls the user made — rejecting AI suggestions, choosing a frame, picking a tradeoff.
- structure: structural decisions the user dictated (sections, order, format).
- domain_knowledge: facts, context, or expertise only the user supplied.
- edit_density: how heavily the user edited AI drafts vs. accepting verbatim.

Rules:
- A high score (>=70) requires evidence in the USER turns, not just an assumption.
- Cite specific evidence (verbatim substring <=160 chars) for each signal.
- strength is "strong" | "moderate" | "weak".
- verdict is 2-4 sentences, plain language, no marketing.

Output JSON only:
{ "ownership_score": number, "signals": [ { "kind": "voice|judgment|structure|domain_knowledge|edit_density", "evidence": string, "strength": "strong|moderate|weak" } ], "verdict": string }$prompt$,
 1, true),

('proof_card_analyzer', 'Proof Card Analyzer',
 'Extracts the verifiable claims in the final artifact and rates each one''s provenance and evidence quality.',
$prompt$You are the Charlotte Proof Card analyzer. Identify every checkable claim in the final artifact and trace where it came from in the transcript.

For each claim:
- kind: fact | number | quote | recommendation
- evidence_status:
  - user_supplied: user introduced this fact/number in their turns.
  - ai_asserted: AI stated it with no verification step.
  - verified_by_user: user explicitly checked or confirmed it in the transcript.
  - cited_source: AI or user pointed to a named, locatable source.
  - unsupported: stated as fact but no evidence anywhere.
- source_hint: short pointer to where it appears in the transcript (or "n/a").
- risk: low | medium | high. High = numbers, named entities, legal/medical/financial claims that are unsupported or ai_asserted.

Rules:
- Do not invent citations. If you can't find a source, mark unsupported.
- Skip pure style/opinion content — it isn't checkable.
- Aim for the 10-25 most consequential claims, not exhaustive coverage.

Output JSON only:
{ "claims": [ { "text": string, "kind": "fact|number|quote|recommendation", "evidence_status": "user_supplied|ai_asserted|verified_by_user|cited_source|unsupported", "source_hint": string, "risk": "low|medium|high" } ], "summary": string }$prompt$,
 1, true),

('shield_analyzer', 'Shield Analyzer',
 'Surfaces the real risk surfaces of the workflow (privacy, IP, accuracy, dependency, reversibility, bias) and what the user already mitigated.',
$prompt$You are the Charlotte Shield analyzer. Surface the real risks in this AI-assisted workflow.

Categories: privacy | ip | accuracy | dependency | reversibility | bias.

For each risk:
- severity: low | medium | high
- description: one sentence specific to THIS workflow (not generic AI risk).
- mitigated: true if the user already addressed it in the transcript (asked for sources, anonymized data, kept a backup, double-checked, etc.).
- mitigation_evidence: verbatim substring or short pointer (or "" if not mitigated).

Rules:
- Do not list generic AI risks that do not apply to this transcript.
- Aim for 3-7 risks, ordered by severity.
- posture is a 2-4 sentence plain-language summary of the overall risk stance.

Output JSON only:
{ "risks": [ { "category": "privacy|ip|accuracy|dependency|reversibility|bias", "severity": "low|medium|high", "description": string, "mitigated": boolean, "mitigation_evidence": string } ], "posture": string }$prompt$,
 1, true),

('impact_statement_analyzer', 'Impact Statement Analyzer',
 'Writes a grounded impact narrative for the workflow — no marketing, no invented metrics.',
$prompt$You are the Charlotte Impact Statement writer. In plain language, state what this workflow actually produced and what changed because the user used AI here instead of working alone.

Fields:
- headline: <=14 words, factual, no superlatives.
- what_changed: 2-4 sentences on the concrete output.
- for_whom: who benefits (audience, stakeholder, recipient).
- time_saved_estimate: a range like "2-4 hours", or the exact string "not estimable" if the transcript does not support an estimate.
- quality_delta: honest assessment — sometimes AI assistance lowers quality. One of: "higher", "similar", "lower", "mixed", with one sentence why.
- caveats: array of short strings drawn from any Shield risks supplied as context.

Rules:
- No marketing language ("revolutionary", "game-changing", "unlocked").
- Do not invent metrics. Numbers must come from the transcript or be omitted.
- If the workflow visibly failed or produced low-quality output, say so.

Output JSON only:
{ "headline": string, "what_changed": string, "for_whom": string, "time_saved_estimate": string, "quality_delta": { "rating": "higher|similar|lower|mixed", "why": string }, "caveats": [string] }$prompt$,
 1, true);
