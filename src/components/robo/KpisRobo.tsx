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
}

/** Os quatro números que se procura primeiro: cartão, rótulo, valor e uma linha de apoio. */
function CardKpi({
  rotulo,
  children,
  detalhe,
}: {
  rotulo: string;
  children: React.ReactNode;
  detalhe?: React.ReactNode;
}) {
  return (
    <div className="painel p-4">
      <p className="rotulo-metrica">{rotulo}</p>
      <p className="mt-2 text-xl leading-none font-semibold tracking-tight tabular-nums sm:text-2xl">{children}</p>
      {detalhe ? <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{detalhe}</p> : null}
    </div>
  );
}

/** Os outros oito, em lista agrupada: rótulo à esquerda, valor à direita, o apoio embaixo do rótulo. */
function LinhaKpi({
  rotulo,
  children,
  detalhe,
}: {
  rotulo: string;
  children: React.ReactNode;
  detalhe?: React.ReactNode;
}) {
  return (
    <div className="sep [--sep:16px] flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="min-w-0">
        <span className="block text-sm">{rotulo}</span>
        {detalhe ? <span className="block text-xs text-muted-foreground tabular-nums">{detalhe}</span> : null}
      </dt>
      <dd className="shrink-0 text-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * KPIs da visão geral (spec §8.2), em R$ líquido por 1 contrato, desde o início. Eram doze cartões
 * iguais, que no celular davam seis fileiras (812 px) sem hierarquia. Desde 17/09/2026: quatro
 * cartões e oito linhas. As fórmulas que vinham embaixo do número ("soma dos gains ÷ soma dos
 * losses") saíram: a definição de cada métrica está na metodologia. O drawdown segue as abas Desempenho
 * e Risco desde 19/09/2026: % do capital de referência no número e, embaixo, o R$ e o capital ("-R$ 34.599
 * sobre capital de R$ 35.000"; só o R$ fazia o 98,9% parecer a conta inteira). Sem capital, R$ no número.
 */
export function KpisRobo({ linhas, valorPonto, capitalReferencia, hoje }: Props) {
  const k = calcularKpis(
    linhas,
    { base: "liquido", unidade: "brl", valorPonto },
    { hoje, capitalReferencia },
  );

  if (k.nDias === 0) {
    return (
      <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">{VAZIO_DO_PERIODO.tudo}</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CardKpi rotulo="Acumulado" detalhe={`${formatarNumero(k.nDias)} ${k.nDias === 1 ? "dia" : "dias"} de pregão`}>
          <Valor valor={k.acumulado} inteiro={Math.abs(k.acumulado) >= 1000} />
        </CardKpi>
        <CardKpi rotulo="Mês atual">
          <Valor valor={k.mes} inteiro={Math.abs(k.mes) >= 1000} />
        </CardKpi>
        <CardKpi
          rotulo="Drawdown máximo"
          detalhe={
            k.drawdown.valor === 0
              ? undefined
              : k.drawdownMaximoPct !== null && capitalReferencia
                ? `${formatarBRL(-k.drawdown.valor, { inteiro: k.drawdown.valor >= 1000, sinal: true })} sobre capital de ${formatarBRL(capitalReferencia, { inteiro: true })}`
                : k.drawdown.fundo
                  ? `fundo em ${formatarData(k.drawdown.fundo)}`
                  : undefined
          }
        >
          {k.drawdown.valor === 0 ? (
            <span className="text-muted-foreground">nenhum</span>
          ) : k.drawdownMaximoPct !== null ? (
            formatarPct(k.drawdownMaximoPct)
          ) : (
            <Valor valor={-k.drawdown.valor} inteiro={k.drawdown.valor >= 1000} />
          )}
        </CardKpi>
        {/* número e rótulo presos (19/09/2026): no celular quebrava "2.420 / losses" */}
        <CardKpi
          rotulo="Taxa de acerto"
          detalhe={
            <>
              {formatarNumero(k.nGain)}&nbsp;gains · {formatarNumero(k.nLoss)}&nbsp;losses
            </>
          }
        >
          {formatarPct(k.taxaAcerto)}
        </CardKpi>
      </div>

      <dl className="painel grid overflow-hidden sm:grid-cols-2 sm:[&>div:nth-last-child(-n+2)]:after:hidden">
        <LinhaKpi rotulo="Média mensal" detalhe={`${formatarNumero(k.nMeses)} ${k.nMeses === 1 ? "mês" : "meses"}`}>
          <Valor valor={k.mediaMensal} inteiro={Math.abs(k.mediaMensal) >= 1000} />
        </LinhaKpi>
        <LinhaKpi rotulo="Operações" detalhe={`${formatarNumero(k.mediaOperacoesDia, 1)} por dia`}>
          {formatarNumero(k.nOperacoes)}
        </LinhaKpi>
        <LinhaKpi rotulo="Fator de lucro">{formatarMultiplo(k.fatorLucro)}</LinhaKpi>
        <LinhaKpi rotulo="Payoff">{formatarMultiplo(k.payoff)}</LinhaKpi>
        <LinhaKpi rotulo="Melhor dia" detalhe={k.melhorDia ? formatarData(k.melhorDia.dia) : undefined}>
          {k.melhorDia ? <Valor valor={k.melhorDia.valor} /> : "–"}
        </LinhaKpi>
        <LinhaKpi rotulo="Pior dia" detalhe={k.piorDia ? formatarData(k.piorDia.dia) : undefined}>
          {k.piorDia ? <Valor valor={k.piorDia.valor} /> : "–"}
        </LinhaKpi>
        {/* contagem de dias, não dinheiro: uma cor só (19/09/2026) */}
        <LinhaKpi rotulo="Dias positivos × negativos">
          {formatarNumero(k.diasPositivos)}
          <span className="text-muted-foreground"> × </span>
          {formatarNumero(k.diasNegativos)}
        </LinhaKpi>
        <LinhaKpi rotulo="Maior sequência de dias negativos" detalhe={`de positivos: ${formatarNumero(k.maiorSequenciaDiasPositivos)}`}>
          {formatarNumero(k.maiorSequenciaDiasNegativos)}
        </LinhaKpi>
      </dl>
    </div>
  );
}
