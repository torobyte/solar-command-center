import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "superadmin" | "user";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, role: null, loading: true, signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let userInitiatedSignOut = false;

    const tryRestoreFromNativeBridge = async (): Promise<Session | null> => {
      if (typeof window === "undefined") return null;
      const bridge = (window as unknown as {
        SolarWidgetBridge?: {
          getSavedSession?: () => string;
          isNativeApp?: () => string;
        };
      }).SolarWidgetBridge;
      if (!bridge?.getSavedSession) return null;
      try {
        const raw = bridge.getSavedSession();
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
        if (!parsed.access_token || !parsed.refresh_token) return null;
        const { data, error } = await supabase.auth.setSession({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        });
        if (error) return null;
        return data.session;
      } catch {
        return null;
      }
    };

    const applySession = async (nextSession: Session | null) => {
      if (!active) return;

      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setRole(null);
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", nextUser.id);
        if (!active) return;
        if (error) throw error;
        if (data?.some((r) => r.role === "superadmin")) setRole("superadmin");
        else setRole("user");
      } catch {
        if (active) setRole("user");
      } finally {
        if (active) setRoleLoading(false);
      }
    };

    const initialize = async () => {
      setAuthLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          await applySession(data.session);
        } else {
          // Sin sesión: si estamos dentro de la APK, intenta revalidar desde el bridge nativo.
          const restored = await tryRestoreFromNativeBridge();
          await applySession(restored);
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      // Si la sesión se pierde por expiración / fallo de refresh, no dejamos
      // al usuario fuera: intentamos restaurar desde el bridge nativo antes
      // de reportar SIGNED_OUT al resto de la app.
      if ((event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") && !nextSession && !userInitiatedSignOut) {
        setAuthLoading(true);
        void (async () => {
          const restored = await tryRestoreFromNativeBridge();
          await applySession(restored ?? null);
          if (active) setAuthLoading(false);
        })();
        return;
      }
      if (event === "SIGNED_OUT") userInitiatedSignOut = false;
      setAuthLoading(true);
      void applySession(nextSession).finally(() => {
        if (active) setAuthLoading(false);
      });
    });

    void initialize();

    // Marcador para que las próximas señales SIGNED_OUT se consideren
    // intencionadas por el usuario.
    (window as unknown as { __markUserSignOut?: () => void }).__markUserSignOut = () => {
      userInitiatedSignOut = true;
    };

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider value={{
      user,
      session, role,
      loading: authLoading || (!!user && roleLoading),
      signOut: async () => {
        try {
          (window as unknown as { __markUserSignOut?: () => void }).__markUserSignOut?.();
        } catch {}
        await supabase.auth.signOut();
      },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
