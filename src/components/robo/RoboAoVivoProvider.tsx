"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import type { EstadoRoboAoVivo, InicialRoboAoVivo } from "@/hooks/useRoboAoVivo";
import { pregaoAberto, type HorarioPregao } from "@/lib/stats/pregao";
import type { OperacaoPublica, RoboPublico } from "@/lib/tipos";

// Do hook só vêm tipos: o hook (e com ele o cliente do Supabase, ~63 KB gz)
// entra pelo assinante, carregado depois da hidratação (18/09/2026).
// Se o pedaço não baixar (rede ruim), a página segue com os dados do
// servidor, sem ao vivo, em vez de cair no erro de cliente.
const AssinanteRobo = dynamic(
  () =>
    import("./AssinanteRobo")
      .then((m) => m.AssinanteRobo)
      .catch((e: unknown) => {
        console.warn("[realtime] assinante não carregou", e);
        return () => null;
      }),
  { ssr: false },
);

interface ValorRobo {
  estado: EstadoRoboAoVivo;
  robo: RoboPublico;
  pregao: HorarioPregao;
  feriados: string[];
  hoje: string;
  /** o pregão estava aberto quando o servidor montou a página (ver usePregaoAberto) */
  pregaoAbertoNoServidor: boolean;
}

const Ctx = createContext<ValorRobo | null>(null);

interface Props {
  robo: RoboPublico;
  inicial: InicialRoboAoVivo;
  pregao: HorarioPregao;
  feriados: string[];
  pregaoAbertoNoServidor: boolean;
  children: React.ReactNode;
}

// Cópia da ordenação de src/hooks/useRoboAoVivo.ts (lá não é exportada).
function ordenarOperacoes(lista: OperacaoPublica[]): OperacaoPublica[] {
  return [...lista].sort(
    (a, b) => new Date(a.fechamento_em).getTime() - new Date(b.fechamento_em).getTime(),
  );
}

/** Uma assinatura do topic robo:<slug> compartilhada pelo cabeçalho e pelo painel de hoje. */
export function RoboAoVivoProvider({ robo, inicial, pregao, feriados, pregaoAbertoNoServidor, children }: Props) {
  // Tem que nascer EXATAMENTE como o useState de useRoboAoVivo: é o que o
  // servidor e a hidratação desenham antes de o assinante carregar. Se o
  // Lucas mudar a inicialização lá, muda aqui também.
  const [estado, setEstado] = useState<EstadoRoboAoVivo>(() => ({
    operacoes: ordenarOperacoes(inicial.operacoes),
    posicoes: inicial.posicoes,
    ultimoHeartbeatEm: inicial.ultimoHeartbeatEm,
    ultimaMensagemEm: null,
    conectado: false,
  }));
  const valor = useMemo<ValorRobo>(
    () => ({ estado, robo, pregao, feriados, hoje: inicial.dia, pregaoAbertoNoServidor }),
    [estado, robo, pregao, feriados, inicial.dia, pregaoAbertoNoServidor],
  );
  return (
    <Ctx.Provider value={valor}>
      <AssinanteRobo slug={robo.slug} inicial={inicial} aoMudar={setEstado} />
      {children}
    </Ctx.Provider>
  );
}

export function useRobo(): ValorRobo {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRobo precisa estar dentro de RoboAoVivoProvider");
  return v;
}

// abertura e fechamento do pregão mudam por minuto: conferir a cada 30 s basta
function assinarMeioMinuto(avisar: () => void) {
  const id = window.setInterval(avisar, 30_000);
  return () => window.clearInterval(id);
}

/**
 * O pregão está aberto agora? (19/09/2026) No servidor e na hidratação vale o que o servidor calculou
 * ao montar a página, a mesma resposta dos dois lados; depois, o relógio do navegador. Quem usa só
 * renderiza de novo quando a resposta muda, não a cada volta do relógio.
 */
export function usePregaoAberto(): boolean {
  const { pregao, feriados, pregaoAbertoNoServidor } = useRobo();
  const ler = useCallback(() => pregaoAberto(new Date(), pregao, feriados), [pregao, feriados]);
  return useSyncExternalStore(assinarMeioMinuto, ler, () => pregaoAbertoNoServidor);
}
