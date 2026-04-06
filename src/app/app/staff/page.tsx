"use client";

import { useState, useEffect, useCallback } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaffTable, type StaffWithPosition } from "@/components/staff/staff-table";
import { StaffProfile } from "@/components/staff/staff-profile";
import { InviteModal } from "@/components/staff/invite-modal";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { UserPlus, Upload, Users } from "lucide-react";
import type { Position, SubPosition, Branch } from "@/lib/types";

const selectClass = cn(
  "h-10 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900",
  "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
  "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8"
);

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffWithPosition[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [subPositions, setSubPositions] = useState<SubPosition[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Panels
  const [selectedStaff, setSelectedStaff] = useState<StaffWithPosition | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // Get tenant ID
    const { data: tid } = await supabase.rpc("get_user_tenant_id");
    if (!tid) return;
    setTenantId(tid);

    // Fetch all data in parallel
    const [staffRes, posRes, subPosRes, branchRes] = await Promise.all([
      supabase
        .from("staff")
        .select("*, positions(name), sub_positions(name)")
        .eq("tenant_id", tid)
        .order("first_name"),
      supabase.from("positions").select("*").eq("tenant_id", tid).order("name"),
      supabase.from("sub_positions").select("*").eq("tenant_id", tid).order("name"),
      supabase.from("branches").select("*").eq("tenant_id", tid).order("name"),
    ]);

    if (staffRes.data) {
      const mapped: StaffWithPosition[] = staffRes.data.map((s: Record<string, unknown>) => ({
        ...(s as StaffWithPosition),
        position_name: (s.positions as { name: string } | null)?.name ?? null,
        sub_position_name: (s.sub_positions as { name: string } | null)?.name ?? null,
      }));
      setStaff(mapped);
    }
    if (posRes.data) setPositions(posRes.data);
    if (subPosRes.data) setSubPositions(subPosRes.data);
    if (branchRes.data) setBranches(branchRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Apply filters
  const filtered = staff.filter((s) => {
    // Search
    if (search) {
      const q = search.toLowerCase();
      const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
      const idMatch = s.id_number?.toLowerCase().includes(q) ?? false;
      if (!fullName.includes(q) && !idMatch) return false;
    }
    // Position
    if (positionFilter && s.position_id !== positionFilter) return false;
    // Status
    if (statusFilter === "active" && s.active === false) return false;
    if (statusFilter === "inactive" && s.active !== false) return false;
    return true;
  });

  function handleRowClick(s: StaffWithPosition) {
    setSelectedStaff(s);
  }

  function handleEdit(s: StaffWithPosition) {
    setSelectedStaff(s);
  }

  async function handleDeactivate(s: StaffWithPosition) {
    const supabase = createClient();
    await supabase
      .from("staff")
      .update({ active: !(s.active !== false) })
      .eq("id", s.id);
    fetchData();
  }

  function handleSaved() {
    setSelectedStaff(null);
    setShowInvite(false);
    fetchData();
  }

  if (loading) {
    return (
      <PageShell title="Staff">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  return (
    <>
      <PageShell
        title="Staff"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              <Upload size={14} />
              Import CSV
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowInvite(true)}
            >
              <UserPlus size={14} />
              Invite Staff
            </Button>
          </div>
        }
      >
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <Input
              placeholder="Search by name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              compact
            />
          </div>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className={cn(selectClass, "h-9 text-xs")}
          >
            <option value="">All Positions</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "active" | "inactive")
            }
            className={cn(selectClass, "h-9 text-xs")}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Table or empty state */}
        {filtered.length > 0 ? (
          <StaffTable
            staff={filtered}
            onRowClick={handleRowClick}
            onEdit={handleEdit}
            onDeactivate={handleDeactivate}
          />
        ) : staff.length === 0 ? (
          /* True empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent mb-4">
              <Users size={28} />
            </div>
            <h3 className="text-base font-semibold text-base-900 mb-1">
              No staff yet
            </h3>
            <p className="text-sm text-base-400 mb-4 max-w-sm">
              Add your team members to start building rosters and managing shifts.
            </p>
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowInvite(true)}
            >
              <UserPlus size={16} />
              Invite Staff
            </Button>
          </div>
        ) : (
          /* Filter returned no results */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-base-400">
              No staff match your filters. Try adjusting your search.
            </p>
          </div>
        )}
      </PageShell>

      {/* Staff profile slide-over */}
      {selectedStaff && (
        <StaffProfile
          staff={selectedStaff}
          positions={positions}
          subPositions={subPositions}
          branches={branches}
          onClose={() => setSelectedStaff(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          tenantId={tenantId}
          positions={positions}
          subPositions={subPositions}
          branches={branches}
          onClose={() => setShowInvite(false)}
          onInvited={handleSaved}
        />
      )}
    </>
  );
}
