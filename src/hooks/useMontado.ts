"use client";

import { useSyncExternalStore } from "react";

const assinarNada = () => () => {};

/** false no servidor e na hidratação, true depois de montar no cliente. */
export function useMontado(): boolean {
  return useSyncExternalStore(
    assinarNada,
    () => true,
    () => false,
  );
}
