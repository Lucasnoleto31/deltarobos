"use client";

import { useMemo, useState } from "react";
import { GraficoResultado } from "@/components/graficos/GraficoResultado";
import { NumeroGrande } from "@/components/sistema/Numero";
import { formatarBRL, formatarData } from "@/lib/formato";
import { curvaDosDias } from "@/lib/stats/risco";
import { maiorQueda as trechoDaMaiorQueda } from "@/lib/stats/serie-casa";
import { AbaixoDoPico } from "./AbaixoDoPico";

interface Props {
  /** os pregões do histórico em ordem de data, só [dia, resultado]: é tudo o que vai ao navegador */
  dias: ReadonlyArray<readonly [dia: string, valor: number]>;
  /** a maior queda do histórico (positiva), já calculada no servidor: o mesmo número da conta do capital */
  maiorQueda: number;
  /** a segunda linha debaixo do número: a premissa e o tamanho do histórico */
  premissa: string;
  /** os fatos que ficam colados no número (vêm prontos do servidor) */
  fatos: React.ReactNode;
}

// A altura da curva nesta aba. O padrão do GraficoResultado foi pensado para a página inicial; aqui há o
// cabeçalho do robô e as abas em cima e a faixa "abaixo do topo" embaixo, então a curva fica mais baixa para
// o número, o gráfico e o começo do bloco seguinte caberem na primeira tela.
const ALTURA_DA_CURVA = { "--alt-curva": "clamp(12rem, calc(100dvh - 45rem), 24rem)" } as React.CSSProperties;

/**
 * O alto da aba "Quedas e risco": a maior queda do histórico em número grande, os fatos dela ao lado, a
 * curva com a queda em vermelho e, colada embaixo, no mesmo eixo de tempo, a faixa de quanto o resultado
 * ficou abaixo do topo em cada pregão. Apontar um pregão (ponteiro ou dedo) troca o número grande pelo
 * quanto o robô estava abaixo do topo naquele dia.
 *
 * É a única parte da aba que roda no navegador, por causa do ponteiro. Recebe só data e valor de cada pregão
 * e remonta a curva com curvaDosDias, a mesma conta que o servidor usou para os números da tela.
 */
export function CurvaDaQueda({ dias, maiorQueda, premissa, fatos }: Props) {
  const [apontado, setApontado] = useState<number | null>(null);
  const curva = useMemo(() => curvaDosDias(dias.map(([dia, valor]) => ({ dia, valor }))), [dias]);
  // o trecho da curva que vai em vermelho: do topo ao fundo da maior queda
  const trecho = useMemo(() => trechoDaMaiorQueda(curva), [curva]);

  const lido = apontado !== null ? (curva[apontado] ?? null) : null;
  const brl = (v: number) => formatarBRL(v, { inteiro: Math.abs(v) >= 1000 });

  return (
    <section aria-labelledby="risco-titulo">
      <h2 id="risco-titulo" className="text-[0.9375rem] font-normal text-muted-foreground">
        Maior queda
      </h2>

      {/* lado a lado só a partir de xl: os fatos daqui são mais largos que os da página inicial, e entre
          1024 e 1280 px a coluna do número ficaria espremida */}
      <div className="mt-3 grid gap-x-16 gap-y-6 xl:grid-cols-[minmax(0,auto)_minmax(0,28rem)] xl:items-end xl:justify-start">
        <div className="min-w-0">
          <NumeroGrande valor={lido ? lido.drawdown : maiorQueda > 0 ? -maiorQueda : 0} />
          {/* a primeira linha diz o que é o número (e é a que muda com o ponteiro); a segunda, a premissa */}
          <p className="mt-3 text-sm text-muted-foreground">
            {lido ? (
              <>
                {formatarData(lido.dia)} ·{" "}
                {lido.drawdown < 0 ? (lido.pico > 0 ? `abaixo do topo de ${brl(lido.pico)}` : "abaixo do ponto de partida") : "no topo"}
              </>
            ) : maiorQueda > 0 ? (
              "do ponto mais alto ao mais baixo que veio depois"
            ) : (
              "o resultado não recuou nenhuma vez"
            )}
          </p>
          <p className="text-sm text-pretty text-sutil">{premissa}</p>
        </div>
        {fatos}
      </div>

      <div style={ALTURA_DA_CURVA}>
        <GraficoResultado dias={curva} queda={trecho} ativo={apontado} aoApontar={setApontado} className="mt-8" />
      </div>
      <AbaixoDoPico curva={curva} ativo={apontado} aoApontar={setApontado} className="mt-1" />
      {trecho && curva.length > 1 ? (
        <p className="mt-3 text-[0.8125rem] text-pretty text-sutil lg:pr-20">
          Em <span className="text-negativo">vermelho</span> na curva, a maior queda. Embaixo, quanto o resultado ficou abaixo do topo (o ponto mais
          alto até ali) em cada dia.
        </p>
      ) : null}
    </section>
  );
}
