import type { Metadata } from "next";
import Link from "next/link";
import { BarrasPorRobo } from "@/components/comparativo/BarrasPorRobo";
import { resumirPorPeriodo } from "@/components/comparativo/resumo-por-periodo";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { RevelarNaRolagem } from "@/components/compartilhados/RevelarNaRolagem";
import { Valor } from "@/components/compartilhados/Valor";
import { CardsKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { GraficoBarras } from "@/components/desempenho/GraficoBarras";
import { NavSecoes } from "@/components/layout/NavSecoes";
import { Voltar } from "@/components/layout/Voltar";
import { listarEstatisticas, listarRobos } from "@/lib/consultas/publico";
import { formatarBRL, formatarData, formatarMesAno, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { heatmapAnoMes } from "@/lib/stats/calendario";
import { calcularKpis, type Kpis } from "@/lib/stats/kpis";
import { hojeSP } from "@/lib/stats/periodos";
import { riscoDeRuina } from "@/lib/stats/risco";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import type { EstatisticaPublica, RoboPublico } from "@/lib/tipos";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Comparativo",
  description: "Todos os robôs da Quants Robôs lado a lado: resultado, acerto, drawdown máximo e risco de ruína, por contrato.",
};

const OPCOES: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 1 };

/**
 * As seções da barra da lateral direita, na ordem (19/09/2026). "Mês a mês" tem âncora como as outras
 * (#mes-a-mes abre no gráfico), mas fica fora da barra: é um gráfico DENTRO de "Todos juntos" e os dois
 * terminam no mesmo ponto, no fim da página — medido aqui, o traço dele nunca chegaria a acender.
 */
const SECOES = [
  { id: "lado-a-lado", rotulo: "Lado a lado" },
  { id: "quem-rendeu-mais", rotulo: "Quem rendeu mais" },
  { id: "todos-juntos", rotulo: "Todos juntos" },
];

/** Soma as séries diárias (1 contrato de cada robô) num único robô "casa". */
function somarSeries(series: LinhaDiaria[][]): LinhaDiaria[] {
  const porDia = new Map<string, LinhaDiaria>();
  for (const linhas of series) {
    for (const l of linhas) {
      const acc = porDia.get(l.dia) ?? {
        dia: l.dia,
        pontos_por_contrato: 0,
        resultado_brl_por_contrato: 0,
        custos_brl_por_contrato: 0,
        n_operacoes: 0,
        n_gain: 0,
        n_loss: 0,
        soma_gain_brl_por_contrato: 0,
        soma_loss_brl_por_contrato: 0,
        maior_gain_brl_por_contrato: 0,
        maior_loss_brl_por_contrato: 0,
      };
      acc.pontos_por_contrato += l.pontos_por_contrato;
      acc.resultado_brl_por_contrato += l.resultado_brl_por_contrato;
      acc.custos_brl_por_contrato += l.custos_brl_por_contrato;
      acc.n_operacoes += l.n_operacoes;
      acc.n_gain += l.n_gain;
      acc.n_loss += l.n_loss;
      acc.soma_gain_brl_por_contrato += l.soma_gain_brl_por_contrato;
      acc.soma_loss_brl_por_contrato += l.soma_loss_brl_por_contrato;
      acc.maior_gain_brl_por_contrato = Math.max(acc.maior_gain_brl_por_contrato, l.maior_gain_brl_por_contrato);
      acc.maior_loss_brl_por_contrato = Math.min(acc.maior_loss_brl_por_contrato, l.maior_loss_brl_por_contrato);
      porDia.set(l.dia, acc);
    }
  }
  return [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1));
}

interface Coluna {
  robo: RoboPublico;
  k: Kpis;
  ruina: number | null;
  linhas: LinhaDiaria[];
}

/** Uma linha da tabela lado a lado: o rótulo, como se lê cada robô e qual deles é o melhor (se faz sentido). */
interface Metrica {
  rotulo: string;
  valor: (c: Coluna) => React.ReactNode;
  /** número usado para achar o melhor; undefined = a linha não tem "melhor" */
  chave?: (c: Coluna) => number | null;
  /** "maior" (padrão) ou "menor" ganha */
  ganha?: "maior" | "menor";
  /** o "o que é" da métrica (19/09/2026); "Operando desde" é uma data e fica sem */
  info?: ChaveIndicador;
}

const METRICAS: Metrica[] = [
  { rotulo: "Resultado desde o início", info: "acumulado", valor: (c) => <Valor valor={c.k.acumulado} inteiro className="font-semibold" />, chave: (c) => c.k.acumulado },
  { rotulo: "Mês atual", info: "mesAtual", valor: (c) => <Valor valor={c.k.mes} inteiro={Math.abs(c.k.mes) >= 1000} />, chave: (c) => c.k.mes },
  { rotulo: "Média mensal", info: "mediaMensal", valor: (c) => <Valor valor={c.k.mediaMensal} inteiro={Math.abs(c.k.mediaMensal) >= 1000} />, chave: (c) => c.k.mediaMensal },
  { rotulo: "Taxa de acerto", info: "taxaAcerto", valor: (c) => formatarPct(c.k.taxaAcerto), chave: (c) => c.k.taxaAcerto },
  { rotulo: "Fator de lucro", info: "fatorLucro", valor: (c) => formatarMultiplo(c.k.fatorLucro), chave: (c) => c.k.fatorLucro },
  { rotulo: "Payoff", info: "payoff", valor: (c) => formatarMultiplo(c.k.payoff), chave: (c) => c.k.payoff },
  {
    rotulo: "Drawdown máximo",
    info: "drawdown",
    valor: (c) => (c.k.drawdown.valor > 0 ? <Valor valor={-c.k.drawdown.valor} inteiro={c.k.drawdown.valor >= 1000} /> : "–"),
    chave: (c) => c.k.drawdown.valor,
    ganha: "menor",
  },
  {
    rotulo: "Drawdown máximo, % do capital",
    info: "drawdownPct",
    valor: (c) => (c.k.drawdownMaximoPct !== null ? <span className="text-negativo">{formatarPct(c.k.drawdownMaximoPct, 1)}</span> : "–"),
    chave: (c) => c.k.drawdownMaximoPct,
    ganha: "menor",
  },
  {
    // 19/09/2026: sem vermelho/laranja, como na aba Risco: é probabilidade, não dinheiro
    rotulo: "Risco de ruína",
    info: "riscoRuina",
    valor: (c) => (c.ruina === null ? "–" : formatarPct(c.ruina, 1)),
    chave: (c) => c.ruina,
    ganha: "menor",
  },
  { rotulo: "Operações", info: "operacoes", valor: (c) => formatarNumero(c.k.nOperacoes) },
  { rotulo: "Dias de pregão", info: "diasPregao", valor: (c) => formatarNumero(c.k.nDias) },
  { rotulo: "Capital de referência", info: "capitalReferencia", valor: (c) => (c.robo.capital_referencia ? formatarBRL(c.robo.capital_referencia, { inteiro: true }) : "–") },
  { rotulo: "Operando desde", valor: (c) => (c.robo.conta_real_desde ? formatarData(c.robo.conta_real_desde) : "–") },
];

/** O rótulo da métrica com o i do "o que é" ao lado, quando ela tem chave no glossário. */
function RotuloMetrica({ m }: { m: Metrica }) {
  return m.info ? <RotuloComInfo chave={m.info}>{m.rotulo}</RotuloComInfo> : m.rotulo;
}

/** O índice da coluna que ganha na linha, ou null quando a linha não compara. */
function melhorDe(m: Metrica, colunas: Coluna[]): number | null {
  if (!m.chave) return null;
  let melhor: number | null = null;
  let valorMelhor = 0;
  colunas.forEach((c, i) => {
    const v = m.chave!(c);
    if (v === null || !Number.isFinite(v)) return;
    if (melhor === null || (m.ganha === "menor" ? v < valorMelhor : v > valorMelhor)) {
      melhor = i;
      valorMelhor = v;
    }
  });
  return melhor;
}

/**
 * Comparativo (18/09/2026, "mais intuitivo e útil"): a tabela virou de lado, um robô por coluna e uma
 * métrica por linha, com o melhor de cada linha marcado; embaixo, quem rendeu mais no período em barras;
 * por fim, todos juntos mês a mês. A curva do conjunto saiu: era mais um gráfico de linha.
 * 19/09/2026: no celular a tabela mostrava 1 robô de 3 e rolava de lado; abaixo de 768 px cada métrica
 * vira um rótulo com os robôs lado a lado embaixo, e os nomes ficam uma vez só, no topo.
 */
export default async function PaginaComparativo() {
  const hoje = hojeSP();
  const [robos, estatisticas] = await Promise.all([listarRobos(), listarEstatisticas()]);

  const porRobo = new Map<string, EstatisticaPublica[]>();
  for (const e of estatisticas) {
    const lista = porRobo.get(e.slug) ?? [];
    lista.push(e);
    porRobo.set(e.slug, lista);
  }

  const colunas: Coluna[] = robos
    .filter((r) => r.status !== "arquivado")
    .map((r) => {
      const linhas = porRobo.get(r.slug) ?? [];
      const k = calcularKpis(linhas, { ...OPCOES, valorPonto: r.valor_ponto_brl }, { hoje, capitalReferencia: r.capital_referencia });
      const nLoss = linhas.reduce((s, l) => s + l.n_loss, 0);
      const somaLoss = linhas.reduce((s, l) => s + l.soma_loss_brl_por_contrato, 0);
      const perdaMedia = nLoss > 0 ? somaLoss / nLoss : 0;
      const ruina = riscoDeRuina({ taxaAcerto: k.taxaAcerto, payoff: k.payoff, capital: r.capital_referencia, perdaMedia });
      return { robo: r, k, ruina, linhas };
    })
    .filter((c) => c.linhas.length > 0)
    .sort((a, b) => b.k.acumulado - a.k.acumulado);

  const casa = somarSeries(colunas.map((c) => c.linhas));
  const kCasa = calcularKpis(casa, OPCOES, { hoje });
  const mensal = heatmapAnoMes(casa, OPCOES)
    .flatMap((l) => l.meses.filter((m): m is NonNullable<typeof m> => m !== null))
    .slice(-12)
    .map((m) => ({ rotulo: formatarMesAno(`${m.mes}-01`), valor: m.total, n: m.nDias }));

  // o "o que é" do glossário fala de um robô; aqui os números são dos robôs somados (19/09/2026)
  const tiles: ItemKpi[] = [
    {
      rotulo: "Desde o início",
      info: "acumulado",
      infoTexto: "Soma do que todos os robôs juntos ganharam e perderam desde a primeira operação registrada no site, com 1 contrato de cada, já descontados os custos.",
      valor: <Valor valor={kCasa.acumulado} inteiro />,
      detalhe: `${formatarNumero(kCasa.nDias)} dias de pregão`,
    },
    {
      rotulo: "Mês atual",
      info: "mesAtual",
      infoTexto: "Resultado de todos os robôs juntos, com 1 contrato de cada, nas operações fechadas do dia 1º deste mês até hoje, já descontados os custos.",
      valor: <Valor valor={kCasa.mes} inteiro={Math.abs(kCasa.mes) >= 1000} />,
    },
    {
      rotulo: "Drawdown máximo",
      info: "drawdown",
      infoTexto: "A maior queda do saldo dos robôs somados, com 1 contrato de cada, desde um topo até o fundo seguinte. Mostra o pior momento de quem operasse todos ao mesmo tempo.",
      valor: <Valor valor={-kCasa.drawdown.valor} inteiro />,
      detalhe: kCasa.drawdownMaximoPct !== null ? undefined : kCasa.drawdown.fundo ? `fundo em ${formatarData(kCasa.drawdown.fundo)}` : undefined,
    },
    {
      rotulo: "Operações",
      info: "operacoes",
      infoTexto: "Quantas operações os robôs fecharam, somando as de todos. Cada operação vai da entrada no mercado até a posição zerar.",
      valor: formatarNumero(kCasa.nOperacoes),
      detalhe: `${formatarPct(kCasa.taxaAcerto)} de acerto`,
    },
  ];

  return (
    <>
      {/* fora do .conteudo de propósito: o space-y-8 daria margem ao <nav>, e margem em elemento fixo
          empurra a barra para baixo do meio da tela (19/09/2026) */}
      {colunas.length > 0 ? <NavSecoes secoes={SECOES} /> : null}
      <div className="conteudo space-y-8 py-8">
        <Voltar href="/">Início</Voltar>
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Comparativo</h1>
          <p className="text-muted-foreground">Por 1 contrato, líquido de custos.</p>
        </header>

        {colunas.length === 0 ? (
          <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">Nenhum robô com operações fechadas ainda.</p>
        ) : (
          <>
            {/* as âncoras da barra de seções; quem tira o título de baixo do cabeçalho fixo é o
                scroll-padding-top do html (globals.css), então aqui não entra scroll-mt (19/09/2026) */}
            <section id="lado-a-lado" className="painel">
              <div className="border-b px-4 py-3 sm:px-5">
                <h2 className="font-semibold">Lado a lado</h2>
              </div>

              {/* celular: os nomes uma vez no topo, e cada métrica com os robôs em colunas embaixo */}
              <div className="md:hidden">
                <div className="grid gap-2 border-b px-4 py-2.5 text-right text-sm" style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` }}>
                  {colunas.map((c) => (
                    <div key={c.robo.slug} className="flex min-w-0 flex-col justify-end px-1.5">
                      <Link href={`/robos/${c.robo.slug}`} className="block leading-snug font-medium break-words hover:underline">
                        {c.robo.nome}
                      </Link>
                      <span className="text-xs text-muted-foreground">{c.robo.ativo}</span>
                    </div>
                  ))}
                </div>
                <dl>
                  {METRICAS.map((m) => {
                    const melhor = melhorDe(m, colunas);
                    return (
                      <div key={m.rotulo} className="sep px-4 py-2.5">
                        <dt className="text-xs text-muted-foreground">
                          <RotuloMetrica m={m} />
                        </dt>
                        <dd
                          className={`mt-1 grid gap-2 text-right tabular-nums ${colunas.length > 3 ? "text-xs" : "text-sm"}`}
                          style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` }}
                        >
                          {colunas.map((c, i) => (
                            <span key={c.robo.slug} className={`min-w-0 truncate rounded-md px-1.5 py-0.5 ${melhor === i ? "bg-(--linha-hover) font-semibold" : ""}`}>
                              <span className="sr-only">{c.robo.nome}: </span>
                              {m.valor(c)}
                            </span>
                          ))}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:font-medium">
                      <th className="text-left text-xs text-muted-foreground">Métrica</th>
                      {colunas.map((c) => (
                        <th key={c.robo.slug} className="text-right">
                          <Link href={`/robos/${c.robo.slug}`} className="hover:underline">
                            {c.robo.nome}
                          </Link>
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.robo.ativo}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="[&>tr]:border-t">
                    {METRICAS.map((m) => {
                      const melhor = melhorDe(m, colunas);
                      return (
                        <tr key={m.rotulo} className="tabular-nums [&>td]:px-4 [&>td]:py-2.5">
                          <td className="text-muted-foreground">
                            <RotuloMetrica m={m} />
                          </td>
                          {colunas.map((c, i) => (
                            <td key={c.robo.slug} className={`text-right ${melhor === i ? "bg-(--linha-hover) font-semibold" : ""}`}>
                              {m.valor(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* os totais por período saem prontos daqui: a série diária de cada robô era 85% do HTML (18/09/2026).
                A âncora fica neste invólucro porque o título mora dentro do componente (19/09/2026).
                A entrada ao rolar vai DENTRO do invólucro, nunca nele: o elemento com o id não pode ser
                o que translada, senão o clique na barra de seções mira a posição ainda deslocada e o
                título para 12 px mais alto, encostado no cabeçalho (19/09/2026). */}
            <div id="quem-rendeu-mais">
              <RevelarNaRolagem>
                <BarrasPorRobo
                  robos={colunas.map((c) => ({
                    slug: c.robo.slug,
                    nome: c.robo.nome,
                    ativo: c.robo.ativo,
                    porPeriodo: resumirPorPeriodo(c.linhas, c.robo.valor_ponto_brl, hoje),
                  }))}
                />
              </RevelarNaRolagem>
            </div>

            {/* uma entrada só para a seção inteira (19/09/2026): título, cartões e gráfico chegam juntos.
                Cartão a cartão ficaria agitado numa página que se lê comparando números de um lado para
                o outro. "Lado a lado" não ganha entrada de propósito: ela abre acima da dobra nos dois
                tamanhos, e o observador só esconde o que está abaixo da janela. */}
            <section id="todos-juntos">
              <RevelarNaRolagem className="space-y-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Todos juntos</h2>
                  <p className="text-sm text-muted-foreground">{colunas.map((c) => c.robo.nome).join(" + ")}, 1 contrato de cada</p>
                </div>
                <CardsKpi itens={tiles} className="lg:grid-cols-4" />
                <div id="mes-a-mes" className="painel p-4 sm:p-5">
                  <h3 className="mb-2 text-sm font-medium">
                    <RotuloComInfo
                      chave="resultadoMensal"
                      texto="Quanto os robôs somados, com 1 contrato de cada, ganharam ou perderam em cada mês, já descontados os custos."
                    >
                      Mês a mês
                    </RotuloComInfo>
                  </h3>
                  <GraficoBarras dados={mensal} unidade="brl" altura={220} rotuloN="Dias de pregão" />
                </div>
              </RevelarNaRolagem>
            </section>
          </>
        )}
      </div>
    </>
  );
}
