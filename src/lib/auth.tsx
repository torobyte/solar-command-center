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
  const [role, setRole] = useState<Role | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let currentUserId: string | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      const nextUserId = s?.user?.id ?? null;
      if (nextUserId === currentUserId) return; // ignore TOKEN_REFRESHED / same-user events
      currentUserId = nextUserId;
      if (nextUserId) {
        setRoleLoading(true);
        setTimeout(() => fetchRole(nextUserId), 0);
      } else {
        setRole(null);
        setRoleLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      currentUserId = data.session?.user?.id ?? null;
      if (data.session?.user) {
        fetchRole(data.session.user.id);
      } else {
        setRoleLoading(false);
      }
      setAuthLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (data?.some((r) => r.role === "superadmin")) setRole("superadmin");
      else setRole("user");
    } finally {
      setRoleLoading(false);
    }
  }

  return (
    <Ctx.Provider value={{
      user: session?.user ?? null,
      session, role,
      loading: authLoading || (!!session?.user && roleLoading),
      signOut: async () => { await supabase.auth.signOut(); },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
