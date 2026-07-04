-- Allow a user to insert ONLY their own 'participant' role (default on signup)
CREATE POLICY "Users self-assign participant role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND role = 'participant'::app_role
);

-- Admins can insert any role for any user
CREATE POLICY "Admins insert any role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can update any role
CREATE POLICY "Admins update any role"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete any role
CREATE POLICY "Admins delete any role"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed liam@charlotte-labs.com as admin (also gives researcher + participant via grant_admin_role)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'liam@charlotte-labs.com') THEN
    PERFORM public.grant_admin_role('liam@charlotte-labs.com');
  END IF;
END $$;