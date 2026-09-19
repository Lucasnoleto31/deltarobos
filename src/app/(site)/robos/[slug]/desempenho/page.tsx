import type { Metadata } from "next";
import { Suspense } from "react";
import { empacotar, soLinhaDiaria } from "@/components/compartilhados/ops-codec";
import { SkeletonCurva, SkeletonKpis } from "@/components/compartilhados/Skeletons";
import { PainelDesempenho } from "@/components/desempenho/PainelDesempenho";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Desempenho` : "Desempenho" };
}

/** Aba Desempenho: todas as métricas da spec §7 com filtros compartilhados. */
export default async function PaginaDesempenho({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  // 19/09/2026: feriados, margem e fator de segurança saíram com a seção de risco (está na aba Risco)
  const [robo, linhas, ops] = await Promise.all([buscarRobo(slug), listarEstatisticas(slug), listarOperacoesCompactas(slug)]);
  if (!robo) return null;

  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <SkeletonKpis quantidade={4} />
          <SkeletonCurva />
        </div>
      }
    >
      <PainelDesempenho
        slug={slug}
        linhas={soLinhaDiaria(linhas)}
        pacote={empacotar(ops)}
        hoje={hoje}
        valorPonto={robo.valor_ponto_brl}
        capitalReferencia={robo.capital_referencia}
      />
    </Suspense>
  );
}
