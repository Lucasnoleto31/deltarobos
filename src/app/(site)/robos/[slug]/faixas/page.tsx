import type { Metadata } from "next";
import { PainelFaixas } from "@/components/faixas/PainelFaixas";
import { calcularPorPeriodo } from "@/components/robo/ops-por-periodo";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, carregarParametros } from "@/lib/consultas/publico";
import { validarFaixas } from "@/lib/stats/faixas";
import { hojeSP } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Faixas` : "Faixas" };
}

/** Aba Faixas: validação por dia da semana × hora de entrada, com os parâmetros do banco. */
export default async function PaginaFaixas({ params }: Props) {
  const { slug } = await params;
  const [robo, ops, parametros] = await Promise.all([buscarRobo(slug), listarOperacoesCompactas(slug), carregarParametros()]);
  if (!robo) return null;
  // 18/09/2026: a validação dos três períodos sai pronta daqui; as ~15 mil operações (~700 KB
  // no HTML) não vão mais ao navegador só para o painel refazer a conta a cada troca de período
  const resultados = calcularPorPeriodo(ops, hojeSP(), (opsP) => validarFaixas(opsP, parametros.faixas));
  return <PainelFaixas resultados={resultados} />;
}
