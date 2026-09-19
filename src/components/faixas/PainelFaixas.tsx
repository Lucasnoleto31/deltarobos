"use client";

import { cn } from "cn";
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import type { PeriodoPainel } from "@/components/robo/ops-por-periodo";
import { formatarBRL, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import {
  DIAS_UTEIS,
  HORAS,
  LOTE_POR_CLASSE,
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
// 19/09/2026: o vermelho puro sobre o fundo de Evitar media 4,4:1 no escuro; lá o texto leva 20% da cor
// do texto da página, como no selo de status, e a célula fica igual. No claro o vermelho puro passa.
const FUNDO: Record<ClasseFaixa, string> = {
  ligar: "bg-positivo/12 ring-positivo/40 text-positivo",
  cautela: "bg-alerta/12 ring-alerta/40 text-alerta",
  neutro: "bg-muted ring-foreground/15 text-muted-foreground",
  evitar: "bg-negativo/12 ring-negativo/40 text-negativo dark:text-[color-mix(in_srgb,var(--negativo)_80%,var(--foreground))]",
};
const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// hífen + word joiner (U+2060): o "-R$ 12,30" das frases não quebra entre o sinal e o valor (19/09/2026)
const SINAL_PRESO = String.fromCharCode(0x2d, 0x2060);

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
  // 19/09/2026: "ligar" e "evitar" repetiam a contagem da Distribuição e as Regras desta mesma tela
  const insights = r.insights.filter((i) => i.chave !== "ligar" && i.chave !== "evitar");

  if (resultados.tudo.nOperacoes === 0) {
    return <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">Sem operações fechadas ainda.</p>;
  }

  return (
    <div className="space-y-6">
      {/* 19/09/2026: o título "Faixas" repetia a aba logo acima; fica só para leitor de tela */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="sr-only">Faixas</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            <strong className="text-foreground">{formatarNumero(r.nOperacoes)}</strong> operações em{" "}
            <strong className="text-foreground">{formatarNumero(totalComDados)}</strong> faixas de dia × hora · mediana de drawdown{" "}
            <strong className="text-foreground">{formatarBRL(r.medianaDd, { inteiro: r.medianaDd >= 1000 })}</strong>
          </p>
        </div>
        <Segmentado ariaLabel="Período" opcoes={OPCOES_PERIODO} valor={periodo} onChange={setPeriodo} />
      </header>

      {/* as regras, uma linha por classe; a definição de cada termo está na metodologia */}
      <section className="painel">
        <div className="border-b px-4 py-3 sm:px-5">
          <h3 className="font-semibold">Regras</h3>
          <p className="text-xs text-muted-foreground">amostra mínima de {formatarNumero(p.amostraMinima)} operações por faixa</p>
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
                  {/* 19/09/2026: embaixo da classe, só o lote; "Operar com confiança" e afins eram tom de coach */}
                  <span className="flex-1">
                    <span className="font-medium">{ROTULO_CLASSE[c]}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">lote {formatarPct(LOTE_POR_CLASSE[c], 0)}</span>
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: COR[c] }}>
                    {formatarNumero(r.contagem[c])}
                  </span>
                  <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                    {totalComDados > 0 ? formatarPct(r.contagem[c] / totalComDados, 0) : "0%"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 19/09/2026: sem faixa Ligar, a lista mostra os maiores scores entre todas as classificadas
            (validarFaixas); o título dizia "para ligar" nos dois casos */}
        <section className="painel p-4 sm:p-5">
          <h3 className="font-semibold">{r.contagem.ligar > 0 ? "Melhores faixas para ligar" : "Maiores scores"}</h3>
          <p className="mb-3 text-xs text-muted-foreground tabular-nums">
            {r.contagem.ligar > 0
              ? `${formatarNumero(r.melhores.length)} de ${formatarNumero(r.contagem.ligar)} ${r.contagem.ligar === 1 ? "faixa" : "faixas"} Ligar, pelo score`
              : "nenhuma faixa classificada como Ligar"}
          </p>
          {r.melhores.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma faixa com amostra suficiente.</p>
          ) : (
            <ol className="space-y-3">
              {r.melhores.map((f) => (
                <li key={f.rotulo}>
                  {/* 19/09/2026: sem o número da posição (a ordem já diz), a barra do score fora do verde
                      (não é dinheiro) e o "lote 100%" sem quebrar entre a palavra e o número */}
                  <button
                    type="button"
                    onClick={() => setSelecionada(f)}
                    className="flex w-full items-center gap-3 rounded-lg text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{f.rotulo}</span>
                      <div className="mt-1 h-1 rounded-full bg-muted">
                        <div className="h-1 rounded-full bg-foreground/60" style={{ width: `${Math.round((f.score / maiorScore) * 100)}%` }} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                        {formatarNumero(f.n)} op · {formatarPct(f.acerto, 0)} acerto · recuperação {rec(f.recuperacao)} · lote&nbsp;{formatarPct(f.lote, 0)}
                      </p>
                    </div>
                    {/* 19/09/2026: o score não é dinheiro, então sai do verde; o rótulo embaixo sai da caixa alta */}
                    <div className="text-right">
                      <span className="text-xl font-semibold tabular-nums">{formatarNumero(f.score)}</span>
                      <span className="block text-[11px] text-muted-foreground">score</span>
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
          <h3 className="font-semibold">Mapa de faixas</h3>
          <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {CLASSES.map((c) => (
              <li key={c} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: COR[c] }} /> {ROTULO_CLASSE[c]}
              </li>
            ))}
          </ul>
        </div>
        {/* 19/09/2026: no celular o mapa rola de lado; a borda esmaece em vez de cortar o valor seco */}
        <div className="borda-esmaece overflow-x-auto">
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
                            f.classe ? FUNDO[f.classe] : "bg-transparent text-muted-foreground ring-foreground/10",
                            apagada && "opacity-25",
                            sel && "ring-2 ring-foreground",
                          )}
                        >
                          <span className="font-semibold">{f.classe ? ROTULO_CLASSE[f.classe] : "sem amostra"}</span>
                          {/* 19/09/2026: sem o opacity-80, que levava a linha a 3,2-4,5:1 sobre a célula tingida */}
                          <span className="text-[11px] tabular-nums">
                            {formatarNumero(f.n)} op{f.n > 0 ? ` · ${formatarPct(f.acerto, 0)}` : ""}
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
                score <strong className="text-foreground">{formatarNumero(selecionada.score)}</strong> · lote&nbsp;{formatarPct(selecionada.lote, 0)}
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
              <Item rotulo="Meses positivos" valor={`${formatarNumero(selecionada.mesesPositivos)} de ${formatarNumero(selecionada.mesesComDados)}`} />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">{selecionada.motivo}.</p>
          </div>
        ) : null}
      </section>

      {insights.length > 0 ? (
        <section className="painel">
          <div className="border-b px-4 py-3 sm:px-5">
            <h3 className="font-semibold">O que as regras apontam</h3>
          </div>
          <ul className="divide-y divide-(--painel-fio)">
            {insights.map((i) => (
              <li key={i.chave} className="px-4 py-2.5 text-sm sm:px-5">
                {i.texto.replace(/-(?=R\$)/g, SINAL_PRESO)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** 19/09/2026: o rótulo acima do número saiu da caixa alta */
function Item({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
