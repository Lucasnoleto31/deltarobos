"use client";

import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { desempacotar, type OpsEmpacotadas } from "@/components/compartilhados/ops-codec";
import { Valor } from "@/components/compartilhados/Valor";
import { Heatmap } from "@/components/desempenho/Heatmap";
import { escalaDeForca, mistura } from "@/components/graficos/base";
import { AmostraDaLinha, CURVA_POR_OPERACAO, DesenhoDaCurva, MolduraProfit, type MarcadorDaCurva } from "@/components/graficos/CurvaProfit";
import { seriePorOperacao } from "@/components/graficos/series-da-curva";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataLonga, formatarMesAno, formatarNumero, formatarPct } from "@/lib/formato";
import { gradeMes, heatmapAnoMes, mesesComDados } from "@/lib/stats/calendario";
import { dia as diaOp, excursaoDoDia, porDiaSemana, porHora, valorOperacao } from "@/lib/stats/operacoes";
import { mesDe, somarMeses } from "@/lib/stats/periodos";
import { valorDia } from "@/lib/stats/serie";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";

interface Props {
  linhas: LinhaDiaria[];
  /** as operações empacotadas por ops-codec: 158 KB em vez de 699 KB no HTML (18/09/2026) */
  pacote: OpsEmpacotadas;
  feriados: string[];
  hoje: string;
  valorPonto: number;
  capitalReferencia: number | null;
}

const CABECALHO = ["Seg", "Ter", "Qua", "Qui", "Sex"];
// quantos dias as listas de melhores e piores mostram antes do "mostrar os 10"
const NO_TOPO = 5;
// A curva do dia: 170 px no celular; no computador ela vai de 130 a 300 px para o detalhe terminar junto com
// o calendário ao lado (19/09/2026: antes eram as casas do mês que esticavam até o detalhe). Os 130 são para
// fevereiro de quatro semanas, em que o calendário fica 78 px mais baixo
const ALTURA_CURVA = 170;
const ALTURA_CURVA_MIN = 130;
const ALTURA_CURVA_MAX = 300;

/** O valor dentro da casa do dia: sem "R$" e sem espaço depois do sinal, para caber em 60 px no celular. */
function curto(v: number): string {
  const a = Math.abs(v);
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${formatarNumero(a, a >= 100 ? 0 : 2)}`;
}

/**
 * Dois ou três números lado a lado num painel só, com o rótulo embaixo: cabe em 390 px sem um invadir o
 * outro. Três já é o limite nessa largura; o que não couber num trio vai numa fileira de dois embaixo.
 */
function Fileira({
  itens,
  colunas = 3,
}: {
  /** info: a chave do glossário, que põe o i do "o que é" no rótulo; textoInfo troca a explicação (19/09/2026) */
  itens: Array<{ rotulo: string; valor: React.ReactNode; apoio?: React.ReactNode; info?: ChaveIndicador; textoInfo?: string }>;
  colunas?: 2 | 3;
}) {
  return (
    <dl className={cn("grid divide-x divide-(--painel-fio)", colunas === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {itens.map((i) => (
        // 19/09/2026: px-1 no celular para o rótulo com o i caber numa linha em 115 px; o que ainda quebra
        // ("melhor dia do mês") quebra ao meio, e não com uma palavra sozinha embaixo
        <div key={i.rotulo} className="min-w-0 px-1 py-3 text-center sm:px-3">
          <dd className="truncate text-base leading-none font-semibold tabular-nums sm:text-xl">{i.valor}</dd>
          <dt className="mt-1.5 text-[11px] text-balance text-muted-foreground">
            {i.info ? (
              <RotuloComInfo chave={i.info} texto={i.textoInfo}>
                {i.rotulo}
              </RotuloComInfo>
            ) : (
              i.rotulo
            )}
          </dt>
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
 * 19/09/2026 (Artur: "muito esticada e tem um monte de espaço vazio"): as casas do mês têm altura fixa
 * e baixa em vez de esticar até o detalhe; o "Por hora de entrada" saiu da coluna do detalhe para uma
 * faixa de largura toda embaixo, e a curva do dia ocupa a diferença para as duas colunas terminarem juntas.
 * Cada número ganhou o i do "o que é"; o aviso de como o MEP e o MEN são medidos foi para dentro dele.
 */
export function PainelCalendario({ linhas, pacote, feriados, hoje, valorPonto, capitalReferencia }: Props) {
  const ops = useMemo(() => desempacotar(pacote), [pacote]);
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
  const calendarioRef = useRef<HTMLElement>(null);
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
  // de segunda a sexta; a semana que só tem sábado ou domingo no mês (mês que começa num sábado, ou que
  // termina num domingo) virava uma fileira inteira invisível
  const semanasUteis = useMemo(
    () => grade.semanas.map((s) => s.slice(1, 6)).filter((s) => s.some((d) => !d.foraDoMes)),
    [grade],
  );
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
  const opsNoHistorico = porDia.reduce((s, f) => s + f.n, 0);
  const primeiroDia = linhas.reduce((a, l) => (l.dia < a ? l.dia : a), linhas[0]?.dia ?? hoje);
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

  // A curva ocupa a diferença de altura entre o calendário e o detalhe, para as duas colunas terminarem
  // juntas sem esticar as casas do mês (só lado a lado, a partir de 1024 px). Mede onde o conteúdo de cada
  // painel acaba, não o painel: na grade os dois esticam até o mais alto. O ResizeObserver já chama o
  // ajuste ao começar a observar, e de novo quando o mês troca de 4 para 5 semanas ou o texto quebra.
  const [alturaCurva, setAlturaCurva] = useState(ALTURA_CURVA);
  const alturaCurvaRef = useRef(ALTURA_CURVA);
  const temCurva = curvaDoDia.length > 0;
  useEffect(() => {
    const cal = calendarioRef.current;
    const det = detalheRef.current;
    if (!cal || !det || typeof ResizeObserver === "undefined") return;
    const ladoALado = window.matchMedia("(min-width: 1024px)");
    const fimDoConteudo = (el: HTMLElement) => {
      const ultimo = el.lastElementChild as HTMLElement | null;
      return ultimo ? ultimo.offsetTop + ultimo.offsetHeight : el.offsetHeight;
    };
    const ajustar = () => {
      const atual = alturaCurvaRef.current;
      const nova =
        ladoALado.matches && temCurva
          ? Math.min(ALTURA_CURVA_MAX, Math.max(ALTURA_CURVA_MIN, atual + fimDoConteudo(cal) - fimDoConteudo(det)))
          : ALTURA_CURVA;
      if (Math.abs(nova - atual) < 2) return;
      alturaCurvaRef.current = nova;
      setAlturaCurva(nova);
    };
    const observador = new ResizeObserver(ajustar);
    for (const el of [cal, det, cal.lastElementChild, det.lastElementChild]) if (el) observador.observe(el);
    ladoALado.addEventListener("change", ajustar);
    return () => {
      observador.disconnect();
      ladoALado.removeEventListener("change", ajustar);
    };
  }, [mes, diaSel, temCurva]);

  const mesAnterior = mesDe(somarMeses(`${mes}-01`, -1));
  const mesSeguinte = mesDe(somarMeses(`${mes}-01`, 1));
  const podeVoltar = mesAnterior >= primeiroMes;
  const podeAvancar = mesSeguinte <= mesAtual;

  const irHoje = () => {
    setMes(mesAtual);
    setDiaSel(linhas.some((l) => l.dia === hoje) ? hoje : ultimoDiaDe(mesAtual));
  };

  if (linhas.length === 0) {
    return <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">Sem operações fechadas ainda.</p>;
  }

  return (
    <div className="space-y-6">
      {/* 19/09/2026: o título "Calendário" repetia a aba logo acima; fica só para leitor de tela, e a
          linha de fatos abre a página */}
      <header>
        <h2 className="sr-only">Calendário</h2>
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

      {/* 19/09/2026: o scroll-mt-20 saiu daqui e do detalhe. Quem desconta o cabeçalho fixo passou a ser
          o scroll-padding-top do html (globals.css), e os dois SOMAVAM: o scrollIntoView do clique no dia
          parava o painel 183 px do topo no celular, com 92 px de vão vazio debaixo da barra (medido). */}
      <div ref={mesRef} className="grid items-stretch gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* mês: casas de altura fixa; quem acompanha a altura do lado é a curva do detalhe (19/09/2026) */}
        <section ref={calendarioRef} className="painel">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="min-w-0">
              <h3 className="font-semibold first-letter:uppercase">{formatarMesAno(`${mes}-01`)}</h3>
              <p className="truncate text-xs text-muted-foreground tabular-nums">
                {formatarNumero(grade.nDias)} {grade.nDias === 1 ? "pregão" : "pregões"}
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
                  info: "resultadoMes",
                  textoInfo: capitalReferencia
                    ? "Soma do resultado de todos os pregões do mês mostrado, já descontados os custos. A porcentagem embaixo é esse valor comparado com o capital de referência do robô."
                    : undefined,
                },
                {
                  rotulo: "dias positivos",
                  valor: grade.nDias > 0 ? formatarPct(grade.nPositivos / grade.nDias, 0) : "–",
                  apoio: `${formatarNumero(grade.nPositivos)} de ${formatarNumero(grade.nDias)}`,
                  info: "diasPositivos",
                  textoInfo: "Parte dos pregões do mês que terminaram no lucro, já descontados os custos.",
                },
                {
                  rotulo: "melhor dia do mês",
                  valor: melhorDoMes ? <Valor valor={melhorDoMes.valor} inteiro={Math.abs(melhorDoMes.valor) >= 1000} /> : "–",
                  apoio: melhorDoMes ? formatarData(melhorDoMes.dia) : undefined,
                  info: "melhorDia",
                  textoInfo: "O pregão do mês com o maior resultado, já descontados os custos, e a data em que aconteceu.",
                },
              ]}
            />
          </div>

          <div className="p-2 sm:p-3">
            <div className="mb-1 grid grid-cols-5 gap-1 text-center text-[11px] text-muted-foreground uppercase sm:gap-1.5">
              {CABECALHO.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
              {semanasUteis.flat().map((d) => {
                const semDado = d.valor === null;
                const selecionado = d.dia === diaSel;
                const positivo = !semDado && d.valor! > 0;
                const negativo = !semDado && d.valor! < 0;
                const feriado = semDado && !d.pregao && !d.foraDoMes;
                // a cor segue o tamanho do resultado: de 14% a 50% do verde ou do vermelho; o texto fica
                // branco em cima (verde sobre verde não se lia, 18/09/2026). 19/09/2026: o dia do mês a 75%
                // e o "N op" a 65% do branco mediam 3,6 a 4,4:1 no verde mais forte; a 90% e 85% passam de 4,5
                // nos dois temas
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
                    aria-label={semDado ? undefined : `${formatarData(d.dia)}: ${curto(d.valor!)} reais em ${formatarNumero(d.nOperacoes)} operações`}
                    style={{ background: fundo }}
                    // 19/09/2026: altura fixa (56 px no celular, 72 px daí para cima) em vez de esticar até o
                    // detalhe, que deixava a casa com 135 px e o número perdido no canto. Do celular para cima o
                    // "N op" sobe para a linha do dia e o valor ganha a largura toda embaixo
                    className={cn(
                      "flex h-14 min-w-0 flex-col justify-between rounded-lg p-1.5 text-left tabular-nums outline-none transition-shadow disabled:cursor-default sm:h-[72px] sm:px-2.5 sm:py-2",
                      "focus-visible:ring-2 focus-visible:ring-ring/60",
                      // sem operação, bem apagado: o pregão vazio (futuro, ou sem operação) com um fundo quase
                      // nenhum, o feriado sem fundo
                      semDado && (d.pregao ? "bg-foreground/[0.025] text-muted-foreground/70" : "text-muted-foreground/50"),
                      (positivo || negativo) && "text-foreground",
                      !semDado && !positivo && !negativo && "bg-muted text-foreground",
                      d.foraDoMes && "invisible",
                      selecionado ? "ring-2 ring-foreground" : !semDado && "ring-1 ring-(--painel-fio) hover:ring-foreground/40",
                    )}
                  >
                    <span className="flex w-full items-baseline justify-between gap-1">
                      <span className={cn("text-[11px] font-medium sm:text-xs", !semDado && "text-foreground/90")}>{d.diaDoMes}</span>
                      {!semDado ? (
                        <span className="hidden text-[10px] text-foreground/85 sm:inline">{formatarNumero(d.nOperacoes)} op</span>
                      ) : null}
                    </span>
                    {!semDado ? (
                      <span className="w-full min-w-0">
                        <span className="block truncate text-[11px] leading-tight font-semibold sm:text-lg">{curto(d.valor!)}</span>
                        <span className="block text-[10px] leading-tight text-foreground/85 sm:hidden">{formatarNumero(d.nOperacoes)} op</span>
                      </span>
                    ) : feriado ? (
                      <span className="text-[10px] leading-tight">feriado</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* detalhe do dia */}
        <section ref={detalheRef} className="painel">
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
                    {
                      rotulo: "resultado",
                      valor: <Valor valor={totalDia} inteiro={Math.abs(totalDia) >= 1000} />,
                      info: "resultadoDia",
                    },
                    {
                      rotulo: opsDia.length === 1 ? "operação" : "operações",
                      valor: formatarNumero(opsDia.length),
                      info: "operacoes",
                      textoInfo: "Quantas vezes o robô entrou no mercado e saiu neste pregão. Cada operação vai da entrada até a posição zerar.",
                    },
                    {
                      rotulo: opsDia.length > 0 ? `acerto · ${formatarNumero(gainsDia)} ${gainsDia === 1 ? "gain" : "gains"}` : "acerto",
                      valor: opsDia.length > 0 ? formatarPct(gainsDia / opsDia.length, 0) : "–",
                      info: "taxaAcerto",
                      textoInfo:
                        "Parte das operações do dia que terminou com lucro depois dos custos; cada uma delas é um gain. Sozinha não diz se o dia foi bom: depende também do tamanho dos ganhos e das perdas.",
                    },
                  ]}
                />
              </div>

              {/* MEP e MEN: o pico e o vale do saldo do dia, medidos só nos fechamentos. Não é o número do
                  Profit, que acompanha tick a tick com a posição aberta. 19/09/2026: o aviso de como é medido,
                  que ocupava duas linhas embaixo dos números, foi para dentro da explicação de cada um. */}
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
                      info: "mep",
                      textoInfo:
                        "O ponto mais alto que o saldo do dia alcançou, conferido a cada operação fechada. A posição ainda aberta não entra na conta, por isso nunca passa do MEP da plataforma Profit, que acompanha o saldo a cada movimento do preço.",
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
                      info: "men",
                      textoInfo:
                        "O ponto mais baixo que o saldo do dia alcançou, conferido a cada operação fechada: o quanto o dia chegou a ficar no prejuízo. A posição ainda aberta não entra na conta, por isso nunca passa do MEN da plataforma Profit, que acompanha o saldo a cada movimento do preço.",
                    },
                  ]}
                />
              </div>

              <div className="p-3 sm:p-4">
                {curvaDoDia.length > 0 ? (
                  <MolduraProfit
                    // o i vai no título, que é lido; a legenda é aria-hidden (19/09/2026)
                    titulo={<RotuloComInfo chave="curvaDoDia">O dia, operação a operação</RotuloComInfo>}
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
                      altura={alturaCurva}
                      marcadores={marcadoresDoDia}
                      rotulosX={ordemNoEixo}
                      formatarEixo={(v) => formatarNumero(v, 0)}
                      rotuloVertical="Saldo do dia (R$)"
                      rotuloAria={`Resultado acumulado de ${formatarData(diaSel)}, operação a operação`}
                    />
                  </MolduraProfit>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Por hora de entrada, do dia escolhido: saiu da coluna do detalhe, onde empurrava o painel 380 px
          abaixo do calendário, para uma faixa de largura toda com as horas em até três colunas (19/09/2026).
          A barra dá o tamanho, o texto dá o número. Rótulo de grupo em caixa alta por preferência do dono */}
      {diaSel !== null && horasDia.length > 0 ? (
        <section className="painel px-4 pt-3 pb-1 sm:px-5">
          <div className="painel-cabeca px-0">
            <h3 className="painel-titulo">
              <RotuloComInfo
                chave="porHora"
                texto="Resultado das operações do dia agrupadas pela hora em que começaram, com quantas foram em cada hora e que parte delas terminou no lucro."
              >
                Por hora de entrada
              </RotuloComInfo>
            </h3>
            <span className="painel-acao tabular-nums">{formatarData(diaSel)}</span>
          </div>
          {/* o fio entre as linhas fica em cima de cada hora, menos na primeira fileira de cada largura */}
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {horasDia.map((f) => (
              <li
                key={f.chave}
                className={cn(
                  "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-(--sep-cor) py-2 text-sm tabular-nums",
                  "first:border-t-0 sm:[&:nth-child(-n+2)]:border-t-0 lg:[&:nth-child(-n+3)]:border-t-0",
                )}
              >
                <span className="text-muted-foreground">{f.rotulo}</span>
                <div className="min-w-0">
                  <div className="h-1 rounded-full bg-muted">
                    <div
                      className={cn("h-1 rounded-full", f.total >= 0 ? "bg-positivo" : "bg-negativo")}
                      style={{ width: `${Math.max(3, Math.round((Math.abs(f.total) / maiorHora) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatarNumero(f.n)} op · {formatarPct(f.n > 0 ? f.nGain / f.n : 0, 0)} de acerto
                  </p>
                </div>
                <Valor valor={f.total} className="font-medium" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* 19/09/2026: "todo o histórico" virou o fato que diz o mesmo, com número e data */}
        <section className="painel p-4">
          <h3 className="font-semibold">
            <RotuloComInfo chave="porDiaSemana">Por dia da semana</RotuloComInfo>
          </h3>
          <p className="mb-3 text-xs text-muted-foreground tabular-nums">
            {formatarNumero(opsNoHistorico)} operações desde {formatarData(primeiroDia)}
          </p>
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
                    {formatarPct(f.n > 0 ? f.nGain / f.n : 0, 0)} · {formatarNumero(f.n)} op
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <ListaDias titulo="Melhores dias" info="melhoresDias" itens={melhores} positivo todos={todosOsDias} aoEscolher={(d) => { trocarMes(mesDe(d)); escolherDia(d, true); }} />
        <ListaDias titulo="Piores dias" info="pioresDias" itens={piores} todos={todosOsDias} aoEscolher={(d) => { trocarMes(mesDe(d)); escolherDia(d, true); }} />
      </div>

      {melhores.length > NO_TOPO ? (
        <div className="flex justify-center lg:justify-end">
          <Button variant="outline" size="sm" onClick={() => setTodosOsDias((v) => !v)} aria-expanded={todosOsDias}>
            {todosOsDias ? `Mostrar só os ${NO_TOPO} primeiros` : `Mostrar os ${melhores.length} melhores e piores`}
          </Button>
        </div>
      ) : null}

      <section className="painel p-4 sm:p-5">
        <h3 className="mb-3 font-semibold">
          <RotuloComInfo chave="mapaMeses">Resultado mensal por ano</RotuloComInfo>
        </h3>
        <Heatmap linhas={heatmap} unidade="brl" />
      </section>
    </div>
  );
}

function ListaDias({
  titulo,
  info,
  itens,
  positivo = false,
  todos,
  aoEscolher,
}: {
  titulo: string;
  info: ChaveIndicador;
  itens: { dia: string; valor: number; n: number }[];
  positivo?: boolean;
  todos: boolean;
  /** tocar num dia da lista abre esse dia no calendário */
  aoEscolher: (dia: string) => void;
}) {
  const maior = Math.max(1, ...itens.map((i) => Math.abs(i.valor)));
  const mostrados = todos ? itens : itens.slice(0, NO_TOPO);
  return (
    // 19/09/2026: saiu o "os 5 primeiros do histórico", que ficava errado embaixo de "Piores dias"; o
    // título já diz o que é, e o recorte é o histórico da linha de cima da página. O número da posição
    // também saiu: a ordem da lista já diz
    <section className="painel p-4">
      <h3 className="mb-2 font-semibold">
        <RotuloComInfo chave={info}>{titulo}</RotuloComInfo>
      </h3>
      <ol>
        {mostrados.map((i) => (
          <li key={i.dia}>
            <button
              type="button"
              onClick={() => aoEscolher(i.dia)}
              className="linha-interativa -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
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
