"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/cliente";
import type { EventoColeta, OperacaoPublica, PosicaoPublica } from "@/lib/tipos";

export interface EstadoRoboAoVivo {
  operacoes: OperacaoPublica[];
  posicoes: PosicaoPublica[];
  ultimoHeartbeatEm: string | null;
  /** última mensagem recebida no canal (qualquer evento) */
  ultimaMensagemEm: string | null;
  conectado: boolean;
}

export interface InicialRoboAoVivo {
  operacoes: OperacaoPublica[];
  posicoes: PosicaoPublica[];
  ultimoHeartbeatEm: string | null;
  /** dia de pregão (YYYY-MM-DD) que o painel "hoje" representa */
  dia: string;
}

function ordenarOperacoes(lista: OperacaoPublica[]): OperacaoPublica[] {
  return [...lista].sort(
    (a, b) => new Date(a.fechamento_em).getTime() - new Date(b.fechamento_em).getTime(),
  );
}

/**
 * Assina o topic privado robo:<slug> e aplica os eventos em cima dos dados
 * que vieram do servidor. Sem F5.
 */
export function useRoboAoVivo(slug: string, inicial: InicialRoboAoVivo): EstadoRoboAoVivo {
  const [estado, setEstado] = useState<EstadoRoboAoVivo>({
    operacoes: ordenarOperacoes(inicial.operacoes),
    posicoes: inicial.posicoes,
    ultimoHeartbeatEm: inicial.ultimoHeartbeatEm,
    ultimaMensagemEm: null,
    conectado: false,
  });

  useEffect(() => {
    let sb: ReturnType<typeof supabaseBrowser>;
    try {
      sb = supabaseBrowser();
    } catch (e) {
      console.warn("[realtime] sem configuração do Supabase no cliente", e);
      return;
    }

    const marcar = () => new Date().toISOString();
    const canal = sb.channel(`robo:${slug}`, { config: { private: true } });

    canal
      .on("broadcast", { event: "operacao" }, ({ payload }) => {
        const op = payload as OperacaoPublica;
        if (op.dia_pregao !== inicial.dia) return;
        setEstado((s) => ({
          ...s,
          operacoes: ordenarOperacoes([...s.operacoes.filter((o) => o.id !== op.id), op]),
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "operacao_removida" }, ({ payload }) => {
        const { id } = payload as { id: number };
        setEstado((s) => ({
          ...s,
          operacoes: s.operacoes.filter((o) => o.id !== id),
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "posicao" }, ({ payload }) => {
        const p = payload as PosicaoPublica;
        setEstado((s) => ({
          ...s,
          posicoes: [...s.posicoes.filter((x) => x.simbolo !== p.simbolo), p],
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "posicao_fechada" }, ({ payload }) => {
        const { simbolo } = payload as { simbolo: string };
        setEstado((s) => ({
          ...s,
          posicoes: s.posicoes.filter((x) => x.simbolo !== simbolo),
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "coleta" }, ({ payload }) => {
        const c = payload as EventoColeta;
        setEstado((s) => ({
          ...s,
          ultimoHeartbeatEm: c.ultimo_heartbeat_em ?? s.ultimoHeartbeatEm,
          ultimaMensagemEm: marcar(),
        }));
      })
      .subscribe((status) => {
        setEstado((s) => ({ ...s, conectado: status === "SUBSCRIBED" }));
        // Ao (re)conectar, busca o estado atual: cobre o que aconteceu entre o
        // render em cache do servidor e a assinatura, ou durante uma queda.
        if (status === "SUBSCRIBED") void ressincronizar();
      });

    async function ressincronizar() {
      try {
        const [ops, pos, robo] = await Promise.all([
          sb
            .from("operacoes_publico")
            .select("*")
            .eq("slug", slug)
            .eq("dia_pregao", inicial.dia)
            .order("fechamento_em", { ascending: true }),
          sb.from("posicoes_abertas_publico").select("*").eq("slug", slug),
          sb.from("robos_publico").select("ultimo_heartbeat_em").eq("slug", slug).maybeSingle(),
        ]);
        setEstado((s) => ({
          ...s,
          operacoes: ops.data ? ordenarOperacoes(ops.data as OperacaoPublica[]) : s.operacoes,
          posicoes: pos.data ? (pos.data as PosicaoPublica[]) : s.posicoes,
          ultimoHeartbeatEm:
            (robo.data?.ultimo_heartbeat_em as string | null | undefined) ?? s.ultimoHeartbeatEm,
        }));
      } catch (e) {
        console.warn("[realtime] falha ao ressincronizar robô", e);
      }
    }

    return () => {
      void sb.removeChannel(canal);
    };
  }, [slug, inicial.dia]);

  return estado;
}
