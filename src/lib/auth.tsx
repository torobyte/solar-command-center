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
        await applySession(data.session);
      } finally {
        if (active) setAuthLoading(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setAuthLoading(true);
      void applySession(nextSession).finally(() => {
        if (active) setAuthLoading(false);
      });
    });

    void initialize();

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
      signOut: async () => { await supabase.auth.signOut(); },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
