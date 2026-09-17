"use client";

import { cn } from "cn";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { CardsKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { Badge } from "@/components/ui/badge";
import { formatarBRL, formatarData, formatarDataCurta, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import { dia as diaOp, resumoOperacoes, type OperacaoCompacta } from "@/lib/stats/operacoes";
import { dentroDoIntervalo, filtrarIntervalo, intervaloDe, PERIODOS, type Periodo } from "@/lib/stats/periodos";
import {
  calmar,
  capitalMinimoRecomendado,
  distribuicaoProfundidade,
  episodiosDrawdown,
  recoveryFactor,
  resumoDiario,
  riscoDeRuina,
  tempoEmDrawdown,
  ulcerIndex,
} from "@/lib/stats/risco";
import { curvaAcumulada, valorDia } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";

interface Props {
  linhas: LinhaDiaria[];
  ops: OperacaoCompacta[];
  hoje: string;
  valorPonto: number;
  capitalReferencia: number | null;
  margem: number | null;
  fatorSeguranca: number;
}

const OPCOES_PERIODO = PERIODOS.filter((p) => p.valor !== "personalizado" && p.valor !== "7d");

/** Aba Risco: índices de risco, curva de drawdown, maiores quedas, profundidade, piores dias e resumo diário. */
export function PainelRisco({ linhas, ops, hoje, valorPonto, capitalReferencia, margem, fatorSeguranca }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const opcoes = useMemo<OpcoesSerie>(() => ({ base: "liquido", unidade: "brl", valorPonto }), [valorPonto]);
  const intervalo = useMemo(() => intervaloDe(periodo, hoje), [periodo, hoje]);
  const linhasF = useMemo(() => filtrarIntervalo(linhas, intervalo), [linhas, intervalo]);
  const opsF = useMemo(() => ops.filter((op) => dentroDoIntervalo(diaOp(op), intervalo)), [ops, intervalo]);

  const kpis = useMemo(() => calcularKpis(linhasF, opcoes, { hoje, capitalReferencia }), [linhasF, opcoes, hoje, capitalReferencia]);
  const curva = useMemo(() => curvaAcumulada(linhasF, opcoes), [linhasF, opcoes]);
  const episodios = useMemo(() => episodiosDrawdown(curva, Infinity), [curva]);
  const resumoOps = useMemo(() => resumoOperacoes(opsF, opcoes), [opsF, opcoes]);
  const diario = useMemo(() => resumoDiario(curva, episodios), [curva, episodios]);
  const profundidade = useMemo(() => distribuicaoProfundidade(episodios, capitalReferencia), [episodios, capitalReferencia]);
  const piores = useMemo(
    () => linhasF.map((l) => ({ dia: l.dia, valor: valorDia(l, opcoes), n: l.n_operacoes })).sort((a, b) => a.valor - b.valor).slice(0, 5),
    [linhasF, opcoes],
  );

  const dd = kpis.drawdown.valor;
  const temCapital = Boolean(capitalReferencia && capitalReferencia > 0);
  const vCalmar = calmar(kpis.acumulado, kpis.nDias, dd);
  const vRecovery = recoveryFactor(kpis.acumulado, dd);
  const vUlcer = ulcerIndex(curva, capitalReferencia);
  const vTempo = tempoEmDrawdown(curva);
  const vRuina = riscoDeRuina({ taxaAcerto: kpis.taxaAcerto, payoff: kpis.payoff, capital: capitalReferencia, perdaMedia: resumoOps.mediaLoss });
  const capitalMinimo = margem !== null ? capitalMinimoRecomendado(margem, dd, fatorSeguranca) : null;

  const dadosCurva = useMemo(
    () => curva.map((p) => ({ dia: p.dia, dd: temCapital ? (p.drawdown / (capitalReferencia as number)) * 100 : p.drawdown })),
    [curva, temCapital, capitalReferencia],
  );

  if (linhas.length === 0) {
    return <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Ainda não há operações fechadas pra medir risco.</p>;
  }

  const tiles: ItemKpi[] = [
    {
      rotulo: "Queda máxima",
      valor: temCapital ? formatarPct(kpis.drawdownMaximoPct, 1) : <Valor valor={-dd} inteiro={dd >= 1000} />,
      detalhe: temCapital ? formatarBRL(-dd, { inteiro: dd >= 1000, sinal: true }) : "sem capital de referência",
      tom: "negativo",
    },
    { rotulo: "Calmar", valor: formatarMultiplo(vCalmar), detalhe: "retorno anualizado ÷ queda máxima", tom: (vCalmar ?? 0) >= 1 ? "positivo" : "neutro" },
    { rotulo: "Recovery factor", valor: formatarMultiplo(vRecovery), detalhe: "resultado ÷ queda máxima", tom: (vRecovery ?? 0) >= 1 ? "positivo" : "neutro" },
    { rotulo: "Ulcer index", valor: formatarNumero(vUlcer, 2), detalhe: temCapital ? "profundidade média, em % do capital" : "profundidade média, em R$/contrato", tom: "info" },
    {
      rotulo: "Risco de ruína",
      valor: vRuina === null ? "–" : formatarPct(vRuina, 1),
      detalhe: vRuina === null ? "precisa de capital de referência" : `capital ${formatarBRL(capitalReferencia ?? 0, { inteiro: true })} · perda média ${formatarBRL(resumoOps.mediaLoss, { inteiro: Math.abs(resumoOps.mediaLoss) >= 1000 })}`,
      tom: vRuina === null ? "alerta" : vRuina >= 0.5 ? "negativo" : vRuina > 0.05 ? "alerta" : "positivo",
    },
    { rotulo: "Tempo em drawdown", valor: formatarPct(vTempo, 0), detalhe: `${curva.filter((p) => p.drawdown < 0).length} de ${curva.length} pregões abaixo do pico`, tom: vTempo > 0.5 ? "alerta" : "neutro" },
  ];

  const tiles2: ItemKpi[] = [
    {
      rotulo: "Tempo de recuperação",
      valor: dd === 0 ? "–" : kpis.drawdown.diasAteRecuperar !== null ? `${kpis.drawdown.diasAteRecuperar} dias` : "em recuperação",
      detalhe: kpis.drawdown.inicio ? `maior queda desde ${formatarData(kpis.drawdown.inicio)}` : undefined,
      tom: kpis.drawdown.recuperacao || dd === 0 ? "neutro" : "alerta",
    },
    {
      rotulo: "Capital mínimo · 1 contrato",
      valor: capitalMinimo !== null ? formatarBRL(capitalMinimo, { inteiro: true }) : "–",
      detalhe: capitalMinimo !== null ? `margem ${formatarBRL(margem ?? 0, { inteiro: true })} + queda × ${fatorSeguranca}` : "margem de referência não configurada",
      tom: capitalMinimo !== null ? "info" : "alerta",
    },
    { rotulo: "Capital de referência", valor: capitalReferencia ? formatarBRL(capitalReferencia, { inteiro: true }) : "–", detalhe: "base dos percentuais", tom: "neutro" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Risco</h2>
          <p className="text-sm text-muted-foreground">Líquido, por 1 contrato. Definições na metodologia.</p>
        </div>
        <Segmentado ariaLabel="Período" opcoes={OPCOES_PERIODO} valor={periodo} onChange={setPeriodo} />
      </header>

      <CardsKpi itens={tiles} />
      <CardsKpi itens={tiles2} className="lg:grid-cols-3" />

      <section className="painel p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="font-semibold">Curva de drawdown</h3>
            <p className="text-xs text-muted-foreground">{temCapital ? `distância do pico, em % do capital de ${formatarBRL(capitalReferencia ?? 0, { inteiro: true })}` : "distância do pico, em R$ por contrato"}</p>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            máx <strong className="text-negativo">{temCapital ? formatarPct(kpis.drawdownMaximoPct, 1) : formatarBRL(dd, { inteiro: true })}</strong>
            {" · "}recuperação média{" "}
            <strong className="text-foreground">{diario.recuperacaoMediaDias !== null ? `${Math.round(diario.recuperacaoMediaDias)} dias` : "–"}</strong>
          </p>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dadosCurva} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="dd-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--negativo)" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="var(--negativo)" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="dia" tickFormatter={formatarDataCurta} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis
                width={56}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (temCapital ? `${Math.round(v)}%` : formatarBRL(v, { inteiro: true }))}
              />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--popover-foreground)" }}
                labelFormatter={(l) => formatarData(String(l))}
                formatter={(v) => [temCapital ? `${Number(v).toFixed(1)}%` : formatarBRL(Number(v)), "Drawdown"]}
              />
              <Area type="monotone" dataKey="dd" stroke="var(--negativo)" strokeWidth={1.5} fill="url(#dd-fill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="overflow-x-auto painel">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Top 10 maiores quedas</h3>
            <p className="text-xs text-muted-foreground">do pico ao fundo</p>
          </div>
          {episodios.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma queda no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th>#</th>
                  <th>Início</th>
                  <th>Fundo</th>
                  <th>Recuperação</th>
                  <th className="text-right">R$</th>
                  {temCapital ? <th className="text-right">%</th> : null}
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t">
                {episodios.slice(0, 10).map((e, i) => (
                  <tr key={`${e.inicio}-${e.fundo}`} className="tabular-nums [&>td]:px-3 [&>td]:py-2">
                    <td className="text-muted-foreground">{String(i + 1).padStart(2, "0")}</td>
                    <td>{formatarData(e.inicio)}</td>
                    <td>{formatarData(e.fundo)}</td>
                    <td>{e.recuperacao ? formatarData(e.recuperacao) : <span className="text-alerta">—</span>}</td>
                    <td className="text-right text-negativo">{formatarBRL(e.valor, { inteiro: e.valor >= 1000 })}</td>
                    {temCapital ? <td className="text-right text-negativo">{formatarPct(e.valor / (capitalReferencia as number), 1)}</td> : null}
                    <td className="text-right">
                      {e.recuperacao ? (
                        <Badge variant="secondary" className="bg-positivo/15 text-positivo">Recuperado</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-alerta/15 text-alerta">Aberto</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="painel p-4">
          <h3 className="font-semibold">Distribuição por profundidade</h3>
          <p className="mb-3 text-xs text-muted-foreground">{episodios.length} quedas no período{temCapital ? ", em % do capital" : ", em R$ por contrato"}</p>
          <ul className="space-y-2.5 text-sm">
            {profundidade.map((f, i) => {
              const maior = Math.max(1, ...profundidade.map((x) => x.n));
              return (
                <li key={f.rotulo} className="flex items-center gap-3">
                  <span className="w-20 text-muted-foreground tabular-nums">{f.rotulo}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted">
                    <div
                      className={cn("h-1.5 rounded-full", i < 2 ? "bg-positivo" : i < 4 ? "bg-alerta" : "bg-negativo")}
                      style={{ width: `${f.n > 0 ? Math.max(3, Math.round((f.n / maior) * 100)) : 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-semibold tabular-nums">{f.n}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="painel p-4">
          <h3 className="mb-3 font-semibold">5 piores dias</h3>
          <ol className="space-y-2.5">
            {piores.map((p, i) => {
              const maior = Math.max(1, ...piores.map((x) => Math.abs(x.valor)));
              return (
                <li key={p.dia} className="flex items-center gap-3 text-sm">
                  <span className="w-5 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium tabular-nums">
                        {formatarData(p.dia)} <span className="text-xs font-normal text-muted-foreground">{p.n} op</span>
                      </span>
                      <Valor valor={p.valor} inteiro={Math.abs(p.valor) >= 1000} className="font-semibold" />
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-muted">
                      <div className="h-1 rounded-full bg-negativo" style={{ width: `${Math.max(3, Math.round((Math.abs(p.valor) / maior) * 100))}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="painel p-4">
          <h3 className="mb-3 font-semibold">Resumo diário</h3>
          <dl className="divide-y text-sm">
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Dias negativos</dt>
              <dd className="tabular-nums">
                <strong>{diario.diasNegativos} de {diario.nDias}</strong> <span className="text-xs text-muted-foreground">{formatarPct(diario.fracaoNegativa, 0)}</span>
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Sequência negativa máxima</dt>
              <dd className="tabular-nums">
                <strong>{diario.maiorSequenciaNegativa} dias</strong> <span className="text-xs text-muted-foreground">consecutivos</span>
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Volatilidade diária</dt>
              <dd className="tabular-nums">
                <strong>{formatarBRL(diario.volatilidade, { inteiro: diario.volatilidade >= 1000 })}</strong> <span className="text-xs text-muted-foreground">desvio padrão</span>
              </dd>
            </div>
            <div className="flex items-center justify-between py-2">
              <dt className="text-muted-foreground">Recuperação média</dt>
              <dd className="tabular-nums">
                <strong>{diario.recuperacaoMediaDias !== null ? `${Math.round(diario.recuperacaoMediaDias)} dias` : "–"}</strong>{" "}
                <span className="text-xs text-muted-foreground">{diario.episodiosRecuperados} quedas recuperadas</span>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
