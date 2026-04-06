/**
 * Route-to-role permission mapping.
 *
 * Exact paths are checked first, then wildcard patterns (ending with /*).
 */
export const PAGE_PERMISSIONS: Record<string, string[]> = {
  "/app": ["owner", "manager", "staff"],
  "/app/roster": ["owner", "manager", "staff"],
  "/app/cashup": ["owner", "manager"],
  "/app/aura-upload": ["owner", "manager"],
  "/app/reports": ["owner", "manager"],
  "/app/reports/*": ["owner", "manager"],
  "/app/staff": ["owner", "manager"],
  "/app/settings": ["owner"],
  "/app/settings/branches": ["owner"],
  "/app/settings/branches/*": ["owner"],
  "/app/settings/aura-mapping": ["owner"],
  "/app/settings/billing": ["owner"],
};

/**
 * Given a pathname, return the list of roles allowed to access it.
 * Returns an empty array if no permission rule is defined (i.e. unrestricted).
 */
export function getRequiredRoles(pathname: string): string[] {
  // 1. Exact match
  if (PAGE_PERMISSIONS[pathname]) {
    return PAGE_PERMISSIONS[pathname];
  }

  // 2. Wildcard match — find the most specific wildcard pattern
  let bestMatch = "";
  let bestRoles: string[] = [];

  for (const [pattern, roles] of Object.entries(PAGE_PERMISSIONS)) {
    if (!pattern.endsWith("/*")) continue;

    const prefix = pattern.slice(0, -2); // Remove /*
    if (pathname.startsWith(prefix + "/") || pathname === prefix) {
      // Keep the longest (most specific) match
      if (prefix.length > bestMatch.length) {
        bestMatch = prefix;
        bestRoles = roles;
      }
    }
  }

  return bestRoles;
}
