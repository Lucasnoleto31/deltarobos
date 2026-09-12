"use client";

import { useEffect } from "react";

/** Força o tema do documento (o embed é um iframe próprio, então não afeta o site). */
export function ForcarTema({ tema }: { tema: "claro" | "escuro" }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "escuro");
    document.documentElement.style.colorScheme = tema === "escuro" ? "dark" : "light";
  }, [tema]);
  return null;
}
