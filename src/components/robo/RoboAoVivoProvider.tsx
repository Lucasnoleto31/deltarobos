"use client";

import { createContext, useContext, useMemo } from "react";
import { useRoboAoVivo, type EstadoRoboAoVivo, type InicialRoboAoVivo } from "@/hooks/useRoboAoVivo";
import type { HorarioPregao } from "@/lib/stats/pregao";
import type { RoboPublico } from "@/lib/tipos";

interface ValorRobo {
  estado: EstadoRoboAoVivo;
  robo: RoboPublico;
  pregao: HorarioPregao;
  feriados: string[];
  hoje: string;
}

const Ctx = createContext<ValorRobo | null>(null);

interface Props {
  robo: RoboPublico;
  inicial: InicialRoboAoVivo;
  pregao: HorarioPregao;
  feriados: string[];
  children: React.ReactNode;
}

/** Uma assinatura do topic robo:<slug> compartilhada pelo cabeçalho e pelo painel de hoje. */
export function RoboAoVivoProvider({ robo, inicial, pregao, feriados, children }: Props) {
  const estado = useRoboAoVivo(robo.slug, inicial);
  const valor = useMemo<ValorRobo>(
    () => ({ estado, robo, pregao, feriados, hoje: inicial.dia }),
    [estado, robo, pregao, feriados, inicial.dia],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useRobo(): ValorRobo {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRobo precisa estar dentro de RoboAoVivoProvider");
  return v;
}
