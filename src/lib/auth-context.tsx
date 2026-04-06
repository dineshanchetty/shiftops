"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Tenant } from "@/lib/types";

export type UserRole = "owner" | "manager" | "staff";

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  tenantId: string | null;
  branchIds: string[];
  tenant: Tenant | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  tenantId: null,
  branchIds: [],
  tenant: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  async function loadUserData(currentUser: User) {
    try {
      // Fetch tenant membership (role + branch_ids)
      const { data: member } = await supabase
        .from("tenant_members")
        .select("role, tenant_id, branch_ids")
        .eq("user_id", currentUser.id)
        .single();

      if (member) {
        setRole(member.role as UserRole);
        setTenantId(member.tenant_id);
        setBranchIds(member.branch_ids ?? []);

        // Fetch tenant details
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("*")
          .eq("id", member.tenant_id)
          .single();

        setTenant(tenantData);
      }
    } catch (error) {
      console.error("Failed to load user data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial load
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (currentUser) {
        setUser(currentUser);
        loadUserData(currentUser);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        setLoading(true);
        loadUserData(currentUser);
      } else {
        setRole(null);
        setTenantId(null);
        setBranchIds([]);
        setTenant(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, role, tenantId, branchIds, tenant, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
