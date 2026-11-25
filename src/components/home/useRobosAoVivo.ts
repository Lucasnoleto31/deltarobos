"use client";

import { useMemo } from "react";
import { useAgora } from "@/hooks/useAgora";
import { pregaoAberto } from "@/lib/stats/pregao";
import { statusAoVivo, type StatusAoVivo } from "@/lib/stats/status-robo";
import { useCasa } from "./CasaAoVivoProvider";
import type { DadosCardRobo } from "./tipos";

/** O mínimo de um robô que a lista ao vivo precisa (a barra lateral manda só isto; a home manda o card inteiro). */
export type RoboBase = Pick<
  DadosCardRobo,
  | "slug"
  | "nome"
  | "ativo"
  | "status"
  | "horarioInicio"
  | "horarioFim"
  | "posicionado"
  | "nPosicoesAbertas"
  | "ultimoHeartbeatEm"
  | "temColetor"
  | "hoje"
  | "mes"
> & { acumulado?: number };

export type RoboAoVivo<T extends RoboBase> = T & {
  /** operações e gains de hoje, do resumo ao vivo (quando há) */
  hojeOperacoes?: number;
  hojeGains?: number;
  posicoesAbertas?: number;
  statusAoVivo: StatusAoVivo;
  /** pregão do ativo fechado agora (sem relógio, vale o que o servidor calculou) */
  pregaoFechado: boolean;
  /** fechou operação hoje, ou tem resultado hoje */
  operouHoje: boolean;
};

/**
 * Os robôs com os números do dia e o status atualizados pelo realtime (topic "casa"). Era a conta que
 * a GradeRobos fazia sozinha; saiu para cá em 25/11/2026 porque a barra lateral do sistema mostra os
 * mesmos robôs em toda página e os dois precisam dizer a mesma coisa.
 *
 * Mês e acumulado do servidor já trazem o `hoje` do servidor; entra só o que o resumo tem além dele. Se o
 * resumo já é de outro dia (página montada ontem, lida hoje), o dia do servidor fica onde está e o resumo
 * entra inteiro (19/09/2026).
 */
export function useRobosAoVivo<T extends RoboBase>(robos: readonly T[]): RoboAoVivo<T>[] {
  const { estado, feriados, pregaoPorAtivo, pregaoGeral, pregaoAbertoNoServidor, hoje: hojeDaCasa } = useCasa();
  const agora = useAgora(5000);

  return useMemo(() => {
    return robos.map((robo) => {
      const vivo = estado.resumo?.robos.find((r) => r.slug === robo.slug);
      const coleta = estado.coleta[robo.slug];
      const hoje = vivo ? vivo.resultado_liquido_por_contrato : robo.hoje;
      const delta = vivo ? hoje - (estado.resumo?.dia === hojeDaCasa ? robo.hoje : 0) : 0;
      const posicionado = coleta?.posicionado ?? vivo?.posicionado ?? robo.posicionado;
      const ultimoHeartbeatEm = coleta?.ultimo_heartbeat_em ?? robo.ultimoHeartbeatEm;

      const pregao = pregaoPorAtivo[robo.ativo] ?? pregaoGeral;
      const aberto = agora ? pregaoAberto(agora, pregao, feriados) : false;
      const hojeOperacoes = vivo?.n_operacoes;

      return {
        ...robo,
        hoje,
        hojeOperacoes,
        hojeGains: vivo?.n_gain,
        mes: robo.mes + delta,
        acumulado: robo.acumulado === undefined ? undefined : robo.acumulado + delta,
        posicionado,
        // mapa de coleta (fresco), resumo, snapshot do servidor, nesta ordem (21/09/2026)
        posicoesAbertas: coleta?.n_posicoes_abertas ?? vivo?.n_posicoes_abertas ?? robo.nPosicoesAbertas,
        ultimoHeartbeatEm,
        statusAoVivo: statusAoVivo({
          status: robo.status,
          posicionado,
          ultimoHeartbeatEm,
          horarioInicio: robo.horarioInicio,
          horarioFim: robo.horarioFim,
          pregaoAberto: aberto,
          agora: agora ?? new Date(0),
          temColetor: robo.temColetor,
        }),
        pregaoFechado: agora ? !aberto : !pregaoAbertoNoServidor,
        operouHoje: (hojeOperacoes ?? 0) > 0 || hoje !== 0,
      } as RoboAoVivo<T>;
    });
  }, [robos, estado.resumo, estado.coleta, hojeDaCasa, agora, pregaoPorAtivo, pregaoGeral, feriados, pregaoAbertoNoServidor]);
}
