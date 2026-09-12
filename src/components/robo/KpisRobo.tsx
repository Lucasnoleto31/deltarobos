import { Valor } from "@/components/compartilhados/Valor";
import { formatarData, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import type { LinhaDiaria } from "@/lib/stats/tipos";

interface Props {
  linhas: LinhaDiaria[];
  valorPonto: number;
  capitalReferencia: number | null;
  hoje: string;
}

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
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{children}</p>
      {detalhe ? <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p> : null}
    </div>
  );
}

/** KPIs básicos da Fase 1 (spec §8.2), em R$ líquido por 1 contrato, desde o início. */
export function KpisRobo({ linhas, valorPonto, capitalReferencia, hoje }: Props) {
  const k = calcularKpis(
    linhas,
    { base: "liquido", unidade: "brl", valorPonto },
    { hoje, capitalReferencia },
  );

  if (k.nDias === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Ainda não há operações fechadas para calcular estatísticas.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <CardKpi rotulo="Acumulado" detalhe={`${k.nDias} dias de pregão`}>
        <Valor valor={k.acumulado} inteiro={Math.abs(k.acumulado) >= 1000} />
      </CardKpi>
      <CardKpi rotulo="Mês atual">
        <Valor valor={k.mes} inteiro={Math.abs(k.mes) >= 1000} />
      </CardKpi>
      <CardKpi rotulo="Média mensal" detalhe={`${k.nMeses} ${k.nMeses === 1 ? "mês" : "meses"}`}>
        <Valor valor={k.mediaMensal} inteiro={Math.abs(k.mediaMensal) >= 1000} />
      </CardKpi>
      <CardKpi
        rotulo="Drawdown máximo"
        detalhe={
          k.drawdownMaximoPct !== null
            ? `${formatarPct(k.drawdownMaximoPct)} do capital de referência`
            : k.drawdown.fundo
              ? `fundo em ${formatarData(k.drawdown.fundo)}`
              : undefined
        }
      >
        <Valor valor={-k.drawdown.valor} inteiro={k.drawdown.valor >= 1000} />
      </CardKpi>
      <CardKpi rotulo="Taxa de acerto" detalhe={`${k.nGain} gain · ${k.nLoss} loss`}>
        {formatarPct(k.taxaAcerto)}
      </CardKpi>
      <CardKpi rotulo="Fator de lucro" detalhe="soma dos gains ÷ soma dos losses">
        {formatarMultiplo(k.fatorLucro)}
      </CardKpi>
      <CardKpi rotulo="Payoff" detalhe="gain médio ÷ loss médio">
        {formatarMultiplo(k.payoff)}
      </CardKpi>
      <CardKpi rotulo="Operações" detalhe={`${formatarNumero(k.mediaOperacoesDia, 1)} por dia`}>
        {formatarNumero(k.nOperacoes)}
      </CardKpi>
      <CardKpi rotulo="Melhor dia" detalhe={k.melhorDia ? formatarData(k.melhorDia.dia) : undefined}>
        {k.melhorDia ? <Valor valor={k.melhorDia.valor} /> : "–"}
      </CardKpi>
      <CardKpi rotulo="Pior dia" detalhe={k.piorDia ? formatarData(k.piorDia.dia) : undefined}>
        {k.piorDia ? <Valor valor={k.piorDia.valor} /> : "–"}
      </CardKpi>
      <CardKpi rotulo="Dias positivos × negativos">
        <span className="text-positivo">{k.diasPositivos}</span>
        <span className="text-muted-foreground"> × </span>
        <span className="text-negativo">{k.diasNegativos}</span>
      </CardKpi>
      <CardKpi rotulo="Maior sequência de dias negativos" detalhe={`positivos: ${k.maiorSequenciaDiasPositivos}`}>
        {k.maiorSequenciaDiasNegativos}
      </CardKpi>
    </div>
  );
}
