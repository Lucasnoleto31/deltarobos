"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useMontado } from "@/hooks/useMontado";

export function AlternadorTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const montado = useMontado();

  const escuro = montado ? resolvedTheme === "dark" : true;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={escuro ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={() => setTheme(escuro ? "light" : "dark")}
    >
      {escuro ? <Sun /> : <Moon />}
    </Button>
  );
}
