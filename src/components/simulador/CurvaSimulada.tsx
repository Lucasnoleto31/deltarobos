"use client";

import { useCallback, useId, useMemo } from "react";
import { escalaEmReais } from "@/components/graficos/CurvaCapital";
import { AmostraDaLinha, CURVA_POR_DIA, DesenhoDaCurva, MolduraProfit, PROFIT } from "@/components/graficos/CurvaProfit";
import { formatarBRL } from "@/lib/formato";
import type { PontoSimulado } from "@/lib/stats/simulador";
import { pontosDaSimulacao } from "./serie-simulada";

interface Props {
  /** a curva simulada do período (ResultadoSimulacao.serie), em ordem de dia */
  serie: PontoSimulado[];
  /** o capital inicial informado: o zero do desenho e a base do % do drawdown */
  capital: number;
  altura?: number;
}

/**
 * O patrimônio simulado dia a dia, com o drawdown embaixo, no mesmo desenho da curva de capital
 * (DesenhoDaCurva, estilo Profit). Desenha-se o ACUMULADO, não o patrimônio: a escala da curva sempre
 * inclui o zero, e o patrimônio absoluto (R$ 30 mil oscilando 2 mil) viraria uma linha reta lá no alto.
 * O zero do desenho é o capital inicial; o eixo da direita rotula capital + valor, então lê-se patrimônio.
 * O eixo do drawdown fica em R$ (a prop formatarEixoDrawdown existe para isso), porque somar o capital
 * a uma queda não faria sentido. Sem zoom por arrasto e sem marcadores: é uma leitura, não uma análise.
 */
export function CurvaSimulada({ serie, capital, altura = 320 }: Props) {
  const id = `simulador-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { pontos, rotulosX } = useMemo(() => pontosDaSimulacao(serie, capital), [serie, capital]);
  // referências estáveis: o desenho guarda o traçado enquanto os props não mudam
  const formatarEixo = useCallback((v: number) => escalaEmReais(capital + v), [capital]);
  const formatarEixoDrawdown = useCallback((v: number) => escalaEmReais(v), []);

  if (serie.length === 0) {
    return (
      <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: altura }}>
        Sem pregões no período.
      </div>
    );
  }

  return (
    <MolduraProfit
      titulo="Patrimônio simulado"
      legenda={
        <>
          <span className="inline-flex items-center gap-1.5">
            <AmostraDaLinha cores={CURVA_POR_DIA} />
            Por dia · zero = capital inicial de {formatarBRL(capital, { inteiro: true })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2" style={{ background: PROFIT.baixa, opacity: 0.62 }} />
            Drawdown
          </span>
        </>
      }
    >
      <DesenhoDaCurva
        id={id}
        pontos={pontos}
        cores={CURVA_POR_DIA}
        altura={Math.round(altura * 0.66)}
        alturaDoDrawdown={Math.max(56, Math.round(altura * 0.26))}
        rotulosX={rotulosX}
        formatarEixo={formatarEixo}
        formatarEixoDrawdown={formatarEixoDrawdown}
        rotuloVertical="Patrimônio simulado (R$)"
        rotuloAria="Patrimônio simulado dia a dia, com o drawdown embaixo"
      />
    </MolduraProfit>
  );
}
