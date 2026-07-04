DROP POLICY IF EXISTS "public read shared proof receipt" ON public.receipts;
REVOKE SELECT ON public.receipts FROM anon;