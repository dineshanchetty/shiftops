import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/auth-context";

const roleConfig: Record<
  UserRole,
  { label: string; className: string }
> = {
  owner: {
    label: "Owner",
    className: "bg-purple-100 text-purple-800",
  },
  manager: {
    label: "Manager",
    className: "bg-blue-100 text-blue-800",
  },
  staff: {
    label: "Staff",
    className: "bg-gray-100 text-gray-800",
  },
};

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const config = roleConfig[role];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
