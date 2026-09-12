"use client";

import { createContext, useContext, useMemo } from "react";
import { useCasaAoVivo, type EstadoCasaAoVivo } from "@/hooks/useCasaAoVivo";
import type { HorarioPregao } from "@/lib/stats/pregao";
import type { InicialCasa, PregaoPorAtivo } from "./tipos";

interface ValorCasa {
  estado: EstadoCasaAoVivo;
  feriados: string[];
  hoje: string;
  pregaoPorAtivo: PregaoPorAtivo;
  /** união dos horários de todos os ativos */
  pregaoGeral: HorarioPregao;
}

const Ctx = createContext<ValorCasa | null>(null);

const PREGAO_PADRAO: HorarioPregao = { inicio: "09:00", fim: "18:00" };

interface Props {
  inicial: InicialCasa;
  feriados: string[];
  hoje: string;
  children: React.ReactNode;
}

/** Uma assinatura do topic "casa" compartilhada por barra, hero e grade. */
export function CasaAoVivoProvider({ inicial, feriados, hoje, children }: Props) {
  const estado = useCasaAoVivo(inicial);

  const { pregaoPorAtivo, pregaoGeral } = useMemo(() => {
    const porAtivo: PregaoPorAtivo = {};
    let inicio: string | null = null;
    let fim: string | null = null;
    for (const m of estado.mercado) {
      porAtivo[m.prefixo_simbolo] = { inicio: m.pregao_inicio, fim: m.pregao_fim };
      if (inicio === null || m.pregao_inicio < inicio) inicio = m.pregao_inicio;
      if (fim === null || m.pregao_fim > fim) fim = m.pregao_fim;
    }
    return {
      pregaoPorAtivo: porAtivo,
      pregaoGeral: inicio && fim ? { inicio, fim } : PREGAO_PADRAO,
    };
  }, [estado.mercado]);

  const valor = useMemo<ValorCasa>(
    () => ({ estado, feriados, hoje, pregaoPorAtivo, pregaoGeral }),
    [estado, feriados, hoje, pregaoPorAtivo, pregaoGeral],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCasa(): ValorCasa {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCasa precisa estar dentro de CasaAoVivoProvider");
  return v;
}
