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
import { useEffect, useMemo, useRef } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarBRL, formatarDataCurta, formatarPontos } from "@/lib/formato";
import { curvaAcumulada, drawdownMaximo } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";

interface Props {
  /** série já filtrada pelo período desejado */
  linhas: readonly LinhaDiaria[];
  opcoes: OpcoesSerie;
  altura?: number;
  mostrarResumo?: boolean;
}

// lightweight-charts não lê variável CSS; cores fixas por tema, as mesmas dos tokens do globals.css
const CORES = {
  dark: {
    texto: "#aca496",
    grade: "rgba(248,245,239,0.06)",
    positivo: "#53b86f",
    negativo: "#e8594b",
    positivoArea: "rgba(83,184,111,0.22)",
    negativoArea: "rgba(232,89,75,0.22)",
    drawdown: "rgba(232,89,75,0.5)",
  },
  light: {
    texto: "#71685c",
    grade: "rgba(20,20,22,0.06)",
    positivo: "#2e6f40",
    negativo: "#b22222",
    positivoArea: "rgba(46,111,64,0.16)",
    negativoArea: "rgba(178,34,34,0.16)",
    drawdown: "rgba(178,34,34,0.45)",
  },
};

function diaParaTimestamp(dia: string): UTCTimestamp {
  return (new Date(`${dia}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

/**
 * Curva de capital acumulada por contrato (pane de cima) com drawdown
 * desenhado embaixo. Quem controla período, unidade e base é o pai.
 */
export function CurvaCapital({ linhas, opcoes, altura = 320, mostrarResumo = true }: Props) {
  const { resolvedTheme } = useTheme();
  const cores = resolvedTheme === "light" ? CORES.light : CORES.dark;

  const curva = useMemo(() => curvaAcumulada(linhas, opcoes), [linhas, opcoes]);
  const dd = useMemo(() => drawdownMaximo(curva), [curva]);
  const acumulado = curva.length > 0 ? curva[curva.length - 1].acumulado : 0;
  const unidade = opcoes.unidade;

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
    if (painel) painel.setHeight(Math.round(altura * 0.28));

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
      {mostrarResumo ? (
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
      ) : null}

      <div className="relative">
        <div ref={containerRef} className="w-full" style={{ height: altura }} />
        {curva.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Sem operações no período.
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Resultado acumulado por {opcoes.contratos ?? 1}{" "}
        {(opcoes.contratos ?? 1) === 1 ? "contrato" : "contratos"}, dia a dia. Embaixo, a distância
        até o pico anterior (drawdown).
      </p>
    </div>
  );
}
