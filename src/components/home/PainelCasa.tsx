"use client";

import { cn } from "cn";
import Link from "next/link";
import { useMemo, useState } from "react";
import { GraficoComparativo, type SerieDoComparativo } from "@/components/comparativo/GraficoComparativo";
import { GLOSSARIO } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { GraficoResultado } from "@/components/graficos/GraficoResultado";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import type { SerieDoRobo } from "@/lib/consultas/casa";
import { formatarBRL, formatarData, formatarDataLonga, formatarNumero } from "@/lib/formato";
import { custosDaSoma, premissaDoRobo } from "@/lib/premissa";
import {
  aPartirDe,
  acumular,
  compararNaLista,
  curvaNoEixo,
  ganhoPorQueda,
  inicioDoPeriodoDaCasa,
  maiorQueda,
  resumirDias,
  somarSeries,
  tamanhoDoHistorico,
  type CurvaNoEixo,
  type DiaResultado,
  type PeriodoDaCasa,
} from "@/lib/stats/serie-casa";
import { useCasa } from "./CasaAoVivoProvider";
import { TextoDeHoje } from "./TextoDeHoje";
import type { CapitalMinimoPorRobo, DadosCardRobo } from "./tipos";
import { useRobosAoVivo } from "./useRobosAoVivo";

interface Props {
  cards: DadosCardRobo[];
  series: SerieDoRobo[];
  /** o capital mínimo de cada robô, pelo slug (de capitaisDaCasa, lido no servidor) */
  capitais: CapitalMinimoPorRobo;
}

const PERIODOS: ReadonlyArray<{ valor: PeriodoDaCasa; rotulo: string; coluna: string }> = [
  { valor: "12m", rotulo: "12 meses", coluna: "Em 12 meses" },
  { valor: "tudo", rotulo: "Desde o início", coluna: "Desde o início" },
  { valor: "30", rotulo: "30 pregões", coluna: "Em 30 pregões" },
];

/** O que a curva mostra: a soma dos robôs, ou a curva de cada um no mesmo gráfico. */
type Vista = "somados" | "lado";
const VISTAS: ReadonlyArray<{ valor: Vista; rotulo: string }> = [
  { valor: "somados", rotulo: "Somados" },
  { valor: "lado", rotulo: "Lado a lado" },
];

// a miniatura de cada robô na lista: no máximo estes pontos
const PONTOS_DA_MINIATURA = 90;

// "R$ 1" não se separa no fim da linha (o caractere sai do código, não de um escape escrito no arquivo)
const ESPACO_FIXO = String.fromCharCode(0xa0);
const NOME_DO_GANHO_POR_QUEDA = GLOSSARIO.ganhoPorQueda.nome.replace("R$ 1", `R$${ESPACO_FIXO}1`);
// no meio de uma frase o nome começa com minúscula (só a primeira letra: "R$" continua como é)
const GANHO_POR_QUEDA_NA_FRASE = NOME_DO_GANHO_POR_QUEDA.charAt(0).toLowerCase() + NOME_DO_GANHO_POR_QUEDA.slice(1);
const NOME_DO_CAPITAL = GLOSSARIO.capitalMinimo.nome;
const NOME_DA_QUEDA = GLOSSARIO.drawdown.nome;

/**
 * As colunas da lista. Até 1280 px (celular, tablet e janela estreita) é a versão compacta: nome, resultado e
 * maior queda lado a lado, e o resto embaixo, em texto pequeno. De 1280 px em diante, uma coluna por número;
 * a miniatura da curva entra em 1440 px, quando sobra largura para o nome e para ela.
 */
const COLUNAS = cn(
  "grid-cols-[minmax(0,1fr)_5.75rem_5.75rem] gap-x-3",
  "sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] sm:gap-x-6",
  "xl:grid-cols-[minmax(0,1fr)_7rem_7rem_9.5rem_7rem]",
  "min-[90rem]:grid-cols-[minmax(18rem,1fr)_minmax(7rem,16rem)_7rem_7rem_9.5rem_7rem]",
);
const ROTULO_DE_COLUNA = "text-right text-[0.8125rem] text-pretty text-sutil";

const brl = (v: number) => formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
const pregoesEmPalavras = (n: number) => `${formatarNumero(n)} ${n === 1 ? "pregão" : "pregões"}`;

interface PontoDaMiniatura {
  /** posição no período, de 0 a 100 */
  x: number;
  acumulado: number;
}

/**
 * A curva pequena de um robô na lista: linha na cor do texto e a maior queda em vermelho, como no gráfico
 * grande. Todas dividem o mesmo eixo de tempo e a mesma escala de valor (`dominio`): um robô que começou no
 * meio do período começa no meio da miniatura, e um que somou R$ 10 mil não parece do tamanho de um que
 * somou R$ 40 mil.
 */
function Miniatura({ pontos, dominio }: { pontos: PontoDaMiniatura[]; dominio: readonly [number, number] }) {
  if (pontos.length < 2) return null;
  const [min, max] = dominio;
  const y = (v: number) => (max === min ? 50 : 97 - ((v - min) / (max - min)) * 94);
  const ponto = (i: number) => `${pontos[i].x.toFixed(2)},${y(pontos[i].acumulado).toFixed(2)}`;
  const linha = pontos.map((_, i) => `${i === 0 ? "M" : "L"}${ponto(i)}`).join("");
  const q = maiorQueda(pontos);
  const de = q ? Math.max(0, q.iInicio) : 0;
  const trecho = q ? Array.from({ length: q.iFundo - de + 1 }, (_, k) => `${k === 0 ? "M" : "L"}${ponto(de + k)}`).join("") : null;
  return (
    <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-11 w-full overflow-visible">
      <path d={linha} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {trecho ? (
        <path d={trecho} fill="none" stroke="var(--negativo)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ) : null}
    </svg>
  );
}

/**
 * A página inicial inteira, "Visão geral" (ficha Mesa; DESIGN.md, seção 9). A pergunta da tela: os robôs dão
 * resultado, e qual deles? Um número grande, uma curva e a lista dos robôs, que é a comparação entre eles.
 *
 * - O número é o resultado somado dos robôs no período, com a premissa escrita junto ("1 contrato por
 *   entrada em cada um dos robôs" e os custos, de lib/premissa): sem ela o leigo lê o valor como o que um
 *   robô rende. O robô cujo histórico não tem custo cadastrado entra na premissa como ressalva, pelo nome
 *   ("já descontados os custos, menos no X, que não tem custo no histórico"). Ao lado, os fatos: dias com
 *   ganho, pior dia e maior queda.
 * - A curva é a do período, com a maior queda em vermelho. Em "Somados" é a soma; em "Lado a lado", a curva
 *   de cada robô no mesmo gráfico, todas partindo de zero no começo do período e com o nome na ponta.
 *   Passar o ponteiro troca o número pelo acumulado até aquele pregão.
 * - A lista é a comparação (25/11/2026: a página "Comparar robôs" deixou de existir). Colunas que decidem:
 *   resultado no período, maior queda do mesmo período, ganho para cada R$ 1 da maior queda e capital
 *   mínimo. Vem em ordem do ganho por queda, do maior para o menor; quem não tem o número (sem ganho ou sem
 *   queda no período) leva um traço com o motivo e vai para o fim. Saiu a coluna do mês. Cada linha diz de
 *   quanto tempo e de quantos pregões é o histórico do robô.
 * - A lista também é o controle: passar o ponteiro (ou o foco) num robô troca o número, os fatos e a curva
 *   pelos dele (no "Lado a lado", põe a linha dele em destaque); clicar abre a página do robô. Sair da lista
 *   volta à soma. Sem linha de instrução.
 * - O período vale para a tela toda e é o mesmo corte de data para a soma e para cada robô, então as linhas
 *   da lista somam o número grande. O padrão são 12 meses: há robô com histórico desde 2018 e robô de 2026,
 *   e "desde o início" somado é uma linha quase reta de anos com um salto no fim. "12 meses" é o mesmo
 *   recorte do simulador (inicioPeriodo): com 1 contrato em cada robô, as duas telas dão o mesmo número.
 * - No celular não existe "passar por cima": um seletor só, acima da curva, escolhe entre a soma, o lado a
 *   lado e cada robô; a lista vira uma linha por robô com nome, resultado e maior queda, e o ganho por queda
 *   e o capital mínimo embaixo, em texto pequeno.
 *
 * Os robôs vêm do banco; o desenho é uma linha por robô, então serve de 2 a 12. Tudo é para 1 contrato por
 * entrada, com os custos que o histórico de cada robô tem. As séries vêm do servidor (cache de 60 s); o que
 * o ao vivo já sabe de hoje além delas entra nos totais. As contas são as de lib/stats/serie-casa; o capital
 * mínimo é o de capitaisDaCasa, o mesmo número das outras telas.
 */
export function PainelCasa({ cards, series, capitais }: Props) {
  const { hoje } = useCasa();
  const robos = useRobosAoVivo(cards);
  const [periodo, setPeriodo] = useState<PeriodoDaCasa>("12m");
  const [vista, setVista] = useState<Vista>("somados");
  // o robô escolhido: pelo ponteiro ou pelo foco na lista, ou pelo seletor do celular
  const [slug, setSlug] = useState<string | null>(null);
  // no lado a lado, o robô cuja linha está mais perto do ponteiro
  const [noGrafico, setNoGrafico] = useState<string | null>(null);
  const [apontado, setApontado] = useState<number | null>(null);

  // o que o ao vivo tem de hoje além do que o servidor mandou, por robô
  const aoVivoAMais = useMemo(() => {
    const doServidor = new Map(cards.map((c) => [c.slug, c.acumulado]));
    return new Map(robos.map((r) => [r.slug, r.acumulado - (doServidor.get(r.slug) ?? r.acumulado)]));
  }, [cards, robos]);

  const somadaInteira = useMemo(() => somarSeries(series.map((s) => s.dias)), [series]);
  const historicos = useMemo(() => new Map(series.map((s) => [s.slug, tamanhoDoHistorico(s.dias)])), [series]);

  // cada robô e a soma, já no período: o corte é o mesmo dia para todos
  const noPeriodo = useMemo(() => {
    const inicio = inicioDoPeriodoDaCasa(somadaInteira, periodo, hoje);
    const porRobo = new Map<string, DiaResultado[]>();
    for (const s of series) porRobo.set(s.slug, aPartirDe(s.dias, inicio));
    return { inicio, porRobo, somada: aPartirDe(somadaInteira, inicio) };
  }, [series, somadaInteira, periodo, hoje]);

  // de cada robô no período: resultado, maior queda, pregões e a miniatura no eixo de tempo comum
  const contas = useMemo(() => {
    const total = noPeriodo.somada.length;
    const posicao = new Map(noPeriodo.somada.map((d, i) => [d.dia, total > 1 ? (i / (total - 1)) * 100 : 0]));
    let min = 0;
    let max = 0;
    const porRobo = new Map<string, { total: number; queda: number; pregoes: number; pontos: PontoDaMiniatura[] }>();
    for (const [chave, dias] of noPeriodo.porRobo) {
      const curva = acumular(dias);
      const passo = Math.max(1, Math.ceil(curva.length / PONTOS_DA_MINIATURA));
      const pontos: PontoDaMiniatura[] = [];
      curva.forEach((p, i) => {
        if (p.acumulado < min) min = p.acumulado;
        if (p.acumulado > max) max = p.acumulado;
        if (i % passo === 0 || i === curva.length - 1) pontos.push({ x: posicao.get(p.dia) ?? 0, acumulado: p.acumulado });
      });
      porRobo.set(chave, {
        total: curva.length > 0 ? curva[curva.length - 1].acumulado : 0,
        queda: maiorQueda(curva)?.valor ?? 0,
        pregoes: dias.length,
        pontos,
      });
    }
    return { porRobo, dominio: [min, max] as const };
  }, [noPeriodo]);

  // as linhas da lista, na ordem da comparação: do maior ganho por queda para o menor; o "em breve" por último
  const linhas = useMemo(
    () =>
      robos
        .map((robo) => {
          const conta = contas.porRobo.get(robo.slug);
          const emBreve = robo.status === "em_breve";
          const pregoes = emBreve ? 0 : (conta?.pregoes ?? 0);
          const resultado = (conta?.total ?? 0) + (aoVivoAMais.get(robo.slug) ?? 0);
          const queda = conta?.queda ?? 0;
          return {
            robo,
            emBreve,
            pregoes,
            resultado,
            queda,
            // sem pregão no período não há o que dividir
            ganho: pregoes > 0 ? ganhoPorQueda(resultado, queda) : null,
            pontos: conta?.pontos ?? [],
          };
        })
        .sort(
          (a, b) =>
            Number(a.emBreve) - Number(b.emBreve) ||
            compararNaLista(
              { ganhoPorQueda: a.ganho?.valor ?? null, resultado: a.resultado, pregoes: a.pregoes },
              { ganhoPorQueda: b.ganho?.valor ?? null, resultado: b.resultado, pregoes: b.pregoes },
            ),
        ),
    [robos, contas, aoVivoAMais],
  );

  // lado a lado: a curva de cada robô no eixo de tempo comum (os pregões da soma), partindo de zero
  const ladoALado = useMemo(() => {
    if (vista !== "lado") return null;
    const eixo = noPeriodo.somada.map((d) => d.dia);
    const curvas = new Map<string, CurvaNoEixo>();
    for (const s of series) {
      const dias = noPeriodo.porRobo.get(s.slug) ?? [];
      if (dias.length === 0) continue;
      const curva = acumular(dias);
      // o robô que já existia quando o período começou parte de zero no começo do gráfico; o que estreou
      // dentro do período começa onde o histórico dele começa
      const jaExistia = noPeriodo.inicio !== null && s.dias[0].dia < noPeriodo.inicio;
      curvas.set(s.slug, curvaNoEixo(eixo, curva, maiorQueda(curva), jaExistia));
    }
    return { eixo, curvas };
  }, [vista, series, noPeriodo]);

  const curvasDoGrafico = useMemo<SerieDoComparativo[]>(
    () =>
      ladoALado
        ? linhas.flatMap((l) => {
            const c = l.emBreve ? undefined : ladoALado.curvas.get(l.robo.slug);
            return c ? [{ slug: l.robo.slug, nome: l.robo.nome, acumulado: c.acumulado, queda: c.queda }] : [];
          })
        : [],
    [ladoALado, linhas],
  );

  const slugEmFoco = vista === "lado" ? (noGrafico ?? slug) : slug;
  const escolhido = slugEmFoco ? (linhas.find((l) => l.robo.slug === slugEmFoco && !l.emBreve) ?? null) : null;
  const slugEscolhido = escolhido?.robo.slug ?? null;
  const recorte = useMemo(
    () => (slugEscolhido ? (noPeriodo.porRobo.get(slugEscolhido) ?? []) : noPeriodo.somada),
    [slugEscolhido, noPeriodo],
  );
  const pontos = useMemo(() => acumular(recorte), [recorte]);
  const queda = useMemo(() => maiorQueda(pontos), [pontos]);
  const resumo = useMemo(() => resumirDias(recorte), [recorte]);
  const aMais = slugEscolhido ? (aoVivoAMais.get(slugEscolhido) ?? 0) : [...aoVivoAMais.values()].reduce((s, v) => s + v, 0);

  // A leitura do pregão apontado. O índice pode ter ficado de uma série mais longa (troca de robô, de período
  // ou de vista), por isso tudo é conferido. No lado a lado o índice é do eixo comum, que tem os mesmos
  // pregões da soma; a curva de um robô pode não ter linha naquele dia.
  let lido: { dia: string; acumulado: number; noDia: number | null } | null = null;
  if (apontado !== null) {
    const curvaDoEscolhido = ladoALado && slugEscolhido ? ladoALado.curvas.get(slugEscolhido) : null;
    if (curvaDoEscolhido && ladoALado) {
      const dia = ladoALado.eixo[apontado];
      const acumulado = curvaDoEscolhido.acumulado[apontado];
      if (dia !== undefined && acumulado !== null && acumulado !== undefined) {
        lido = { dia, acumulado, noDia: curvaDoEscolhido.noDia[apontado] ?? null };
      }
    } else if (!(ladoALado && slugEscolhido)) {
      const p = pontos[apontado];
      if (p) lido = { dia: p.dia, acumulado: p.acumulado, noDia: p.valor };
    }
  }
  const numero = lido ? lido.acumulado : resumo.total + aMais;

  const opcao = PERIODOS.find((p) => p.valor === periodo) ?? PERIODOS[0];
  // Os custos vêm de lib/premissa, com os robôs que entram no número: o apontado, ou os que têm pregões no
  // período. O robô cujo histórico não tem custo cadastrado não entra como "já descontados os custos": sozinho
  // diz "antes dos custos", e na soma vira a ressalva, pelo nome.
  const premissa = useMemo(() => {
    const dosRobos = (ls: typeof linhas) => ls.map((l) => ({ nome: l.robo.nome, custoPorContrato: l.robo.custoPorContrato }));
    const doEscolhido = linhas.find((l) => l.robo.slug === slugEscolhido);
    if (doEscolhido) return premissaDoRobo(doEscolhido.robo.custoPorContrato);
    const naSoma = linhas.filter((l) => l.pregoes > 0);
    if (naSoma.length === 1) return premissaDoRobo(naSoma[0].robo.custoPorContrato);
    if (naSoma.length > 1) return `com 1 contrato por entrada em cada um dos ${formatarNumero(naSoma.length)} robôs, ${custosDaSoma(dosRobos(naSoma))}`;
    // nenhum robô no período: vale a nota de todos os que têm histórico
    return `com 1 contrato por entrada, ${custosDaSoma(dosRobos(linhas.filter((l) => !l.emBreve && historicos.get(l.robo.slug))))}`;
  }, [linhas, slugEscolhido, historicos]);

  // De quando é o número. O robô cujo histórico cabe inteiro no período diz o tamanho do histórico: "nos
  // últimos 12 meses" de um robô que tem 9 meses seria mentira.
  const historicoDoEscolhido = slugEscolhido ? (historicos.get(slugEscolhido) ?? null) : null;
  const historicoInteiro =
    historicoDoEscolhido !== null && (noPeriodo.inicio === null || historicoDoEscolhido.desde >= noPeriodo.inicio);
  const quando =
    historicoDoEscolhido && historicoInteiro
      ? `em ${historicoDoEscolhido.tempo}, ${pregoesEmPalavras(historicoDoEscolhido.pregoes)}`
      : periodo === "tudo"
        ? recorte.length > 0
          ? `desde ${formatarDataLonga(recorte[0].dia)}`
          : ""
        : periodo === "12m"
          ? "nos últimos 12 meses"
          : `nos últimos ${pregoesEmPalavras(noPeriodo.somada.length)}`;

  // os fatos que acompanham o número: aparecem ao lado dele no computador e depois da curva no celular
  const fatos =
    resumo.pregoes > 0 ? (
      <Fatos>
        <Fato rotulo="Dias com ganho">
          <span className="font-medium">{formatarNumero(resumo.comGanho)}</span>
          <span className="text-muted-foreground"> de {formatarNumero(resumo.pregoes)}</span>
        </Fato>
        {resumo.pior && resumo.pior.valor < 0 ? (
          <Fato rotulo="Pior dia">
            <span className="mr-3 text-sutil">{formatarData(resumo.pior.dia)}</span>
            <Valor valor={resumo.pior.valor} inteiro={Math.abs(resumo.pior.valor) >= 1000} className="font-medium" />
          </Fato>
        ) : null}
        <Fato rotulo={NOME_DA_QUEDA}>
          {queda ? <Valor valor={-queda.valor} inteiro className="font-medium" /> : <span className="text-sutil">nenhuma</span>}
        </Fato>
      </Fatos>
    ) : null;

  // Com dois robôs ou mais há o que pôr lado a lado. No computador a escolha é "Somados · Lado a lado" e o
  // robô se aponta na lista; no celular, onde não existe "passar por cima", um seletor só traz as duas
  // vistas e cada robô (na ordem do banco, que não muda com o período).
  const comHistorico = robos.filter((r) => r.status !== "em_breve" && historicos.get(r.slug));
  const podeComparar = comHistorico.length > 1;
  const trocarVista = (v: Vista) => {
    setVista(v);
    setApontado(null);
    setNoGrafico(null);
  };
  const opcoesNoCelular = [
    ...VISTAS.map((v) => ({ valor: `vista:${v.valor}`, rotulo: v.rotulo })),
    ...comHistorico.map((r) => ({ valor: `robo:${r.slug}`, rotulo: r.nome })),
  ];
  const escolherNoCelular = (v: string) => {
    if (v.startsWith("robo:")) {
      // a curva de um robô sozinho é a vista "Somados" com ele escolhido
      trocarVista("somados");
      setSlug(v.slice("robo:".length));
    } else {
      trocarVista(v === "vista:lado" ? "lado" : "somados");
      setSlug(null);
    }
  };

  const mostraLadoALado = vista === "lado" && ladoALado !== null;
  const temCurvasLadoALado = mostraLadoALado && ladoALado.eixo.length >= 2 && curvasDoGrafico.length > 0;

  return (
    <div>
      {/* de quem é o número, e os controles da tela */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 lg:pr-20">
        <h1 className="text-[0.9375rem] text-muted-foreground">
          {escolhido ? (
            <>
              <span className="font-medium text-foreground">{escolhido.robo.nome}</span> · resultado do robô
            </>
          ) : (
            "Resultado somado dos robôs"
          )}
        </h1>
        {/* Os controles ficam alinhados à borda direita da curva: é dela (e da tela toda) que eles são. Entre
            1024 e 1280 px os dois não cabem ao lado do título com um nome de robô comprido: ali têm sempre a
            própria linha, para o cabeçalho não mudar de altura quando o ponteiro passa pela lista. */}
        <div className="flex max-w-full min-w-0 items-center gap-x-6 lg:max-xl:basis-full lg:max-xl:justify-end">
          {podeComparar ? (
            <div className="hidden items-center gap-x-6 lg:flex">
              <Segmentado ariaLabel="O que a curva mostra" opcoes={VISTAS} valor={vista} onChange={trocarVista} />
              <span aria-hidden className="h-3.5 w-px bg-(--painel-fio-forte)" />
            </div>
          ) : null}
          <Segmentado ariaLabel="Período" opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} />
        </div>
      </div>

      <div className="mt-3 grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,20rem)] lg:items-end lg:justify-start">
        <div className="min-w-0">
          <NumeroGrande valor={numero} />
          <p className="mt-3 min-h-[1.5em] text-sm text-pretty text-muted-foreground">
            {lido ? (
              <>
                até {formatarDataLonga(lido.dia)} ·{" "}
                {lido.noDia === null ? (
                  "sem operação no dia"
                ) : (
                  <>
                    no dia <Valor valor={lido.noDia} inteiro={Math.abs(lido.noDia) >= 1000} className="font-medium" />
                  </>
                )}
              </>
            ) : (
              <>
                {premissa}
                {quando ? ` · ${quando}` : ""}
              </>
            )}
          </p>
        </div>

        {/* no computador os fatos ficam colados no número; no celular descem para depois da curva */}
        {fatos ? <div className="hidden lg:block lg:pb-0.5">{fatos}</div> : null}
      </div>

      {/* no celular, o que a curva mostra: todos somados, lado a lado, ou um robô */}
      {podeComparar ? (
        <Segmentado
          ariaLabel="O que a curva mostra"
          opcoes={opcoesNoCelular}
          valor={slug ? `robo:${slug}` : `vista:${vista}`}
          onChange={escolherNoCelular}
          className="mt-6 lg:hidden"
        />
      ) : null}

      {/* a curva */}
      {mostraLadoALado ? (
        <GraficoComparativo
          dias={ladoALado.eixo}
          series={curvasDoGrafico}
          destaque={slugEscolhido}
          ativo={apontado}
          aoApontar={setApontado}
          aoDestacar={setNoGrafico}
          className="mt-6 lg:mt-8"
        />
      ) : (
        <GraficoResultado dias={pontos} queda={queda} ativo={apontado} aoApontar={setApontado} className="mt-6 lg:mt-8" />
      )}
      {mostraLadoALado ? (
        temCurvasLadoALado ? (
          <p className="mt-1 text-[0.8125rem] text-pretty text-sutil">
            Cada curva parte de zero no começo do período. Em <span className="text-negativo">vermelho</span>, a maior queda de cada robô.
          </p>
        ) : null
      ) : queda ? (
        <p className="mt-1 text-[0.8125rem] text-pretty text-sutil">
          Em <span className="text-negativo">vermelho</span>, a maior queda: do ponto mais alto ao mais baixo que veio depois.
        </p>
      ) : null}
      {fatos ? <div className="mt-6 lg:hidden">{fatos}</div> : null}

      {/* os robôs: a lista é a comparação */}
      <section
        aria-labelledby="robos-titulo"
        id="robos"
        className="mt-9"
        // só o mouse "sai" da lista: no toque, o fim de qualquer gesto sobre ela desfaria a escolha do seletor
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setSlug(null);
        }}
      >
        <div className={cn("grid items-end border-b border-(--painel-fio) pb-3 lg:pr-20", COLUNAS)}>
          <h2 id="robos-titulo" className="text-[0.9375rem] font-medium">
            Por robô
          </h2>
          <span aria-hidden className="hidden min-[90rem]:block" />
          <span className={ROTULO_DE_COLUNA}>{opcao.coluna}</span>
          <span className={ROTULO_DE_COLUNA}>{NOME_DA_QUEDA}</span>
          <span className={cn(ROTULO_DE_COLUNA, "hidden xl:block")}>
            <RotuloComInfo chave="ganhoPorQueda" className="text-right">
              {NOME_DO_GANHO_POR_QUEDA}
            </RotuloComInfo>
          </span>
          <span className={cn(ROTULO_DE_COLUNA, "hidden xl:block")}>
            <RotuloComInfo
              chave="capitalMinimo"
              texto={`${GLOSSARIO.capitalMinimo.texto} Aqui entra a maior queda de todo o histórico do robô, não só a do período.`}
              className="text-right"
            >
              {NOME_DO_CAPITAL}
            </RotuloComInfo>
          </span>
        </div>

        {linhas.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Nenhum robô cadastrado.</p>
        ) : (
          <ul>
            {linhas.map((l) => {
              const r = l.robo;
              const naLista = slugEscolhido === r.slug;
              const semNumeros = l.emBreve || l.pregoes === 0;
              const historico = l.emBreve ? null : (historicos.get(r.slug) ?? null);
              const capital = l.emBreve || !historico ? null : (capitais[r.slug] ?? null);
              const roboAgora = {
                statusAoVivo: r.statusAoVivo,
                operouHoje: r.operouHoje,
                hoje: r.hoje,
                hojeOperacoes: r.hojeOperacoes,
                dadosAte: r.ultimoPregao?.dia ?? null,
              };
              const textoDoHistorico = historico ? `histórico de ${historico.tempo}, ${pregoesEmPalavras(historico.pregoes)}` : null;

              // o ganho por queda: o número, ou um traço com o motivo (nunca um número que engane)
              const ganho = l.ganho?.valor ?? null;
              const semGanhoPorque = l.emBreve
                ? null
                : l.pregoes === 0
                  ? "sem pregões no período"
                  : l.ganho?.falta === "ganho"
                    ? "sem ganho no período"
                    : l.ganho?.falta === "queda"
                      ? "sem queda no período"
                      : null;

              return (
                <li key={r.slug} className="border-b border-(--painel-fio)">
                  <Link
                    href={`/robos/${r.slug}`}
                    onPointerEnter={(e) => {
                      // no toque não há "passar por cima": o toque abre a página do robô
                      if (e.pointerType === "mouse" && !l.emBreve) setSlug(r.slug);
                    }}
                    // o foco do teclado também escolhe o robô; o do toque não (o toque já navega)
                    onFocus={(e) => (l.emBreve || !e.currentTarget.matches(":focus-visible") ? null : setSlug(r.slug))}
                    onBlur={(e) => (e.currentTarget.matches(":focus-visible") ? setSlug(null) : null)}
                    className={cn(
                      "relative -mx-3 grid items-baseline gap-y-1 rounded-md px-3 py-3.5 outline-none transition-colors lg:pr-[5.75rem] xl:items-center",
                      COLUNAS,
                      "hover:bg-(--linha-hover) focus-visible:bg-(--linha-hover)",
                      naLista && "bg-(--linha-hover)",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-[1.0625rem] leading-snug font-medium tracking-[-0.01em] text-pretty [overflow-wrap:anywhere]">{r.nome}</span>
                      {/* com uma coluna por número, o que o robô fez hoje e o tamanho do histórico ficam debaixo do nome */}
                      <span className="hidden xl:block">
                        <TextoDeHoje robo={roboAgora} className="block text-pretty" />
                        {textoDoHistorico ? <span className="block text-[0.8125rem] text-pretty text-sutil">{textoDoHistorico}</span> : null}
                      </span>
                    </span>

                    <span aria-hidden className={cn("hidden min-[90rem]:block", naLista ? "text-foreground" : "text-muted-foreground")}>
                      {semNumeros ? null : <Miniatura pontos={l.pontos} dominio={contas.dominio} />}
                    </span>

                    <span className="text-right text-[0.9375rem] font-medium xl:text-base">
                      <span className="sr-only">{opcao.coluna}: </span>
                      {semNumeros ? <span className="font-normal text-sutil">–</span> : <Valor valor={l.resultado} inteiro={Math.abs(l.resultado) >= 1000} />}
                    </span>

                    <span className="text-right text-[0.9375rem] xl:text-base">
                      <span className="sr-only">{NOME_DA_QUEDA}: </span>
                      {semNumeros ? (
                        <span className="text-sutil">–</span>
                      ) : l.queda > 0 ? (
                        <span className="whitespace-nowrap text-muted-foreground">{brl(-l.queda)}</span>
                      ) : (
                        <span className="text-sutil">nenhuma</span>
                      )}
                    </span>

                    {/* versão compacta: o que o robô fez hoje e o histórico numa linha; o ganho por queda e o capital mínimo embaixo */}
                    <span className="col-span-3 block text-[0.8125rem] text-pretty xl:hidden">
                      <TextoDeHoje robo={roboAgora} />
                      {textoDoHistorico ? <span className="text-sutil"> · {textoDoHistorico}</span> : null}
                    </span>
                    {l.emBreve ? null : (
                      <span className="col-span-3 mt-1 grid gap-y-0.5 text-[0.8125rem] text-muted-foreground sm:flex sm:flex-wrap sm:gap-x-8 xl:hidden">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3 sm:justify-start">
                          <span>{NOME_DO_GANHO_POR_QUEDA}</span>
                          <span className="ml-auto text-right sm:ml-0">
                            {ganho !== null ? (
                              <span className="whitespace-nowrap text-foreground">{formatarBRL(ganho)}</span>
                            ) : (
                              <span className="text-sutil">–{semGanhoPorque ? `, ${semGanhoPorque}` : ""}</span>
                            )}
                          </span>
                        </span>
                        <span className="flex items-baseline justify-between gap-x-3 sm:justify-start">
                          <span>{NOME_DO_CAPITAL}</span>
                          {capital !== null ? (
                            <span className="whitespace-nowrap text-foreground">{formatarBRL(capital, { inteiro: true })}</span>
                          ) : (
                            <span className="text-sutil">–</span>
                          )}
                        </span>
                      </span>
                    )}

                    {/* uma coluna por número */}
                    <span className="hidden text-right xl:block">
                      <span className="sr-only">{NOME_DO_GANHO_POR_QUEDA}: </span>
                      {ganho !== null ? (
                        <span className="whitespace-nowrap">{formatarBRL(ganho)}</span>
                      ) : (
                        <>
                          <span className="text-sutil">–</span>
                          {semGanhoPorque ? <span className="block text-xs text-pretty text-sutil">{semGanhoPorque}</span> : null}
                        </>
                      )}
                    </span>
                    <span className="hidden text-right xl:block">
                      <span className="sr-only">{NOME_DO_CAPITAL}: </span>
                      {capital !== null ? (
                        <span className="whitespace-nowrap">{formatarBRL(capital, { inteiro: true })}</span>
                      ) : (
                        <span className="text-sutil">–</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {linhas.length > 0 ? (
          <p className="mt-4 max-w-3xl text-[0.8125rem] text-pretty text-sutil">
            {linhas.length > 1 ? `A lista vai do maior para o menor ${GANHO_POR_QUEDA_NA_FRASE}. ` : ""}O capital mínimo usa a maior queda de
            todo o histórico do robô, não só a do período.
          </p>
        ) : null}
      </section>
    </div>
  );
}
