import type { Metadata } from "next";
import { PainelCalendario } from "@/components/calendario/PainelCalendario";
import { empacotar, soLinhaDiaria } from "@/components/compartilhados/ops-codec";
import { listarOperacoesCompactas } from "@/lib/consultas/operacoes";
import { buscarRobo, listarEstatisticas, listarExposicaoDia, listarFeriados, listarMercado } from "@/lib/consultas/publico";
import { hojeSP } from "@/lib/stats/periodos";
import { horarioDaJanela } from "@/lib/stats/saldo-dia";

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
  const [robo, linhas, ops, feriados, exposicao, mercado] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarOperacoesCompactas(slug),
    listarFeriados(),
    // MEP/MEN por dia medidos pelo EA 1.1.0 (22/09/2026): uma linha por dia com medição, já sem robo_id
    listarExposicaoDia(slug),
    // o pregão do ativo dimensiona o eixo do tempo da série do saldo do dia quando o robô não tem horário (23/09/2026)
    listarMercado(),
  ]);
  if (!robo) return null;
  const m = mercado.find((x) => x.prefixo_simbolo === robo.ativo);
  const horario = horarioDaJanela(robo, m ? { inicio: m.pregao_inicio, fim: m.pregao_fim } : { inicio: "09:00", fim: "18:00" });

  return (
    <PainelCalendario
      linhas={soLinhaDiaria(linhas)}
      pacote={empacotar(ops)}
      exposicao={exposicao}
      feriados={feriados}
      hoje={hoje}
      valorPonto={robo.valor_ponto_brl}
      custoPorContrato={robo.custo_por_contrato}
      capitalReferencia={robo.capital_referencia}
      slug={robo.slug}
      nomeRobo={robo.nome}
      contaDemo={robo.conta_tipo === "demo"}
      temColetor={robo.tem_coletor}
      horario={horario}
    />
  );
}
