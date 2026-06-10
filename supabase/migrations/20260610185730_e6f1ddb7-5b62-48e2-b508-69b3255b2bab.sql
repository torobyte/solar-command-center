
DROP POLICY IF EXISTS rules_insert_own ON public.notification_rules;
CREATE POLICY rules_insert_own ON public.notification_rules FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
      OR public.is_site_member(site_id, auth.uid(), 'admin'::public.site_member_role)
    )
  );

DROP POLICY IF EXISTS rules_update_own ON public.notification_rules;
CREATE POLICY rules_update_own ON public.notification_rules FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
    OR public.is_site_member(site_id, auth.uid(), 'admin'::public.site_member_role)
  );

DROP POLICY IF EXISTS rules_delete_own ON public.notification_rules;
CREATE POLICY rules_delete_own ON public.notification_rules FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
    OR public.is_site_member(site_id, auth.uid(), 'admin'::public.site_member_role)
  );
