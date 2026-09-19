"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { EstadoCasaAoVivo } from "@/hooks/useCasaAoVivo";
import { pregaoAberto, type HorarioPregao } from "@/lib/stats/pregao";
import { horarioGeral } from "./datas";
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
  /** o pregão geral estava aberto quando o servidor montou a página (ver usePregaoAberto) */
  pregaoAbertoNoServidor: boolean;
}

const Ctx = createContext<ValorCasa | null>(null);

interface Props {
  inicial: InicialCasa;
  feriados: string[];
  hoje: string;
  pregaoAbertoNoServidor: boolean;
  children: React.ReactNode;
}

/** Uma assinatura do topic "casa" compartilhada por barra, hero e grade. */
export function CasaAoVivoProvider({ inicial, feriados, hoje, pregaoAbertoNoServidor, children }: Props) {
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

  const pregaoPorAtivo = useMemo(() => {
    const porAtivo: PregaoPorAtivo = {};
    for (const m of estado.mercado) {
      porAtivo[m.prefixo_simbolo] = { inicio: m.pregao_inicio, fim: m.pregao_fim };
    }
    return porAtivo;
  }, [estado.mercado]);
  const pregaoGeral = useMemo(() => horarioGeral(estado.mercado), [estado.mercado]);

  const valor = useMemo<ValorCasa>(
    () => ({ estado, feriados, hoje, pregaoPorAtivo, pregaoGeral, pregaoAbertoNoServidor }),
    [estado, feriados, hoje, pregaoPorAtivo, pregaoGeral, pregaoAbertoNoServidor],
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

// abertura e fechamento do pregão mudam por minuto: conferir a cada 30 s basta
function assinarMeioMinuto(avisar: () => void) {
  const id = window.setInterval(avisar, 30_000);
  return () => window.clearInterval(id);
}

/**
 * O pregão geral está aberto agora? (19/09/2026, igual ao da página do robô) No servidor e na hidratação
 * vale o que o servidor calculou ao montar a página, a mesma resposta dos dois lados: antes da abertura
 * o HTML já chega com o último pregão, sem trocar depois. Depois, o relógio do navegador. Quem usa só
 * renderiza de novo quando a resposta muda.
 */
export function usePregaoAberto(): boolean {
  const { pregaoGeral, feriados, pregaoAbertoNoServidor } = useCasa();
  const ler = useCallback(() => pregaoAberto(new Date(), pregaoGeral, feriados), [pregaoGeral, feriados]);
  return useSyncExternalStore(assinarMeioMinuto, ler, () => pregaoAbertoNoServidor);
}
