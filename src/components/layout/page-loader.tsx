"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function PageLoader() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPathname = useRef(pathname);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const growRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    // Clear any existing timers
    if (timerRef.current) clearTimeout(timerRef.current);
    if (growRef.current) clearInterval(growRef.current);

    // Start loading
    setLoading(true);
    setVisible(true);
    setWidth(0);

    // Animate width from 0 to ~80% quickly
    let currentWidth = 0;
    growRef.current = setInterval(() => {
      currentWidth += (85 - currentWidth) * 0.1;
      if (currentWidth >= 84) {
        if (growRef.current) clearInterval(growRef.current);
        growRef.current = null;
      }
      setWidth(currentWidth);
    }, 50);

    // Complete after a short delay (simulating page load)
    timerRef.current = setTimeout(() => {
      if (growRef.current) clearInterval(growRef.current);
      growRef.current = null;
      setWidth(100);
      setLoading(false);

      // Fade out after reaching 100%
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 300);
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (growRef.current) clearInterval(growRef.current);
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      className="page-loader"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "3px",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "var(--color-accent)",
          transition: loading
            ? "width 50ms linear"
            : "width 200ms ease-out, opacity 300ms ease-out",
          opacity: loading ? 1 : 0,
          boxShadow: "0 0 8px var(--color-accent)",
        }}
      />
    </div>
  );
}
