import type { Metadata } from "next";
import { PainelRisco } from "@/components/risco/PainelRisco";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, carregarParametros, listarEstatisticas, listarMercado } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Risco` : "Risco" };
}

/** Aba Risco: queda máxima, Calmar, recovery factor, Ulcer, risco de ruína, curva de drawdown, quedas. */
export default async function PaginaRisco({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, linhas, ops, mercado, parametros] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarOperacoesCompactas(slug),
    listarMercado(),
    carregarParametros(),
  ]);
  if (!robo) return null;

  const margem = mercado.find((m) => m.prefixo_simbolo === robo.ativo)?.margem_referencia ?? null;

  return (
    <PainelRisco
      linhas={linhas}
      ops={ops}
      hoje={hoje}
      valorPonto={robo.valor_ponto_brl}
      capitalReferencia={robo.capital_referencia}
      margem={margem}
      fatorSeguranca={parametros.fatorSeguranca}
    />
  );
}
