"use client";

import Link from "next/link";
import { AvisoSemAtualizacao } from "@/components/compartilhados/AvisoSemAtualizacao";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { TextoDeHoje } from "@/components/home/TextoDeHoje";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { linkSimulador } from "@/components/simulador/simulador-url";
import { buttonVariants } from "@/components/ui/button";
import { useAgora } from "@/hooks/useAgora";
import { formatarData, formatarNumero, haQuanto } from "@/lib/formato";
import { normalizarHora, pregaoAberto } from "@/lib/stats/pregao";
import { statusAoVivo } from "@/lib/stats/status-robo";
import { useRobo } from "./RoboAoVivoProvider";

interface Props {
  /** para onde vai o botão "Quero esse robô" (o WhatsApp da equipe); sem ele, os passos de Como funciona */
  linkQuero?: string;
}

/**
 * Cabeçalho da página do robô (spec §8.2; ficha Mesa, 25/11/2026, segunda passada): o caminho de volta, o
 * nome, o que o robô fez hoje em palavras comuns (ao vivo), a descrição, uma linha com os dados de cadastro
 * e as ações à direita. Sem selo, sem etiqueta, sem caixa alta.
 *
 * O botão principal da página é "Quero esse robô" (era um bloco à parte no pé da visão geral). "Simular com
 * meu capital" e "Tela ao vivo" são caminhos secundários, em texto.
 */
export function CabecalhoRobo({ linkQuero }: Props) {
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

  const ops = estado.operacoes;
  const hojeLiquido = ops.reduce((s, o) => s + o.resultado_brl_por_contrato - o.custos_brl_por_contrato, 0);
  const ultimaOperacaoEm = ops.length > 0 ? ops[ops.length - 1].fechamento_em : robo.ultima_operacao_em;
  const emBreve = robo.status === "em_breve";

  return (
    <header className="conteudo pt-8 lg:pt-9">
      {/* o caminho de volta (18/09/2026, Artur: "toda página precisa ter uma maneira de voltar") */}
      <nav aria-label="Caminho" className="mb-2 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-sutil">
        <Link href="/" className="transition-colors hover:text-foreground">
          Visão geral
        </Link>
        <span aria-hidden>/</span>
        <span>{robo.ativo_nome}</span>
      </nav>

      <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="min-w-0 md:flex-1">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-[1.75rem] leading-tight font-medium tracking-tight sm:text-[2rem]">{robo.nome}</h1>
            <TextoDeHoje
              robo={{
                statusAoVivo: status,
                operouHoje: ops.length > 0,
                hoje: hojeLiquido,
                hojeOperacoes: ops.length,
                dadosAte: robo.ultima_operacao_em,
              }}
              className="text-sm"
            />
          </div>
          {robo.descricao_publica ? (
            // no celular a descrição ocupa no máximo duas linhas: o número da página tem de aparecer logo
            <p className="mt-2 max-w-3xl text-pretty text-[0.9375rem] text-muted-foreground max-sm:line-clamp-2 max-sm:text-sm">
              {robo.descricao_publica}
            </p>
          ) : null}
        </div>

        {emBreve ? null : (
          // no celular: o botão primeiro e os dois atalhos com o nome curto, tudo numa linha só
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 text-sm max-md:flex-row-reverse max-md:justify-end md:gap-x-6 md:shrink-0">
            {/* a tela cheia do dia é rara: sem prefetch */}
            <Link href={`/robos/${robo.slug}/ao-vivo`} prefetch={false} className={LINK_DO_PAINEL}>
              <span className="sm:hidden">Ao vivo</span>
              <span className="max-sm:hidden">Tela ao vivo</span>
            </Link>
            <Link href={linkSimulador(robo.slug)} className={LINK_DO_PAINEL}>
              <span className="sm:hidden">Simular</span>
              <span className="max-sm:hidden">Simular com meu capital</span>
            </Link>
            {linkQuero ? (
              <a href={linkQuero} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "h-9" })}>
                Quero esse robô
              </a>
            ) : (
              <Link href="/metodologia#como-comecar" className={buttonVariants({ className: "h-9" })}>
                Quero esse robô
              </Link>
            )}
          </div>
        )}
      </div>

      {/* no celular, uma linha corrida de texto pequeno em vez de uma grade de cinco blocos */}
      <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] sm:mt-5 sm:gap-x-8 sm:gap-y-2 sm:text-sm">
        {robo.horario_inicio && robo.horario_fim ? (
          <div className="flex gap-1.5">
            <dt className="text-sutil">Opera das</dt>
            <dd>
              {normalizarHora(robo.horario_inicio)} às {normalizarHora(robo.horario_fim)}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt className="text-sutil">
            <RotuloComInfo chave="contratosPadrao">Contratos por operação</RotuloComInfo>
          </dt>
          <dd>{formatarNumero(robo.contratos_padrao)}</dd>
        </div>
        {robo.conta_real_desde ? (
          <div className="flex gap-1.5">
            <dt className="text-sutil">No ar desde</dt>
            <dd>{formatarData(robo.conta_real_desde)}</dd>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          <dt className="text-sutil">Última operação</dt>
          <dd>{ultimaOperacaoEm && agora ? haQuanto(ultimaOperacaoEm, agora) : "–"}</dd>
        </div>
        {robo.versao_atual ? (
          <div className="flex gap-1.5">
            <dt className="text-sutil">Versão</dt>
            <dd>{robo.versao_atual}</dd>
          </div>
        ) : null}
        {robo.conta_tipo === "demo" ? (
          <div className="flex gap-1.5">
            <dt className="text-sutil">Conta</dt>
            <dd className="text-alerta" title="As estatísticas vêm de uma conta demo">
              Demo
            </dd>
          </div>
        ) : null}
      </dl>

      {/* robô sem coletor não manda sinal: o aviso de atraso seria sempre falso (19/09/2026) */}
      {robo.status === "ativo" && robo.tem_coletor ? (
        <AvisoSemAtualizacao ultimoHeartbeatEm={estado.ultimoHeartbeatEm} pregao={pregao} feriados={feriados} className="mt-4" />
      ) : null}
      {robo.status === "pausado" ? <p className="mt-4 text-sm text-alerta">Este robô está pausado. O histórico continua disponível.</p> : null}
      {robo.status === "arquivado" ? (
        <p className="mt-4 text-sm text-muted-foreground">Este robô foi arquivado. O histórico continua disponível para consulta.</p>
      ) : null}
    </header>
  );
}
