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
  /** UUID of the role assigned to this user (roles.id), if any. */
  roleId: string | null;
  /** Permission keys this user has via their role. Owners are treated as having all. */
  permissions: string[];
  tenantId: string | null;
  branchIds: string[];
  tenant: Tenant | null;
  loading: boolean;
  /** Convenience — true if the user has the given permission key, or is owner. */
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  roleId: null,
  permissions: [],
  tenantId: null,
  branchIds: [],
  tenant: null,
  loading: true,
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  async function loadUserData(currentUser: User) {
    try {
      // Fetch tenant membership (role + branch_ids + role_id)
      const { data: member } = await supabase
        .from("tenant_members")
        .select("role, role_id, tenant_id, branch_ids")
        .eq("user_id", currentUser.id)
        .single();

      if (member) {
        const memberRoleId =
          (member as unknown as { role_id?: string | null }).role_id ?? null;
        setRole(member.role as UserRole);
        setRoleId(memberRoleId);
        setTenantId(member.tenant_id);
        setBranchIds(member.branch_ids ?? []);

        // Fetch tenant details + this role's permission keys in parallel.
        const [{ data: tenantData }, grants] = await Promise.all([
          supabase.from("tenants").select("*").eq("id", member.tenant_id).single(),
          memberRoleId
            ? supabase
                .from("role_permissions")
                .select("permission_key")
                .eq("role_id", memberRoleId)
            : Promise.resolve({ data: [] as { permission_key: string }[] }),
        ]);

        setTenant(tenantData);
        setPermissions(
          (grants.data ?? []).map(
            (g) => (g as { permission_key: string }).permission_key
          )
        );
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
        setRoleId(null);
        setPermissions([]);
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

  const hasPermission = (key: string): boolean => {
    // Owners always pass — mirrors the SQL has_permission() behaviour.
    if (role === "owner") return true;
    return permissions.includes(key) || permissions.includes("tenant.admin");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        roleId,
        permissions,
        tenantId,
        branchIds,
        tenant,
        loading,
        hasPermission,
      }}
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
