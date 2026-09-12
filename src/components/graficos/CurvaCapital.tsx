"use client";

import {
  AreaSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarBRL, formatarDataCurta, formatarPontos } from "@/lib/formato";
import { filtrarPeriodo, PERIODOS, type Periodo } from "@/lib/stats/periodos";
import { curvaAcumulada, drawdownMaximo } from "@/lib/stats/serie";
import type { Base, LinhaDiaria, Unidade } from "@/lib/stats/tipos";

interface Props {
  linhas: LinhaDiaria[];
  valorPonto: number;
  hoje: string;
  periodoInicial?: Periodo;
}

const OPCOES_UNIDADE: ReadonlyArray<{ valor: Unidade; rotulo: string }> = [
  { valor: "brl", rotulo: "R$" },
  { valor: "pontos", rotulo: "Pontos" },
];
const OPCOES_BASE: ReadonlyArray<{ valor: Base; rotulo: string }> = [
  { valor: "liquido", rotulo: "Líquido" },
  { valor: "bruto", rotulo: "Bruto" },
];

// lightweight-charts não entende oklch(); cores fixas por tema
const CORES = {
  dark: {
    texto: "#a3a3a3",
    grade: "rgba(255,255,255,0.06)",
    positivo: "#4ade80",
    negativo: "#f87171",
    positivoArea: "rgba(74,222,128,0.25)",
    negativoArea: "rgba(248,113,113,0.25)",
    drawdown: "rgba(248,113,113,0.55)",
  },
  light: {
    texto: "#6b7280",
    grade: "rgba(0,0,0,0.06)",
    positivo: "#16a34a",
    negativo: "#dc2626",
    positivoArea: "rgba(22,163,74,0.18)",
    negativoArea: "rgba(220,38,38,0.18)",
    drawdown: "rgba(220,38,38,0.5)",
  },
};

function diaParaTimestamp(dia: string): UTCTimestamp {
  return (new Date(`${dia}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

/**
 * Curva de capital acumulada por contrato (pane de cima) com drawdown
 * desenhado embaixo. Toggles de período, unidade e bruto/líquido.
 */
export function CurvaCapital({ linhas, valorPonto, hoje, periodoInicial = "tudo" }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const [unidade, setUnidade] = useState<Unidade>("brl");
  const [base, setBase] = useState<Base>("liquido");

  const { resolvedTheme } = useTheme();
  const cores = resolvedTheme === "light" ? CORES.light : CORES.dark;

  const curva = useMemo(
    () => curvaAcumulada(filtrarPeriodo(linhas, periodo, hoje), { base, unidade, valorPonto }),
    [linhas, periodo, hoje, base, unidade, valorPonto],
  );
  const dd = useMemo(() => drawdownMaximo(curva), [curva]);
  const acumulado = curva.length > 0 ? curva[curva.length - 1].acumulado : 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaRef = useRef<ISeriesApi<"Area"> | null>(null);
  const histRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // cria o gráfico uma vez
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: cores.texto,
        attributionLogo: false,
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: cores.grade },
        horzLines: { color: cores.grade },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      handleScroll: { vertTouchDrag: false, pressedMouseMove: true, horzTouchDrag: true, mouseWheel: false },
      handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: true },
      crosshair: { mode: 0 },
      localization: {
        locale: "pt-BR",
        timeFormatter: (t: UTCTimestamp) =>
          formatarDataCurta(new Date(t * 1000).toISOString().slice(0, 10)),
      },
    });

    const area = chart.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    const hist = chart.addSeries(
      HistogramSeries,
      { priceLineVisible: false, lastValueVisible: false, color: cores.drawdown },
      1,
    );

    const painel = chart.panes()[1];
    if (painel) painel.setHeight(90);

    chartRef.current = chart;
    areaRef.current = area;
    histRef.current = hist;

    return () => {
      chart.remove();
      chartRef.current = null;
      areaRef.current = null;
      histRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tema, unidade e dados
  useEffect(() => {
    const chart = chartRef.current;
    const area = areaRef.current;
    const hist = histRef.current;
    if (!chart || !area || !hist) return;

    const positivo = acumulado >= 0;
    const formatador = (p: number) =>
      unidade === "brl" ? formatarBRL(p, { inteiro: Math.abs(p) >= 1000 }) : formatarPontos(p);

    chart.applyOptions({
      layout: { textColor: cores.texto },
      grid: { vertLines: { color: cores.grade }, horzLines: { color: cores.grade } },
      localization: { priceFormatter: formatador },
    });
    area.applyOptions({
      lineColor: positivo ? cores.positivo : cores.negativo,
      topColor: positivo ? cores.positivoArea : cores.negativoArea,
      bottomColor: "rgba(0,0,0,0)",
    });
    hist.applyOptions({ color: cores.drawdown });

    area.setData(curva.map((p) => ({ time: diaParaTimestamp(p.dia), value: p.acumulado })));
    hist.setData(curva.map((p) => ({ time: diaParaTimestamp(p.dia), value: p.drawdown })));
    chart.timeScale().fitContent();
  }, [curva, cores, unidade, acumulado]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          ariaLabel="Período"
          opcoes={PERIODOS}
          valor={periodo}
          onChange={setPeriodo}
          className="overflow-x-auto"
        />
        <div className="ml-auto flex gap-2">
          <Segmentado ariaLabel="Unidade" opcoes={OPCOES_UNIDADE} valor={unidade} onChange={setUnidade} />
          <Segmentado ariaLabel="Bruto ou líquido" opcoes={OPCOES_BASE} valor={base} onChange={setBase} />
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">No período</dt>
          <dd className="font-semibold">
            <Valor valor={acumulado} unidade={unidade} />
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">Drawdown máx.</dt>
          <dd className="font-semibold">
            <Valor valor={-dd.valor} unidade={unidade} />
            {dd.diasAteRecuperar !== null ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                recuperado em {dd.diasAteRecuperar} dias
              </span>
            ) : dd.valor > 0 ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">em recuperação</span>
            ) : null}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">Dias</dt>
          <dd className="font-semibold tabular-nums">{curva.length}</dd>
        </div>
      </dl>

      <div className="relative">
        <div ref={containerRef} className="h-80 w-full" />
        {curva.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Sem operações no período.
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Resultado acumulado por 1 contrato, dia a dia. Embaixo, a distância até o pico anterior
        (drawdown).
      </p>
    </div>
  );
}
