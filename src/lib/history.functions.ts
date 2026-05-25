import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Reset histórico de consumos para un sitio. Borra telemetry_samples y
 * daily_totals (opcionalmente acotado por rango de fechas). Sólo el
 * propietario del sitio puede ejecutarlo.
 */
export const resetSiteHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      site_id: z.string().uuid(),
      from: z.string().optional(), // YYYY-MM-DD
      to: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // Verifica que el usuario sea owner del sitio (RLS via has_site_access).
    const { data: site, error: e1 } = await supabase
      .from("sites").select("id,owner_id").eq("id", data.site_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!site || site.owner_id !== userId) throw new Error("No autorizado");

    const fromDate = data.from ?? "1970-01-01";
    const toDate = data.to ?? "2999-12-31";
    const fromTs = `${fromDate}T00:00:00.000Z`;
    const toTs = `${toDate}T23:59:59.999Z`;

    const [t, d] = await Promise.all([
      supabase.from("telemetry_samples").delete()
        .eq("site_id", data.site_id).gte("recorded_at", fromTs).lte("recorded_at", toTs),
      supabase.from("daily_totals").delete()
        .eq("site_id", data.site_id).gte("day", fromDate).lte("day", toDate),
    ]);
    if (t.error) throw new Error(t.error.message);
    if (d.error) throw new Error(d.error.message);
    return { ok: true };
  });
