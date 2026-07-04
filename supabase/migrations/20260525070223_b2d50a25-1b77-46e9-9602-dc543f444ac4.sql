DELETE FROM public.receipt_recommendations_cache
WHERE payload->>'priority_rationale' ILIKE 'Fallback%';