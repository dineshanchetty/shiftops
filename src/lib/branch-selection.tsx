"use client";

/**
 * App-wide "current branch" selection. Drives the top-bar branch picker,
 * the dashboard widgets, and any other page that filters by the active
 * branch. Persists in localStorage so the same branch is selected after
 * a page refresh or navigation.
 *
 * `null` means "All branches" — used by tenants with more than one branch
 * where the user wants the consolidated view (and is the default for
 * owners with access to >1 branch).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "shiftops.currentBranchId";

interface BranchSelectionValue {
  /** Active branch id, or null for "All branches". */
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
}

const Ctx = createContext<BranchSelectionValue>({
  selectedBranchId: null,
  setSelectedBranchId: () => {},
});

export function BranchSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v) setSelectedBranchIdState(v);
    } catch {
      /* ignore SSR / private-mode errors */
    }
  }, []);

  const setSelectedBranchId = useCallback((id: string | null) => {
    setSelectedBranchIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ selectedBranchId, setSelectedBranchId }),
    [selectedBranchId, setSelectedBranchId]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBranchSelection(): BranchSelectionValue {
  return useContext(Ctx);
}
