"use client";

import { cn } from "cn";
import { Lightbulb, SlidersHorizontal, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarBRL, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import {
  DESCRICAO_CLASSE,
  DIAS_UTEIS,
  HORAS,
  ROTULO_CLASSE,
  validarFaixas,
  type ClasseFaixa,
  type Faixa,
  type ParametrosFaixas,
} from "@/lib/stats/faixas";
import { dia as diaOp, type OperacaoCompacta } from "@/lib/stats/operacoes";
import { dentroDoIntervalo, intervaloDe, PERIODOS, type Periodo } from "@/lib/stats/periodos";

interface Props {
  ops: OperacaoCompacta[];
  hoje: string;
  parametros: ParametrosFaixas;
}

const OPCOES_PERIODO = PERIODOS.filter((p) => p.valor !== "personalizado" && p.valor !== "7d");
const CLASSES: ClasseFaixa[] = ["ligar", "cautela", "neutro", "evitar"];
const COR: Record<ClasseFaixa, string> = {
  ligar: "var(--positivo)",
  cautela: "var(--alerta)",
  neutro: "var(--muted-foreground)",
  evitar: "var(--negativo)",
};
const FUNDO: Record<ClasseFaixa, string> = {
  ligar: "bg-positivo/12 ring-positivo/40 text-positivo",
  cautela: "bg-alerta/12 ring-alerta/40 text-alerta",
  neutro: "bg-muted ring-foreground/15 text-muted-foreground",
  evitar: "bg-negativo/12 ring-negativo/40 text-negativo",
};
const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function rec(v: number | null): string {
  return v === null ? "∞" : formatarMultiplo(v);
}

/** Aba Faixas: quando ligar cada combinação de dia da semana × hora de entrada, pelas regras configuradas. */
export function PainelFaixas({ ops, hoje, parametros }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [filtroClasse, setFiltroClasse] = useState<ClasseFaixa | null>(null);
  const [selecionada, setSelecionada] = useState<Faixa | null>(null);

  const intervalo = useMemo(() => intervaloDe(periodo, hoje), [periodo, hoje]);
  const opsF = useMemo(() => ops.filter((op) => dentroDoIntervalo(diaOp(op), intervalo)), [ops, intervalo]);
  const r = useMemo(() => validarFaixas(opsF, parametros), [opsF, parametros]);

  const porCelula = useMemo(() => {
    const m = new Map<string, Faixa>();
    for (const f of r.faixas) m.set(`${f.diaSemana}-${f.hora}`, f);
    return m;
  }, [r]);

  const totalComDados = r.comDados.length;
  const dadosPizza = CLASSES.map((c) => ({ classe: c, valor: r.contagem[c] })).filter((d) => d.valor > 0);
  const maiorScore = Math.max(1, ...r.melhores.map((f) => f.score));
  const p = r.parametros;

  if (ops.length === 0) {
    return <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Ainda não há operações fechadas pra validar faixas.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Validação de faixas</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Classificação cruzada por dia da semana e hora de entrada: em quais faixas vale ligar o robô com lote cheio, onde reduzir e o
              que desligar. Regras abaixo e na metodologia.
            </p>
          </div>
          <Segmentado ariaLabel="Período" opcoes={OPCOES_PERIODO} valor={periodo} onChange={setPeriodo} />
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          <strong className="text-foreground">{formatarNumero(r.nOperacoes)}</strong> operações analisadas · mediana de drawdown{" "}
          <strong className="text-foreground">{formatarBRL(r.medianaDd, { inteiro: r.medianaDd >= 1000 })}</strong> ·{" "}
          <strong className="text-foreground">{totalComDados}</strong> faixas com dados
        </p>
      </header>

      <section className="painel p-4 sm:p-5">
        <h3 className="inline-flex items-center gap-2 font-semibold">
          <SlidersHorizontal className="size-4" /> Validação cruzada · parâmetros
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Cada condição de EVITAR é independente: basta uma ser satisfeita. Amostra mínima de {p.amostraMinima} operações por faixa.
        </p>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-positivo/8 p-3 ring-1 ring-positivo/25">
            <p className="text-[11px] font-medium tracking-wide text-positivo uppercase">Ligar</p>
            <ul className="mt-1 space-y-0.5 tabular-nums">
              <li>consistência ≥ {formatarPct(p.ligar.acertoMin, 0)}</li>
              <li>recuperação ≥ {formatarMultiplo(p.ligar.recuperacaoMin)}</li>
              <li>DD relativo ≤ {formatarMultiplo(p.ligar.ddRelativoMax, 1)}×</li>
            </ul>
          </div>
          <div className="rounded-lg bg-alerta/8 p-3 ring-1 ring-alerta/25">
            <p className="text-[11px] font-medium tracking-wide text-alerta uppercase">Cautela</p>
            <ul className="mt-1 space-y-0.5 tabular-nums">
              <li>consistência ≥ {formatarPct(p.cautela.acertoMin, 0)}</li>
              <li>recuperação ≥ {formatarMultiplo(p.cautela.recuperacaoMin)}</li>
            </ul>
          </div>
          <div className="rounded-lg bg-negativo/8 p-3 ring-1 ring-negativo/25">
            <p className="text-[11px] font-medium tracking-wide text-negativo uppercase">Evitar (qualquer uma)</p>
            <ul className="mt-1 space-y-0.5 tabular-nums">
              <li>consistência &lt; {formatarPct(p.evitar.acertoMax, 0)}</li>
              <li>recuperação &lt; {formatarMultiplo(p.evitar.recuperacaoMax)}</li>
              <li>DD relativo &gt; {formatarMultiplo(p.evitar.ddRelativoMin, 1)}×</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Consistência = taxa de acerto pelo líquido · recuperação = resultado ÷ drawdown da faixa · DD relativo = drawdown da faixa ÷ mediana das
          faixas. O que não é Ligar, Cautela nem Evitar fica Neutro.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="painel p-4 sm:p-5">
          <h3 className="font-semibold">Distribuição das faixas</h3>
          <div className="flex items-center gap-4">
            <div className="relative size-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dadosPizza} dataKey="valor" nameKey="classe" innerRadius={44} outerRadius={64} paddingAngle={2} isAnimationActive={false} stroke="none">
                    {dadosPizza.map((d) => (
                      <Cell key={d.classe} fill={COR[d.classe]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{totalComDados}</span>
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">faixas</span>
              </div>
            </div>
            <ul className="flex-1 space-y-2">
              {CLASSES.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => setFiltroClasse((f) => (f === c ? null : c))}
                    aria-pressed={filtroClasse === c}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60",
                      filtroClasse === c && "bg-muted",
                    )}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: COR[c] }} />
                    <span className="flex-1">
                      <span className="font-medium">{ROTULO_CLASSE[c]}</span>
                      <span className="block text-xs text-muted-foreground">{DESCRICAO_CLASSE[c]}</span>
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: COR[c] }}>
                      {r.contagem[c]}
                    </span>
                    <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                      {totalComDados > 0 ? formatarPct(r.contagem[c] / totalComDados, 0) : "0%"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="painel p-4 sm:p-5">
          <h3 className="inline-flex items-center gap-2 font-semibold">
            <Zap className="size-4 text-positivo" /> Melhores faixas para ligar
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">maior score entre as classificadas como Ligar</p>
          {r.melhores.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma faixa com amostra suficiente.</p>
          ) : (
            <ol className="space-y-3">
              {r.melhores.map((f, i) => (
                <li key={f.rotulo}>
                  <button type="button" onClick={() => setSelecionada(f)} className="flex w-full items-center gap-3 text-left text-sm">
                    <span className="w-5 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{f.rotulo}</span>
                        {f.classe ? <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] ring-1", FUNDO[f.classe])}>{ROTULO_CLASSE[f.classe]}</span> : null}
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted">
                        <div className="h-1 rounded-full bg-positivo" style={{ width: `${Math.round((f.score / maiorScore) * 100)}%` }} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                        {formatarNumero(f.n)} op · {formatarPct(f.acerto, 0)} acerto · recuperação {rec(f.recuperacao)} · lote {Math.round(f.lote * 100)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-semibold text-positivo tabular-nums">{f.score}</span>
                      <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">score</span>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {r.insights.length > 0 ? (
        <section className="painel">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Insights automáticos</h3>
            <p className="text-xs text-muted-foreground">{r.insights.length} observações geradas pelas regras da metodologia</p>
          </div>
          <ul className="divide-y">
            {r.insights.map((i) => (
              <li key={i.chave} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-positivo" />
                <span>{i.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="painel p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Mapa de faixas</h3>
            <p className="text-xs text-muted-foreground">dia da semana × hora de entrada</p>
          </div>
          <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {CLASSES.map((c) => (
              <li key={c} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: COR[c] }} /> {ROTULO_CLASSE[c]}
              </li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1.5 text-xs">
            <thead>
              <tr className="text-muted-foreground uppercase">
                <th className="w-12" />
                {DIAS_UTEIS.map((d) => (
                  <th key={d} className="text-left font-medium">
                    {DIA_CURTO[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HORAS.map((h) => (
                <tr key={h}>
                  <th className="text-left font-medium text-muted-foreground tabular-nums">{String(h).padStart(2, "0")}:00</th>
                  {DIAS_UTEIS.map((d) => {
                    const f = porCelula.get(`${d}-${h}`);
                    if (!f) return <td key={d} />;
                    const apagada = filtroClasse !== null && f.classe !== filtroClasse;
                    const sel = selecionada?.diaSemana === d && selecionada?.hora === h;
                    return (
                      <td key={d} className="p-0">
                        <button
                          type="button"
                          onClick={() => setSelecionada(f)}
                          className={cn(
                            "flex h-14 w-full flex-col justify-center rounded-lg px-2.5 text-left ring-1 transition-opacity",
                            f.classe ? FUNDO[f.classe] : "bg-transparent text-muted-foreground/60 ring-foreground/10",
                            apagada && "opacity-25",
                            sel && "ring-2 ring-foreground",
                          )}
                        >
                          <span className="font-semibold">{f.classe ? ROTULO_CLASSE[f.classe] : "sem amostra"}</span>
                          <span className="text-[11px] opacity-80 tabular-nums">
                            {f.n} op{f.n > 0 ? ` · ${formatarPct(f.acerto, 0)}` : ""}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selecionada ? (
          <div className="mt-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">
                {selecionada.rotulo}{" "}
                {selecionada.classe ? <span className={cn("ml-2 rounded-md px-1.5 py-0.5 text-[11px] ring-1", FUNDO[selecionada.classe])}>{ROTULO_CLASSE[selecionada.classe]}</span> : null}
              </h4>
              <span className="text-sm text-muted-foreground tabular-nums">
                score <strong className="text-foreground">{selecionada.score}</strong> · lote {Math.round(selecionada.lote * 100)}%
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
              <Item rotulo="Operações" valor={formatarNumero(selecionada.n)} />
              <Item rotulo="Consistência" valor={formatarPct(selecionada.acerto, 0)} />
              <Item rotulo="Recuperação" valor={rec(selecionada.recuperacao)} />
              <Item rotulo="Drawdown" valor={formatarBRL(selecionada.dd, { inteiro: selecionada.dd >= 1000 })} />
              <Item rotulo="DD relativo" valor={selecionada.ddRelativo === null ? "–" : `${formatarMultiplo(selecionada.ddRelativo, 1)}×`} />
              <Item rotulo="Expectativa / op" valor={<Valor valor={selecionada.expectativa} />} />
              <Item rotulo="Total" valor={<Valor valor={selecionada.total} inteiro={Math.abs(selecionada.total) >= 1000} />} />
              <Item rotulo="Estabilidade" valor={`${selecionada.mesesPositivos} de ${selecionada.mesesComDados} meses`} />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">Regra: {selecionada.motivo}.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">{rotulo}</dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
