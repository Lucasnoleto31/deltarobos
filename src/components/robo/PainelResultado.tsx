"use client";

import { useCallback, useMemo, useState } from "react";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { expandirSerie, type SerieCompacta } from "@/components/graficos/series-da-curva";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import { formatarData, formatarDataLonga, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { mesmoRecorte } from "./curva-por-periodo";
import { HojeAoVivo } from "./HojeAoVivo";
import {
  PERIODOS_RESUMO,
  TITULO_DO_PERIODO,
  VAZIO_DO_PERIODO,
  noPeriodo,
  periodoInicial,
  type PeriodoFechado,
  type PeriodoResumo,
} from "./periodos-resumo";
import { usePregaoAberto, useRobo } from "./RoboAoVivoProvider";

interface Props {
  /** a série diária inteira; o recorte por período é feito aqui */
  linhas: LinhaDiaria[];
  /** a curva por operação leve de cada período (até PONTOS_LEVE pontos, montada no servidor, só os números); a completa vem da rota /curva ao abrir "Por operação" */
  pontosPorOperacao: Record<PeriodoFechado, SerieCompacta>;
  valorPonto: number;
  capitalReferencia: number | null;
}

/**
 * O que abre a visão geral do robô: "Hoje" ao vivo e, nos outros períodos, o resultado da semana, do mês, do
 * ano e desde o início (18/09/2026, Artur: "faltam filtros, hoje, semana, mes, tudo"). Desde a ficha Mesa
 * (25/11/2026, segunda passada) é o mesmo desenho da página inicial, sem caixa: uma linha de título com o
 * período à direita, o número grande com a premissa embaixo, os fatos ao lado e a curva na largura toda.
 *
 * Os números vêm de calcularKpis sobre a série diária recortada; a curva, de CurvaCapital. Desde
 * 19/09/2026 não abre sempre em "Hoje": fora do pregão e sem operação no dia, abre no primeiro período com
 * operação (periodoInicial). Enquanto a pessoa não toca no filtro, a escolha acompanha o pregão: abriu ou
 * chegou operação, volta para "Hoje". Robô sem coletor (só histórico importado) não tem dia ao vivo: para ele
 * o pregão aberto não conta, nem no período inicial nem no "ao vivo" do título.
 */
export function PainelResultado({ linhas, pontosPorOperacao, valorPonto, capitalReferencia }: Props) {
  const { estado, robo, hoje } = useRobo();
  const aberto = usePregaoAberto();
  const aoVivo = aberto && robo.tem_coletor;
  const operacoesHoje = estado.operacoes.length;
  const temPosicao = estado.posicoes.length > 0;
  const automatico = useMemo(
    // o pregão aberto só leva a "Hoje" quando há o que mostrar (operação fechada ou aberta): antes disso "Hoje"
    // é um zero grande, e a página abre no primeiro período com operação (ficha Mesa, 25/11/2026)
    () => periodoInicial(linhas, hoje, { operacoesHoje, pregaoAberto: aoVivo && (operacoesHoje > 0 || temPosicao) }),
    [linhas, hoje, operacoesHoje, aoVivo, temPosicao],
  );
  const [escolhido, setEscolhido] = useState<PeriodoResumo | null>(null);
  const periodo = escolhido ?? automatico;
  const atualizadoEm = estado.ultimaMensagemEm ?? estado.ultimoHeartbeatEm;

  return (
    <section aria-labelledby="resultado">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[0.9375rem] text-muted-foreground">
          <h2 id="resultado" className="font-normal">
            {/* "ao vivo" só com o pregão aberto e coletor: no sábado é o dia parado */}
            {periodo === "hoje" ? (aoVivo ? "Hoje, ao vivo" : "Hoje") : TITULO_DO_PERIODO[periodo]}
          </h2>
          {periodo === "hoje" ? (
            <>
              <span>· {formatarDataLonga(hoje)}</span>
              {/* sem coletor não há sinal: "atualizado sem dados" não diz nada (19/09/2026) */}
              {robo.tem_coletor ? (
                <span className="text-sutil">
                  · <AtualizadoHa em={atualizadoEm} className="text-[0.8125rem] text-sutil" />
                </span>
              ) : null}
            </>
          ) : null}
        </div>
        <Segmentado ariaLabel="Período do resultado" opcoes={PERIODOS_RESUMO} valor={periodo} onChange={setEscolhido} />
      </div>

      {periodo === "hoje" ? (
        <HojeAoVivo />
      ) : (
        <ResultadoDoPeriodo
          key={periodo}
          periodo={periodo}
          slug={robo.slug}
          linhas={linhas}
          serie={pontosPorOperacao[periodo]}
          valorPonto={valorPonto}
          capitalReferencia={capitalReferencia}
          hoje={hoje}
        />
      )}
    </section>
  );
}

function ResultadoDoPeriodo({
  periodo,
  slug,
  linhas,
  serie,
  valorPonto,
  capitalReferencia,
  hoje,
}: {
  periodo: PeriodoFechado;
  slug: string;
  linhas: LinhaDiaria[];
  /** a série leve do período; a completa é pedida à rota quando a curva abre "Por operação" */
  serie: SerieCompacta;
  valorPonto: number;
  capitalReferencia: number | null;
  hoje: string;
}) {
  const opcoes = useMemo<OpcoesSerie>(() => ({ base: "liquido", unidade: "brl", valorPonto }), [valorPonto]);
  const recorte = useMemo(() => noPeriodo(linhas, periodo, hoje), [linhas, periodo, hoje]);
  const k = useMemo(() => calcularKpis(recorte, opcoes, { hoje, capitalReferencia }), [recorte, opcoes, hoje, capitalReferencia]);
  // a dica de cada ponto é escrita aqui, com as mesmas funções que o servidor usava (240 pontos, custo nulo)
  const pontos = useMemo(() => expandirSerie(serie, opcoes), [serie, opcoes]);
  // A série do HTML é a leve: em período longo cada ponto junta operações (22/09/2026, Lucas: "o gráfico
  // por operações está igual por dia"). Ao abrir "Por operação" a curva pede a completa, uma operação por
  // ponto, à rota /api/robos/[slug]/curva/[periodo] (mesmo recorte, cache de 60 s) e escreve as dicas aqui.
  // Quando a leve já tem uma operação por ponto (menos operações que pontos), não há o que pedir.
  const jaCompleta = serie.total <= serie.pontos.length;
  const carregarPorOperacao = useCallback(
    async (sinal: AbortSignal) => {
      const resposta = await fetch(`/api/robos/${encodeURIComponent(slug)}/curva/${periodo}`, { signal: sinal });
      // a rota responde 503 sem cache quando o banco falha: a curva fica na leve e a próxima abertura tenta de novo
      if (!resposta.ok) throw new Error(`curva ${periodo}: HTTP ${resposta.status}`);
      const completa: unknown = await resposta.json();
      // A rota é outra foto do banco (cache próprio): se chegou operação ou pregão novo desde que a página
      // foi montada, a completa não casa com a leve, com o eixo por dia nem com os números ao lado. Fica a leve.
      if (!mesmoRecorte(serie, completa)) return null;
      return expandirSerie(completa, opcoes);
    },
    [slug, periodo, opcoes, serie],
  );

  if (recorte.length === 0) {
    return <p className="py-12 text-sm text-muted-foreground">{VAZIO_DO_PERIODO[periodo]}</p>;
  }

  const dias = recorte.map((l) => l.dia).sort();
  const quando = dias.length === 1 ? `em ${formatarData(dias[0])}` : `de ${formatarData(dias[0])} a ${formatarData(dias[dias.length - 1])}`;

  return (
    <>
      <div className="mt-3 grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,22rem)] lg:items-end lg:justify-start">
        <div className="min-w-0">
          <NumeroGrande valor={k.acumulado} />
          <p className="mt-3 text-sm text-pretty text-muted-foreground">com 1 contrato, já descontados os custos · {quando}</p>
        </div>

        <Fatos className="lg:pb-0.5">
          <Fato rotulo="Dias com ganho">
            <span className="font-medium">{formatarNumero(k.diasPositivos)}</span>
            <span className="text-muted-foreground"> de {formatarNumero(k.nDias)}</span>
          </Fato>
          {k.piorDia && k.piorDia.valor < 0 ? (
            <Fato rotulo="Pior dia">
              <span className="mr-3 text-sutil">{formatarData(k.piorDia.dia)}</span>
              <Valor valor={k.piorDia.valor} inteiro={Math.abs(k.piorDia.valor) >= 1000} className="font-medium" />
            </Fato>
          ) : null}
          <Fato rotulo="Maior queda" info="drawdown">
            {k.drawdown.valor === 0 ? (
              <span className="text-sutil">nenhuma</span>
            ) : (
              <Valor valor={-k.drawdown.valor} inteiro={k.drawdown.valor >= 1000} className="font-medium" />
            )}
          </Fato>
          {k.nOperacoes > 0 ? (
            <Fato rotulo="Operações">
              <span className="font-medium">{formatarNumero(k.nOperacoes)}</span>
              <span className="text-muted-foreground"> · {formatarPct(k.taxaAcerto, 0)} com ganho</span>
            </Fato>
          ) : null}
        </Fatos>
      </div>

      <div className="mt-8 min-w-0">
        <CurvaCapital
          linhas={recorte}
          opcoes={opcoes}
          altura={360}
          mostrarResumo={false}
          pontosPorOperacao={pontos}
          carregarPorOperacao={jaCompleta ? undefined : carregarPorOperacao}
          // os extremos de todas as operações: a completa chega na mesma régua da leve, sem o gráfico pular
          escalaExtra={serie.extremos}
          // semana e mês têm poucos pregões: a curva por operação é a que mostra alguma coisa
          modoInicial={periodo === "semana" || periodo === "mes" ? "operacao" : "dia"}
        />
      </div>
    </>
  );
}
