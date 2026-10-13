import { cn } from "cn";
import type { ChaveIndicador } from "@/components/compartilhados/glossario";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
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

/**
 * Os quatro números que se procura primeiro: cartão, rótulo (com o "o que é"), valor e uma linha de apoio.
 * O número é o protagonista do cartão (13/10/2026): maior a partir do lg, onde a grade tem quatro colunas, e
 * pintado pelo sinal (o Valor) ou pela `cor` quando chega como texto pronto (o drawdown em %).
 */
function CardKpi({
  rotulo,
  info,
  children,
  detalhe,
  cor,
}: {
  rotulo: string;
  info: ChaveIndicador;
  children: React.ReactNode;
  detalhe?: React.ReactNode;
  cor?: string;
}) {
  return (
    <div className="painel flex flex-col p-4">
      <p className="rotulo-metrica">
        <RotuloComInfo chave={info}>{rotulo}</RotuloComInfo>
      </p>
      <p className={cn("mt-2.5 text-xl leading-none font-semibold tracking-tight tabular-nums sm:text-2xl lg:text-[1.75rem]", cor)}>
        {children}
      </p>
      {detalhe ? <p className="mt-2 text-xs text-muted-foreground tabular-nums">{detalhe}</p> : null}
    </div>
  );
}

/** Os outros oito, em lista agrupada: rótulo à esquerda, valor à direita, o apoio embaixo do rótulo. */
function LinhaKpi({
  rotulo,
  info,
  children,
  detalhe,
}: {
  rotulo: string;
  info: ChaveIndicador;
  children: React.ReactNode;
  detalhe?: React.ReactNode;
}) {
  return (
    <div className="sep [--sep:16px] flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="min-w-0">
        <RotuloComInfo chave={info} className="block text-sm">
          {rotulo}
        </RotuloComInfo>
        {detalhe ? <span className="block text-xs text-muted-foreground tabular-nums">{detalhe}</span> : null}
      </dt>
      <dd className="shrink-0 text-right text-sm font-semibold whitespace-nowrap tabular-nums">{children}</dd>
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
 * Desde 19/09/2026 cada rótulo traz o i com o "o que é" do glossário, no lugar das fórmulas que saíram.
 * 13/10/2026 (mídia kit da Zeve, "mais cor, principalmente nos valores positivos e negativos"): o resultado
 * pinta pelo sinal em todo lugar, o drawdown é sempre perda (vermelho, também em %), e as contagens com regra
 * clara de lado (gains e losses, dias positivos e negativos) ganham o verde e o vermelho. Taxa de acerto,
 * fator de lucro, payoff e número de operações não têm sinal e ficam na cor do texto.
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
        <CardKpi rotulo="Acumulado" info="acumulado" detalhe={`${formatarNumero(k.nDias)} ${k.nDias === 1 ? "dia" : "dias"} de pregão`}>
          <Valor valor={k.acumulado} inteiro={Math.abs(k.acumulado) >= 1000} destaque />
        </CardKpi>
        <CardKpi rotulo="Mês atual" info="mesAtual">
          <Valor valor={k.mes} inteiro={Math.abs(k.mes) >= 1000} destaque />
        </CardKpi>
        <CardKpi
          rotulo="Drawdown máximo"
          // o número é o % do capital quando há capital; sem ele, o R$
          info={k.drawdownMaximoPct !== null ? "drawdownPct" : "drawdown"}
          // o % chega como texto: a cor vem do cartão (drawdown é sempre perda); o R$ se pinta sozinho
          cor={k.drawdown.valor !== 0 && k.drawdownMaximoPct !== null ? "text-negativo" : undefined}
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
            <Valor valor={-k.drawdown.valor} inteiro={k.drawdown.valor >= 1000} destaque />
          )}
        </CardKpi>
        {/* número e rótulo presos (19/09/2026): no celular quebrava "2.420 / losses" */}
        <CardKpi
          rotulo="Taxa de acerto"
          info="taxaAcerto"
          detalhe={
            <>
              <span className="text-positivo">{formatarNumero(k.nGain)}&nbsp;gains</span> ·{" "}
              <span className="text-negativo">{formatarNumero(k.nLoss)}&nbsp;losses</span>
            </>
          }
        >
          {formatarPct(k.taxaAcerto)}
        </CardKpi>
      </div>

      <dl className="painel grid overflow-hidden sm:grid-cols-2 sm:[&>div:nth-last-child(-n+2)]:after:hidden">
        <LinhaKpi rotulo="Média mensal" info="mediaMensal" detalhe={`${formatarNumero(k.nMeses)} ${k.nMeses === 1 ? "mês" : "meses"}`}>
          <Valor valor={k.mediaMensal} inteiro={Math.abs(k.mediaMensal) >= 1000} />
        </LinhaKpi>
        <LinhaKpi rotulo="Operações" info="operacoes" detalhe={`${formatarNumero(k.mediaOperacoesDia, 1)} por dia`}>
          {formatarNumero(k.nOperacoes)}
        </LinhaKpi>
        <LinhaKpi rotulo="Fator de lucro" info="fatorLucro">{formatarMultiplo(k.fatorLucro)}</LinhaKpi>
        <LinhaKpi rotulo="Payoff" info="payoff">{formatarMultiplo(k.payoff)}</LinhaKpi>
        <LinhaKpi rotulo="Melhor dia" info="melhorDia" detalhe={k.melhorDia ? formatarData(k.melhorDia.dia) : undefined}>
          {k.melhorDia ? <Valor valor={k.melhorDia.valor} /> : "–"}
        </LinhaKpi>
        <LinhaKpi rotulo="Pior dia" info="piorDia" detalhe={k.piorDia ? formatarData(k.piorDia.dia) : undefined}>
          {k.piorDia ? <Valor valor={k.piorDia.valor} /> : "–"}
        </LinhaKpi>
        {/* contagem de dias, não dinheiro: era uma cor só (19/09/2026); desde 13/10/2026 cada lado na cor dele */}
        <LinhaKpi rotulo="Dias positivos × negativos" info="diasPositivosNegativos">
          <span className="text-positivo">{formatarNumero(k.diasPositivos)}</span>
          <span className="text-muted-foreground"> × </span>
          <span className="text-negativo">{formatarNumero(k.diasNegativos)}</span>
        </LinhaKpi>
        <LinhaKpi rotulo="Maior sequência de dias negativos" info="sequenciaDiasNegativos" detalhe={`de positivos: ${formatarNumero(k.maiorSequenciaDiasPositivos)}`}>
          {formatarNumero(k.maiorSequenciaDiasNegativos)}
        </LinhaKpi>
      </dl>
    </div>
  );
}
