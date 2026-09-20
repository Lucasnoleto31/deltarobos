"use client";

import { cn } from "cn";
import { Fragment, useMemo, useState } from "react";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
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
// o texto da regra de cada classe e o "o que é" dela (19/09/2026: o Neutro entrou nas Regras, era a única
// classe do mapa sem regra na tela)
const COR_TEXTO: Record<ClasseFaixa, string> = {
  ligar: "text-positivo",
  cautela: "text-alerta",
  neutro: "text-muted-foreground",
  evitar: "text-negativo",
};
const INFO_CLASSE: Record<ClasseFaixa, ChaveIndicador> = {
  ligar: "classeLigar",
  cautela: "classeCautela",
  neutro: "classeNeutro",
  evitar: "classeEvitar",
};
const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// hífen + word joiner (U+2060): o "-R$ 12,30" das frases não quebra entre o sinal e o valor (19/09/2026)
const SINAL_PRESO = String.fromCharCode(0x2d, 0x2060);

function rec(v: number | null): string {
  return v === null ? "∞" : formatarMultiplo(v);
}

/** "4×" no inteiro, "0,6×" no resto (19/09/2026) */
function vezes(v: number): string {
  return `${formatarNumero(v, Number.isInteger(v) ? 0 : 1)}×`;
}

/**
 * 19/09/2026: o motivo da faixa e as frases de "O que as regras apontam" chegam prontos de lib/stats/faixas
 * com ponto decimal e "x" ("recuperação 3.69 ≥ 0.85, DD relativo 0.6x ≤ 4x"). Aqui só o formato muda:
 * 3,69, 0,85, 0,6× e 4×. Valor em reais já vem formatado e fica de fora (o "R$ 1.234" não vira decimal).
 */
function formatarTextoRegra(texto: string): string {
  // o "×" mantém as casas que vieram (0.0x vira 0,0×, 4x vira 4×); a vírgula depois do número é pontuação
  const casas = (n: string) => n.split(".")[1]?.length ?? 0;
  return texto
    .replace(/(?<!\d|\d[.,])(\d+(?:\.\d+)?)x\b/g, (_, n: string) => `${formatarNumero(Number(n), casas(n))}×`)
    .replace(/(?<!\d|\d[.,]|R\$\s?)(\d+\.\d+)(?!\d|[.,]\d)/g, (_, n: string) => formatarMultiplo(Number(n)))
    .replace(/-(?=R\$)/g, SINAL_PRESO);
}

const chaveFaixa = (f: Pick<Faixa, "diaSemana" | "hora">) => `${f.diaSemana}-${f.hora}`;

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
  // 19/09/2026: a faixa escolhida fica guardada pelo dia e hora, não pelo objeto: ao trocar o período o
  // detalhe mostrava os números do período anterior. Tocar de novo na mesma faixa desmarca.
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const r = resultados[periodo];

  const porCelula = useMemo(() => {
    const m = new Map<string, Faixa>();
    for (const f of r.faixas) m.set(chaveFaixa(f), f);
    return m;
  }, [r]);
  const faixaSel = selecionada === null ? null : (porCelula.get(selecionada) ?? null);
  const alternar = (f: Faixa) => setSelecionada((s) => (s === chaveFaixa(f) ? null : chaveFaixa(f)));

  const totalComDados = r.comDados.length;
  const maiorScore = Math.max(1, ...r.melhores.map((f) => f.score));
  const p = r.parametros;
  const regras: Record<Exclude<ClasseFaixa, "neutro">, string[]> = {
    ligar: [
      `acerto ≥ ${formatarPct(p.ligar.acertoMin, 0)}`,
      `recuperação ≥ ${formatarMultiplo(p.ligar.recuperacaoMin)}`,
      `drawdown ≤ ${vezes(p.ligar.ddRelativoMax)} a mediana`,
    ],
    cautela: [`acerto ≥ ${formatarPct(p.cautela.acertoMin, 0)}`, `recuperação ≥ ${formatarMultiplo(p.cautela.recuperacaoMin)}`],
    evitar: [
      `acerto < ${formatarPct(p.evitar.acertoMax, 0)}`,
      `recuperação < ${formatarMultiplo(p.evitar.recuperacaoMax)}`,
      `drawdown > ${vezes(p.evitar.ddRelativoMin)} a mediana`,
    ],
  };
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
            <strong className="text-foreground">{formatarNumero(totalComDados)}</strong>{" "}
            <RotuloComInfo chave="faixa">faixas de dia × hora</RotuloComInfo> ·{" "}
            <RotuloComInfo chave="medianaDrawdown">mediana de drawdown</RotuloComInfo>{" "}
            <strong className="text-foreground">{formatarBRL(r.medianaDd, { inteiro: r.medianaDd >= 1000 })}</strong>
          </p>
        </div>
        <Segmentado ariaLabel="Período" opcoes={OPCOES_PERIODO} valor={periodo} onChange={setPeriodo} />
      </header>

      {/* as regras, uma por classe, na ordem do resto da tela; o i de cada classe diz em palavras o que a
          regra ao lado diz em números (19/09/2026). A conta completa está na metodologia. */}
      <section className="painel">
        <div className="border-b px-4 py-3 sm:px-5">
          <h3 className="font-semibold">Regras</h3>
          <p className="text-xs text-muted-foreground">
            <RotuloComInfo chave="amostraMinima">amostra mínima de {formatarNumero(p.amostraMinima)} operações por faixa</RotuloComInfo>
          </p>
        </div>
        <dl className="grid text-sm sm:grid-cols-2 lg:grid-cols-4">
          {CLASSES.map((c, i) => (
            <div
              key={c}
              className={cn(
                "border-(--painel-fio) px-4 py-3 sm:px-5 lg:border-t-0",
                i > 0 && "border-t lg:border-l",
                i === 1 && "sm:border-t-0",
                i % 2 === 1 && "sm:border-l",
              )}
            >
              <dt className={cn("font-medium", COR_TEXTO[c])}>
                <RotuloComInfo chave={INFO_CLASSE[c]}>{ROTULO_CLASSE[c]}</RotuloComInfo>
              </dt>
              {/* cada critério inteiro numa linha: o "0,40" e o "·" não começam linha sozinhos */}
              <dd className="mt-1 text-muted-foreground tabular-nums">
                {c === "neutro"
                  ? "com amostra, fora de Ligar, Cautela e Evitar"
                  : regras[c].map((t, j) => (
                      <Fragment key={t}>
                        {j === 0 ? null : c === "evitar" ? <> ou&nbsp;</> : <>&nbsp;· </>}
                        <span className="whitespace-nowrap">{t}</span>
                      </Fragment>
                    ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* distribuição: uma barra empilhada e a lista; tocar numa classe filtra o mapa */}
        <section className="painel p-4 sm:p-5">
          <h3 className="font-semibold">
            <RotuloComInfo chave="distribuicaoFaixas">Distribuição das faixas</RotuloComInfo>
          </h3>
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
          <h3 className="font-semibold">
            <RotuloComInfo chave="melhoresFaixas">{r.contagem.ligar > 0 ? "Melhores faixas para ligar" : "Maiores scores"}</RotuloComInfo>
          </h3>
          <p className="mb-3 text-xs text-muted-foreground tabular-nums">
            {r.contagem.ligar > 0
              ? `${formatarNumero(r.melhores.length)} de ${formatarNumero(r.contagem.ligar)} ${r.contagem.ligar === 1 ? "faixa" : "faixas"} Ligar, pelo score`
              : "nenhuma faixa classificada como Ligar"}
          </p>
          {r.melhores.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma faixa com amostra suficiente.</p>
          ) : (
            <ol className="-mx-2">
              {r.melhores.map((f) => (
                <li key={f.rotulo}>
                  {/* 19/09/2026: sem o número da posição (a ordem já diz), a barra do score fora do verde
                      (não é dinheiro) e o "lote 100%" sem quebrar entre a palavra e o número. A faixa aberta
                      no detalhe fica marcada aqui também, e tocar de novo fecha. */}
                  <button
                    type="button"
                    onClick={() => alternar(f)}
                    aria-pressed={selecionada === chaveFaixa(f)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors outline-none hover:bg-(--linha-hover) focus-visible:ring-2 focus-visible:ring-ring/50",
                      selecionada === chaveFaixa(f) && "bg-(--linha-hover) ring-1 ring-foreground/25",
                    )}
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
          <h3 className="font-semibold">
            <RotuloComInfo chave="mapaFaixas">Mapa de faixas</RotuloComInfo>
          </h3>
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
                    const sel = selecionada === chaveFaixa(f);
                    return (
                      <td key={d} className="p-0">
                        <button
                          type="button"
                          onClick={() => alternar(f)}
                          aria-pressed={sel}
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

        {faixaSel ? (
          <div className="mt-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">
                {faixaSel.rotulo}{" "}
                {faixaSel.classe ? <span className={cn("ml-2 rounded-md px-1.5 py-0.5 text-[11px] ring-1", FUNDO[faixaSel.classe])}>{ROTULO_CLASSE[faixaSel.classe]}</span> : null}
              </h4>
              <span className="text-sm text-muted-foreground tabular-nums">
                <RotuloComInfo chave="score">score</RotuloComInfo> <strong className="text-foreground">{formatarNumero(faixaSel.score)}</strong> ·{" "}
                <RotuloComInfo chave="lote">lote</RotuloComInfo>&nbsp;{formatarPct(faixaSel.lote, 0)}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
              <Item
                rotulo="Operações"
                info="operacoes"
                texto="Quantas operações começaram neste dia da semana e nesta hora, no período escolhido."
                valor={formatarNumero(faixaSel.n)}
              />
              <Item rotulo="Acerto" info="taxaAcerto" valor={formatarPct(faixaSel.acerto, 0)} />
              <Item rotulo="Recuperação" info="recuperacaoFaixa" valor={rec(faixaSel.recuperacao)} />
              <Item rotulo="Drawdown" info="drawdownFaixa" valor={formatarBRL(faixaSel.dd, { inteiro: faixaSel.dd >= 1000 })} />
              <Item rotulo="DD relativo" info="ddRelativo" valor={faixaSel.ddRelativo === null ? "–" : `${formatarMultiplo(faixaSel.ddRelativo, 1)}×`} />
              <Item rotulo="Expectativa / op" info="expectativaOperacao" valor={<Valor valor={faixaSel.expectativa} />} />
              <Item rotulo="Total" info="totalFaixa" valor={<Valor valor={faixaSel.total} inteiro={Math.abs(faixaSel.total) >= 1000} />} />
              <Item
                rotulo="Meses positivos"
                info="mesesPositivos"
                valor={`${formatarNumero(faixaSel.mesesPositivos)} de ${formatarNumero(faixaSel.mesesComDados)}`}
              />
            </dl>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">{formatarTextoRegra(faixaSel.motivo)}.</p>
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
                {formatarTextoRegra(i.texto)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** 19/09/2026: o rótulo acima do número saiu da caixa alta; ganhou o i do "o que é" (texto troca o do glossário) */
function Item({ rotulo, info, texto, valor }: { rotulo: string; info: ChaveIndicador; texto?: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">
        <RotuloComInfo chave={info} texto={texto}>
          {rotulo}
        </RotuloComInfo>
      </dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
