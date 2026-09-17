"use client";

import { useId, useMemo, useState } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarNumero, formatarPontos } from "@/lib/formato";
import type { OperacaoCompacta } from "@/lib/stats/operacoes";
import { drawdownMaximo } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import {
  AmostraDaLinha,
  CURVA_POR_DIA,
  CURVA_POR_OPERACAO,
  DesenhoDaCurva,
  MolduraProfit,
  PROFIT,
  type PontoDoDesenho,
} from "./CurvaProfit";
import { rotulosDeData, seriePorDia, seriePorOperacao } from "./series-da-curva";

interface Props {
  /** série já filtrada pelo período desejado */
  linhas: readonly LinhaDiaria[];
  opcoes: OpcoesSerie;
  altura?: number;
  mostrarResumo?: boolean;
  /** operações do mesmo período: liga a aba "Por operação" (a série é montada aqui) */
  operacoes?: readonly OperacaoCompacta[];
  /** a série por operação já montada (a visão geral monta no servidor e manda só os pontos) */
  pontosPorOperacao?: PontoDoDesenho[];
}

type Modo = "operacao" | "dia";
const MODOS: Array<[Modo, string]> = [
  ["operacao", "Por operação"],
  ["dia", "Por dia"],
];

/** "5,77 mil" a partir de mil, no padrão brasileiro, como a escala do gráfico do Profit no Hub. */
function escalaEmReais(v: number): string {
  return Math.abs(v) >= 1000
    ? `${formatarNumero(v / 1000, Math.abs(v) % 1000 === 0 ? 0 : 1)} mil`
    : formatarNumero(v || 0, 0);
}

/**
 * Curva de capital acumulada por contrato, com o drawdown em barras embaixo. Desde 17/09/2026 no
 * estilo do Gráfico de Patrimônio do Profit, como no Zeve Hub: moldura grafite, cores medidas no
 * Profit e o agrupamento nas abas do rodapé ("Por operação" e "Por dia"). Os dois agrupamentos
 * dividem a mesma escala e o mesmo eixo de tempo, então a troca só acrescenta ou tira o sobe e desce
 * de dentro do dia. Quem controla período, unidade e base é o pai; o resumo em cima continua vindo
 * de curvaAcumulada e drawdownMaximo, por dia.
 */
export function CurvaCapital({ linhas, opcoes, altura = 320, mostrarResumo = true, operacoes, pontosPorOperacao }: Props) {
  const id = `curva-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // abre por dia, como no Hub: a linha limpa é a do fechamento de cada pregão
  const [modo, setModo] = useState<Modo>("dia");

  const porDia = useMemo(() => seriePorDia(linhas, opcoes), [linhas, opcoes]);
  const porOperacao = useMemo(
    () => pontosPorOperacao ?? (operacoes ? seriePorOperacao(operacoes, opcoes, porDia.dias) : null),
    [pontosPorOperacao, operacoes, opcoes, porDia.dias],
  );
  const dd = useMemo(() => drawdownMaximo(porDia.curva), [porDia.curva]);
  const rotulosX = useMemo(() => rotulosDeData(porDia.dias), [porDia.dias]);

  const curva = porDia.curva;
  const acumulado = curva.length > 0 ? curva[curva.length - 1].acumulado : 0;
  const unidade = opcoes.unidade;
  const temAbas = porOperacao !== null && porOperacao.length > 0;
  const modoAtivo: Modo = temAbas ? modo : "dia";
  const pontos = modoAtivo === "dia" ? porDia.pontos : (porOperacao ?? []);
  const cores = modoAtivo === "dia" ? CURVA_POR_DIA : CURVA_POR_OPERACAO;
  // a escala cobre as duas séries: trocar de aba não muda a régua
  const escalaDe = [...porDia.pontos.map((p) => p.acumulado), ...(porOperacao ?? []).map((p) => p.acumulado)];

  const alturaDaCurva = Math.round(altura * 0.66);
  const alturaDoDrawdown = Math.max(56, Math.round(altura * 0.26));
  const formatarEixo = (v: number) => (unidade === "brl" ? escalaEmReais(v) : formatarPontos(v));
  const base = opcoes.base === "liquido" ? "líquido" : "bruto";

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

      {curva.length === 0 ? (
        <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: altura }}>
          Sem operações no período.
        </div>
      ) : (
        <MolduraProfit
          titulo="Resultado acumulado"
          legenda={
            <>
              <span className="inline-flex items-center gap-1.5">
                <AmostraDaLinha cores={cores} />
                {modoAtivo === "dia" ? "Por dia" : "Por operação"} · {opcoes.contratos ?? 1}{" "}
                {(opcoes.contratos ?? 1) === 1 ? "contrato" : "contratos"}, {base}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2" style={{ background: PROFIT.baixa, opacity: 0.62 }} />
                Drawdown
              </span>
            </>
          }
          abas={
            temAbas ? (
              <div
                role="group"
                aria-label="Agrupar o gráfico"
                className="flex items-center gap-1 rounded-b-lg px-1 py-0.5 text-xs"
                style={{ background: PROFIT.abas, borderTop: `1px solid ${PROFIT.abasBorda}` }}
              >
                {MODOS.map(([chave, rotulo], i) => (
                  <span key={chave} className="contents">
                    {i > 0 ? (
                      <span aria-hidden style={{ color: PROFIT.separador }}>
                        |
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-pressed={modo === chave}
                      onClick={() => setModo(chave)}
                      className="h-7 rounded-[3px] px-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                      style={modo === chave ? { background: PROFIT.abaAtiva, color: PROFIT.titulo } : { color: PROFIT.abaTexto }}
                    >
                      {rotulo}
                    </button>
                  </span>
                ))}
              </div>
            ) : undefined
          }
        >
          <DesenhoDaCurva
            key={modoAtivo}
            id={`${id}-${modoAtivo}`}
            pontos={pontos}
            escalaDe={escalaDe}
            cores={cores}
            altura={alturaDaCurva}
            alturaDoDrawdown={alturaDoDrawdown}
            rotulosX={rotulosX}
            formatarEixo={formatarEixo}
            rotuloVertical={unidade === "brl" ? `Saldo ${base} (R$)` : `Saldo ${base} (pts)`}
            rotuloAria={`Resultado acumulado ${modoAtivo === "dia" ? "dia a dia" : "operação a operação"}, com o drawdown embaixo`}
          />
        </MolduraProfit>
      )}
    </div>
  );
}
