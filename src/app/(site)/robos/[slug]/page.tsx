import Link from "next/link";
import { Faq } from "@/components/compartilhados/Faq";
import { seriePorDia, seriePorOperacao } from "@/components/graficos/series-da-curva";
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
import { dia as diaDaOperacao } from "@/lib/stats/operacoes";
import { hojeSP } from "@/lib/stats/periodos";

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
  // cada período é montada aqui, já reduzida aos 240 pontos do desenho, e só eles seguem.
  const opcoesDaCurva = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
  const pontosPorOperacao = Object.fromEntries(
    PERIODOS_FECHADOS.map((periodo) => {
      const inicio = inicioDoPeriodo(periodo, hoje);
      const opsDoPeriodo = ops.filter((op) => diaDaOperacao(op) <= hoje && (inicio === null || diaDaOperacao(op) >= inicio));
      const dias = seriePorDia(noPeriodo(linhas, periodo, hoje), opcoesDaCurva).dias;
      return [periodo, seriePorOperacao(opsDoPeriodo, opcoesDaCurva, dias)];
    }),
  ) as Record<PeriodoFechado, ReturnType<typeof seriePorOperacao>>;

  const emBreve = robo.status === "em_breve";
  // Num dia de muitas operações, as últimas 20 são todas de hoje, e a seção só repetiria o painel
  // "Hoje ao vivo" logo acima. Ela aparece quando traz alguma coisa de outro dia (17/09/2026).
  const ultimasSoDeHoje = ultimas.length > 0 && ultimas.every((o) => o.dia_pregao === hoje);

  return (
    <div className="space-y-10">
      {emBreve ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          Este robô ainda não começou a operar em conta real.
        </p>
      ) : (
        <>
          <PainelResultado
            linhas={linhas}
            pontosPorOperacao={pontosPorOperacao}
            valorPonto={robo.valor_ponto_brl}
            capitalReferencia={robo.capital_referencia}
          />

          <section aria-labelledby="kpis" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="kpis" className="text-lg font-semibold tracking-tight">
                Resumo desde o início
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

      <section aria-labelledby="faq" className="painel-grupo">
        <div className="painel-cabeca">
          <h2 id="faq" className="painel-titulo">
            Perguntas frequentes
          </h2>
          <div className="painel-acao">
            <Link href="/metodologia" className="underline-offset-4 hover:text-foreground hover:underline">
              Metodologia completa
            </Link>
          </div>
        </div>
        <Faq />
      </section>

      <Disclaimer
        nomeRobo={robo.nome}
        texto={parametros.textos.disclaimer}
        linkCta={parametros.links.whatsapp}
      />
    </div>
  );
}
