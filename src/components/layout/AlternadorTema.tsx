"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useMontado } from "@/hooks/useMontado";

/**
 * O sol e a lua do cabeçalho. Desde 13/10/2026 o ícone fica no cinza do texto secundário e acende na cor do
 * texto no hover: o botão no azul ao lado é a única coisa que chama na barra.
 */
export function AlternadorTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const montado = useMontado();

  const escuro = montado ? resolvedTheme === "dark" : true;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground"
      aria-label={escuro ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={() => setTheme(escuro ? "light" : "dark")}
    >
      {escuro ? <Sun /> : <Moon />}
    </Button>
  );
}
