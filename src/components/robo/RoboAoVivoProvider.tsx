"use client";

import { createContext, useContext, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { EstadoRoboAoVivo, InicialRoboAoVivo } from "@/hooks/useRoboAoVivo";
import type { HorarioPregao } from "@/lib/stats/pregao";
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
}

const Ctx = createContext<ValorRobo | null>(null);

interface Props {
  robo: RoboPublico;
  inicial: InicialRoboAoVivo;
  pregao: HorarioPregao;
  feriados: string[];
  children: React.ReactNode;
}

// Cópia da ordenação de src/hooks/useRoboAoVivo.ts (lá não é exportada).
function ordenarOperacoes(lista: OperacaoPublica[]): OperacaoPublica[] {
  return [...lista].sort(
    (a, b) => new Date(a.fechamento_em).getTime() - new Date(b.fechamento_em).getTime(),
  );
}

/** Uma assinatura do topic robo:<slug> compartilhada pelo cabeçalho e pelo painel de hoje. */
export function RoboAoVivoProvider({ robo, inicial, pregao, feriados, children }: Props) {
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
    () => ({ estado, robo, pregao, feriados, hoje: inicial.dia }),
    [estado, robo, pregao, feriados, inicial.dia],
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
