UPDATE public.system_prompt_templates
SET prompt_text = replace(
  prompt_text,
  '--- DIMENSION_REGISTRY ---',
  E'--- SUMMARY FIELD INSTRUCTIONS ---\n\n'
  || E'The summary field is free prose, 3–5 sentences. Write it in second person ("you").\n\n'
  || E'Structure it as follows:\n\n'
  || E'  Sentence 1: What the student was trying to accomplish in this conversation.\n\n'
  || E'  Sentence 2: The dimension where their behavior was strongest, with a one-clause reason grounded in the transcript.\n\n'
  || E'  Sentence 3: The dimension where evidence was thinnest or confidence was lowest, stated neutrally — not as a failure, as an observation.\n\n'
  || E'  Sentence 4 (optional): One specific behavior pattern observed that is worth naming — something the student actually did, not generic advice.\n\n'
  || E'  Final sentence: The overall_level in plain language. e.g. "Across this session, your collaboration sits at the Developing level."\n\n'
  || E'Rules: No rubric jargon beyond the dimension names. No scores in the summary (scores are in the structured fields). No praise or blame. Warm and direct.\n\n'
  || E'The privacy_note field should be 1 sentence, plain language, naming what data was used and confirming no personal information is stored in the receipt. e.g. "This receipt was scored from your conversation transcript; no personally identifying information is stored in this analysis."\n\n'
  || E'--- DIMENSION_REGISTRY ---'
),
updated_at = now()
WHERE template_key = 'fluency_analyzer';