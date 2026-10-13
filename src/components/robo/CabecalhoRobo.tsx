"use client";

import { AvisoSemAtualizacao } from "@/components/compartilhados/AvisoSemAtualizacao";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { Badge } from "@/components/ui/badge";
import { useAgora } from "@/hooks/useAgora";
import { formatarData, formatarNumero, haQuanto } from "@/lib/formato";
import { totalAbertas } from "@/lib/stats/posicoes";
import { normalizarHora, pregaoAberto } from "@/lib/stats/pregao";
import { statusAoVivo } from "@/lib/stats/status-robo";
import { useRobo } from "./RoboAoVivoProvider";

/** Cabeçalho da página do robô (spec §8.2): identidade, horário, status ao vivo. */
export function CabecalhoRobo() {
  const { robo, estado, pregao, feriados } = useRobo();
  const agora = useAgora(5000);

  const aberto = agora ? pregaoAberto(agora, pregao, feriados) : false;
  const status = statusAoVivo({
    status: robo.status,
    posicionado: estado.posicoes.length > 0,
    ultimoHeartbeatEm: estado.ultimoHeartbeatEm,
    horarioInicio: robo.horario_inicio,
    horarioFim: robo.horario_fim,
    pregaoAberto: aberto,
    agora: agora ?? new Date(0),
    temColetor: robo.tem_coletor,
  });

  const ultimaOperacaoEm =
    estado.operacoes.length > 0
      ? estado.operacoes[estado.operacoes.length - 1].fechamento_em
      : robo.ultima_operacao_em;

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* A cor do robô (13/10/2026, mídia kit da Zeve): a barra ao lado do nome e o tom do selo do ativo, pela
                --cor-robo que o layout põe no <article> (corDoRobo, pela ordem do banco). O nome fica na cor do
                texto: alguns tons da paleta no claro ficam em 3:1, bom para marca e pouco para letra */}
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              <span aria-hidden className="h-[0.8em] w-1.5 shrink-0 rounded-full bg-(--cor-robo)" />
              {robo.nome}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-[color-mix(in_srgb,var(--cor-robo)_45%,transparent)] bg-[color-mix(in_srgb,var(--cor-robo)_12%,transparent)]"
              >
                {robo.ativo_nome} · {robo.ativo}
              </Badge>
              {robo.versao_atual ? (
                <Badge variant="outline" className="text-muted-foreground">
                  v{robo.versao_atual}
                </Badge>
              ) : null}
              {/* o laranja do alerta com 20% da cor do texto no claro, como o selo de status: puro sobre o tingido
                  dava 4,1:1 */}
              {robo.conta_tipo === "demo" ? (
                <Badge
                  variant="outline"
                  className="border-alerta/40 bg-alerta/10 text-[color-mix(in_srgb,var(--alerta)_80%,var(--foreground))] dark:text-alerta"
                  title="As estatísticas vêm de uma conta demo"
                >
                  Conta demo
                </Badge>
              ) : null}
            </div>
          </div>
          {robo.descricao_publica ? (
            <p className="max-w-prose text-pretty text-muted-foreground">{robo.descricao_publica}</p>
          ) : null}
        </div>
        {/* "Posicionado · 3 em aberto" (21/09/2026): operações em aberto no selo, só com o status Posicionado;
            o flex-wrap do cabeçalho absorve o selo mais longo no celular */}
        <BadgeStatusRobo status={status} abertas={totalAbertas(estado.posicoes)} className="h-6 px-2.5 text-sm" />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
        {robo.horario_inicio && robo.horario_fim ? (
          <div className="flex gap-1.5 max-sm:flex-col max-sm:gap-0">
            <dt className="text-muted-foreground">Horário</dt>
            <dd className="font-medium tabular-nums">
              {normalizarHora(robo.horario_inicio)} – {normalizarHora(robo.horario_fim)}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-1.5 max-sm:flex-col max-sm:gap-0">
          <dt className="text-muted-foreground">Contratos padrão</dt>
          <dd className="font-medium tabular-nums">{formatarNumero(robo.contratos_padrao)}</dd>
        </div>
        {robo.conta_real_desde ? (
          <div className="flex gap-1.5 max-sm:flex-col max-sm:gap-0">
            <dt className="text-muted-foreground">Operando desde</dt>
            <dd className="font-medium tabular-nums">{formatarData(robo.conta_real_desde)}</dd>
          </div>
        ) : null}
        <div className="flex gap-1.5 max-sm:flex-col max-sm:gap-0">
          <dt className="text-muted-foreground">Última operação</dt>
          <dd className="font-medium tabular-nums">
            {ultimaOperacaoEm && agora ? haQuanto(ultimaOperacaoEm, agora) : "–"}
          </dd>
        </div>
      </dl>

      {/* robô sem coletor não manda sinal: o aviso de atraso seria sempre falso (19/09/2026) */}
      {robo.status === "ativo" && robo.tem_coletor ? (
        <AvisoSemAtualizacao
          ultimoHeartbeatEm={estado.ultimoHeartbeatEm}
          pregao={pregao}
          feriados={feriados}
        />
      ) : null}
      {robo.status === "pausado" ? (
        <p className="rounded-lg border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-[color-mix(in_srgb,var(--alerta)_80%,var(--foreground))] dark:text-alerta">
          Este robô está pausado. O histórico continua disponível.
        </p>
      ) : null}
      {robo.status === "arquivado" ? (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Este robô foi arquivado. O histórico continua disponível para consulta.
        </p>
      ) : null}
    </header>
  );
}
