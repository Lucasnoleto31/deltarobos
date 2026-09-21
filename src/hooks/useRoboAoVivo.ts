"use client";

import { useEffect, useRef, useState } from "react";
import { totalAbertas } from "@/lib/stats/posicoes";
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

  // As posições mais recentes, para o handler do evento "coleta" comparar sem depender do closure do
  // efeito (que só vê o estado do primeiro render). Escrita no efeito, lida só em handler: nunca no render.
  const posicoesAtuais = useRef<PosicaoPublica[]>(inicial.posicoes);
  useEffect(() => {
    posicoesAtuais.current = estado.posicoes;
  }, [estado.posicoes]);

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

    // Sobem a cada evento que mexe na lista. A ressincronização guarda o valor antes de consultar e, se
    // chegou evento enquanto a consulta estava no ar, não aplica a foto: o evento é mais novo que ela.
    // Sem isso, um "posicao_fechada" recebido durante a consulta era atropelado pela resposta, que
    // ressuscitava o grupo fechado, e nada corrigia depois (21/09/2026).
    let versaoPosicoes = 0;
    let versaoOperacoes = 0;

    canal
      .on("broadcast", { event: "operacao" }, ({ payload }) => {
        const op = payload as OperacaoPublica;
        if (op.dia_pregao !== inicial.dia) return;
        versaoOperacoes++;
        setEstado((s) => ({
          ...s,
          operacoes: ordenarOperacoes([...s.operacoes.filter((o) => o.id !== op.id), op]),
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "operacao_removida" }, ({ payload }) => {
        const { id } = payload as { id: number };
        versaoOperacoes++;
        setEstado((s) => ({
          ...s,
          operacoes: s.operacoes.filter((o) => o.id !== id),
          ultimaMensagemEm: marcar(),
        }));
      })
      // posições vêm agregadas por (símbolo, lado); cada evento é a linha inteira da view, então o
      // n_abertas do grupo (operações em aberto, 21/09/2026) chega junto e substitui o anterior
      .on("broadcast", { event: "posicao" }, ({ payload }) => {
        const p = payload as PosicaoPublica;
        versaoPosicoes++;
        setEstado((s) => ({
          ...s,
          posicoes: [
            ...s.posicoes.filter((x) => !(x.simbolo === p.simbolo && x.lado === p.lado)),
            p,
          ],
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "posicao_fechada" }, ({ payload }) => {
        const { simbolo, lado } = payload as { simbolo: string; lado?: PosicaoPublica["lado"] };
        versaoPosicoes++;
        setEstado((s) => ({
          ...s,
          posicoes: s.posicoes.filter(
            (x) => !(x.simbolo === simbolo && (lado === undefined || x.lado === lado)),
          ),
          ultimaMensagemEm: marcar(),
        }));
      })
      .on("broadcast", { event: "coleta" }, ({ payload }) => {
        const c = payload as EventoColeta;
        // O broadcast não tem replay: um "posicao_fechada" perdido (aba em segundo plano, reconexão no
        // meio) deixava o grupo preso e "2 operações em aberto" congelado até a próxima reconexão. A
        // coleta traz n_posicoes_abertas a cada <= 30 s: quando diverge do que a tela soma, ressincroniza.
        // A coleta conta antes da sincronização do mesmo heartbeat, então a divergência pode ser
        // passageira; a ressincronização (três consultas pequenas) resolve nos dois casos.
        if (
          typeof c.n_posicoes_abertas === "number" &&
          c.n_posicoes_abertas !== totalAbertas(posicoesAtuais.current)
        ) {
          void ressincronizar();
        }
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
      const vPos = versaoPosicoes;
      const vOps = versaoOperacoes;
      try {
        const [ops, pos, robo] = await Promise.all([
          sb
            .from("operacoes_publico")
            .select("*")
            .eq("slug", slug)
            .eq("dia_pregao", inicial.dia)
            .order("fechamento_em", { ascending: true }),
          // "*" traz n_abertas junto quando a view tiver a coluna (migration 0020)
          sb.from("posicoes_abertas_publico").select("*").eq("slug", slug),
          sb.from("robos_publico").select("ultimo_heartbeat_em").eq("slug", slug).maybeSingle(),
        ]);
        setEstado((s) => ({
          ...s,
          // foto só entra se nenhum evento da lista chegou enquanto a consulta estava no ar
          operacoes:
            ops.data && vOps === versaoOperacoes
              ? ordenarOperacoes(ops.data as OperacaoPublica[])
              : s.operacoes,
          posicoes: pos.data && vPos === versaoPosicoes ? (pos.data as PosicaoPublica[]) : s.posicoes,
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
