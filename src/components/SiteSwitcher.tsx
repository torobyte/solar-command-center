import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown, Check, Star, List } from "lucide-react";
import { toast } from "sonner";

export const DEFAULT_SITE_KEY = "default.site.id.v1";
export const SKIP_DEFAULT_REDIRECT_KEY = "skip.default.site.redirect";

interface MiniSite { id: string; name: string }

export function SiteSwitcher({ currentSiteId }: { currentSiteId: string }) {
  const [sites, setSites] = useState<MiniSite[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setDefaultId(localStorage.getItem(DEFAULT_SITE_KEY));
    }
    supabase
      .from("sites")
      .select("id,name")
      .order("name", { ascending: true })
      .then(({ data }) => setSites((data ?? []) as MiniSite[]));
  }, []);

  const current = sites.find((s) => s.id === currentSiteId);

  function setAsDefault() {
    localStorage.setItem(DEFAULT_SITE_KEY, currentSiteId);
    setDefaultId(currentSiteId);
    toast.success("Sitio predeterminado actualizado");
  }
  function clearDefault() {
    localStorage.removeItem(DEFAULT_SITE_KEY);
    setDefaultId(null);
    toast.success("Sitio predeterminado eliminado");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl gap-2 shrink-0">
          <span className="truncate max-w-[140px]">{current?.name ?? "Cambiar sitio"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Tus sitios</span>
          {defaultId === currentSiteId ? (
            <button onClick={clearDefault} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> Predeterminado
            </button>
          ) : (
            <button onClick={setAsDefault} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Star className="h-3 w-3" /> Marcar predeterminado
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-72 overflow-y-auto">
          {sites.map((s) => {
            const isCurrent = s.id === currentSiteId;
            const isDefault = s.id === defaultId;
            return (
              <DropdownMenuItem
                key={s.id}
                onSelect={() => { if (!isCurrent) navigate({ to: "/sites/$siteId", params: { siteId: s.id } }); }}
                className="flex items-center gap-2"
              >
                {isCurrent ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="h-3.5 w-3.5" />}
                <span className="flex-1 truncate">{s.name}</span>
                {isDefault && <Star className="h-3 w-3 fill-amber-400 text-amber-500" />}
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/app"
            search={{ list: "1" } as never}
            onClick={() => { try { sessionStorage.setItem(SKIP_DEFAULT_REDIRECT_KEY, "1"); } catch { /* ignore */ } }}
            className="flex items-center gap-2"
          >
            <List className="h-3.5 w-3.5" /> Ver todos los sitios
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
