import type { Metadata } from "next";
import { Suspense } from "react";
import { SkeletonCurva, SkeletonKpis } from "@/components/compartilhados/Skeletons";
import { PainelDesempenho } from "@/components/desempenho/PainelDesempenho";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import {
  buscarRobo,
  carregarParametros,
  listarEstatisticas,
  listarFeriados,
  listarMercado,
} from "@/lib/consultas/publico";
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
  const [robo, linhas, ops, feriados, mercado, parametros] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarOperacoesCompactas(slug),
    listarFeriados(),
    listarMercado(),
    carregarParametros(),
  ]);
  if (!robo) return null;

  const margem = mercado.find((m) => m.prefixo_simbolo === robo.ativo)?.margem_referencia ?? null;

  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <SkeletonKpis quantidade={6} />
          <SkeletonCurva />
        </div>
      }
    >
      <PainelDesempenho
        slug={slug}
        linhas={linhas}
        ops={ops}
        feriados={feriados}
        hoje={hoje}
        valorPonto={robo.valor_ponto_brl}
        capitalReferencia={robo.capital_referencia}
        margem={margem}
        fatorSeguranca={parametros.fatorSeguranca}
      />
    </Suspense>
  );
}
