"use client";

import { cn } from "cn";
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import type { PeriodoPainel } from "@/components/robo/ops-por-periodo";
import { formatarBRL, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import {
  DESCRICAO_CLASSE,
  DIAS_UTEIS,
  HORAS,
  ROTULO_CLASSE,
  type ClasseFaixa,
  type Faixa,
  type ResultadoFaixas,
} from "@/lib/stats/faixas";

interface Props {
  /** validarFaixas de cada período, calculado na página (18/09/2026: as operações não vêm mais) */
  resultados: Record<PeriodoPainel, ResultadoFaixas>;
}

const OPCOES_PERIODO: ReadonlyArray<{ valor: PeriodoPainel; rotulo: string }> = [
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "tudo", rotulo: "Tudo" },
];
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

/**
 * Aba Faixas: quando ligar cada combinação de dia da semana × hora de entrada, pelas regras
 * configuradas. Refeita em 18/09/2026 à noite ("essas faixas pode melhorar"): sem o parágrafo de
 * apresentação, sem ícones de lâmpada e raio, sem o gráfico de pizza (a distribuição virou uma
 * barra empilhada e a lista), as regras numa linha por classe e o período nos mesmos atalhos das
 * outras abas. Os números continuam vindo de validarFaixas.
 */
export function PainelFaixas({ resultados }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoPainel>("tudo");
  const [filtroClasse, setFiltroClasse] = useState<ClasseFaixa | null>(null);
  const [selecionada, setSelecionada] = useState<Faixa | null>(null);

  const r = resultados[periodo];

  const porCelula = useMemo(() => {
    const m = new Map<string, Faixa>();
    for (const f of r.faixas) m.set(`${f.diaSemana}-${f.hora}`, f);
    return m;
  }, [r]);

  const totalComDados = r.comDados.length;
  const maiorScore = Math.max(1, ...r.melhores.map((f) => f.score));
  const p = r.parametros;

  if (resultados.tudo.nOperacoes === 0) {
    return <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Ainda não há operações fechadas para validar faixas.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Faixas</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            <strong className="text-foreground">{formatarNumero(r.nOperacoes)}</strong> operações em{" "}
            <strong className="text-foreground">{totalComDados}</strong> faixas de dia × hora · mediana de drawdown{" "}
            <strong className="text-foreground">{formatarBRL(r.medianaDd, { inteiro: r.medianaDd >= 1000 })}</strong>
          </p>
        </div>
        <Segmentado ariaLabel="Período" opcoes={OPCOES_PERIODO} valor={periodo} onChange={setPeriodo} />
      </header>

      {/* as regras, uma linha por classe; a definição de cada termo está na metodologia */}
      <section className="painel">
        <div className="border-b px-4 py-3 sm:px-5">
          <h3 className="font-semibold">Regras</h3>
          <p className="text-xs text-muted-foreground">amostra mínima de {p.amostraMinima} operações por faixa</p>
        </div>
        <dl className="grid divide-y divide-(--painel-fio) text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3 sm:px-5">
            <dt className="font-medium text-positivo">Ligar</dt>
            <dd className="mt-1 text-muted-foreground tabular-nums">
              acerto ≥ {formatarPct(p.ligar.acertoMin, 0)} · recuperação ≥ {formatarMultiplo(p.ligar.recuperacaoMin)} · drawdown ≤{" "}
              {formatarMultiplo(p.ligar.ddRelativoMax, 1)}× a mediana
            </dd>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <dt className="font-medium text-alerta">Cautela</dt>
            <dd className="mt-1 text-muted-foreground tabular-nums">
              acerto ≥ {formatarPct(p.cautela.acertoMin, 0)} · recuperação ≥ {formatarMultiplo(p.cautela.recuperacaoMin)}
            </dd>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <dt className="font-medium text-negativo">Evitar</dt>
            <dd className="mt-1 text-muted-foreground tabular-nums">
              acerto &lt; {formatarPct(p.evitar.acertoMax, 0)} ou recuperação &lt; {formatarMultiplo(p.evitar.recuperacaoMax)} ou drawdown &gt;{" "}
              {formatarMultiplo(p.evitar.ddRelativoMin, 1)}× a mediana
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* distribuição: uma barra empilhada e a lista; tocar numa classe filtra o mapa */}
        <section className="painel p-4 sm:p-5">
          <h3 className="font-semibold">Distribuição das faixas</h3>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
            {CLASSES.map((c) =>
              r.contagem[c] > 0 ? (
                <div
                  key={c}
                  className="h-full transition-[width] duration-500"
                  style={{ width: `${(r.contagem[c] / Math.max(1, totalComDados)) * 100}%`, background: COR[c], opacity: filtroClasse && filtroClasse !== c ? 0.3 : 1 }}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-3 space-y-1">
            {CLASSES.map((c) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => setFiltroClasse((f) => (f === c ? null : c))}
                  aria-pressed={filtroClasse === c}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-(--linha-hover)",
                    filtroClasse === c && "bg-(--linha-hover)",
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COR[c] }} />
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
        </section>

        <section className="painel p-4 sm:p-5">
          <h3 className="font-semibold">Melhores faixas para ligar</h3>
          <p className="mb-3 text-xs text-muted-foreground">pelo score, entre as classificadas como Ligar</p>
          {r.melhores.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma faixa com amostra suficiente.</p>
          ) : (
            <ol className="space-y-3">
              {r.melhores.map((f, i) => (
                <li key={f.rotulo}>
                  <button
                    type="button"
                    onClick={() => setSelecionada(f)}
                    className="flex w-full items-center gap-3 rounded-lg text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="w-5 text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{f.rotulo}</span>
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

      <section className="painel p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Mapa de faixas</h3>
            <p className="text-xs text-muted-foreground">dia da semana × hora de entrada</p>
          </div>
          <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {CLASSES.map((c) => (
              <li key={c} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: COR[c] }} /> {ROTULO_CLASSE[c]}
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
              <Item rotulo="Acerto" valor={formatarPct(selecionada.acerto, 0)} />
              <Item rotulo="Recuperação" valor={rec(selecionada.recuperacao)} />
              <Item rotulo="Drawdown" valor={formatarBRL(selecionada.dd, { inteiro: selecionada.dd >= 1000 })} />
              <Item rotulo="DD relativo" valor={selecionada.ddRelativo === null ? "–" : `${formatarMultiplo(selecionada.ddRelativo, 1)}×`} />
              <Item rotulo="Expectativa / op" valor={<Valor valor={selecionada.expectativa} />} />
              <Item rotulo="Total" valor={<Valor valor={selecionada.total} inteiro={Math.abs(selecionada.total) >= 1000} />} />
              <Item rotulo="Meses positivos" valor={`${selecionada.mesesPositivos} de ${selecionada.mesesComDados}`} />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">{selecionada.motivo}.</p>
          </div>
        ) : null}
      </section>

      {r.insights.length > 0 ? (
        <section className="painel">
          <div className="border-b px-4 py-3 sm:px-5">
            <h3 className="font-semibold">O que as regras apontam</h3>
          </div>
          <ul className="divide-y divide-(--painel-fio)">
            {r.insights.map((i) => (
              <li key={i.chave} className="px-4 py-2.5 text-sm sm:px-5">
                {i.texto}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
