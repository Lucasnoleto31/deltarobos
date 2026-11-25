"use client";

import { cn } from "cn";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { useCasa } from "@/components/home/CasaAoVivoProvider";
import { useRobosAoVivo, type RoboBase } from "@/components/home/useRobosAoVivo";
import { Fato, Fatos, NumeroGrande } from "@/components/sistema/Numero";
import type { SerieDoRobo } from "@/lib/consultas/casa";
import { formatarBRL, formatarData, formatarDataLonga, formatarMesAno, formatarNumero, formatarPct } from "@/lib/formato";
import { GraficoComparativo, type SerieDoComparativo } from "./GraficoComparativo";
import {
  PERIODOS_COMPARATIVO,
  curvaNoEixo,
  eixoComum,
  indiceDoMelhor,
  recortarPeriodo,
  resumirNoPeriodo,
  type PeriodoComparativo,
} from "./resumo-por-periodo";

/** O que a tela precisa de cada robô: o mínimo do ao vivo (para o mês e o total acompanharem o dia) e o nome do ativo. */
export type RoboDoComparativo = RoboBase & { acumulado: number; ativoNome: string };

interface Props {
  /** os robôs com histórico, sem os arquivados (vêm do banco) */
  robos: RoboDoComparativo[];
  /** a série diária de cada um, a mesma da página inicial */
  series: SerieDoRobo[];
}

// o período em palavras, para a premissa do número e para a linha do robô que não operou nele
const QUANDO: Record<Exclude<PeriodoComparativo, "tudo">, string> = {
  "12m": "nos últimos 12 meses",
  ano: "neste ano",
  mes: "neste mês",
  semana: "nesta semana",
};

const brl = (v: number) => formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });

/**
 * "Comparar robôs" (ficha Mesa, 25/11/2026). A pergunta da tela: qual robô foi melhor, e em quê?
 *
 * - O número grande é o resultado do robô que mais rendeu no período, com o nome dele na linha de cima e a
 *   premissa embaixo. Ao lado, três fatos que a tabela não tem (dias com ganho, melhor e pior dia).
 * - Um gráfico só: a curva de cada robô no mesmo eixo de tempo e na mesma escala, com o nome na ponta. A
 *   linha do robô em destaque fica na cor do texto, com a maior queda em vermelho; as outras, apagadas.
 * - A tabela, um robô por linha e poucas colunas, com o melhor de cada coluna em peso 500. Ela é a legenda
 *   e o seletor: passar o ponteiro (ou o foco) numa linha põe aquele robô em destaque no gráfico e no
 *   número; o nome abre a página do robô. Passar o ponteiro no gráfico faz o mesmo com a linha mais perto
 *   e lê o acumulado até aquele pregão. Sem linha de instrução.
 * - O período vale para a tela toda. O padrão são 12 meses, como na página inicial.
 *
 * O que saiu (o Lucas: "coisas que não são necessárias pode tirar"): a tabela de 13 métricas por robô
 * (ficaram as cinco que respondem à pergunta; o resto está na página de cada robô), as barras de "quem
 * rendeu mais" (a coluna de resultado, em ordem, diz o mesmo) e "todos juntos", que é a página inicial.
 *
 * 19/09/2026: abaixo de 768 px a tabela antiga virava outra coisa (os nomes no topo e cada métrica
 * embaixo). Agora é a mesma tabela, que rola de lado dentro do próprio bloco com o nome do robô preso à
 * esquerda.
 *
 * Tudo é para 1 contrato e já descontados os custos. As séries vêm do servidor (cache de 60 s); o que o ao
 * vivo já sabe de hoje além delas entra no total e no mês, como na página inicial.
 */
export function PainelComparativo({ robos, series }: Props) {
  const { hoje } = useCasa();
  const vivos = useRobosAoVivo(robos);
  const [periodo, setPeriodo] = useState<PeriodoComparativo>("12m");
  const [slug, setSlug] = useState<string | null>(null);
  const [apontado, setApontado] = useState<number | null>(null);

  // o que o ao vivo tem de hoje além do que o servidor mandou, por robô
  const aoVivoAMais = useMemo(() => {
    const doServidor = new Map(robos.map((r) => [r.slug, r.acumulado]));
    return new Map(vivos.map((r) => [r.slug, r.acumulado - (doServidor.get(r.slug) ?? r.acumulado)]));
  }, [robos, vivos]);

  // cada robô no período e, para a coluna do mês, se ele operou no mês
  const noPeriodo = useMemo(() => new Map(series.map((s) => [s.slug, resumirNoPeriodo(s, periodo, hoje)])), [series, periodo, hoje]);
  const operouNoMes = useMemo(
    () => new Set(series.filter((s) => recortarPeriodo(s.dias, "mes", hoje).length > 0).map((s) => s.slug)),
    [series, hoje],
  );

  // as curvas no mesmo eixo de tempo
  const eixo = useMemo(() => eixoComum([...noPeriodo.values()]), [noPeriodo]);
  const curvas = useMemo(
    () => new Map([...noPeriodo.values()].map((r) => [r.slug, curvaNoEixo(eixo, r.curva, r.queda)])),
    [noPeriodo, eixo],
  );

  // as linhas da tabela: quem operou no período primeiro, do maior resultado para o menor
  const linhas = useMemo(
    () =>
      vivos
        .map((robo) => {
          const p = noPeriodo.get(robo.slug);
          const aMais = aoVivoAMais.get(robo.slug) ?? 0;
          const pregoes = p?.resumo.pregoes ?? 0;
          return {
            robo,
            // nulo = o robô não operou no período: a linha dele diz isso em palavras e ele fica fora do gráfico
            p: p && pregoes > 0 ? p : null,
            total: (p?.resumo.total ?? 0) + aMais,
            // o mês de quem não operou no mês não entra na disputa da coluna (zero ganharia de quem perdeu)
            mes: operouNoMes.has(robo.slug) || robo.mes !== 0 ? robo.mes : null,
          };
        })
        .sort((a, b) => Number(b.p !== null) - Number(a.p !== null) || b.total - a.total),
    [vivos, noPeriodo, aoVivoAMais, operouNoMes],
  );

  const melhor = useMemo(
    () => ({
      total: indiceDoMelhor(linhas.map((l) => (l.p ? l.total : null))),
      mes: indiceDoMelhor(linhas.map((l) => l.mes)),
      queda: indiceDoMelhor(linhas.map((l) => (l.p ? (l.p.queda?.valor ?? 0) : null)), "menor"),
      acertos: indiceDoMelhor(linhas.map((l) => l.p?.resumo.acertos)),
    }),
    [linhas],
  );

  const curvasDoGrafico = useMemo<SerieDoComparativo[]>(
    () =>
      linhas.flatMap((l) => {
        const c = curvas.get(l.robo.slug);
        return l.p && c ? [{ slug: l.robo.slug, nome: l.robo.nome, acumulado: c.acumulado, queda: c.queda }] : [];
      }),
    [linhas, curvas],
  );

  // o robô em destaque: o apontado (na tabela ou no gráfico) ou, sem ninguém apontado, o de maior resultado
  const comCurva = linhas.filter((l) => l.p !== null);
  const lider = comCurva[0] ?? null;
  const foco = (slug ? comCurva.find((l) => l.robo.slug === slug) : null) ?? lider;

  const opcao = PERIODOS_COMPARATIVO.find((o) => o.valor === periodo) ?? PERIODOS_COMPARATIVO[0];
  const nomeDoMes = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const mesComMaiuscula = nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1);
  const comMes = periodo !== "mes";

  const seletor = <Segmentado ariaLabel="Período" opcoes={PERIODOS_COMPARATIVO} valor={periodo} onChange={setPeriodo} />;

  if (!foco || !foco.p) {
    return (
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 lg:pr-20">
          <p className="text-[0.9375rem] text-muted-foreground">Resultado de cada robô</p>
          {seletor}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Nenhum robô operou {periodo === "tudo" ? "ainda" : QUANDO[periodo]}.</p>
      </div>
    );
  }

  const curvaDoFoco = curvas.get(foco.robo.slug);
  // o índice apontado pode ter ficado de um eixo mais longo (troca de período)
  const acumuladoLido = apontado !== null && curvaDoFoco ? (curvaDoFoco.acumulado[apontado] ?? null) : null;
  const lido =
    apontado !== null && curvaDoFoco && acumuladoLido !== null
      ? { dia: eixo[apontado], acumulado: acumuladoLido, noDia: curvaDoFoco.noDia[apontado] ?? null }
      : null;
  const numero = lido ? lido.acumulado : foco.total;
  const resumo = foco.p.resumo;
  const quando = periodo === "tudo" ? `desde ${formatarDataLonga(foco.p.dias[0].dia)}` : QUANDO[periodo];

  return (
    <div>
      {/* de quem é o número, e o período */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 lg:pr-20">
        <p className="text-[0.9375rem] text-muted-foreground">
          <span className="font-medium text-foreground">{foco.robo.nome}</span> ·{" "}
          {foco === lider && comCurva.length > 1 ? "o maior resultado do período" : "resultado do robô"}
        </p>
        {/* o período fica alinhado à borda direita do gráfico: é dele (e da tela toda) que ele é o controle */}
        {seletor}
      </div>

      <div className="mt-3 grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,auto)_minmax(0,20rem)] lg:items-end lg:justify-start">
        <div className="min-w-0">
          <NumeroGrande valor={numero} />
          {/* a premissa e a leitura do pregão apontado ocupam o mesmo lugar: a tela não pula ao passar o ponteiro */}
          <div className="mt-3 grid text-sm text-pretty text-muted-foreground">
            <p className={cn("col-start-1 row-start-1", lido && "invisible")}>com 1 contrato, já descontados os custos · {quando}</p>
            {lido ? (
              <p className="col-start-1 row-start-1">
                até {formatarDataLonga(lido.dia)} ·{" "}
                {lido.noDia === null ? (
                  "sem operação no dia"
                ) : (
                  <>
                    no dia <Valor valor={lido.noDia} inteiro={Math.abs(lido.noDia) >= 1000} className="font-medium" />
                  </>
                )}
              </p>
            ) : null}
          </div>
        </div>

        <Fatos className="lg:pb-0.5">
          <Fato rotulo="Dias com ganho">
            <span className="font-medium">{formatarNumero(resumo.comGanho)}</span>
            <span className="text-muted-foreground"> de {formatarNumero(resumo.pregoes)}</span>
          </Fato>
          {resumo.melhor && resumo.melhor.valor > 0 ? (
            <Fato rotulo="Melhor dia">
              <span className="mr-3 text-sutil">{formatarData(resumo.melhor.dia)}</span>
              <Valor valor={resumo.melhor.valor} inteiro={Math.abs(resumo.melhor.valor) >= 1000} className="font-medium" />
            </Fato>
          ) : null}
          {resumo.pior && resumo.pior.valor < 0 ? (
            <Fato rotulo="Pior dia">
              <span className="mr-3 text-sutil">{formatarData(resumo.pior.dia)}</span>
              <Valor valor={resumo.pior.valor} inteiro={Math.abs(resumo.pior.valor) >= 1000} className="font-medium" />
            </Fato>
          ) : null}
        </Fatos>
      </div>

      {/* as curvas */}
      <GraficoComparativo
        dias={eixo}
        series={curvasDoGrafico}
        destaque={foco.robo.slug}
        ativo={apontado}
        aoApontar={setApontado}
        aoDestacar={setSlug}
        className="mt-8"
      />
      {curvaDoFoco?.queda ? (
        <p className="mt-1 text-[0.8125rem] text-sutil">
          Em <span className="text-negativo">vermelho</span>, a maior queda do {foco.robo.nome}: do ponto mais alto ao mais baixo que veio depois.
        </p>
      ) : null}

      {/* A tabela. O id continua sendo âncora de link direto (#lado-a-lado); quem tira o título de baixo da
          fita fixa é o scroll-padding-top do html, então aqui não entra scroll-mt (19/09/2026). */}
      <section id="lado-a-lado" aria-label="Os robôs lado a lado" className="mt-9 lg:pr-20" onPointerLeave={() => setSlug(null)}>
        <div className="tbl-moldura">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col" className="bg-background text-[0.9375rem] font-medium text-foreground max-md:sticky max-md:left-0 max-md:z-10">
                  Lado a lado
                </th>
                <th scope="col" className="num">
                  {opcao.coluna}
                </th>
                {comMes ? (
                  <th scope="col" className="num">
                    {mesComMaiuscula}
                  </th>
                ) : null}
                <th scope="col" className="num">
                  Maior queda
                </th>
                <th scope="col" className="num">
                  <RotuloComInfo
                    chave="taxaAcerto"
                    texto="De cada 100 operações, quantas terminaram com ganho, já descontados os custos. Sozinho não diz se o robô ganha dinheiro: depende também do tamanho dos ganhos e das perdas."
                  >
                    Acertos
                  </RotuloComInfo>
                </th>
                <th scope="col" className="num">
                  Operações por dia
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const r = l.robo;
                const emFoco = foco.robo.slug === r.slug;
                return (
                  <tr
                    key={r.slug}
                    className={cn("group", emFoco && "[&>td]:bg-(--linha-hover)")}
                    onPointerEnter={(e) => {
                      // no toque não há "passar por cima": o toque no nome abre a página do robô
                      if (e.pointerType === "mouse") setSlug(r.slug);
                    }}
                  >
                    {/* No celular a tabela rola de lado e o nome fica preso à esquerda, com fundo próprio. Lá a
                        coluna tem largura fixa e o texto quebra: solta, ela tomava três quartos da tela. */}
                    <td className="bg-background py-2.5 group-hover:bg-(--linha-hover) max-md:sticky max-md:left-0 max-md:z-10">
                      <div className="max-md:w-36 md:whitespace-nowrap">
                        <Link
                          href={`/robos/${r.slug}`}
                          onFocus={() => setSlug(r.slug)}
                          onBlur={() => setSlug(null)}
                          className="block w-fit text-[1.0625rem] leading-snug font-medium tracking-[-0.01em] outline-none hover:underline focus-visible:underline"
                        >
                          {r.nome}
                        </Link>
                        <span className="block text-[0.8125rem] text-pretty text-sutil">
                          {r.ativoNome}
                          {l.p?.historicoDesde ? ` · histórico desde ${formatarMesAno(l.p.historicoDesde)}` : ""}
                        </span>
                      </div>
                    </td>
                    {l.p ? (
                      <>
                        <td className="num">
                          <Valor valor={l.total} inteiro={Math.abs(l.total) >= 1000} className={cn(melhor.total === i && "font-medium")} />
                        </td>
                        {comMes ? (
                          <td className="num">
                            {l.mes === null ? (
                              <span className="text-sutil">–</span>
                            ) : (
                              <Valor valor={l.mes} inteiro={Math.abs(l.mes) >= 1000} className={cn(melhor.mes === i && "font-medium")} />
                            )}
                          </td>
                        ) : null}
                        <td className={cn("num", melhor.queda === i ? "font-medium" : "text-muted-foreground")}>
                          {l.p.queda ? brl(-l.p.queda.valor) : "nenhuma"}
                        </td>
                        <td className={cn("num", melhor.acertos === i && "font-medium")}>
                          {l.p.resumo.acertos === null ? <span className="text-sutil">–</span> : formatarPct(l.p.resumo.acertos, 0)}
                        </td>
                        <td className="num">
                          {l.p.operacoesPorDia === null ? <span className="text-sutil">–</span> : formatarNumero(l.p.operacoesPorDia, 1)}
                        </td>
                      </>
                    ) : (
                      // o robô que não operou no período aparece uma vez, em palavras, e não numa fileira de traços
                      <td colSpan={comMes ? 5 : 4} className="text-sutil">
                        sem operação {periodo === "tudo" ? "ainda" : QUANDO[periodo]}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
