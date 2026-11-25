"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { expandirSerie, type SerieCompacta } from "@/components/graficos/series-da-curva";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import { formatarBRL, formatarData, formatarNumero } from "@/lib/formato";
import { resumoDoPeriodo, type ResumoDoPeriodo } from "@/lib/stats/como-opera";
import { tempoEmPalavras } from "@/lib/stats/indicadores-robo";
import type { LinhaDiaria } from "@/lib/stats/tipos";
import { mesmoRecorte, opcoesDaCurva } from "./curva-por-periodo";
import { PERIODOS_DO_RESUMO, TITULO_DO_PERIODO, VAZIO_DO_PERIODO, noPeriodo, type PeriodoFechado } from "./periodos-resumo";
import { useRobo } from "./RoboAoVivoProvider";

interface Props {
  /** a série diária inteira; o recorte por período é feito aqui */
  linhas: LinhaDiaria[];
  /** a curva por operação leve de cada período (até PONTOS_LEVE pontos, montada no servidor, só os números); a completa vem da rota /curva ao abrir "Por operação" */
  pontosPorOperacao: Record<PeriodoFechado, SerieCompacta>;
  valorPonto: number;
  /** o capital mínimo do robô (capitalDoRobo): o mesmo número do cabeçalho e das outras telas, sem período */
  capitalMinimo: number | null;
}

const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const fmtMesComAno = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
/** "julho", ou "julho de 2024" quando o período passa de um ano e o mês sozinho não diz qual. `mes` é "YYYY-MM". */
const nomeDoMes = (mes: string, comAno: boolean) => (comAno ? fmtMesComAno : fmtMes).format(new Date(`${mes}-01T12:00:00Z`));

const plural = (n: number, um: string, varios: string) => `${formatarNumero(n)} ${n === 1 ? um : varios}`;
/** Dinheiro sem sinal, para distância e capital: "R$ 12.000", "R$ 85,50". */
const reais = (v: number) => formatarBRL(v, { inteiro: Math.abs(v) >= 1000 });

/** O tamanho do recorte, escrito junto da premissa: "em 9 meses, 172 pregões". */
function tamanhoDoPeriodo(periodo: PeriodoFechado, r: ResumoDoPeriodo, hoje: string): string {
  const pregoes = plural(r.pregoes, "pregão", "pregões");
  switch (periodo) {
    case "tudo":
      return r.primeiroDia && r.ultimoDia ? `em ${tempoEmPalavras(r.primeiroDia, r.ultimoDia)}, ${pregoes}` : pregoes;
    case "ano":
      return `em ${hoje.slice(0, 4)}, ${pregoes}`;
    case "mes":
      return `em ${nomeDoMes(hoje.slice(0, 7), true)}, ${pregoes}`;
    case "semana":
      return `nesta semana, ${pregoes}`;
  }
}

/** O nome do fato e, embaixo dele, a segunda metade da frase ("recuperou em 97 dias", "o pior foi julho, −R$ 18.897"). */
function Rotulo({ chave, nota, children }: { chave?: ChaveIndicador; nota?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {chave ? <RotuloComInfo chave={chave}>{children}</RotuloComInfo> : children}
      {nota ? <span className="-mt-1 block pb-1 text-[0.8125rem] leading-5 text-pretty text-sutil">{nota}</span> : null}
    </>
  );
}

/**
 * O que abre a aba Resumo do robô (revisão de 25/11/2026, DESIGN.md seção 9). A pergunta da tela: este robô
 * vale a pena? Quanto ganhou e quanto caiu no caminho?
 *
 * - O número grande é o resultado desde o início, com a premissa ("com 1 contrato por entrada, já descontados
 *   os custos") e o tamanho do histórico ("em 9 meses, 172 pregões") escritos embaixo. A tela abre sempre aí;
 *   ano, mês e semana ficam como escolha. "Hoje" saiu: é a aba Ao vivo.
 * - Ao lado, os fatos que pesam na decisão: a maior queda e se já recuperou; quanto ganhou para cada R$ 1 que
 *   já chegou a cair; o capital mínimo; em quantos meses e dias terminou com ganho, com o pior de cada.
 *   Onde aparece ganho, aparece a queda.
 * - A curva na largura toda, com a maior queda em vermelho (CurvaCapital: por dia e por operação).
 *
 * Os números saem de resumoDoPeriodo (lib/stats/como-opera) sobre a série diária recortada. O capital mínimo
 * não muda com o período: é o do histórico inteiro, o mesmo do cabeçalho.
 */
export function PainelResultado({ linhas, pontosPorOperacao, valorPonto, capitalMinimo }: Props) {
  const { robo, hoje } = useRobo();
  const [periodo, setPeriodo] = useState<PeriodoFechado>("tudo");

  return (
    <section aria-labelledby="resultado">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <h2 id="resultado" className="text-[0.9375rem] font-normal text-muted-foreground">
          {TITULO_DO_PERIODO[periodo]}
        </h2>
        <Segmentado ariaLabel="Período do resultado" opcoes={PERIODOS_DO_RESUMO} valor={periodo} onChange={setPeriodo} />
      </div>

      <ResultadoDoPeriodo
        key={periodo}
        periodo={periodo}
        slug={robo.slug}
        linhas={linhas}
        serie={pontosPorOperacao[periodo]}
        valorPonto={valorPonto}
        capitalMinimo={capitalMinimo}
        hoje={hoje}
      />
    </section>
  );
}

function ResultadoDoPeriodo({
  periodo,
  slug,
  linhas,
  serie,
  valorPonto,
  capitalMinimo,
  hoje,
}: {
  periodo: PeriodoFechado;
  slug: string;
  linhas: LinhaDiaria[];
  /** a série leve do período; a completa é pedida à rota quando a curva abre "Por operação" */
  serie: SerieCompacta;
  valorPonto: number;
  capitalMinimo: number | null;
  hoje: string;
}) {
  const opcoes = useMemo(() => opcoesDaCurva(valorPonto), [valorPonto]);
  const recorte = useMemo(() => noPeriodo(linhas, periodo, hoje), [linhas, periodo, hoje]);
  const r = useMemo(() => resumoDoPeriodo(recorte), [recorte]);
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

  // o mês sozinho só diz qual é quando o recorte cabe num ano
  const maisDeUmAno = r.primeiroDia !== null && r.ultimoDia !== null && r.primeiroDia.slice(0, 4) !== r.ultimoDia.slice(0, 4);
  const s = r.situacao;
  const notaDaQueda =
    s.tipo === "recuperou" ? (
      <>
        recuperou em {plural(s.dias, "dia", "dias")}
        {s.abaixoDoTopo > 0 ? `; hoje está ${reais(s.abaixoDoTopo)} abaixo do topo` : ""}
      </>
    ) : s.tipo === "nao-recuperou" ? (
      <>ainda não recuperou; está {reais(s.abaixoDoTopo)} abaixo do topo</>
    ) : undefined;
  const piorMes = r.meses.pior;
  const piorDia = r.piorDia;

  // Os fatos, em duas listas: o risco do caminho e a consistência. Ficam ao lado do número no computador e
  // depois da curva no celular (a ordem lá é número, curva, fatos); em tela larga as duas listas vão lado a lado.
  const fatos = (
    <div className="grid gap-x-12 md:max-xl:grid-cols-2 min-[1400px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Fatos>
        <Fato
          rotulo={
            <Rotulo chave="drawdown" nota={notaDaQueda}>
              Maior queda
            </Rotulo>
          }
        >
          {s.tipo === "sem-queda" ? <span className="text-sutil">nenhuma</span> : <Valor valor={-r.maiorQueda} inteiro={r.maiorQueda >= 1000} className="font-medium" />}
        </Fato>
        {r.ganhoPorQueda !== null ? (
          <Fato rotulo={<Rotulo chave="ganhoPorQueda">Ganho para cada R$ 1 da maior queda</Rotulo>}>
            <span className="font-medium">{formatarBRL(r.ganhoPorQueda)}</span>
          </Fato>
        ) : null}
        {capitalMinimo !== null ? (
          <Fato rotulo={<Rotulo chave="capitalMinimo">Capital mínimo</Rotulo>}>
            <span className="font-medium">{formatarBRL(capitalMinimo, { inteiro: true })}</span>
          </Fato>
        ) : null}
      </Fatos>
      <Fatos>
        {r.meses.meses > 1 ? (
          <Fato
            rotulo={
              <Rotulo
                nota={
                  piorMes && piorMes.valor < 0 ? (
                    <>
                      o pior foi {nomeDoMes(piorMes.mes, maisDeUmAno)}, <Valor valor={piorMes.valor} inteiro={Math.abs(piorMes.valor) >= 1000} />
                    </>
                  ) : (
                    "nenhum mês terminou com perda"
                  )
                }
              >
                Meses com ganho
              </Rotulo>
            }
          >
            <span className="font-medium">{formatarNumero(r.meses.comGanho)}</span>
            <span className="text-muted-foreground"> de {formatarNumero(r.meses.meses)}</span>
          </Fato>
        ) : null}
        <Fato
          rotulo={
            <Rotulo
              nota={
                piorDia && piorDia.valor < 0 ? (
                  <>
                    o pior foi {formatarData(piorDia.dia)}, <Valor valor={piorDia.valor} inteiro={Math.abs(piorDia.valor) >= 1000} />
                  </>
                ) : undefined
              }
            >
              Dias com ganho
            </Rotulo>
          }
        >
          <span className="font-medium">{formatarNumero(r.diasComGanho)}</span>
          <span className="text-muted-foreground"> de {formatarNumero(r.pregoes)}</span>
        </Fato>
      </Fatos>
    </div>
  );

  return (
    <>
      <div className="mt-3 grid gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,auto)_minmax(0,1fr)] xl:items-start min-[1400px]:items-end">
        <div className="min-w-0">
          <NumeroGrande valor={r.resultado} centavos={Math.abs(r.resultado) < 1000} />
          <p className="mt-3 text-sm text-pretty text-muted-foreground xl:max-w-[22rem]">
            com 1 contrato por entrada, já descontados os custos · {tamanhoDoPeriodo(periodo, r, hoje)}
          </p>
        </div>
        <div className="hidden min-w-0 xl:block xl:max-w-[46rem]">{fatos}</div>
      </div>

      {/* A altura da curva é o que sobra da janela depois do cabeçalho do robô, das abas e do número: no computador
          o número, a curva e o começo do que vem depois cabem sem rolar */}
      <div className="mt-6 min-w-0 [--alt-curva:15rem] sm:[--alt-curva:18rem] lg:mt-8 lg:[--alt-curva:clamp(14rem,calc(100dvh_-_41rem),27rem)]">
        <CurvaCapital
          linhas={recorte}
          opcoes={opcoes}
          mostrarResumo={false}
          pontosPorOperacao={pontos}
          carregarPorOperacao={jaCompleta ? undefined : carregarPorOperacao}
          // os extremos de todas as operações: a completa chega na mesma régua da leve, sem o gráfico pular
          escalaExtra={serie.extremos}
          // semana e mês têm poucos pregões: a curva por operação é a que mostra alguma coisa
          modoInicial={periodo === "semana" || periodo === "mes" ? "operacao" : "dia"}
        />
      </div>
      {r.maiorQueda > 0 ? (
        <p className="mt-1 text-[0.8125rem] text-sutil">
          Em <span className="text-negativo">vermelho</span>, a maior queda: do ponto mais alto ao mais baixo que veio depois.
        </p>
      ) : null}

      <div className="mt-6 xl:hidden">{fatos}</div>
    </>
  );
}
