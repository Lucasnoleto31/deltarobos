"use client";

import { cn } from "cn";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { GraficoBarras } from "@/components/desempenho/GraficoBarras";
import { Heatmap } from "@/components/desempenho/Heatmap";
import { Button } from "@/components/ui/button";
import { formatarBRL, formatarData, formatarDataLonga, formatarMesAno, formatarNumero, formatarPct } from "@/lib/formato";
import { gradeMes, heatmapAnoMes, mesesComDados } from "@/lib/stats/calendario";
import { dia as diaOp, porDiaSemana, porHora, valorOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
import { mesDe, somarMeses } from "@/lib/stats/periodos";
import { valorDia } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";

interface Props {
  linhas: LinhaDiaria[];
  ops: OperacaoCompacta[];
  feriados: string[];
  hoje: string;
  valorPonto: number;
  capitalReferencia: number | null;
}

const CABECALHO = ["Seg", "Ter", "Qua", "Qui", "Sex"];

function curto(v: number): string {
  return formatarBRL(v, { inteiro: Math.abs(v) >= 100, sinal: true }).replace("R$", "").trim();
}

/** Aba Calendário: mês com detalhe do dia por horário, dia da semana, melhores/piores dias e heatmap. */
export function PainelCalendario({ linhas, ops, feriados, hoje, valorPonto, capitalReferencia }: Props) {
  const opcoes = useMemo<OpcoesSerie>(() => ({ base: "liquido", unidade: "brl", valorPonto }), [valorPonto]);
  const meses = useMemo(() => mesesComDados(linhas), [linhas]);
  const primeiroMes = meses[0] ?? mesDe(hoje);
  const mesAtual = mesDe(hoje);

  const [mes, setMes] = useState(() => (meses.includes(mesAtual) ? mesAtual : (meses[meses.length - 1] ?? mesAtual)));
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const grade = useMemo(() => gradeMes(linhas, mes, opcoes, feriados), [linhas, mes, opcoes, feriados]);
  const semanasUteis = useMemo(() => grade.semanas.map((s) => s.slice(1, 6)), [grade]);
  const melhorDoMes = useMemo(() => {
    let melhor: { dia: string; valor: number } | null = null;
    for (const d of grade.semanas.flat()) {
      if (d.valor !== null && (melhor === null || d.valor > melhor.valor)) melhor = { dia: d.dia, valor: d.valor };
    }
    return melhor;
  }, [grade]);

  const diasValor = useMemo(
    () => linhas.map((l) => ({ dia: l.dia, valor: valorDia(l, opcoes), n: l.n_operacoes })),
    [linhas, opcoes],
  );
  const melhores = useMemo(() => [...diasValor].sort((a, b) => b.valor - a.valor).slice(0, 10), [diasValor]);
  const piores = useMemo(() => [...diasValor].sort((a, b) => a.valor - b.valor).slice(0, 10), [diasValor]);
  const melhorGeral = melhores[0];
  const piorGeral = piores[0];

  const porDia = useMemo(() => porDiaSemana(ops, opcoes), [ops, opcoes]);
  const maiorDia = Math.max(1, ...porDia.map((f) => Math.abs(f.total)));
  const heatmap = useMemo(() => heatmapAnoMes(linhas, opcoes), [linhas, opcoes]);

  const opsDia = useMemo(() => (diaSel ? ops.filter((op) => diaOp(op) === diaSel) : []), [ops, diaSel]);
  const totalDia = opsDia.reduce((s, op) => s + valorOperacao(op, opcoes), 0);
  const gainsDia = opsDia.filter((op) => op[4] - op[5] > 0).length;
  const horasDia = useMemo(() => porHora(opsDia, opcoes).filter((f) => f.n > 0), [opsDia, opcoes]);

  const mesAnterior = mesDe(somarMeses(`${mes}-01`, -1));
  const mesSeguinte = mesDe(somarMeses(`${mes}-01`, 1));
  const podeVoltar = mesAnterior >= primeiroMes;
  const podeAvancar = mesSeguinte <= mesAtual;

  const irHoje = () => {
    setMes(mesAtual);
    setDiaSel(linhas.some((l) => l.dia === hoje) ? hoje : null);
  };

  if (linhas.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        Ainda não há operações fechadas pra montar o calendário.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Calendário de resultados</h2>
        <p className="text-sm text-muted-foreground">
          O resultado de cada pregão, o detalhe por horário e os padrões por dia da semana, mês e ano. Líquido, por 1 contrato.
        </p>
        <p className="flex flex-wrap gap-x-3 pt-1 text-sm text-muted-foreground tabular-nums">
          <span>
            <strong className="text-foreground">{formatarNumero(linhas.length)}</strong> pregões
          </span>
          {melhorGeral ? (
            <span>
              · melhor dia <Valor valor={melhorGeral.valor} inteiro className="font-semibold" />
            </span>
          ) : null}
          {piorGeral ? (
            <span>
              · pior dia <Valor valor={piorGeral.valor} inteiro className="font-semibold" />
            </span>
          ) : null}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* mês */}
        <section className="rounded-2xl bg-card ring-1 ring-foreground/10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h3 className="font-semibold first-letter:uppercase">{formatarMesAno(`${mes}-01`)}</h3>
              <p className="text-xs text-muted-foreground tabular-nums">
                {grade.nDias} {grade.nDias === 1 ? "pregão" : "pregões"} · {grade.nPositivos} positivos · clique num dia
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" aria-label="Mês anterior" disabled={!podeVoltar} onClick={() => setMes(mesAnterior)}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="sm" onClick={irHoje}>
                Hoje
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Próximo mês" disabled={!podeAvancar} onClick={() => setMes(mesSeguinte)}>
                <ChevronRight />
              </Button>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 border-b px-4 py-3 text-sm">
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Resultado do mês</dt>
              <dd className="text-xl font-semibold">
                <Valor valor={grade.total} inteiro={Math.abs(grade.total) >= 1000} />
              </dd>
              {capitalReferencia ? (
                <dd className="text-xs text-muted-foreground tabular-nums">{formatarPct(grade.total / capitalReferencia, 2)} do capital</dd>
              ) : null}
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Dias positivos</dt>
              <dd className="text-xl font-semibold tabular-nums">{grade.nDias > 0 ? formatarPct(grade.nPositivos / grade.nDias, 0) : "–"}</dd>
              <dd className="text-xs text-muted-foreground tabular-nums">
                {grade.nPositivos} de {grade.nDias} pregões
              </dd>
            </div>
            <div>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Melhor dia do mês</dt>
              <dd className="text-xl font-semibold">{melhorDoMes ? <Valor valor={melhorDoMes.valor} inteiro={Math.abs(melhorDoMes.valor) >= 1000} /> : "–"}</dd>
              {melhorDoMes ? <dd className="text-xs text-muted-foreground tabular-nums">{formatarData(melhorDoMes.dia)}</dd> : null}
            </div>
          </dl>

          <div className="p-3">
            <div className="mb-1 grid grid-cols-5 gap-1.5 text-center text-[11px] text-muted-foreground uppercase">
              {CABECALHO.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {semanasUteis.flat().map((d) => {
                const semDado = d.valor === null;
                const selecionado = d.dia === diaSel;
                const tom = semDado
                  ? d.pregao
                    ? "bg-muted/40 text-muted-foreground"
                    : "bg-transparent text-muted-foreground/40"
                  : d.valor! > 0
                    ? "bg-positivo/15 text-positivo ring-1 ring-positivo/30 hover:ring-positivo/60"
                    : d.valor! < 0
                      ? "bg-negativo/15 text-negativo ring-1 ring-negativo/30 hover:ring-negativo/60"
                      : "bg-muted text-foreground";
                return (
                  <button
                    key={d.dia}
                    type="button"
                    disabled={semDado}
                    onClick={() => setDiaSel(d.dia)}
                    aria-pressed={selecionado}
                    className={cn(
                      "flex min-h-16 flex-col items-start rounded-lg p-2 text-left text-xs tabular-nums transition-shadow disabled:cursor-default",
                      tom,
                      d.foraDoMes && "invisible",
                      selecionado && "ring-2 ring-foreground",
                    )}
                  >
                    <span className="font-semibold">{d.diaDoMes}</span>
                    {!semDado ? (
                      <>
                        <span className="mt-0.5 text-sm font-semibold">{curto(d.valor!)}</span>
                        <span className="text-[10px] opacity-70">{d.nOperacoes} op</span>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* detalhe do dia */}
        <section className="rounded-2xl bg-card ring-1 ring-foreground/10">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Detalhe do dia</h3>
            <p className="text-xs text-muted-foreground">{diaSel ? formatarDataLonga(diaSel) : "Clique num pregão do calendário"}</p>
          </div>
          {diaSel === null ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center text-sm text-muted-foreground">
              <Clock className="size-5" />
              <p className="font-medium text-foreground">Nenhum dia selecionado</p>
              <p>O detalhamento por horário aparece aqui.</p>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Resultado</dt>
                  <dd className="text-xl font-semibold">
                    <Valor valor={totalDia} inteiro={Math.abs(totalDia) >= 1000} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Operações</dt>
                  <dd className="text-xl font-semibold tabular-nums">{opsDia.length}</dd>
                </div>
                <div>
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">Acerto</dt>
                  <dd className="text-xl font-semibold tabular-nums">{opsDia.length > 0 ? formatarPct(gainsDia / opsDia.length, 0) : "–"}</dd>
                </div>
              </dl>
              <div>
                <p className="mb-1 text-xs font-medium">Por hora de entrada</p>
                <GraficoBarras dados={horasDia.map((f) => ({ rotulo: f.rotulo, valor: f.total, n: f.n }))} unidade="brl" altura={180} />
              </div>
              <ul className="divide-y text-sm">
                {horasDia.map((f) => (
                  <li key={f.chave} className="flex items-center justify-between py-1.5 tabular-nums">
                    <span className="text-muted-foreground">{f.rotulo}</span>
                    <span className="text-xs text-muted-foreground">
                      {f.n} op · {f.n > 0 ? Math.round((f.nGain / f.n) * 100) : 0}%
                    </span>
                    <Valor valor={f.total} className="font-medium" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <h3 className="font-semibold">Por dia da semana</h3>
          <p className="mb-3 text-xs text-muted-foreground">resultado consolidado</p>
          <ul className="space-y-3">
            {porDia.map((f) => (
              <li key={f.chave} className="flex items-center gap-3 text-sm">
                <span className="w-8 font-medium">{f.rotulo}</span>
                <div className="h-1.5 flex-1 rounded-full bg-muted">
                  <div
                    className={cn("h-1.5 rounded-full", f.total >= 0 ? "bg-positivo" : "bg-negativo")}
                    style={{ width: `${Math.max(3, Math.round((Math.abs(f.total) / maiorDia) * 100))}%` }}
                  />
                </div>
                <div className="w-28 text-right">
                  <Valor valor={f.total} inteiro={Math.abs(f.total) >= 1000} className="font-semibold" />
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {f.n > 0 ? Math.round((f.nGain / f.n) * 100) : 0}% · {formatarNumero(f.n)} op
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <ListaDias titulo="Melhores dias" sub="Top 10 do período" itens={melhores} positivo />
        <ListaDias titulo="Piores dias" sub="Top 10 do período" itens={piores} />
      </div>

      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
        <h3 className="font-semibold">Resultado mensal por ano</h3>
        <p className="mb-3 text-xs text-muted-foreground">cada célula é o consolidado do mês</p>
        <Heatmap linhas={heatmap} unidade="brl" />
      </section>
    </div>
  );
}

function ListaDias({
  titulo,
  sub,
  itens,
  positivo = false,
}: {
  titulo: string;
  sub: string;
  itens: { dia: string; valor: number; n: number }[];
  positivo?: boolean;
}) {
  const maior = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <h3 className="font-semibold">{titulo}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{sub}</p>
      <ol className="space-y-2.5">
        {itens.map((i, idx) => (
          <li key={i.dia} className="flex items-center gap-3 text-sm">
            <span className="w-5 text-xs text-muted-foreground tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium tabular-nums">
                  {formatarData(i.dia)} <span className="text-xs font-normal text-muted-foreground">{i.n} op</span>
                </span>
                <Valor valor={i.valor} inteiro={Math.abs(i.valor) >= 1000} className="font-semibold" />
              </div>
              <div className="mt-1 h-1 rounded-full bg-muted">
                <div
                  className={cn("h-1 rounded-full", positivo ? "bg-positivo" : "bg-negativo")}
                  style={{ width: `${Math.max(3, Math.round((Math.abs(i.valor) / maior) * 100))}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
