"use client";

import { Activity, BarChart3, Percent, Scale, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { buttonVariants } from "@/components/ui/button";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { formatarBRL, formatarData, formatarDuracao, formatarMesAno, formatarMultiplo, formatarNumero, formatarPct, formatarPontos } from "@/lib/formato";
import { heatmapAnoMes } from "@/lib/stats/calendario";
import { calcularKpis } from "@/lib/stats/kpis";
import {
  dia as diaDaOperacao,
  histograma,
  porDiaSemana,
  porHora,
  porSimbolo,
  resumoOperacoes,
  sequencias,
  type OperacaoCompacta,
} from "@/lib/stats/operacoes";
import { dentroDoIntervalo, ehDia, ehPeriodo, filtrarIntervalo, intervaloDe, type Periodo } from "@/lib/stats/periodos";
import { episodiosDrawdown } from "@/lib/stats/risco";
import { curvaAcumulada, drawdownMaximo } from "@/lib/stats/serie";
import type { Base, LinhaDiaria, OpcoesSerie, Unidade } from "@/lib/stats/tipos";
import { CardsKpi, type ItemKpi } from "./CardsKpi";
import { Filtros, type EstadoFiltros } from "./Filtros";
import { GraficoBarras } from "./GraficoBarras";
import { Heatmap } from "./Heatmap";
import { PorSimbolo } from "./PorSimbolo";
import { Risco } from "./Risco";

interface Props {
  slug: string;
  linhas: LinhaDiaria[];
  ops: OperacaoCompacta[];
  feriados: string[];
  hoje: string;
  valorPonto: number;
  capitalReferencia: number | null;
  margem: number | null;
  fatorSeguranca: number;
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

function rotuloUnidade(v: number, unidade: Unidade): string {
  return unidade === "brl" ? formatarBRL(v, { inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v)} pts`;
}

/** Aba Desempenho: um estado de filtros vale pra todas as seções. */
export function PainelDesempenho({
  slug,
  linhas,
  ops,
  hoje,
  valorPonto,
  capitalReferencia,
  margem,
  fatorSeguranca,
}: Props) {
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
  const curva = useMemo(() => curvaAcumulada(linhasF, opcoes), [linhasF, opcoes]);
  const episodios = useMemo(() => episodiosDrawdown(curva, 5), [curva]);
  const drawdownBrl = useMemo(
    () => drawdownMaximo(curvaAcumulada(linhasF, { base: "liquido", unidade: "brl", valorPonto, contratos: 1 })).valor,
    [linhasF, valorPonto],
  );
  const heatmap = useMemo(() => heatmapAnoMes(linhas, opcoes), [linhas, opcoes]);
  const mensal = useMemo(
    () => heatmap.flatMap((l) => l.meses.filter((m): m is NonNullable<typeof m> => m !== null)).map((m) => ({ rotulo: formatarMesAno(`${m.mes}-01`), valor: m.total, n: m.nDias })),
    [heatmap],
  );
  const porDia = useMemo(() => porDiaSemana(opsF, opcoes), [opsF, opcoes]);
  const porHoraF = useMemo(() => porHora(opsF, opcoes), [opsF, opcoes]);
  const hist = useMemo(() => histograma(opsF, opcoes, 12), [opsF, opcoes]);
  const simbolos = useMemo(() => porSimbolo(opsF, opcoes), [opsF, opcoes]);

  const retornoPct =
    estado.unidade === "brl" && capitalReferencia && capitalReferencia > 0
      ? kpis.acumulado / (capitalReferencia * estado.contratos)
      : null;

  const linkOperacoes = (() => {
    const p = new URLSearchParams();
    if (intervalo.de) p.set("de", intervalo.de);
    if (intervalo.ate && intervalo.ate !== hoje) p.set("ate", intervalo.ate);
    const qs = p.toString();
    return `/robos/${slug}/operacoes${qs ? `?${qs}` : ""}`;
  })();

  if (linhas.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        Ainda não há operações fechadas pra montar o desempenho.
      </p>
    );
  }

  const cards: ItemKpi[] = [
    { rotulo: "Operações", valor: formatarNumero(resumo.n), detalhe: `${formatarNumero(resumo.nGain)} gain de ${formatarNumero(resumo.n)}`, tom: "info", icone: <BarChart3 className="size-4" /> },
    { rotulo: "Taxa de acerto", valor: formatarPct(kpis.taxaAcerto), detalhe: `${resumo.nGain} × ${resumo.nLoss}`, tom: (kpis.taxaAcerto ?? 0) >= 0.5 ? "positivo" : "negativo", icone: <Percent className="size-4" /> },
    { rotulo: "Fator de lucro", valor: formatarMultiplo(kpis.fatorLucro), detalhe: "gains ÷ losses", tom: (kpis.fatorLucro ?? 0) >= 1 ? "positivo" : "negativo", icone: <Scale className="size-4" /> },
    {
      rotulo: "Rebaixamento máx.",
      valor: kpis.drawdownMaximoPct !== null ? formatarPct(kpis.drawdownMaximoPct) : <Valor valor={-kpis.drawdown.valor} unidade={estado.unidade} inteiro={kpis.drawdown.valor >= 1000} />,
      detalhe: kpis.drawdownMaximoPct !== null ? rotuloUnidade(-kpis.drawdown.valor, estado.unidade) : kpis.drawdown.fundo ? `fundo em ${formatarData(kpis.drawdown.fundo)}` : undefined,
      tom: "negativo",
      icone: <Activity className="size-4" />,
    },
    { rotulo: "Ganho médio", valor: <Valor valor={resumo.mediaGain} unidade={estado.unidade} />, detalhe: `maior ${rotuloUnidade(resumo.maiorGain, estado.unidade)}`, tom: "positivo", icone: <TrendingUp className="size-4" /> },
    { rotulo: "Perda média", valor: <Valor valor={resumo.mediaLoss} unidade={estado.unidade} />, detalhe: `maior ${rotuloUnidade(resumo.maiorLoss, estado.unidade)}`, tom: "negativo", icone: <TrendingDown className="size-4" /> },
    { rotulo: "Payoff", valor: formatarMultiplo(kpis.payoff), detalhe: "ganho médio ÷ perda média" },
    { rotulo: "Média mensal", valor: <Valor valor={kpis.mediaMensal} unidade={estado.unidade} inteiro={Math.abs(kpis.mediaMensal) >= 1000} />, detalhe: `${kpis.nMeses} ${kpis.nMeses === 1 ? "mês" : "meses"}` },
    { rotulo: "Melhor dia", valor: kpis.melhorDia ? <Valor valor={kpis.melhorDia.valor} unidade={estado.unidade} inteiro={Math.abs(kpis.melhorDia.valor) >= 1000} /> : "–", detalhe: kpis.melhorDia ? formatarData(kpis.melhorDia.dia) : undefined },
    { rotulo: "Pior dia", valor: kpis.piorDia ? <Valor valor={kpis.piorDia.valor} unidade={estado.unidade} inteiro={Math.abs(kpis.piorDia.valor) >= 1000} /> : "–", detalhe: kpis.piorDia ? formatarData(kpis.piorDia.dia) : undefined },
    { rotulo: "Dias positivos × negativos", valor: <><span className="text-positivo">{kpis.diasPositivos}</span><span className="text-muted-foreground"> × </span><span className="text-negativo">{kpis.diasNegativos}</span></>, detalhe: `${kpis.nDias} dias de pregão` },
    { rotulo: "Maior sequência", valor: <><span className="text-positivo">{seq.maiorGains}</span><span className="text-muted-foreground"> gains · </span><span className="text-negativo">{seq.maiorLosses}</span><span className="text-muted-foreground"> losses</span></>, detalhe: "operação a operação" },
  ];

  return (
    <div className="space-y-8">
      {/* número grande */}
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Desempenho · {estado.contratos} {estado.contratos === 1 ? "contrato" : "contratos"} · {estado.base === "liquido" ? "líquido de custos" : "bruto"}
        </p>
        <p className="text-5xl font-semibold tracking-tight sm:text-6xl">
          <Valor valor={kpis.acumulado} unidade={estado.unidade} />
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
          <span>
            <strong className="text-foreground">{formatarNumero(resumo.n)}</strong> operações
          </span>
          {retornoPct !== null ? (
            <span>
              · retorno <strong className={retornoPct >= 0 ? "text-positivo" : "text-negativo"}>{formatarPct(retornoPct, 2)}</strong>
            </span>
          ) : null}
          <span>
            · acerto <strong className="text-foreground">{formatarPct(kpis.taxaAcerto)}</strong>
          </span>
          <span>
            · fator de lucro <strong className="text-foreground">{formatarMultiplo(kpis.fatorLucro)}</strong>
          </span>
          <span>
            · {formatarNumero(resumo.mediaPorDia, 1)} op./dia · duração média {formatarDuracao(resumo.duracaoMediaSeg)}
          </span>
        </p>
      </header>

      <Filtros estado={estado} onChange={(patch) => setEstado((s) => ({ ...s, ...patch }))} hoje={hoje} linkOperacoes={linkOperacoes} />

      <CardsKpi itens={cards} />

      <section className="painel p-4 sm:p-5">
        <h2 className="mb-3 font-semibold">Curva de capital</h2>
        <CurvaCapital linhas={linhasF} opcoes={opcoes} operacoes={opsF} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="painel p-4 sm:p-5">
          <h2 className="font-semibold">Resultado mensal</h2>
          <p className="mb-3 text-xs text-muted-foreground">{mensal.length} meses · todo o histórico</p>
          <GraficoBarras dados={mensal} unidade={estado.unidade} rotuloN="Dias de pregão" />
        </section>
        <section className="painel p-4 sm:p-5">
          <h2 className="font-semibold">Resultado por ativo</h2>
          <p className="mb-3 text-xs text-muted-foreground">séries do contrato no período</p>
          <PorSimbolo faixas={simbolos} unidade={estado.unidade} />
        </section>
      </div>

      {/* O mapa ocupa a largura toda: ao lado do cartão de atalhos a coluna "Total" não cabia (a tabela tem
          640 px de mínimo). Os atalhos ficaram numa linha só, sem o parágrafo: as abas em cima já dizem o mesmo. */}
      <section className="painel p-4 sm:p-5">
        <h2 className="font-semibold">Ano × mês</h2>
        <p className="mb-3 text-xs text-muted-foreground">todo o histórico</p>
        <Heatmap linhas={heatmap} unidade={estado.unidade} />
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="text-xs text-muted-foreground">O dia a dia, o risco e as faixas em detalhe:</span>
          <div className="flex flex-wrap gap-2">
            <Link href={`/robos/${slug}/calendario`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Calendário
            </Link>
            <Link href={`/robos/${slug}/risco`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Risco
            </Link>
            <Link href={`/robos/${slug}/faixas`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Validação de faixas
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Distribuição</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="painel p-4">
            <h3 className="mb-2 text-sm font-medium">Por dia da semana</h3>
            <GraficoBarras dados={porDia.map((f) => ({ rotulo: f.rotulo, valor: f.total, n: f.n }))} unidade={estado.unidade} altura={200} />
          </div>
          <div className="painel p-4">
            <h3 className="mb-2 text-sm font-medium">Por hora de entrada</h3>
            <GraficoBarras dados={porHoraF.map((f) => ({ rotulo: f.rotulo, valor: f.total, n: f.n }))} unidade={estado.unidade} altura={200} />
          </div>
          <div className="painel p-4">
            <h3 className="mb-2 text-sm font-medium">Resultado por operação</h3>
            <GraficoBarras
              dados={hist.map((f) => ({ rotulo: rotuloUnidade((f.de + f.ate) / 2, estado.unidade), valor: f.n }))}
              unidade={estado.unidade}
              altura={200}
              contagem
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Risco</h2>
        <Risco
          kpis={kpis}
          episodios={episodios}
          unidade={estado.unidade}
          contratos={estado.contratos}
          capitalReferencia={capitalReferencia}
          margem={margem}
          fatorSeguranca={fatorSeguranca}
          drawdownBrlPorContrato={drawdownBrl}
        />
      </section>
    </div>
  );
}
