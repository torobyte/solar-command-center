INSERT INTO public.user_roles (user_id, role)
SELECT id, 'superadmin'::app_role FROM auth.users WHERE email = 'brian@torobyte.com'
ON CONFLICT (user_id, role) DO NOTHING;