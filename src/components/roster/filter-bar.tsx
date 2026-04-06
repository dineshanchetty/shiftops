"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Branch, Position, SubPosition } from "@/lib/types";

export interface RosterFilters {
  branchId: string;
  positionId: string;
  subPositionId: string;
  month: number;
  year: number;
  startDay: number;
  endDay: number;
}

interface FilterBarProps {
  branches: Branch[];
  positions: Position[];
  subPositions: SubPosition[];
  filters: RosterFilters;
  onFilterChange: (filters: RosterFilters) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function FilterBar({
  branches,
  positions,
  subPositions,
  filters,
  onFilterChange,
}: FilterBarProps) {
  const filteredSubPositions = filters.positionId
    ? subPositions.filter((sp) => sp.position_id === filters.positionId)
    : subPositions;

  function handleChange(partial: Partial<RosterFilters>) {
    const next = { ...filters, ...partial };
    // Reset sub-position when position changes
    if ("positionId" in partial && partial.positionId !== filters.positionId) {
      next.subPositionId = "";
    }
    onFilterChange(next);
  }

  function handlePrevMonth() {
    let m = filters.month - 1;
    let y = filters.year;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    handleChange({ month: m, year: y, startDay: 1, endDay: daysInMonth(m, y) });
  }

  function handleNextMonth() {
    let m = filters.month + 1;
    let y = filters.year;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    handleChange({ month: m, year: y, startDay: 1, endDay: daysInMonth(m, y) });
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const selectClass = cn(
    "h-9 rounded-lg border border-base-200 bg-surface px-3 text-sm text-base-900",
    "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
    "appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8"
  );

  const numberInputClass = cn(
    "h-9 w-16 rounded-lg border border-base-200 bg-surface px-2 text-sm text-base-900 text-center font-mono",
    "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
    "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
  );

  return (
    <div className="sticky top-0 z-30 bg-surface border-b border-base-200">
      <div className="p-3 overflow-x-auto">
        <div className="flex items-center flex-wrap gap-3 min-w-max">
          {/* Branch */}
          <select
            value={filters.branchId}
            onChange={(e) => handleChange({ branchId: e.target.value })}
            className={selectClass}
            aria-label="Branch"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          {/* Position */}
          <select
            value={filters.positionId}
            onChange={(e) => handleChange({ positionId: e.target.value })}
            className={selectClass}
            aria-label="Position"
          >
            <option value="">All Positions</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Sub-position */}
          <select
            value={filters.subPositionId}
            onChange={(e) => handleChange({ subPositionId: e.target.value })}
            className={selectClass}
            aria-label="Sub-position"
            disabled={!filters.positionId}
          >
            <option value="">All Sub-positions</option>
            {filteredSubPositions.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name}
              </option>
            ))}
          </select>

          {/* Divider */}
          <div className="w-px h-6 bg-base-200 hidden sm:block" />

          {/* Prev month */}
          <button
            onClick={handlePrevMonth}
            className="h-9 w-9 rounded-lg border border-base-200 bg-surface flex items-center justify-center text-base-600 hover:bg-surface-2 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Month */}
          <select
            value={filters.month}
            onChange={(e) => {
              const m = Number(e.target.value);
              handleChange({ month: m, startDay: 1, endDay: daysInMonth(m, filters.year) });
            }}
            className={selectClass}
            aria-label="Month"
          >
            {MONTHS.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>

          {/* Year */}
          <select
            value={filters.year}
            onChange={(e) => {
              const y = Number(e.target.value);
              handleChange({ year: y, startDay: 1, endDay: daysInMonth(filters.month, y) });
            }}
            className={selectClass}
            aria-label="Year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* Next month */}
          <button
            onClick={handleNextMonth}
            className="h-9 w-9 rounded-lg border border-base-200 bg-surface flex items-center justify-center text-base-600 hover:bg-surface-2 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-base-200 hidden sm:block" />

          {/* Start Day */}
          <label className="flex items-center gap-1.5 text-sm text-base-600">
            From
            <input
              type="number"
              min={1}
              max={31}
              value={filters.startDay}
              onChange={(e) => {
                const v = Math.max(1, Math.min(31, Number(e.target.value)));
                handleChange({ startDay: v });
              }}
              className={numberInputClass}
            />
          </label>

          {/* End Day */}
          <label className="flex items-center gap-1.5 text-sm text-base-600">
            To
            <input
              type="number"
              min={1}
              max={31}
              value={filters.endDay}
              onChange={(e) => {
                const v = Math.max(1, Math.min(31, Number(e.target.value)));
                handleChange({ endDay: v });
              }}
              className={numberInputClass}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}
