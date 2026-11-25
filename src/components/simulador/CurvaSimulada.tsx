"use client";

import { useMemo } from "react";
import { GraficoResultado } from "@/components/graficos/GraficoResultado";
import type { PontoSimulado } from "@/lib/stats/simulador";
import type { Drawdown } from "@/lib/stats/tipos";
import { quedaDaSimulacao } from "./serie-simulada";

interface Props {
  /** a curva simulada do período (ResultadoSimulacao.serie), em ordem de dia */
  serie: PontoSimulado[];
  /** a maior queda que a simulação achou (ResultadoSimulacao.drawdown): o trecho pintado de vermelho */
  drawdown: Drawdown;
  /** o pregão sob o ponteiro: quem chama troca o número grande pela leitura dele */
  ativo: number | null;
  aoApontar: (indice: number | null) => void;
  className?: string;
}

// A altura da curva nesta tela: desconta o que o simulador tem acima do gráfico (a fita, o cabeçalho da página,
// o número com os fatos e a frase do semáforo), para o resultado inteiro caber sem rolar em 1440 e 1920 px.
const ALTURA = { "--alt-curva": "clamp(14rem, calc(100dvh - 33rem), 28rem)" } as React.CSSProperties;

/**
 * O resultado simulado dia a dia (ficha Mesa, 25/11/2026): a mesma curva da página inicial, linha fina na
 * cor do texto com a maior queda em vermelho na própria linha e o valor escrito ao lado. Era a moldura
 * grafite do Profit com a faixa de drawdown embaixo; a maior queda agora se vê na curva, sem caixa.
 *
 * Desenha-se o ACUMULADO, não o patrimônio: o patrimônio absoluto (R$ 30 mil oscilando 2 mil) viraria uma
 * linha reta lá no alto. O zero do desenho é o capital informado, e o eixo lê o resultado em R$, que é o
 * número grande da tela; o patrimônio daquele dia aparece na leitura do pregão apontado.
 */
export function CurvaSimulada({ serie, drawdown, ativo, aoApontar, className }: Props) {
  const queda = useMemo(() => quedaDaSimulacao(serie, drawdown), [serie, drawdown]);
  return (
    <div className={className} style={ALTURA}>
      <GraficoResultado dias={serie} queda={queda} ativo={ativo} aoApontar={aoApontar} />
      {queda && serie.length > 1 ? (
        <p className="mt-1 text-[0.8125rem] text-sutil">
          Em <span className="text-negativo">vermelho</span>, a maior queda: do ponto mais alto ao mais baixo que veio depois.
        </p>
      ) : null}
    </div>
  );
}
