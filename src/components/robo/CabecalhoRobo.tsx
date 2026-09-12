"use client";

import { AvisoSemAtualizacao } from "@/components/compartilhados/AvisoSemAtualizacao";
import { BadgeStatusRobo } from "@/components/compartilhados/BadgeStatusRobo";
import { Badge } from "@/components/ui/badge";
import { useAgora } from "@/hooks/useAgora";
import { formatarData, haQuanto } from "@/lib/formato";
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
  });

  const ultimaOperacaoEm =
    estado.operacoes.length > 0
      ? estado.operacoes[estado.operacoes.length - 1].fechamento_em
      : robo.ultima_operacao_em;

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{robo.nome}</h1>
            <Badge variant="outline">
              {robo.ativo_nome} · {robo.ativo}
            </Badge>
            {robo.versao_atual ? <Badge variant="secondary">v{robo.versao_atual}</Badge> : null}
            {robo.conta_tipo === "demo" ? (
              <Badge variant="outline" className="border-alerta/50 text-alerta" title="As estatísticas vêm de uma conta demo">
                Conta demo
              </Badge>
            ) : null}
          </div>
          {robo.descricao_publica ? (
            <p className="max-w-prose text-pretty text-muted-foreground">{robo.descricao_publica}</p>
          ) : null}
        </div>
        <BadgeStatusRobo status={status} className="h-6 px-2.5 text-sm" />
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {robo.horario_inicio && robo.horario_fim ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Horário</dt>
            <dd className="font-medium tabular-nums">
              {normalizarHora(robo.horario_inicio)} – {normalizarHora(robo.horario_fim)}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Contratos padrão</dt>
          <dd className="font-medium tabular-nums">{robo.contratos_padrao}</dd>
        </div>
        {robo.conta_real_desde ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Conta real desde</dt>
            <dd className="font-medium tabular-nums">{formatarData(robo.conta_real_desde)}</dd>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Última operação</dt>
          <dd className="font-medium tabular-nums">
            {ultimaOperacaoEm && agora ? haQuanto(ultimaOperacaoEm, agora) : "–"}
          </dd>
        </div>
      </dl>

      {robo.status === "ativo" ? (
        <AvisoSemAtualizacao
          ultimoHeartbeatEm={estado.ultimoHeartbeatEm}
          pregao={pregao}
          feriados={feriados}
        />
      ) : null}
      {robo.status === "pausado" ? (
        <p className="rounded-lg border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-alerta">
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
