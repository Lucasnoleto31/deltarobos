"use client";

import { createContext, useContext, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { EstadoCasaAoVivo } from "@/hooks/useCasaAoVivo";
import type { HorarioPregao } from "@/lib/stats/pregao";
import type { InicialCasa, PregaoPorAtivo } from "./tipos";

// Do hook só vêm tipos: o hook (e com ele o cliente do Supabase, ~63 KB gz)
// entra pelo assinante, carregado depois da hidratação (18/09/2026).
// Se o pedaço não baixar (rede ruim), a página segue com os dados do
// servidor, sem ao vivo, em vez de cair no erro de cliente.
const AssinanteCasa = dynamic(
  () =>
    import("./AssinanteCasa")
      .then((m) => m.AssinanteCasa)
      .catch((e: unknown) => {
        console.warn("[realtime] assinante não carregou", e);
        return () => null;
      }),
  { ssr: false },
);

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
  // Tem que nascer EXATAMENTE como o useState de useCasaAoVivo: é o que o
  // servidor e a hidratação desenham antes de o assinante carregar. Se o
  // Lucas mudar a inicialização lá, muda aqui também.
  const [estado, setEstado] = useState<EstadoCasaAoVivo>(() => ({
    resumo: inicial.resumo,
    mercado: inicial.mercado,
    coleta: inicial.coleta,
    ultimaMensagemEm: null,
    conectado: false,
  }));

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

  return (
    <Ctx.Provider value={valor}>
      <AssinanteCasa inicial={inicial} aoMudar={setEstado} />
      {children}
    </Ctx.Provider>
  );
}

export function useCasa(): ValorCasa {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCasa precisa estar dentro de CasaAoVivoProvider");
  return v;
}
