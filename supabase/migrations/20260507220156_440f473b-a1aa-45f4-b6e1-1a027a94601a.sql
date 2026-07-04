ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz;