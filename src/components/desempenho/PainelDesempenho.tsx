"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { desempacotar, type OpsEmpacotadas } from "@/components/compartilhados/ops-codec";
import { Valor } from "@/components/compartilhados/Valor";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { VAZIO_DO_PERIODO } from "@/components/robo/periodos-resumo";
import { Fato, Fatos } from "@/components/sistema/Numero";
import { Grade } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { formatarBRL, formatarData, formatarDataLonga, formatarDuracao, formatarMesAno, formatarMultiplo, formatarNumero, formatarPct, formatarPontos } from "@/lib/formato";
import { heatmapAnoMes } from "@/lib/stats/calendario";
import { calcularKpis } from "@/lib/stats/kpis";
import { dia as diaDaOperacao, porDiaSemana, porHora, porSimbolo, resumoOperacoes, sequencias } from "@/lib/stats/operacoes";
import { anoDe, dentroDoIntervalo, ehDia, ehPeriodo, filtrarIntervalo, intervaloDe, mesDe, type Intervalo, type Periodo } from "@/lib/stats/periodos";
import type { Base, LinhaDiaria, OpcoesSerie, Unidade } from "@/lib/stats/tipos";
import { ListaKpi, type ItemKpi } from "./CardsKpi";
import { Filtros, type EstadoFiltros } from "./Filtros";
import { GraficoBarras } from "./GraficoBarras";
import { juntarPorAtivo } from "./por-ativo";
import { PorSimbolo } from "./PorSimbolo";
import { presetAtivo, type PresetPeriodo } from "./presets-periodo";

interface Props {
  slug: string;
  linhas: LinhaDiaria[];
  /** as operações empacotadas por ops-codec: 158 KB em vez de 699 KB no HTML (18/09/2026) */
  pacote: OpsEmpacotadas;
  hoje: string;
  valorPonto: number;
  capitalReferencia: number | null;
  /** o ativo do cadastro do robô: o prefixo dos códigos de contrato ("WIN") e o nome de leigo ("Mini Índice") */
  ativo: string;
  ativoNome: string;
}

function lerEstado(sp: URLSearchParams, hoje: string): EstadoFiltros {
  const periodo: Periodo = ehPeriodo(sp.get("periodo")) ? (sp.get("periodo") as Periodo) : "tudo";
  const contratosBruto = Number.parseInt(sp.get("contratos") ?? "1", 10);
  return {
    periodo,
    de: ehDia(sp.get("de")) ? (sp.get("de") as string) : "",
    ate: ehDia(sp.get("ate")) ? (sp.get("ate") as string) : hoje,
    unidade: sp.get("unidade") === "pontos" ? "pontos" : "brl",
    base: sp.get("base") === "bruto" ? "bruto" : "liquido",
    contratos: Number.isFinite(contratosBruto) && contratosBruto >= 1 && contratosBruto <= 1000 ? contratosBruto : 1,
  };
}

function urlDe(e: EstadoFiltros, pathname: string, hoje: string): string {
  const p = new URLSearchParams();
  if (e.periodo !== "tudo") p.set("periodo", e.periodo);
  if (e.periodo === "personalizado") {
    if (e.de) p.set("de", e.de);
    if (e.ate && e.ate !== hoje) p.set("ate", e.ate);
  }
  if (e.unidade !== "brl") p.set("unidade", e.unidade);
  if (e.base !== "liquido") p.set("base", e.base);
  if (e.contratos !== 1) p.set("contratos", String(e.contratos));
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Um valor dentro de uma frase, com o sinal e a unidade: "+R$ 200,75", "-12.075 pts". */
function valorEmTexto(v: number, unidade: Unidade): string {
  return unidade === "brl" ? formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v, true)} pts`;
}

const fmtMesPorExtenso = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
/** "novembro de 2026" */
const mesPorExtenso = (dia: string) => fmtMesPorExtenso.format(new Date(`${dia}T00:00:00Z`));

/** `de` é o dia 1º e `ate` o último dia do mesmo mês: é o que o clique numa barra de mês escolhe. */
function ehMesInteiro(de: string, ate: string): boolean {
  if (!de.endsWith("-01") || mesDe(de) !== mesDe(ate)) return false;
  const [ano, mes] = de.split("-").map(Number);
  return ate === new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

// os períodos de dias corridos saíram dos atalhos em 18/09/2026, mas um link antigo ainda pode trazê-los
const ULTIMOS: Partial<Record<Periodo, string>> = {
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
  "3m": "nos últimos 3 meses",
  "12m": "nos últimos 12 meses",
};

/** O período em palavras, para a linha debaixo do número: "desde 13 de fevereiro de 2026", "em março de 2026". */
function quandoFoi(preset: PresetPeriodo, estado: EstadoFiltros, intervalo: Intervalo, primeiroDia: string | null, hoje: string): string {
  switch (preset) {
    case "tudo":
      return primeiroDia ? `desde ${formatarDataLonga(primeiroDia)}` : "";
    case "ano":
      return `em ${anoDe(hoje)}`;
    case "mes":
      return `em ${mesPorExtenso(hoje)}`;
    case "semana":
      return "nesta semana";
    case "hoje":
      return `hoje, ${formatarDataLonga(hoje)}`;
    case "personalizado": {
      const ultimos = ULTIMOS[estado.periodo];
      if (ultimos) return ultimos;
      const { de, ate } = intervalo;
      if (de && ate) {
        if (de === ate) return `em ${formatarDataLonga(de)}`;
        return ehMesInteiro(de, ate) ? `em ${mesPorExtenso(de)}` : `de ${formatarData(de)} a ${formatarData(ate)}`;
      }
      return ate ? `até ${formatarData(ate)}` : "";
    }
  }
}

/** O período sem operação, dito uma vez e em palavras, no lugar de uma tela de zeros. */
function semOperacao(preset: PresetPeriodo): string {
  switch (preset) {
    case "hoje":
      return "Hoje ainda sem operação fechada.";
    case "semana":
    case "mes":
    case "ano":
    case "tudo":
      return VAZIO_DO_PERIODO[preset];
    case "personalizado":
      return "Sem operações fechadas no período escolhido.";
  }
}

/**
 * O número principal da tela, em R$ ou em pontos. É o desenho do NumeroGrande do sistema (o sinal e o "R$"
 * mais leves que os algarismos, negativo em vermelho), que só escreve reais: aqui a unidade é um filtro, e
 * em pontos o "pts" vai depois do número, pequeno e leve.
 */
function NumeroDoPeriodo({ valor, unidade }: { valor: number; unidade: Unidade }) {
  // a partir de mil, sem centavos nem décimo de ponto: no número grande eles só fazem ruído
  const grande = Math.abs(valor) >= 1000;
  const texto = unidade === "brl" ? formatarBRL(valor, { sinal: true, inteiro: grande }) : grande ? formatarNumero(valor, 0, true) : formatarPontos(valor, true);
  const corte = texto.search(/\d/);
  const prefixo = corte < 0 ? "" : texto.slice(0, corte).trim();
  const algarismos = corte < 0 ? texto : texto.slice(corte);
  const leve = cn("font-normal", valor >= 0 && "text-muted-foreground");
  return (
    <p className={cn("numero-grande", valor < 0 && "text-negativo")}>
      {prefixo ? <span className={cn("mr-[0.18em]", leve)}>{prefixo}</span> : null}
      {algarismos}
      {unidade === "pontos" ? <span className={cn("ml-[0.3em] text-[0.42em] tracking-normal", leve)}>pts</span> : null}
    </p>
  );
}

/**
 * Aba Desempenho (ficha Mesa, 25/11/2026). A pergunta da tela: em que períodos o robô ganha e em que
 * períodos perde? Um estado de filtros vale para a tela toda e mora na URL, que pode ser compartilhada.
 *
 * O desenho, sem caixas, de cima para baixo:
 * - a linha de título com os filtros à direita (período, unidade, custos, contratos), em texto;
 * - o resultado do período em número grande, com a premissa e o período escritos embaixo, e ao lado os
 *   fatos: meses e dias com ganho, o pior dia e a maior queda;
 * - a curva, na largura toda (CurvaCapital: por dia e por operação);
 * - o resultado de cada mês em barras; clicar numa barra filtra a tela naquele mês;
 * - o resultado por dia da semana e por horário de entrada, lado a lado;
 * - "Mais números", em lista, com o link para as operações do período.
 *
 * O que saiu nesta passada (Lucas: "coisas que não são necessárias pode tirar"): a fileira de quatro cartões
 * que abria a tela e a lista de oito números logo depois dela (o que não estava repetido foi para "Mais
 * números", no fim); o histograma do resultado por operação; os títulos com "o que é" em cada gráfico; e a
 * lista por código de contrato, que para robô de um ativo só era o resultado por mês contado de outro jeito
 * (agora é por ativo, e só aparece quando o robô operou mais de um). A maior queda em % do capital fica na
 * aba Quedas e risco.
 *
 * Num período sem operação a tela diz isso uma vez, em palavras, e fica só com as barras dos meses. Num
 * período de um dia só, os fatos são a melhor e a pior operação do dia, e o gráfico por dia da semana não
 * entra (seria uma barra e quatro zeros).
 */
export function PainelDesempenho({ slug, linhas, pacote, hoje, valorPonto, capitalReferencia, ativo, ativoNome }: Props) {
  const ops = useMemo(() => desempacotar(pacote), [pacote]);
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [estado, setEstado] = useState<EstadoFiltros>(() => lerEstado(sp, hoje));

  // estado -> URL (compartilhável), sem empurrar histórico
  useEffect(() => {
    const alvo = urlDe(estado, pathname, hoje);
    const atual = sp.size > 0 ? `${pathname}?${sp.toString()}` : pathname;
    if (alvo !== atual) router.replace(alvo, { scroll: false });
  }, [estado, pathname, hoje, router, sp]);

  const intervalo = useMemo(
    () => intervaloDe(estado.periodo, hoje, { de: estado.de || null, ate: estado.ate || null }),
    [estado.periodo, estado.de, estado.ate, hoje],
  );
  const opcoes = useMemo<OpcoesSerie & { base: Base; unidade: Unidade }>(
    () => ({ base: estado.base, unidade: estado.unidade, valorPonto, contratos: estado.contratos }),
    [estado.base, estado.unidade, estado.contratos, valorPonto],
  );

  const linhasF = useMemo(() => filtrarIntervalo(linhas, intervalo), [linhas, intervalo]);
  const opsF = useMemo(() => ops.filter((op) => dentroDoIntervalo(diaDaOperacao(op), intervalo)), [ops, intervalo]);

  const kpis = useMemo(() => calcularKpis(linhasF, opcoes, { hoje, capitalReferencia }), [linhasF, opcoes, hoje, capitalReferencia]);
  const resumo = useMemo(() => resumoOperacoes(opsF, opcoes), [opsF, opcoes]);
  const seq = useMemo(() => sequencias(opsF), [opsF]);
  // as barras dos meses vêm do histórico inteiro, não do período: são elas que escolhem o mês
  const mensal = useMemo(
    () =>
      heatmapAnoMes(linhas, opcoes)
        .flatMap((l) => l.meses.filter((m): m is NonNullable<typeof m> => m !== null))
        .map((m) => ({ rotulo: formatarMesAno(`${m.mes}-01`), valor: m.total, n: m.nDias, mes: m.mes })),
    [linhas, opcoes],
  );
  // os meses do período, para o fato "Meses com ganho" ao lado do número
  const meses = useMemo(() => {
    const doPeriodo = heatmapAnoMes(linhasF, opcoes).flatMap((l) => l.meses.filter((m): m is NonNullable<typeof m> => m !== null));
    return { total: doPeriodo.length, comGanho: doPeriodo.filter((m) => m.total > 0).length };
  }, [linhasF, opcoes]);
  const porDia = useMemo(() => porDiaSemana(opsF, opcoes), [opsF, opcoes]);
  const porHoraF = useMemo(() => porHora(opsF, opcoes), [opsF, opcoes]);
  const ativos = useMemo(
    () => juntarPorAtivo(porSimbolo(opsF, opcoes), { prefixo: ativo, nome: ativoNome }),
    [opsF, opcoes, ativo, ativoNome],
  );

  // clicar num mês nas barras filtra a tela inteira naquele mês
  const verMes = (mes: string) => {
    const [ano, m] = mes.split("-").map(Number);
    const ultimo = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
    setEstado((s) => ({ ...s, periodo: "personalizado", de: `${mes}-01`, ate: ultimo < hoje ? ultimo : hoje }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (linhas.length === 0) {
    return <p className="py-12 text-sm text-muted-foreground">{VAZIO_DO_PERIODO.tudo}</p>;
  }

  const unidade = estado.unidade;
  const preset = presetAtivo(estado, hoje);
  const primeiroDia = linhasF.reduce<string | null>((m, l) => (m === null || l.dia < m ? l.dia : m), null);
  const quando = quandoFoi(preset, estado, intervalo, primeiroDia, hoje);
  const premissa = `com ${formatarNumero(estado.contratos)} ${estado.contratos === 1 ? "contrato" : "contratos"}, ${
    estado.base === "liquido" ? "já descontados os custos" : "antes dos custos"
  }`;

  const temDias = linhasF.length > 0;
  // num período de um dia só, "dias com ganho", "pior dia" e "maior queda" repetiriam o número grande: os
  // fatos passam a ser a melhor e a pior operação do dia
  const umDiaSo = kpis.nDias === 1;
  const duracaoMedia = resumo.duracaoMediaSeg >= 1 ? `duração média de ${formatarDuracao(resumo.duracaoMediaSeg)}` : null;
  // o dia da semana só diz alguma coisa com mais de um dia da semana no período; senão é uma fileira de zeros
  const temDiasDaSemana = porDia.filter((f) => f.n > 0).length > 1;

  const linkOperacoes = (() => {
    const p = new URLSearchParams();
    if (intervalo.de) p.set("de", intervalo.de);
    if (intervalo.ate && intervalo.ate !== hoje) p.set("ate", intervalo.ate);
    const qs = p.toString();
    return `/robos/${slug}/operacoes${qs ? `?${qs}` : ""}`;
  })();

  // a base do percentual de retorno: o capital de referência vezes os contratos do filtro (19/09/2026: o %
  // aparecia sem dizer sobre quanto)
  const capitalDoFiltro = capitalReferencia && capitalReferencia > 0 ? formatarBRL(capitalReferencia * estado.contratos, { inteiro: true }) : null;
  const retornoPct = unidade === "brl" && capitalReferencia && capitalReferencia > 0 ? kpis.acumulado / (capitalReferencia * estado.contratos) : null;

  // "Mais números": o que não está no alto da tela nem nos gráficos, cada um com a linha de apoio em
  // português simples. Em pares no lg: operações e acertos, ganho e perda, a relação entre os dois e o fator
  // de lucro, melhor dia e sequência, média por mês e retorno. Número que não existe no período (sem perda
  // não há perda média nem fator de lucro) não entra: não se mostra linha com zero ou traço. O "o que é" do
  // glossário fica só nos termos que o leigo não conhece (em 19/09/2026 estava em todos; ficha Mesa,
  // 25/11/2026: rótulo comum não leva).
  const maisNumeros: ItemKpi[] = [
    {
      rotulo: "Operações",
      valor: formatarNumero(resumo.n),
      // o histórico importado não traz a duração de cada operação ("duração média de 0 s" não diz nada), e
      // num dia só a média por dia é a própria contagem
      detalhe: umDiaSo
        ? (duracaoMedia ?? undefined)
        : `${formatarNumero(resumo.mediaPorDia, 1)} por dia de pregão${duracaoMedia ? `, com ${duracaoMedia}` : ""}`,
    },
    {
      rotulo: "Acertos",
      valor: formatarPct(kpis.taxaAcerto),
      // espaço que não quebra: o número não se separa do que ele conta na quebra de linha (19/09/2026)
      detalhe: (
        <>
          {formatarNumero(resumo.nGain)}&nbsp;operações com ganho e {formatarNumero(resumo.nLoss)}&nbsp;com perda
        </>
      ),
    },
  ];
  if (resumo.nGain > 0) {
    maisNumeros.push({
      rotulo: "Ganho médio por operação",
      valor: <Valor valor={resumo.mediaGain} unidade={unidade} />,
      // num dia só, a melhor e a pior operação já estão ao lado do número grande
      detalhe: umDiaSo ? undefined : `o maior foi de ${valorEmTexto(resumo.maiorGain, unidade)}`,
    });
  }
  if (resumo.nLoss > 0) {
    maisNumeros.push({
      rotulo: "Perda média por operação",
      valor: <Valor valor={resumo.mediaLoss} unidade={unidade} />,
      detalhe: umDiaSo ? undefined : `a maior foi de ${valorEmTexto(resumo.maiorLoss, unidade)}`,
    });
  }
  if (kpis.payoff !== null) {
    maisNumeros.push({
      rotulo: "Ganho médio contra perda média",
      info: "payoff",
      valor: formatarMultiplo(kpis.payoff),
      detalhe: `o ganho médio é ${formatarPct(kpis.payoff, 0)} da perda média`,
    });
  }
  if (kpis.fatorLucro !== null) {
    maisNumeros.push({
      rotulo: "Fator de lucro",
      info: "fatorLucro",
      valor: formatarMultiplo(kpis.fatorLucro),
      detalhe:
        unidade === "brl"
          ? `ganhou ${formatarBRL(kpis.fatorLucro)} para cada R$ 1 perdido`
          : `para cada ponto perdido, ganhou ${formatarMultiplo(kpis.fatorLucro)}`,
    });
  }
  if (!umDiaSo && kpis.melhorDia && kpis.melhorDia.valor > 0) {
    maisNumeros.push({
      rotulo: "Melhor dia",
      valor: <Valor valor={kpis.melhorDia.valor} unidade={unidade} inteiro={Math.abs(kpis.melhorDia.valor) >= 1000} />,
      detalhe: formatarDataLonga(kpis.melhorDia.dia),
    });
  }
  if (resumo.n > 1) {
    // contagem de operações, não resultado: numa cor só e numa linha só (19/09/2026: quebrava em três cores)
    maisNumeros.push({
      rotulo: "Maior sequência",
      valor: (
        <>
          {formatarNumero(seq.maiorGains)}&nbsp;com ganho · {formatarNumero(seq.maiorLosses)}&nbsp;com perda
        </>
      ),
      detalhe: "em operações seguidas",
    });
  }
  // com um mês só a média é o próprio número grande
  if (kpis.nMeses > 1) {
    maisNumeros.push({
      rotulo: "Média por mês",
      valor: <Valor valor={kpis.mediaMensal} unidade={unidade} inteiro={Math.abs(kpis.mediaMensal) >= 1000} />,
      detalhe: `o resultado do período dividido pelos ${formatarNumero(kpis.nMeses)} meses com operação`,
    });
  }
  if (retornoPct !== null && capitalDoFiltro !== null) {
    maisNumeros.push({
      rotulo: "Retorno sobre o capital",
      info: "retorno",
      valor: <Valor valor={retornoPct} unidade="pct" />,
      detalhe: `o resultado do período sobre um capital de ${capitalDoFiltro}`,
    });
  }

  return (
    <>
      <section aria-labelledby="desempenho-titulo">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <h2 id="desempenho-titulo" className="text-[0.9375rem] font-normal text-muted-foreground">
            {estado.periodo === "tudo" ? "Resultado desde o início" : "Resultado no período"}
          </h2>
          {/* os filtros valem para a tela toda; ficam à direita, na borda do gráfico */}
          <Filtros estado={estado} onChange={(patch) => setEstado((s) => ({ ...s, ...patch }))} hoje={hoje} className="lg:ml-auto lg:justify-end" />
        </div>

        {temDias ? (
          <>
            <div className="mt-3 grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,22rem)] lg:items-end lg:justify-start">
              <div className="min-w-0">
                <NumeroDoPeriodo valor={kpis.acumulado} unidade={unidade} />
                <p className="mt-3 text-sm text-pretty text-muted-foreground">
                  {premissa}
                  {quando ? ` · ${quando}` : ""}
                </p>
              </div>

              <Fatos className="lg:pb-0.5">
                {umDiaSo ? (
                  <>
                    {resumo.maiorGain > 0 ? (
                      <Fato rotulo="Melhor operação">
                        <Valor valor={resumo.maiorGain} unidade={unidade} className="font-medium" />
                      </Fato>
                    ) : null}
                    {resumo.maiorLoss < 0 ? (
                      <Fato rotulo="Pior operação">
                        <Valor valor={resumo.maiorLoss} unidade={unidade} className="font-medium" />
                      </Fato>
                    ) : null}
                  </>
                ) : (
                  <>
                    {meses.total > 1 ? (
                      <Fato rotulo="Meses com ganho">
                        <span className="font-medium">{formatarNumero(meses.comGanho)}</span>
                        <span className="text-muted-foreground"> de {formatarNumero(meses.total)}</span>
                      </Fato>
                    ) : null}
                    <Fato rotulo="Dias com ganho">
                      <span className="font-medium">{formatarNumero(kpis.diasPositivos)}</span>
                      <span className="text-muted-foreground"> de {formatarNumero(kpis.nDias)}</span>
                    </Fato>
                    {kpis.piorDia && kpis.piorDia.valor < 0 ? (
                      <Fato rotulo="Pior dia">
                        <span className="mr-3 text-sutil">{formatarData(kpis.piorDia.dia)}</span>
                        <Valor valor={kpis.piorDia.valor} unidade={unidade} inteiro={Math.abs(kpis.piorDia.valor) >= 1000} className="font-medium" />
                      </Fato>
                    ) : null}
                    <Fato rotulo="Maior queda" info="drawdown">
                      {kpis.drawdown.valor === 0 ? (
                        <span className="text-sutil">nenhuma</span>
                      ) : (
                        <Valor valor={-kpis.drawdown.valor} unidade={unidade} inteiro={kpis.drawdown.valor >= 1000} className="font-medium" />
                      )}
                    </Fato>
                  </>
                )}
              </Fatos>
            </div>

            {/* a curva do período, por dia ou por operação; período, unidade, custos e contratos vêm dos filtros */}
            <div className="mt-8 min-w-0">
              <CurvaCapital linhas={linhasF} opcoes={opcoes} operacoes={opsF} mostrarResumo={false} altura={360} />
            </div>
          </>
        ) : (
          <p className="pt-10 pb-2 text-sm text-muted-foreground">{semOperacao(preset)}</p>
        )}
      </section>

      {/* 19/09/2026: o mapa "Ano × mês" saiu daqui (é o mesmo da aba Dia a dia, e as barras já escolhem o mês),
          e a seção de risco também: o risco fica só na aba Quedas e risco. Com um mês só de histórico, a barra
          única repetiria o número grande. */}
      {mensal.length > 1 ? (
        <Painel
          id="por-mes"
          titulo="Resultado por mês"
          // as barras vêm do histórico inteiro: com outro período no filtro, isso muda a leitura
          apoio={estado.periodo !== "tudo" ? "todo o histórico, não só o período escolhido" : undefined}
          fio={false}
        >
          <GraficoBarras dados={mensal} unidade={unidade} altura={260} rotuloN="Dias de pregão" aoEscolher={(i) => verMes(mensal[i].mes)} />
        </Painel>
      ) : null}

      {resumo.n > 0 ? (
        <>
          {/* eram três gráficos iguais lado a lado (com o histograma por operação); ficam os dois que
              respondem à pergunta da tela, e o do horário ocupa a linha quando o do dia da semana não entra */}
          <Grade>
            {temDiasDaSemana ? (
              <Painel id="por-dia-da-semana" titulo="Resultado por dia da semana" fio={false} className="xl:col-span-6">
                <GraficoBarras dados={porDia.map((f) => ({ rotulo: f.rotulo, valor: f.total, n: f.n }))} unidade={unidade} altura={220} />
              </Painel>
            ) : null}
            <Painel id="por-horario" titulo="Resultado por horário de entrada" fio={false} className={temDiasDaSemana ? "xl:col-span-6" : "xl:col-span-12"}>
              <GraficoBarras dados={porHoraF.map((f) => ({ rotulo: f.rotulo, valor: f.total, n: f.n }))} unidade={unidade} altura={220} />
            </Painel>
          </Grade>

          {ativos.length > 1 ? (
            <Painel id="por-ativo" titulo="Resultado por ativo" corpo="">
              <PorSimbolo faixas={ativos} unidade={unidade} />
            </Painel>
          ) : null}

          <Painel
            id="mais-numeros"
            titulo="Mais números"
            corpo=""
            acao={
              <Link href={linkOperacoes} className={LINK_DO_PAINEL}>
                Ver operações e exportar CSV
              </Link>
            }
          >
            <ListaKpi itens={maisNumeros} />
          </Painel>
        </>
      ) : null}
    </>
  );
}
