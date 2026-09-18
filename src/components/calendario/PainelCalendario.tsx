"use client";

import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { Heatmap } from "@/components/desempenho/Heatmap";
import { escalaDeForca, mistura } from "@/components/graficos/base";
import { AmostraDaLinha, CURVA_POR_OPERACAO, DesenhoDaCurva, MolduraProfit, type MarcadorDaCurva } from "@/components/graficos/CurvaProfit";
import { seriePorOperacao } from "@/components/graficos/series-da-curva";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataLonga, formatarMesAno, formatarNumero, formatarPct } from "@/lib/formato";
import { gradeMes, heatmapAnoMes, mesesComDados } from "@/lib/stats/calendario";
import { dia as diaOp, excursaoDoDia, porDiaSemana, porHora, valorOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
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
// quantos dias as listas de melhores e piores mostram antes do "mostrar os 10"
const NO_TOPO = 5;

/** O valor dentro da casa do dia: sem "R$" e sem espaço depois do sinal, para caber em 60 px no celular. */
function curto(v: number): string {
  const a = Math.abs(v);
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${formatarNumero(a, a >= 100 ? 0 : 2)}`;
}

/**
 * Dois ou três números lado a lado num painel só, com o rótulo embaixo: cabe em 390 px sem um invadir o
 * outro. Três já é o limite nessa largura; o que não couber num trio vai numa fileira de dois embaixo.
 */
function Fileira({ itens, colunas = 3 }: { itens: Array<{ rotulo: string; valor: React.ReactNode; apoio?: React.ReactNode }>; colunas?: 2 | 3 }) {
  return (
    <dl className={cn("grid divide-x divide-(--painel-fio)", colunas === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0 px-2 py-3 text-center sm:px-3">
          <dd className="truncate text-base leading-none font-semibold tabular-nums sm:text-xl">{i.valor}</dd>
          <dt className="mt-1.5 text-[11px] text-muted-foreground">{i.rotulo}</dt>
          {i.apoio ? <dd className="truncate text-[11px] text-muted-foreground tabular-nums">{i.apoio}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * Aba Calendário: o mês com o detalhe do dia, o resultado por dia da semana, os melhores e piores
 * dias e o mapa de meses. Refeita em 17/09/2026 (os números são os mesmos, das mesmas funções):
 * - no celular, tocar num dia não mostrava nada, porque o detalhe ficava uma tela abaixo: agora a
 *   página rola até ele, e o calendário já abre com o último pregão escolhido em vez de um painel
 *   vazio de 540 px dizendo "nenhum dia selecionado";
 * - os três números do mês colidiam em 390 px e "- 12.224" quebrava em duas linhas na casa do dia;
 * - todo dia positivo tinha o mesmo verde: a cor agora segue o tamanho do resultado, como no Hub;
 * - o detalhe do dia mostrava a mesma coisa duas vezes (barras por hora e a lista por hora): as
 *   barras deram lugar ao dia em curva, operação a operação, no estilo Profit.
 */
export function PainelCalendario({ linhas, ops, feriados, hoje, valorPonto, capitalReferencia }: Props) {
  const idCurva = `cal-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const opcoes = useMemo<OpcoesSerie>(() => ({ base: "liquido", unidade: "brl", valorPonto }), [valorPonto]);
  const meses = useMemo(() => mesesComDados(linhas), [linhas]);
  const primeiroMes = meses[0] ?? mesDe(hoje);
  const mesAtual = mesDe(hoje);

  /** o último pregão com operação dentro de um mês: é o dia que o detalhe abre mostrando */
  const ultimoDiaDe = (m: string): string | null => {
    const doMes = linhas.filter((l) => mesDe(l.dia) === m).map((l) => l.dia);
    return doMes.length > 0 ? doMes.reduce((a, b) => (a > b ? a : b)) : null;
  };

  const mesInicial = meses.includes(mesAtual) ? mesAtual : (meses[meses.length - 1] ?? mesAtual);
  const [mes, setMes] = useState(mesInicial);
  const [diaSel, setDiaSel] = useState<string | null>(() => ultimoDiaDe(mesInicial));
  const [todosOsDias, setTodosOsDias] = useState(false);
  const detalheRef = useRef<HTMLElement>(null);
  const mesRef = useRef<HTMLDivElement>(null);

  const trocarMes = (m: string) => {
    setMes(m);
    setDiaSel(ultimoDiaDe(m));
  };

  const escolherDia = (d: string, vindoDaLista = false) => {
    setDiaSel(d);
    if (typeof window === "undefined") return;
    const estreito = window.matchMedia("(max-width: 1023px)").matches;
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Do tablet para baixo o detalhe fica embaixo do calendário, fora da tela: a página vai até ele.
    // No computador os dois ficam lado a lado, então só quem vem das listas lá de baixo precisa subir.
    const alvo = estreito ? detalheRef.current : vindoDaLista ? mesRef.current : null;
    if (alvo) requestAnimationFrame(() => alvo.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" }));
  };

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
  // a régua da cor é o histórico inteiro, para um mês poder ser comparado com outro
  const forca = useMemo(() => escalaDeForca(diasValor.map((d) => d.valor)), [diasValor]);
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
  const maiorHora = Math.max(1, ...horasDia.map((f) => Math.abs(f.total)));

  // o dia em curva, operação a operação (as operações compactas já vêm em ordem de fechamento)
  const curvaDoDia = useMemo(() => (diaSel ? seriePorOperacao(opsDia, opcoes, [diaSel]) : []), [opsDia, opcoes, diaSel]);
  // MEP e MEN do dia sobre TODAS as operações (a curva desenhada é fatiada em até 240 pontos e pode
  // não passar pelo pico); a posição de cada marcador é a mesma régua da série: n-ésima operação / total
  const excursao = useMemo(() => excursaoDoDia(opsDia, opcoes), [opsDia, opcoes]);
  const marcadoresDoDia = useMemo(() => {
    const lista: MarcadorDaCurva[] = [];
    const n = excursao.nOperacoes || 1;
    if (excursao.operacaoMep !== null) lista.push({ posicao: excursao.operacaoMep / n, valor: excursao.mep, rotulo: "MEP", tom: "positivo" });
    if (excursao.operacaoMen !== null) lista.push({ posicao: excursao.operacaoMen / n, valor: excursao.men, rotulo: "MEN", tom: "negativo" });
    return lista;
  }, [excursao]);
  // O eixo de baixo é a ordem de fechamento, e é isso que ele diz: "1ª", "31ª"... A única hora que a
  // operação compacta guarda é a de ABERTURA, e rotular por ela engana: em 02/09/2026 as posições
  // abertas às 10h só fecharam no fim do dia, e o eixo saía "9h 11h 13h 10h".
  const ordemNoEixo = useMemo(() => {
    const n = opsDia.length;
    const quantas = Math.min(5, n);
    const marcas = Array.from({ length: quantas }, (_, i) => {
      const f = i / quantas;
      return { x: f * 100, rotulo: `${formatarNumero(Math.min(n, Math.floor(f * n) + 1))}ª` };
    });
    return marcas.filter((m, i) => i === 0 || m.rotulo !== marcas[i - 1].rotulo);
  }, [opsDia]);

  const mesAnterior = mesDe(somarMeses(`${mes}-01`, -1));
  const mesSeguinte = mesDe(somarMeses(`${mes}-01`, 1));
  const podeVoltar = mesAnterior >= primeiroMes;
  const podeAvancar = mesSeguinte <= mesAtual;

  const irHoje = () => {
    setMes(mesAtual);
    setDiaSel(linhas.some((l) => l.dia === hoje) ? hoje : ultimoDiaDe(mesAtual));
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
        <h2 className="text-2xl font-semibold tracking-tight">Calendário</h2>
        <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular-nums">
          <span>
            <strong className="text-foreground">{formatarNumero(linhas.length)}</strong> pregões, líquido por 1 contrato
          </span>
          {melhorGeral ? (
            <span>
              melhor dia <Valor valor={melhorGeral.valor} inteiro className="font-semibold" />
            </span>
          ) : null}
          {piorGeral ? (
            <span>
              pior dia <Valor valor={piorGeral.valor} inteiro className="font-semibold" />
            </span>
          ) : null}
        </p>
      </header>

      <div ref={mesRef} className="grid scroll-mt-20 items-stretch gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* mês: a grade estica até a altura do detalhe ao lado, para as duas colunas terminarem juntas */}
        <section className="painel flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="min-w-0">
              <h3 className="font-semibold first-letter:uppercase">{formatarMesAno(`${mes}-01`)}</h3>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {grade.nDias} {grade.nDias === 1 ? "pregão" : "pregões"} · escolha um dia
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="icon-sm" aria-label="Mês anterior" disabled={!podeVoltar} onClick={() => trocarMes(mesAnterior)}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="sm" onClick={irHoje}>
                Hoje
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Próximo mês" disabled={!podeAvancar} onClick={() => trocarMes(mesSeguinte)}>
                <ChevronRight />
              </Button>
            </div>
          </div>

          <div className="border-b">
            <Fileira
              itens={[
                {
                  rotulo: "resultado do mês",
                  valor: <Valor valor={grade.total} inteiro={Math.abs(grade.total) >= 1000} />,
                  apoio: capitalReferencia ? `${formatarPct(grade.total / capitalReferencia, 1)} do capital` : undefined,
                },
                {
                  rotulo: "dias positivos",
                  valor: grade.nDias > 0 ? formatarPct(grade.nPositivos / grade.nDias, 0) : "–",
                  apoio: `${grade.nPositivos} de ${grade.nDias}`,
                },
                {
                  rotulo: "melhor dia do mês",
                  valor: melhorDoMes ? <Valor valor={melhorDoMes.valor} inteiro={Math.abs(melhorDoMes.valor) >= 1000} /> : "–",
                  apoio: melhorDoMes ? formatarData(melhorDoMes.dia) : undefined,
                },
              ]}
            />
          </div>

          <div className="flex flex-1 flex-col p-2 sm:p-3">
            <div className="mb-1 grid grid-cols-5 gap-1 text-center text-[11px] text-muted-foreground uppercase sm:gap-1.5">
              {CABECALHO.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="grid flex-1 auto-rows-fr grid-cols-5 gap-1 sm:gap-1.5">
              {semanasUteis.flat().map((d) => {
                const semDado = d.valor === null;
                const selecionado = d.dia === diaSel;
                const positivo = !semDado && d.valor! > 0;
                const negativo = !semDado && d.valor! < 0;
                // a cor segue o tamanho do resultado: de 14% a 50% do verde ou do vermelho; o texto fica
                // branco em cima (verde sobre verde não se lia, 18/09/2026)
                const fundo =
                  positivo || negativo
                    ? mistura(positivo ? "--positivo" : "--negativo", 14 + Math.round(36 * forca(d.valor!)))
                    : undefined;
                return (
                  <button
                    key={d.dia}
                    type="button"
                    disabled={semDado}
                    onClick={() => escolherDia(d.dia)}
                    aria-pressed={selecionado}
                    aria-label={semDado ? undefined : `${formatarData(d.dia)}: ${curto(d.valor!)} reais em ${d.nOperacoes} operações`}
                    style={{ background: fundo }}
                    className={cn(
                      "flex min-h-14 min-w-0 flex-col items-start rounded-lg p-1.5 text-left tabular-nums outline-none transition-shadow disabled:cursor-default sm:min-h-16 sm:p-2",
                      "focus-visible:ring-2 focus-visible:ring-ring/60",
                      semDado && (d.pregao ? "bg-muted/40 text-muted-foreground" : "bg-transparent text-muted-foreground/40"),
                      (positivo || negativo) && "text-foreground",
                      !semDado && !positivo && !negativo && "bg-muted text-foreground",
                      d.foraDoMes && "invisible",
                      selecionado ? "ring-2 ring-foreground" : !semDado && "ring-1 ring-(--painel-fio) hover:ring-foreground/40",
                    )}
                  >
                    <span className="text-[11px] font-medium text-foreground/75 sm:text-xs">{d.diaDoMes}</span>
                    {!semDado ? (
                      <>
                        <span className="mt-0.5 max-w-full truncate text-[11px] leading-tight font-semibold sm:text-sm">{curto(d.valor!)}</span>
                        <span className="text-[10px] leading-tight text-foreground/65">{d.nOperacoes} op</span>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* detalhe do dia */}
        <section ref={detalheRef} className="painel scroll-mt-20">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Detalhe do dia</h3>
            <p className="text-xs text-muted-foreground first-letter:uppercase">
              {diaSel ? formatarDataLonga(diaSel) : "Nenhum pregão com operação neste mês."}
            </p>
          </div>
          {diaSel === null ? null : (
            <>
              <div className="border-b">
                <Fileira
                  itens={[
                    { rotulo: "resultado", valor: <Valor valor={totalDia} inteiro={Math.abs(totalDia) >= 1000} /> },
                    { rotulo: opsDia.length === 1 ? "operação" : "operações", valor: formatarNumero(opsDia.length) },
                    {
                      rotulo: opsDia.length > 0 ? `acerto · ${formatarNumero(gainsDia)} gain` : "acerto",
                      valor: opsDia.length > 0 ? formatarPct(gainsDia / opsDia.length, 0) : "–",
                    },
                  ]}
                />
              </div>

              {/* MEP e MEN: o pico e o vale do saldo do dia, medidos só nos fechamentos. Não é o número do
                  Profit, que acompanha tick a tick com a posição aberta; por isso o texto de apoio diz como
                  é medido, avisa que nunca passa do número do Profit e aponta para a metodologia. */}
              <div className="border-b">
                <Fileira
                  colunas={2}
                  itens={[
                    {
                      rotulo: "exposição positiva (MEP)",
                      valor: opsDia.length > 0 ? <Valor valor={excursao.mep} inteiro={Math.abs(excursao.mep) >= 1000} /> : "–",
                      apoio:
                        opsDia.length === 0
                          ? undefined
                          : excursao.operacaoMep !== null
                            ? `na ${formatarNumero(excursao.operacaoMep)}ª operação`
                            : "não ficou positivo",
                    },
                    {
                      rotulo: "exposição negativa (MEN)",
                      valor: opsDia.length > 0 ? <Valor valor={excursao.men} inteiro={Math.abs(excursao.men) >= 1000} /> : "–",
                      apoio:
                        opsDia.length === 0
                          ? undefined
                          : excursao.operacaoMen !== null
                            ? `na ${formatarNumero(excursao.operacaoMen)}ª operação`
                            : "não ficou negativo",
                    },
                  ]}
                />
                <p className="px-3 pb-3 text-center text-xs text-muted-foreground">
                  medidos a cada fechamento, sem a posição em aberto, por isso nunca passam do MEP/MEN do Profit ·{" "}
                  <Link href="/metodologia#mep-men" className="underline underline-offset-4 hover:text-foreground">
                    metodologia
                  </Link>
                </p>
              </div>

              <div className="space-y-4 p-3 sm:p-4">
                {curvaDoDia.length > 0 ? (
                  <MolduraProfit
                    titulo="O dia, operação a operação"
                    legenda={
                      <span className="inline-flex items-center gap-1.5">
                        <AmostraDaLinha cores={CURVA_POR_OPERACAO} />1 contrato, líquido, por ordem de fechamento
                      </span>
                    }
                  >
                    <DesenhoDaCurva
                      key={diaSel}
                      id={idCurva}
                      pontos={curvaDoDia}
                      cores={CURVA_POR_OPERACAO}
                      altura={170}
                      marcadores={marcadoresDoDia}
                      rotulosX={ordemNoEixo}
                      formatarEixo={(v) => formatarNumero(v, 0)}
                      rotuloVertical="Saldo do dia (R$)"
                      rotuloAria={`Resultado acumulado de ${formatarData(diaSel)}, operação a operação`}
                    />
                  </MolduraProfit>
                ) : null}

                {/* por hora de entrada: a barra dá o tamanho, o texto dá o número */}
                <div className="painel-grupo">
                  <div className="painel-cabeca px-0">
                    <h4 className="painel-titulo">Por hora de entrada</h4>
                  </div>
                  <ul>
                    {horasDia.map((f) => (
                      <li key={f.chave} className="sep [--sep:0px] grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm tabular-nums">
                        <span className="text-muted-foreground">{f.rotulo}</span>
                        <div className="min-w-0">
                          <div className="h-1 rounded-full bg-muted">
                            <div
                              className={cn("h-1 rounded-full", f.total >= 0 ? "bg-positivo" : "bg-negativo")}
                              style={{ width: `${Math.max(3, Math.round((Math.abs(f.total) / maiorHora) * 100))}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatarNumero(f.n)} op · {f.n > 0 ? Math.round((f.nGain / f.n) * 100) : 0}% de acerto
                          </p>
                        </div>
                        <Valor valor={f.total} className="font-medium" />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section className="painel p-4">
          <h3 className="font-semibold">Por dia da semana</h3>
          <p className="mb-3 text-xs text-muted-foreground">todo o histórico</p>
          <ul className="space-y-3">
            {porDia.map((f) => (
              <li key={f.chave} className="flex items-center gap-3 text-sm">
                <span className="w-8 font-medium">{f.rotulo}</span>
                <div className="h-1 flex-1 rounded-full bg-muted">
                  <div
                    className={cn("h-1 rounded-full", f.total >= 0 ? "bg-positivo" : "bg-negativo")}
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

        <ListaDias titulo="Melhores dias" itens={melhores} positivo todos={todosOsDias} aoEscolher={(d) => { trocarMes(mesDe(d)); escolherDia(d, true); }} />
        <ListaDias titulo="Piores dias" itens={piores} todos={todosOsDias} aoEscolher={(d) => { trocarMes(mesDe(d)); escolherDia(d, true); }} />
      </div>

      {melhores.length > NO_TOPO ? (
        <div className="flex justify-center lg:justify-end">
          <Button variant="outline" size="sm" onClick={() => setTodosOsDias((v) => !v)} aria-expanded={todosOsDias}>
            {todosOsDias ? `Mostrar só os ${NO_TOPO} primeiros` : `Mostrar os ${melhores.length} melhores e piores`}
          </Button>
        </div>
      ) : null}

      <section className="painel p-4 sm:p-5">
        <h3 className="font-semibold">Resultado mensal por ano</h3>
        <p className="mb-3 text-xs text-muted-foreground">cada célula é o consolidado do mês</p>
        <Heatmap linhas={heatmap} unidade="brl" />
      </section>
    </div>
  );
}

function ListaDias({
  titulo,
  itens,
  positivo = false,
  todos,
  aoEscolher,
}: {
  titulo: string;
  itens: { dia: string; valor: number; n: number }[];
  positivo?: boolean;
  todos: boolean;
  /** tocar num dia da lista abre esse dia no calendário */
  aoEscolher: (dia: string) => void;
}) {
  const maior = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  const mostrados = todos ? itens : itens.slice(0, NO_TOPO);
  return (
    <section className="painel p-4">
      <h3 className="font-semibold">{titulo}</h3>
      <p className="mb-2 text-xs text-muted-foreground">os {mostrados.length} primeiros do histórico</p>
      <ol>
        {mostrados.map((i, idx) => (
          <li key={i.dia}>
            <button
              type="button"
              onClick={() => aoEscolher(i.dia)}
              className="linha-interativa -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="w-5 text-xs text-muted-foreground tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {formatarData(i.dia)} <span className="text-xs font-normal text-muted-foreground">{formatarNumero(i.n)} op</span>
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
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
