import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  const bootstrappedRef = useRef(false);

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
        // Timeout corto: si Supabase no responde (cloud caído / offline)
        // degradamos a "user" en vez de bloquear la UI indefinidamente.
        const rolePromise = supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", nextUser.id);
        const timeout = new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error("role-timeout") }), 4000),
        );
        const { data, error } = (await Promise.race([rolePromise, timeout])) as { data: { role: string }[] | null; error: Error | null };
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
        // getSession internamente puede intentar refrescar contra la red;
        // timeout para no bloquear el modo offline (/local).
        const sessionPromise = supabase.auth.getSession();
        const timeout = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 3500),
        );
        const { data } = (await Promise.race([sessionPromise, timeout])) as { data: { session: Session | null } };
        if (!active) return;
        if (data.session) {
          await applySession(data.session);
        } else {
          const restored = await tryRestoreFromNativeBridge();
          await applySession(restored);
        }
      } finally {
        if (active) {
          setAuthLoading(false);
          bootstrappedRef.current = true;
        }
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      // Si la sesión se pierde por expiración / fallo de refresh, no dejamos
      // al usuario fuera: intentamos restaurar desde el bridge nativo antes
      // de reportar SIGNED_OUT al resto de la app.
      if ((event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") && !nextSession && !userInitiatedSignOut) {
        void (async () => {
          const restored = await tryRestoreFromNativeBridge();
          await applySession(restored ?? null);
          if (active) {
            setAuthLoading(false);
            bootstrappedRef.current = true;
          }
        })();
        return;
      }
      // TOKEN_REFRESHED con sesión válida ocurre al volver al tab (Supabase
      // auto-refresca el access token). NO re-disparamos applySession ni
      // volvemos a poner la UI en "loading" — eso hace que toda la app
      // parpadee y se vuelva a montar al cambiar de pestaña/app. Sólo
      // actualizamos la sesión silenciosamente; el user y el rol no cambian.
      if (event === "TOKEN_REFRESHED" && nextSession) {
        setSession(nextSession);
        setUser(nextSession.user ?? null);
        return;
      }
      if (event === "SIGNED_OUT") userInitiatedSignOut = false;
      const shouldBlockUi = !bootstrappedRef.current;
      if (shouldBlockUi) setAuthLoading(true);
      void applySession(nextSession).finally(() => {
        if (active) {
          if (shouldBlockUi) setAuthLoading(false);
          bootstrappedRef.current = true;
        }
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
