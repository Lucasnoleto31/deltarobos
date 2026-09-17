import type { Metadata } from "next";
import Link from "next/link";
import { Valor } from "@/components/compartilhados/Valor";
import { CardsKpi, type ItemKpi } from "@/components/desempenho/CardsKpi";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { listarEstatisticas, listarRobos } from "@/lib/consultas/publico";
import { formatarBRL, formatarData, formatarMultiplo, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import { hojeSP } from "@/lib/stats/periodos";
import { riscoDeRuina } from "@/lib/stats/risco";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import type { EstatisticaPublica } from "@/lib/tipos";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Comparativo",
  description: "Todos os robôs da Delta Robôs lado a lado: resultado, acerto, drawdown máximo e risco de ruína, por contrato.",
};

const OPCOES: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 1 };

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

/** Página da casa: todos os robôs lado a lado e a curva somada (1 contrato de cada). */
export default async function PaginaComparativo() {
  const hoje = hojeSP();
  const [robos, estatisticas] = await Promise.all([listarRobos(), listarEstatisticas()]);

  const porRobo = new Map<string, EstatisticaPublica[]>();
  for (const e of estatisticas) {
    const lista = porRobo.get(e.slug) ?? [];
    lista.push(e);
    porRobo.set(e.slug, lista);
  }

  const linhasRobos = robos
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
    .sort((a, b) => b.k.acumulado - a.k.acumulado);

  const comDados = linhasRobos.filter((x) => x.linhas.length > 0);
  const casa = somarSeries(comDados.map((x) => x.linhas));
  const kCasa = calcularKpis(casa, OPCOES, { hoje });

  const tiles: ItemKpi[] = [
    { rotulo: "Resultado da casa", valor: <Valor valor={kCasa.acumulado} inteiro={Math.abs(kCasa.acumulado) >= 1000} />, detalhe: "1 contrato de cada robô, líquido", tom: kCasa.acumulado >= 0 ? "positivo" : "negativo" },
    { rotulo: "Mês", valor: <Valor valor={kCasa.mes} inteiro={Math.abs(kCasa.mes) >= 1000} />, tom: "neutro" },
    { rotulo: "Operações", valor: formatarNumero(kCasa.nOperacoes), detalhe: `${comDados.length} ${comDados.length === 1 ? "robô" : "robôs"} com dados`, tom: "info" },
    { rotulo: "Acerto", valor: formatarPct(kCasa.taxaAcerto), tom: "neutro" },
    { rotulo: "Drawdown máximo", valor: <Valor valor={-kCasa.drawdown.valor} inteiro={kCasa.drawdown.valor >= 1000} />, detalhe: "carteira somada", tom: "negativo" },
    { rotulo: "Dias de pregão", valor: formatarNumero(kCasa.nDias), tom: "neutro" },
  ];

  return (
    <div className="conteudo space-y-8 py-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Comparativo dos robôs</h1>
        <p className="text-muted-foreground">Todos lado a lado, por 1 contrato e líquido de custos. Clique no nome pra abrir o robô.</p>
      </header>

      {comDados.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Ainda não há robô com operações fechadas.</p>
      ) : (
        <>
          <CardsKpi itens={tiles} />

          <section className="overflow-x-auto painel">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Risco por robô</h2>
              <p className="text-xs text-muted-foreground">comparativo de resultado e drawdown desde o início de cada um</p>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th>Robô</th>
                  <th className="text-right">Operações</th>
                  <th className="text-right">Resultado</th>
                  <th className="text-right">Acerto</th>
                  <th className="text-right">Fator de lucro</th>
                  <th className="text-right">Drawdown %</th>
                  <th className="text-right">Drawdown R$</th>
                  <th className="text-right">Risco de ruína</th>
                  <th className="text-right">Desde</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t">
                {linhasRobos.map(({ robo, k, ruina }) => (
                  <tr key={robo.slug} className="tabular-nums [&>td]:px-3 [&>td]:py-2.5">
                    <td>
                      <Link href={`/robos/${robo.slug}`} className="font-medium hover:underline">
                        {robo.nome}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{robo.ativo}</span>
                      {robo.status === "em_breve" ? <span className="ml-2 text-xs text-muted-foreground">em breve</span> : null}
                    </td>
                    <td className="text-right">{formatarNumero(k.nOperacoes)}</td>
                    <td className="text-right">
                      <Valor valor={k.acumulado} inteiro={Math.abs(k.acumulado) >= 1000} className="font-semibold" />
                    </td>
                    <td className="text-right">{formatarPct(k.taxaAcerto)}</td>
                    <td className="text-right">{formatarMultiplo(k.fatorLucro)}</td>
                    <td className="text-right text-negativo">{k.drawdownMaximoPct !== null ? formatarPct(k.drawdownMaximoPct, 1) : "–"}</td>
                    <td className="text-right">{k.drawdown.valor > 0 ? formatarBRL(k.drawdown.valor, { inteiro: k.drawdown.valor >= 1000 }) : "–"}</td>
                    <td className={`text-right ${ruina !== null && ruina >= 0.5 ? "text-negativo" : ruina !== null && ruina > 0.05 ? "text-alerta" : ""}`}>
                      {ruina === null ? "–" : formatarPct(ruina, 1)}
                    </td>
                    <td className="text-right text-muted-foreground">{robo.conta_real_desde ? formatarData(robo.conta_real_desde) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="painel p-4 sm:p-5">
            <h2 className="mb-1 font-semibold">Curva da casa</h2>
            <p className="mb-3 text-xs text-muted-foreground">soma dos resultados diários com 1 contrato de cada robô</p>
            <CurvaCapital linhas={casa} opcoes={OPCOES} />
          </section>
        </>
      )}
    </div>
  );
}
