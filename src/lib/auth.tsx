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

    const syncAuthState = async () => {
      setAuthLoading(true);

      try {
        const { data: userData, error } = await supabase.auth.getUser();
        if (!active) return;

        if (error || !userData.user) {
          setSession(null);
          setUser(null);
          setRole(null);
          setRoleLoading(false);
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!active) return;

        setSession(sessionData.session);
        setUser(userData.user);
        setRoleLoading(true);
        setTimeout(() => fetchRole(userData.user.id), 0);
      } finally {
        if (active) setAuthLoading(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void syncAuthState();
    });

    void syncAuthState();

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      if (data?.some((r) => r.role === "superadmin")) setRole("superadmin");
      else setRole("user");
    } catch {
      setRole("user");
    } finally {
      setRoleLoading(false);
    }
  }

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
