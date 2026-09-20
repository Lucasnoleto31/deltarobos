import Link from "next/link";
import { comMarcaAtual } from "@/components/compartilhados/marca";
import { seriePorDia, seriePorOperacaoCompacta, type SerieCompacta } from "@/components/graficos/series-da-curva";
import { Disclaimer } from "@/components/robo/Disclaimer";
import { KpisRobo } from "@/components/robo/KpisRobo";
import { PainelResultado } from "@/components/robo/PainelResultado";
import {
  PERIODOS_FECHADOS,
  inicioDoPeriodo,
  noPeriodo,
  type PeriodoFechado,
} from "@/components/robo/periodos-resumo";
import { Transparencia } from "@/components/robo/Transparencia";
import { UltimasOperacoes } from "@/components/robo/UltimasOperacoes";
import { buttonVariants } from "@/components/ui/button";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import {
  buscarRobo,
  carregarParametros,
  listarEstatisticas,
  listarUltimasOperacoes,
} from "@/lib/consultas/publico";
import { formatarData } from "@/lib/formato";
import { dia as diaDaOperacao } from "@/lib/stats/operacoes";
import { hojeSP } from "@/lib/stats/periodos";
import type { LinhaDiaria } from "@/lib/stats/tipos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

/** Aba "Visão geral": resultado por período (hoje ao vivo, semana, mês, ano, tudo), resumo e últimas operações. */
export default async function PaginaRobo({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, linhas, ultimas, parametros, ops] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarUltimasOperacoes(slug, 20),
    carregarParametros(),
    // a mesma consulta que a aba Desempenho já faz; aqui ela fica no servidor (ver abaixo)
    listarOperacoesCompactas(slug),
  ]);
  if (!robo) return null; // o layout já tratou o 404

  // Curva "por operação": as operações (dezenas de milhares) não vão para o navegador. A série de
  // cada período é montada aqui, já reduzida aos 240 pontos do desenho, e só os números deles seguem;
  // a dica é escrita no navegador (18/09/2026: com ela pronta, as quatro séries eram 54% do HTML).
  const opcoesDaCurva = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
  // Os períodos se encaixam (semana dentro do mês, do ano, de tudo) e todos terminam hoje: mesma contagem
  // de operações e de dias é o mesmo recorte. Aí vai o mesmo objeto, que o React serializa uma vez só
  // ("ano" e "tudo" enquanto o robô tiver começado no ano corrente).
  const jaMontadas = new Map<string, SerieCompacta>();
  const pontosPorOperacao = Object.fromEntries(
    PERIODOS_FECHADOS.map((periodo) => {
      const inicio = inicioDoPeriodo(periodo, hoje);
      const opsDoPeriodo = ops.filter((op) => diaDaOperacao(op) <= hoje && (inicio === null || diaDaOperacao(op) >= inicio));
      const dias = seriePorDia(noPeriodo(linhas, periodo, hoje), opcoesDaCurva).dias;
      const chave = `${opsDoPeriodo.length}:${dias.length}`;
      const serie = jaMontadas.get(chave) ?? seriePorOperacaoCompacta(opsDoPeriodo, opcoesDaCurva, dias);
      jaMontadas.set(chave, serie);
      return [periodo, serie];
    }),
  ) as Record<PeriodoFechado, SerieCompacta>;

  // O painel é client: vão só os campos da série diária, sem robo_id, slug e atualizado_em em cada linha.
  const linhasDoPainel = linhas.map(
    (l): LinhaDiaria => ({
      dia: l.dia,
      pontos_por_contrato: l.pontos_por_contrato,
      resultado_brl_por_contrato: l.resultado_brl_por_contrato,
      custos_brl_por_contrato: l.custos_brl_por_contrato,
      n_operacoes: l.n_operacoes,
      n_gain: l.n_gain,
      n_loss: l.n_loss,
      soma_gain_brl_por_contrato: l.soma_gain_brl_por_contrato,
      soma_loss_brl_por_contrato: l.soma_loss_brl_por_contrato,
      maior_gain_brl_por_contrato: l.maior_gain_brl_por_contrato,
      maior_loss_brl_por_contrato: l.maior_loss_brl_por_contrato,
    }),
  );

  // o título do resumo diz de quando é o número (19/09/2026): era "Resumo desde o início", o mesmo
  // texto do período "Tudo" logo acima
  const primeiroDia = linhas.reduce<string | null>((m, l) => (m === null || l.dia < m ? l.dia : m), null);

  const emBreve = robo.status === "em_breve";
  // Num dia de muitas operações, as últimas 20 são todas de hoje, e a seção só repetiria o painel
  // "Hoje ao vivo" logo acima. Ela aparece quando traz alguma coisa de outro dia (17/09/2026).
  const ultimasSoDeHoje = ultimas.length > 0 && ultimas.every((o) => o.dia_pregao === hoje);

  return (
    <div className="space-y-10">
      {emBreve ? (
        <p className="painel px-4 py-8 text-center text-sm text-muted-foreground">
          Este robô ainda não começou a operar em conta real.
        </p>
      ) : (
        <>
          <PainelResultado
            linhas={linhasDoPainel}
            pontosPorOperacao={pontosPorOperacao}
            valorPonto={robo.valor_ponto_brl}
            capitalReferencia={robo.capital_referencia}
          />

          <section aria-labelledby="kpis" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="kpis" className="text-lg font-semibold tracking-tight">
                {primeiroDia ? `Desde ${formatarData(primeiroDia)}` : "Resumo"}
              </h2>
              <Link
                href={`/robos/${slug}/desempenho`}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Ver desempenho completo
              </Link>
            </div>
            <KpisRobo
              linhas={linhas}
              valorPonto={robo.valor_ponto_brl}
              capitalReferencia={robo.capital_referencia}
              hoje={hoje}
            />
          </section>

          {ultimasSoDeHoje ? null : (
          <section aria-labelledby="ultimas" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ultimas" className="text-lg font-semibold tracking-tight">
                Últimas operações
              </h2>
              <Link
                href={`/robos/${slug}/operacoes`}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Lista completa
              </Link>
            </div>
            <UltimasOperacoes operacoes={ultimas} />
          </section>
          )}
        </>
      )}

      <Transparencia robo={robo} />

      <Disclaimer
        nomeRobo={robo.nome}
        texto={comMarcaAtual(parametros.textos.disclaimer)}
        linkCta={parametros.links.whatsapp}
      />
    </div>
  );
}
