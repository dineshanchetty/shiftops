import type { UserRole } from "@/lib/auth-context";

/**
 * Check whether a user with the given role can access a specific branch.
 *
 * - Owner: always has access to all branches.
 * - Manager: has access only to branches listed in their branch_ids array.
 * - Staff: has access only to branches listed in their branch_ids array.
 */
export function canAccessBranch(
  role: UserRole | null,
  branchIds: string[],
  branchId: string
): boolean {
  if (!role) return false;
  if (role === "owner") return true;
  return branchIds.includes(branchId);
}
