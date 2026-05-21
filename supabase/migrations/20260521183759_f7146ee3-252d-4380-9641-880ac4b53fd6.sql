CREATE OR REPLACE FUNCTION public.transfer_license_to_site(_license uuid, _new_site uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owns_site boolean;
  _can_license boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.id = _new_site AND s.owner_id = _uid
  ) INTO _owns_site;
  IF NOT _owns_site THEN
    RAISE EXCEPTION 'You do not own the destination site';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.license_codes l
    WHERE l.id = _license
      AND (l.assigned_user_id = _uid OR l.owner_id = _uid)
      AND l.revoked_at IS NULL
  ) INTO _can_license;
  IF NOT _can_license THEN
    RAISE EXCEPTION 'License not found or not yours';
  END IF;

  UPDATE public.license_codes
  SET redeemed_by_site = _new_site,
      redeemed_at = COALESCE(redeemed_at, now())
  WHERE id = _license;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_license_to_site(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_license_to_site(uuid, uuid) TO authenticated;