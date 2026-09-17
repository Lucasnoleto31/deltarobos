import Link from "next/link";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarBRL, formatarData, formatarPct } from "@/lib/formato";
import type { Kpis } from "@/lib/stats/kpis";
import type { EpisodioDrawdown } from "@/lib/stats/risco";
import type { Unidade } from "@/lib/stats/tipos";
import { CardsKpi, type ItemKpi } from "./CardsKpi";

interface Props {
  kpis: Kpis;
  episodios: EpisodioDrawdown[];
  unidade: Unidade;
  contratos: number;
  capitalReferencia: number | null;
  margem: number | null;
  fatorSeguranca: number;
  /** drawdown máximo em R$ líquido por 1 contrato (base do capital mínimo) */
  drawdownBrlPorContrato: number;
}

/** Seção de risco: drawdown, tempo de recuperação, capital mínimo e episódios. */
export function Risco({
  kpis,
  episodios,
  unidade,
  contratos,
  capitalReferencia,
  margem,
  fatorSeguranca,
  drawdownBrlPorContrato,
}: Props) {
  const capitalMinimoPorContrato =
    margem !== null ? margem + drawdownBrlPorContrato * fatorSeguranca : null;

  const itens: ItemKpi[] = [
    {
      rotulo: "Drawdown máximo",
      valor: <Valor valor={-kpis.drawdown.valor} unidade={unidade} inteiro={kpis.drawdown.valor >= 1000} />,
      detalhe:
        kpis.drawdownMaximoPct !== null
          ? `${formatarPct(kpis.drawdownMaximoPct)} do capital de referência`
          : kpis.drawdown.fundo
            ? `fundo em ${formatarData(kpis.drawdown.fundo)}`
            : undefined,
      tom: kpis.drawdown.valor > 0 ? "negativo" : "neutro",
    },
    {
      rotulo: "Tempo de recuperação",
      valor:
        kpis.drawdown.valor === 0
          ? "–"
          : kpis.drawdown.diasAteRecuperar !== null
            ? `${kpis.drawdown.diasAteRecuperar} dias`
            : "em recuperação",
      detalhe:
        kpis.drawdown.inicio && kpis.drawdown.recuperacao
          ? `${formatarData(kpis.drawdown.inicio)} a ${formatarData(kpis.drawdown.recuperacao)}`
          : kpis.drawdown.inicio
            ? `desde ${formatarData(kpis.drawdown.inicio)}`
            : undefined,
      tom: kpis.drawdown.recuperacao || kpis.drawdown.valor === 0 ? "neutro" : "alerta",
    },
    {
      rotulo: `Capital mínimo · ${contratos} ${contratos === 1 ? "contrato" : "contratos"}`,
      valor:
        capitalMinimoPorContrato !== null
          ? formatarBRL(capitalMinimoPorContrato * contratos, { inteiro: true })
          : "–",
      detalhe:
        capitalMinimoPorContrato !== null
          ? `margem ${formatarBRL(margem ?? 0, { inteiro: true })} + drawdown × ${fatorSeguranca}`
          : "margem de referência não configurada",
      tom: capitalMinimoPorContrato !== null ? "info" : "alerta",
    },
    {
      rotulo: "Capital de referência",
      valor: capitalReferencia ? formatarBRL(capitalReferencia, { inteiro: true }) : "–",
      detalhe: capitalReferencia ? "por contrato, base do % de drawdown" : "não configurado",
      tom: "neutro",
    },
  ];

  return (
    <div className="space-y-4">
      <CardsKpi itens={itens} className="lg:grid-cols-4" />

      {episodios.length > 0 ? (
        <div className="overflow-x-auto painel">
          <table className="w-full text-sm">
            <caption className="px-3 py-2 text-left text-xs text-muted-foreground">
              Maiores drawdowns do período, do pico até voltar ao pico
            </caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                <th>Início</th>
                <th>Fundo</th>
                <th>Recuperação</th>
                <th className="text-right">Drawdown</th>
                <th className="text-right">Dias</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t">
              {episodios.map((e) => (
                <tr key={`${e.inicio}-${e.fundo}`} className="tabular-nums [&>td]:px-3 [&>td]:py-2">
                  <td>{formatarData(e.inicio)}</td>
                  <td>{formatarData(e.fundo)}</td>
                  <td>{e.recuperacao ? formatarData(e.recuperacao) : <span className="text-alerta">em aberto</span>}</td>
                  <td className="text-right">
                    <Valor valor={-e.valor} unidade={unidade} inteiro={e.valor >= 1000} />
                  </td>
                  <td className="text-right">{e.diasAteRecuperar ?? `${e.diasAteFundo}+`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Como cada número é calculado está na{" "}
        <Link href="/metodologia#capital-minimo" className="underline underline-offset-4 hover:text-foreground">
          metodologia
        </Link>
        .
      </p>
    </div>
  );
}
