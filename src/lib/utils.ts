import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as South African Rand: "R 1,234.56"
 */
export function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format a date string or Date object as "6 Apr 2026"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "d MMM yyyy");
}

/**
 * Format a time string as "08:00" (returns HH:mm portion)
 */
export function formatTime(time: string): string {
  // Handle both "08:00:00" and "08:00" formats
  const parts = time.split(":");
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
}
