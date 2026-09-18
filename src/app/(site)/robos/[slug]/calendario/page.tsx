import type { Metadata } from "next";
import { PainelCalendario } from "@/components/calendario/PainelCalendario";
import { empacotar, soLinhaDiaria } from "@/components/compartilhados/ops-codec";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas, listarFeriados } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  return { title: robo ? `${robo.nome} · Calendário` : "Calendário" };
}

/** Aba Calendário: resultado por pregão, detalhe por horário e padrões por dia, mês e ano. */
export default async function PaginaCalendario({ params }: Props) {
  const { slug } = await params;
  const hoje = hojeSP();
  const [robo, linhas, ops, feriados] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarOperacoesCompactas(slug),
    listarFeriados(),
  ]);
  if (!robo) return null;

  return (
    <PainelCalendario
      linhas={soLinhaDiaria(linhas)}
      pacote={empacotar(ops)}
      feriados={feriados}
      hoje={hoje}
      valorPonto={robo.valor_ponto_brl}
      capitalReferencia={robo.capital_referencia}
    />
  );
}
