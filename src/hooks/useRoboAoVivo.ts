"use client";

import { useEffect, useRef, useState } from "react";
import type { ExposicaoHoje } from "@/lib/stats/exposicao";
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
  /**
   * MEP/MEN de hoje medidos pelo EA 1.1.0 tick a tick (22/09/2026): a linha de exposicao_dia_publico do
   * dia, atualizada pelo evento "coleta". null = sem medição (EA antigo, robô sem coletor, dia sem operação).
   */
  exposicaoHoje: ExposicaoHoje | null;
}

export interface InicialRoboAoVivo {
  operacoes: OperacaoPublica[];
  posicoes: PosicaoPublica[];
  ultimoHeartbeatEm: string | null;
  /** dia de pregão (YYYY-MM-DD) que o painel "hoje" representa */
  dia: string;
  /** MEP/MEN de hoje pelo EA (listarExposicaoDia com dia = hoje); opcional para quem monta o estado sem ele */
  exposicaoHoje?: ExposicaoHoje | null;
}

/**
 * O evento "coleta" traz, desde a migration 0021, os campos de exposicao_dia_publico de hoje (EventoColeta
 * já os declara; as horas do extremo não vêm no evento, mas entram se um dia vierem). Evento anterior à
 * migration vem sem nenhum deles.
 */
type ColetaComExposicao = EventoColeta & Partial<ExposicaoHoje>;

/** A coleta trouxe os campos de MEP/MEN? Só então ela substitui o que a tela tem (evento antigo não apaga nada). */
function exposicaoDaColeta(c: ColetaComExposicao): ExposicaoHoje | null | undefined {
  if (!("mep_ea" in c) && !("men_ea" in c)) return undefined;
  if (typeof c.mep_ea !== "number" && typeof c.men_ea !== "number") return null;
  return {
    mep_ea: typeof c.mep_ea === "number" ? c.mep_ea : null,
    men_ea: typeof c.men_ea === "number" ? c.men_ea : null,
    mep_ea_n_saidas: typeof c.mep_ea_n_saidas === "number" ? c.mep_ea_n_saidas : null,
    men_ea_n_saidas: typeof c.men_ea_n_saidas === "number" ? c.men_ea_n_saidas : null,
    excursao_ea_parcial: c.excursao_ea_parcial === true,
    mep_ea_em: typeof c.mep_ea_em === "string" ? c.mep_ea_em : null,
    men_ea_em: typeof c.men_ea_em === "string" ? c.men_ea_em : null,
  };
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
    exposicaoHoje: inicial.exposicaoHoje ?? null,
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
        const c = payload as ColetaComExposicao;
        // O broadcast não tem replay: um "posicao_fechada" perdido (aba em segundo plano, reconexão no
        // meio) deixava o grupo preso e "2 operações em aberto" congelado até a próxima reconexão. A
        // coleta traz n_posicoes_abertas a cada <= 30 s: quando diverge do que a tela soma, ressincroniza.
        // A coleta conta antes da sincronização do mesmo heartbeat, então a divergência pode ser
        // passageira; a ressincronização (quatro consultas pequenas) resolve nos dois casos.
        if (
          typeof c.n_posicoes_abertas === "number" &&
          c.n_posicoes_abertas !== totalAbertas(posicoesAtuais.current)
        ) {
          void ressincronizar();
        }
        // MEP/MEN de hoje pelo EA (22/09/2026): a coleta traz a linha de exposicao_dia_publico do dia
        const exposicao = exposicaoDaColeta(c);
        setEstado((s) => ({
          ...s,
          ultimoHeartbeatEm: c.ultimo_heartbeat_em ?? s.ultimoHeartbeatEm,
          ultimaMensagemEm: marcar(),
          exposicaoHoje: exposicao === undefined ? s.exposicaoHoje : exposicao,
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
        const [ops, pos, robo, exposicao] = await Promise.all([
          sb
            .from("operacoes_publico")
            .select("*")
            .eq("slug", slug)
            .eq("dia_pregao", inicial.dia)
            .order("fechamento_em", { ascending: true }),
          // "*" traz n_abertas junto quando a view tiver a coluna (migration 0020)
          sb.from("posicoes_abertas_publico").select("*").eq("slug", slug),
          sb.from("robos_publico").select("ultimo_heartbeat_em").eq("slug", slug).maybeSingle(),
          // MEP/MEN de hoje pelo EA (migration 0021); view ausente vira erro, e a tela fica com o que tem
          sb
            .from("exposicao_dia_publico")
            .select("mep_ea, men_ea, mep_ea_em, men_ea_em, mep_ea_n_saidas, men_ea_n_saidas, excursao_ea_parcial")
            .eq("slug", slug)
            .eq("dia", inicial.dia)
            .maybeSingle(),
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
          // sem linha (data null, sem erro) é "ainda sem medição hoje"; erro (view ausente) mantém o que há
          exposicaoHoje: exposicao.error ? s.exposicaoHoje : ((exposicao.data as unknown as ExposicaoHoje | null) ?? null),
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
