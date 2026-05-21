import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TransferInput = z.object({
  license_id: z.string().uuid(),
  new_site_id: z.string().uuid(),
});

export const transferLicenseToSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TransferInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { error } = await supabase.rpc("transfer_license_to_site", {
      _license: data.license_id,
      _new_site: data.new_site_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
