import Link from "next/link";
import { CurvaCapital } from "@/components/graficos/CurvaCapital";
import { Disclaimer } from "@/components/robo/Disclaimer";
import { KpisRobo } from "@/components/robo/KpisRobo";
import { PainelHoje } from "@/components/robo/PainelHoje";
import { Transparencia } from "@/components/robo/Transparencia";
import { UltimasOperacoes } from "@/components/robo/UltimasOperacoes";
import { buttonVariants } from "@/components/ui/button";
import {
  buscarRobo,
  carregarParametros,
  listarEstatisticas,
  listarUltimasOperacoes,
} from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

/** Aba "Visão geral": hoje ao vivo, resumo desde o início, curva e últimas operações. */
export default async function PaginaRobo({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, linhas, ultimas, parametros] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarUltimasOperacoes(slug, 20),
    carregarParametros(),
  ]);
  if (!robo) return null; // o layout já tratou o 404

  const emBreve = robo.status === "em_breve";

  return (
    <div className="space-y-10">
      {emBreve ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          Este robô ainda não começou a operar em conta real. As estatísticas aparecem aqui assim
          que a primeira operação fechar.
        </p>
      ) : (
        <>
          <PainelHoje />

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

          <section aria-labelledby="curva" className="space-y-3">
            <h2 id="curva" className="text-lg font-semibold tracking-tight">
              Curva de capital
            </h2>
            <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
              <CurvaCapital
                linhas={linhas}
                opcoes={{ base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl }}
              />
            </div>
          </section>

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
        </>
      )}

      <Transparencia robo={robo} />
      <Disclaimer
        nomeRobo={robo.nome}
        texto={parametros.textos.disclaimer}
        linkCta={parametros.links.whatsapp}
      />
    </div>
  );
}
