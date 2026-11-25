import { ListaKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarBRL, formatarData, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import type { LinhaDiaria } from "@/lib/stats/tipos";
import { VAZIO_DO_PERIODO } from "./periodos-resumo";

interface Props {
  linhas: LinhaDiaria[];
  valorPonto: number;
  capitalReferencia: number | null;
  hoje: string;
  className?: string;
}

/**
 * "Mais números" da visão geral do robô (spec §8.2), desde o início, em R$ para 1 contrato e já com custos.
 * Desde a ficha Mesa (25/11/2026) é uma lista só, sem cartões: o resultado e a maior queda já estão no topo
 * da página, e aqui ficam os números de quem quer ir além, cada um com nome de leigo e uma linha dizendo o
 * que ele quer dizer na prática ("ganhou R$ 1,13 para cada R$ 1,00 perdido"). O termo técnico fica na
 * explicação que o nome abre ao toque.
 */
export function KpisRobo({ linhas, valorPonto, capitalReferencia, hoje, className }: Props) {
  const k = calcularKpis(linhas, { base: "liquido", unidade: "brl", valorPonto }, { hoje, capitalReferencia });

  if (k.nDias === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{VAZIO_DO_PERIODO.tudo}</p>;
  }

  const itens: ItemKpi[] = [
    {
      rotulo: "Acertos",
      info: "taxaAcerto",
      valor: formatarPct(k.taxaAcerto),
      detalhe: `${formatarNumero(k.nGain)} operações com ganho, ${formatarNumero(k.nLoss)} com perda`,
    },
    {
      rotulo: "Ganho médio contra perda média",
      info: "payoff",
      valor: formatarMultiplo(k.payoff),
      detalhe:
        k.payoff === null
          ? undefined
          : k.payoff < 1
            ? "os ganhos são menores que as perdas: o robô depende de acertar muito"
            : "os ganhos são maiores que as perdas",
    },
    {
      rotulo: "Fator de lucro",
      info: "fatorLucro",
      valor: formatarMultiplo(k.fatorLucro),
      detalhe: k.fatorLucro === null ? undefined : `ganhou ${formatarBRL(k.fatorLucro)} para cada R$ 1,00 perdido`,
    },
    {
      rotulo: "Operações",
      info: "operacoes",
      valor: formatarNumero(k.nOperacoes),
      detalhe: `${formatarNumero(k.mediaOperacoesDia, 1)} por dia, em ${formatarNumero(k.nDias)} ${k.nDias === 1 ? "pregão" : "pregões"}`,
    },
    {
      rotulo: "Média por mês",
      info: "mediaMensal",
      valor: <Valor valor={k.mediaMensal} inteiro={Math.abs(k.mediaMensal) >= 1000} />,
      detalhe: `em ${formatarNumero(k.nMeses)} ${k.nMeses === 1 ? "mês" : "meses"}; os meses variam muito entre si`,
    },
    {
      rotulo: "Melhor dia",
      valor: k.melhorDia ? <Valor valor={k.melhorDia.valor} inteiro={Math.abs(k.melhorDia.valor) >= 1000} /> : "–",
      detalhe: k.melhorDia ? formatarData(k.melhorDia.dia) : undefined,
    },
    {
      rotulo: "Maior sequência de dias com perda",
      info: "sequenciaDiasNegativos",
      valor: formatarNumero(k.maiorSequenciaDiasNegativos),
      detalhe: `a maior de dias com ganho foi de ${formatarNumero(k.maiorSequenciaDiasPositivos)}`,
    },
    ...(k.drawdownMaximoPct !== null && capitalReferencia && k.drawdown.valor > 0
      ? [
          {
            rotulo: "Maior queda, em % do capital",
            info: "drawdownPct" as const,
            valor: formatarPct(k.drawdownMaximoPct),
            detalhe: `${formatarBRL(-k.drawdown.valor, { inteiro: true, sinal: true })} sobre o capital de referência de ${formatarBRL(capitalReferencia, { inteiro: true })}`,
          },
        ]
      : []),
  ];

  return <ListaKpi itens={itens} className={className} />;
}
