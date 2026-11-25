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
  // o título é o nome que a aba tem na tela desde a ficha Mesa (25/11/2026)
  return { title: robo ? `${robo.nome} · Melhores horários` : "Melhores horários" };
}

/**
 * Aba "Melhores horários" (ficha Mesa, 25/11/2026): o melhor dia e horário em palavras, o mapa de dia da
 * semana por hora de entrada e a tabela dos dias e horários. A classificação vem de validarFaixas, com os
 * parâmetros do banco; o desenho é do PainelFaixas.
 */
export default async function PaginaFaixas({ params }: Props) {
  const { slug } = await params;
  const [robo, ops, parametros] = await Promise.all([buscarRobo(slug), listarOperacoesCompactas(slug), carregarParametros()]);
  if (!robo) return null;
  // 18/09/2026: a validação dos três períodos sai pronta daqui; as ~15 mil operações (~700 KB
  // no HTML) não vão mais ao navegador só para o painel refazer a conta a cada troca de período
  const resultados = calcularPorPeriodo(ops, hojeSP(), (opsP) => validarFaixas(opsP, parametros.faixas));
  return <PainelFaixas resultados={resultados} />;
}
