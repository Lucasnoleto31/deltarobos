"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Relógio que avança a cada `intervaloMs`. Devolve null no servidor e na
 * hidratação (evita diferença de texto entre servidor e cliente).
 */
export function useAgora(intervaloMs = 1000): Date | null {
  const assinar = useCallback(
    (notificar: () => void) => {
      const id = window.setInterval(notificar, intervaloMs);
      return () => window.clearInterval(id);
    },
    [intervaloMs],
  );

  const ms = useSyncExternalStore(
    assinar,
    () => Math.floor(Date.now() / intervaloMs) * intervaloMs,
    () => 0,
  );

  return ms === 0 ? null : new Date(ms);
}
