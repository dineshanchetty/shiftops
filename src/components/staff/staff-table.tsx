"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Pencil, UserX, ChevronUp, ChevronDown } from "lucide-react";
import type { Staff } from "@/lib/types";

// ─── Avatar colour palette ────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-pink-500",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffWithPosition = Staff & {
  position_name?: string | null;
  sub_position_name?: string | null;
};

interface StaffTableProps {
  staff: StaffWithPosition[];
  onRowClick: (s: StaffWithPosition) => void;
  onEdit: (s: StaffWithPosition) => void;
  onDeactivate: (s: StaffWithPosition) => void;
}

const PAGE_SIZE = 20;

// ─── Component ────────────────────────────────────────────────────────────────

export function StaffTable({
  staff,
  onRowClick,
  onEdit,
  onDeactivate,
}: StaffTableProps) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = [...staff];
    copy.sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      return sortDir === "asc"
        ? nameA.localeCompare(nameB)
        : nameB.localeCompare(nameA);
    });
    return copy;
  }, [staff, sortDir]);

  const pageCount = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort() {
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    setPage(0);
  }

  const employmentLabel: Record<string, string> = {
    permanent: "Permanent",
    fixed_term: "Fixed Term",
    casual: "Casual",
  };

  return (
    <div>
      {/* Table wrapper */}
      <div className="overflow-x-auto rounded-xl border border-base-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base-200 bg-surface-2 text-left">
              <th className="px-4 py-3 font-medium text-base-600 min-w-[200px]">
                <button
                  onClick={toggleSort}
                  className="inline-flex items-center gap-1 hover:text-base-900 transition-colors"
                >
                  Name
                  {sortDir === "asc" ? (
                    <ChevronUp size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 font-medium text-base-600 hidden md:table-cell">
                Position
              </th>
              <th className="px-4 py-3 font-medium text-base-600 hidden lg:table-cell">
                Sub-position
              </th>
              <th className="px-4 py-3 font-medium text-base-600 hidden lg:table-cell">
                Employment
              </th>
              <th className="px-4 py-3 font-medium text-base-600 hidden lg:table-cell">
                Phone
              </th>
              <th className="px-4 py-3 font-medium text-base-600">Status</th>
              <th className="px-4 py-3 font-medium text-base-600 w-20">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-200">
            {paged.map((s) => {
              const initials = getInitials(s.first_name, s.last_name);
              const colorIdx =
                hashName(`${s.first_name}${s.last_name}`) %
                AVATAR_COLORS.length;
              const avatarColor = AVATAR_COLORS[colorIdx];

              return (
                <tr
                  key={s.id}
                  onClick={() => onRowClick(s)}
                  className="group cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  {/* Name + avatar */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-semibold",
                          avatarColor
                        )}
                      >
                        {initials}
                      </div>
                      <div>
                        <p className="font-medium text-base-900">
                          {s.first_name} {s.last_name}
                        </p>
                        {/* Show position on mobile where column is hidden */}
                        {s.position_name && (
                          <p className="text-xs text-base-400 md:hidden">
                            {s.position_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Position */}
                  <td className="px-4 py-3 text-base-700 hidden md:table-cell">
                    {s.position_name ?? "\u2014"}
                  </td>

                  {/* Sub-position */}
                  <td className="px-4 py-3 text-base-700 hidden lg:table-cell">
                    {s.sub_position_name ?? "\u2014"}
                  </td>

                  {/* Employment type */}
                  <td className="px-4 py-3 text-base-700 hidden lg:table-cell">
                    {s.employment_type
                      ? employmentLabel[s.employment_type] ?? s.employment_type
                      : "\u2014"}
                  </td>

                  {/* Phone */}
                  <td className="px-4 py-3 text-base-700 hidden lg:table-cell">
                    {s.phone ?? "\u2014"}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <Badge variant={s.active !== false ? "success" : "danger"}>
                      {s.active !== false ? "Active" : "Inactive"}
                    </Badge>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(s);
                        }}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-base-500 hover:bg-surface-3 hover:text-base-700 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeactivate(s);
                        }}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-base-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title={s.active !== false ? "Deactivate" : "Activate"}
                      >
                        <UserX size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-base-400">
            Showing {page * PAGE_SIZE + 1}\u2013
            {Math.min((page + 1) * PAGE_SIZE, sorted.length)} of{" "}
            {sorted.length}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 px-3 text-sm rounded-lg border border-base-200 bg-surface text-base-700 hover:bg-surface-2 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="h-8 px-3 text-sm rounded-lg border border-base-200 bg-surface text-base-700 hover:bg-surface-2 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
