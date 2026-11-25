"use client";

import { cn } from "cn";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { GraficoResultado } from "@/components/graficos/GraficoResultado";
import { Fato, Fatos } from "@/components/sistema/Numero";
import type { SerieDoRobo } from "@/lib/consultas/casa";
import { formatarBRL, formatarData, formatarDataLonga, formatarNumero } from "@/lib/formato";
import { somarMeses } from "@/lib/stats/periodos";
import { acumular, maiorQueda, resumirDias, somarSeries, ultimosPregoes, type DiaResultado } from "@/lib/stats/serie-casa";
import { useCasa } from "./CasaAoVivoProvider";
import { TextoDeHoje } from "./TextoDeHoje";
import type { DadosCardRobo } from "./tipos";
import { useRobosAoVivo } from "./useRobosAoVivo";

interface Props {
  cards: DadosCardRobo[];
  series: SerieDoRobo[];
}

type Periodo = "12m" | "tudo" | "30";
const PERIODOS: ReadonlyArray<{ valor: Periodo; rotulo: string; coluna: string }> = [
  { valor: "12m", rotulo: "12 meses", coluna: "Em 12 meses" },
  { valor: "tudo", rotulo: "Desde o início", coluna: "Desde o início" },
  { valor: "30", rotulo: "30 pregões", coluna: "Em 30 pregões" },
];

// a miniatura de cada robô na lista: no máximo estes pontos
const PONTOS_DA_MINIATURA = 90;

/** O recorte do período: os últimos 12 meses pela data, os últimos 30 pregões pela contagem, ou tudo. */
function recortar(dias: readonly DiaResultado[], periodo: Periodo, hoje: string): DiaResultado[] {
  if (periodo === "tudo") return [...dias];
  if (periodo === "30") return ultimosPregoes(dias, 30);
  const de = somarMeses(hoje, -12);
  return dias.filter((d) => d.dia > de);
}

/** "+R$" e os algarismos separados, para o número grande levar o sinal e a moeda mais leves. */
function partesDoValor(v: number): [string, string] {
  const texto = formatarBRL(v, { sinal: true, inteiro: true });
  const corte = texto.search(/\d/);
  return corte < 0 ? ["", texto] : [texto.slice(0, corte).trim(), texto.slice(corte)];
}

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
  if (pontos.length < 2) return <span className="text-xs text-sutil">sem pregões no período</span>;
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
 * A página inicial inteira (ficha Mesa, 25/11/2026, segunda passada): um número grande, uma curva e a lista
 * dos robôs. Nada mais. O Lucas aprovou a estrutura do sistema e recusou o miolo anterior ("a página não
 * está legal; coisas que não são necessárias pode tirar"): saíram o título de marketing, a faixa de quatro
 * indicadores, os cartões por robô, o gráfico de barras, "como começar", perguntas, vídeos e canais.
 *
 * - O número é o resultado somado dos robôs no período, com a premissa escrita junto ("1 contrato em cada
 *   robô, já descontados os custos"): sem ela o leigo lê o valor como o que um robô rende.
 * - A curva é a do período, com a maior queda em vermelho. Passar o ponteiro nela troca o número pelo
 *   acumulado até aquele pregão.
 * - A lista é o controle: passar o ponteiro (ou o foco) num robô troca o número, os fatos e a curva pelos
 *   dele; clicar abre a página do robô. Sair da lista volta à soma. Sem linha de instrução.
 * - O período vale para a tela toda: número, fatos, curva e, na lista, o resultado, a miniatura e a maior
 *   queda de cada robô. O padrão são 12 meses: há robô com histórico desde 2018 e robô de 2026, e "desde o
 *   início" somado é uma linha quase reta de anos com um salto no fim.
 * - Debaixo do nome de cada robô, o que ele fez hoje em palavras comuns (fraseDeHoje), ao vivo.
 *
 * Os robôs vêm do banco, ordenados pelo resultado do mês; o desenho é uma linha por robô, então serve de 2
 * a 12. Tudo é para 1 contrato e já descontados os custos. As séries vêm do servidor (cache de 60 s); o que
 * o ao vivo já sabe de hoje além delas entra nos totais.
 */
export function PainelCasa({ cards, series }: Props) {
  const { hoje } = useCasa();
  const robos = useRobosAoVivo(cards);
  const [slug, setSlug] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("12m");
  const [apontado, setApontado] = useState<number | null>(null);

  // o que o ao vivo tem de hoje além do que o servidor mandou, por robô
  const aoVivoAMais = useMemo(() => {
    const doServidor = new Map(cards.map((c) => [c.slug, c.acumulado]));
    return new Map(robos.map((r) => [r.slug, r.acumulado - (doServidor.get(r.slug) ?? r.acumulado)]));
  }, [cards, robos]);

  // cada robô e a soma, já no período
  const noPeriodo = useMemo(() => {
    const porRobo = new Map<string, DiaResultado[]>();
    for (const s of series) porRobo.set(s.slug, recortar(s.dias, periodo, hoje));
    const somada = recortar(somarSeries(series.map((s) => s.dias)), periodo, hoje);
    return { porRobo, somada };
  }, [series, periodo, hoje]);

  // a linha de cada robô na lista: resultado e maior queda do período, e a miniatura no eixo de tempo comum
  const linhas = useMemo(() => {
    const total = noPeriodo.somada.length;
    const posicao = new Map(noPeriodo.somada.map((d, i) => [d.dia, total > 1 ? (i / (total - 1)) * 100 : 0]));
    let min = 0;
    let max = 0;
    const porRobo = new Map<string, { total: number; queda: number; pontos: PontoDaMiniatura[] }>();
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
        pontos,
      });
    }
    return { porRobo, dominio: [min, max] as const };
  }, [noPeriodo]);

  const ordenados = useMemo(
    () =>
      [...robos].sort((a, b) => {
        const aBreve = a.status === "em_breve" ? 1 : 0;
        const bBreve = b.status === "em_breve" ? 1 : 0;
        return aBreve !== bBreve ? aBreve - bBreve : b.mes - a.mes;
      }),
    [robos],
  );

  const escolhido = slug ? (robos.find((r) => r.slug === slug) ?? null) : null;
  const slugEscolhido = escolhido?.slug ?? null;
  const recorte = useMemo(
    () => (slugEscolhido ? (noPeriodo.porRobo.get(slugEscolhido) ?? []) : noPeriodo.somada),
    [slugEscolhido, noPeriodo],
  );
  const pontos = useMemo(() => acumular(recorte), [recorte]);
  const queda = useMemo(() => maiorQueda(pontos), [pontos]);
  const resumo = useMemo(() => resumirDias(recorte), [recorte]);
  const aMais = escolhido ? (aoVivoAMais.get(escolhido.slug) ?? 0) : [...aoVivoAMais.values()].reduce((s, v) => s + v, 0);

  // o índice apontado pode ter ficado de uma série mais longa (troca de robô ou de período)
  const lido = apontado !== null ? (pontos[apontado] ?? null) : null;
  const numero = lido ? lido.acumulado : resumo.total + aMais;
  const [prefixo, algarismos] = partesDoValor(numero);

  const nomeDoMes = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const mesComMaiuscula = nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1);
  const quantosRobos = series.filter((s) => s.dias.length > 0).length;
  const opcao = PERIODOS.find((p) => p.valor === periodo) ?? PERIODOS[0];

  const premissa = escolhido
    ? "com 1 contrato, já descontados os custos"
    : `com 1 contrato em cada um dos ${formatarNumero(quantosRobos)} robôs, já descontados os custos`;
  const quando =
    periodo === "tudo"
      ? recorte.length > 0
        ? `desde ${formatarDataLonga(recorte[0].dia)}`
        : ""
      : periodo === "12m"
        ? "nos últimos 12 meses"
        : `nos últimos ${formatarNumero(recorte.length)} pregões`;

  const brl = (v: number) => formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
  const COLUNAS = "lg:grid-cols-[minmax(0,1fr)_15rem_8.5rem_8.5rem_8.5rem]";

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
        <Fato rotulo="Maior queda">
          {queda ? <Valor valor={-queda.valor} inteiro className="font-medium" /> : <span className="text-sutil">nenhuma</span>}
        </Fato>
      </Fatos>
    ) : null;

  // no celular não existe "passar por cima": a curva de um robô se escolhe por este seletor
  const opcoesDeRobo = [
    { valor: "", rotulo: "Todos" },
    ...ordenados.filter((r) => r.status !== "em_breve").map((r) => ({ valor: r.slug, rotulo: r.nome })),
  ];

  return (
    <div>
      {/* o número e os fatos */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 lg:pr-20">
        <h1 className="text-[0.9375rem] text-muted-foreground">
          {escolhido ? (
            <>
              <span className="font-medium text-foreground">{escolhido.nome}</span> · resultado do robô
            </>
          ) : (
            "Resultado somado dos robôs"
          )}
        </h1>
        {/* o período fica alinhado à borda direita da curva: é dela (e da tela toda) que ele é o controle */}
        <Segmentado ariaLabel="Período" opcoes={PERIODOS} valor={periodo} onChange={setPeriodo} />
      </div>

      <div className="mt-3 grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,20rem)] lg:items-end lg:justify-start">
        <div className="min-w-0">
          <p className={cn("numero-grande", numero < 0 && "text-negativo")}>
            <span className={cn("mr-[0.18em] font-normal", numero >= 0 && "text-muted-foreground")}>{prefixo}</span>
            {algarismos}
          </p>
          <p className="mt-3 min-h-[1.5em] text-sm text-pretty text-muted-foreground">
            {lido ? (
              <>
                até {formatarDataLonga(lido.dia)} · no dia{" "}
                <Valor valor={lido.valor} inteiro={Math.abs(lido.valor) >= 1000} className="font-medium" />
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

      {/* no celular, de quem é a curva: todos somados ou um robô */}
      {opcoesDeRobo.length > 2 ? (
        <Segmentado
          ariaLabel="Robô do gráfico"
          opcoes={opcoesDeRobo}
          valor={slug ?? ""}
          onChange={(v) => setSlug(v === "" ? null : v)}
          className="mt-6 lg:hidden"
        />
      ) : null}

      {/* a curva */}
      <GraficoResultado dias={pontos} queda={queda} ativo={apontado} aoApontar={setApontado} className="mt-6 lg:mt-8" />
      {queda ? (
        <p className="mt-1 text-[0.8125rem] text-sutil">
          Em <span className="text-negativo">vermelho</span>, a maior queda: do ponto mais alto ao mais baixo que veio depois.
        </p>
      ) : null}
      {fatos ? <div className="mt-6 lg:hidden">{fatos}</div> : null}

      {/* os robôs */}
      <section
        aria-labelledby="robos-titulo"
        id="robos"
        className="mt-9"
        // só o mouse "sai" da lista: no toque, o fim de qualquer gesto sobre ela desfaria a escolha do seletor
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setSlug(null);
        }}
      >
        <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-8 border-b border-(--painel-fio) pb-3 lg:pr-20", COLUNAS)}>
          <h2 id="robos-titulo" className="text-[0.9375rem] font-medium">
            Por robô
          </h2>
          <span className="hidden lg:block" />
          <span className="text-right text-[0.8125rem] text-sutil">{opcao.coluna}</span>
          <span className="hidden text-right text-[0.8125rem] text-sutil lg:block">{mesComMaiuscula}</span>
          <span className="hidden text-right text-[0.8125rem] text-sutil lg:block">Maior queda</span>
        </div>

        {ordenados.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Nenhum robô cadastrado.</p>
        ) : (
          <ul>
            {ordenados.map((r) => {
              const emBreve = r.status === "em_breve";
              const naLista = slug === r.slug;
              const linha = linhas.porRobo.get(r.slug);
              const total = (linha?.total ?? 0) + (aoVivoAMais.get(r.slug) ?? 0);
              return (
                <li key={r.slug} className="border-b border-(--painel-fio)">
                  <Link
                    href={`/robos/${r.slug}`}
                    onPointerEnter={(e) => {
                      // no toque não há "passar por cima": o toque abre a página do robô
                      if (e.pointerType === "mouse" && !emBreve) setSlug(r.slug);
                    }}
                    // o foco do teclado também escolhe o robô; o do toque não (o toque já navega)
                    onFocus={(e) => (emBreve || !e.currentTarget.matches(":focus-visible") ? null : setSlug(r.slug))}
                    onBlur={(e) => (e.currentTarget.matches(":focus-visible") ? setSlug(null) : null)}
                    className={cn(
                      "-mx-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-2 rounded-md px-3 py-3.5 outline-none transition-colors lg:pr-[5.75rem]",
                      COLUNAS,
                      "hover:bg-(--linha-hover) focus-visible:bg-(--linha-hover)",
                      naLista && "bg-(--linha-hover)",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[1.0625rem] leading-snug font-medium tracking-[-0.01em]">{r.nome}</span>
                      <TextoDeHoje
                        robo={{
                          statusAoVivo: r.statusAoVivo,
                          operouHoje: r.operouHoje,
                          hoje: r.hoje,
                          hojeOperacoes: r.hojeOperacoes,
                          dadosAte: r.ultimoPregao?.dia ?? null,
                        }}
                        className="block truncate"
                      />
                    </span>

                    <span className={cn("hidden lg:block", naLista ? "text-foreground" : "text-muted-foreground")}>
                      {emBreve || !linha ? null : <Miniatura pontos={linha.pontos} dominio={linhas.dominio} />}
                    </span>

                    <span className="text-right font-medium">
                      {emBreve ? <span className="text-sutil">–</span> : <Valor valor={total} inteiro={Math.abs(total) >= 1000} />}
                    </span>

                    {/* no celular, o mês e a maior queda descem para uma segunda linha, com o rótulo junto */}
                    <span className="col-span-2 flex gap-x-6 text-[0.8125rem] text-muted-foreground lg:contents lg:text-base">
                      <span className="lg:text-right lg:text-foreground">
                        <span className="mr-1.5 lg:hidden">{mesComMaiuscula}</span>
                        {emBreve ? <span className="text-sutil">–</span> : <Valor valor={r.mes} inteiro={Math.abs(r.mes) >= 1000} />}
                      </span>
                      <span className="lg:text-right">
                        <span className="mr-1.5 lg:hidden">Maior queda</span>
                        {emBreve || !linha ? (
                          <span className="text-sutil">–</span>
                        ) : linha.queda > 0 ? (
                          <span className="whitespace-nowrap text-muted-foreground">{brl(-linha.queda)}</span>
                        ) : (
                          <span className="text-sutil">nenhuma</span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
