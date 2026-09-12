import { renderToBuffer } from "@react-pdf/renderer";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { ehMes, limitesDoMes, listarOperacoesDoMes } from "@/lib/consultas/relatorios";
import { formatarData, formatarHora } from "@/lib/formato";
import { RelatorioMensal } from "@/lib/relatorios/RelatorioMensal";
import { compactar, porDiaSemana, porHora, porSimbolo } from "@/lib/stats/operacoes";
import { hojeSP, mesDe } from "@/lib/stats/periodos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** O PDF lista até isso de operações; acima, o resumo fica e a lista completa vai no CSV. */
const LIMITE_OPERACOES_PDF = 1000;

/** GET /api/relatorios/[slug]/[mes]/pdf — relatório mensal em PDF gerado das operações públicas. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; mes: string }> }) {
  const { slug, mes } = await params;
  if (!ehMes(mes)) return new Response("mês inválido, use YYYY-MM", { status: 400 });

  const robo = await buscarRobo(slug);
  if (!robo) return new Response("robô não encontrado", { status: 404 });

  const [todas, ops] = await Promise.all([listarEstatisticas(slug), listarOperacoesDoMes(slug, mes)]);
  const linhas = todas.filter((l) => mesDe(l.dia) === mes);
  if (linhas.length === 0) return new Response("sem operações nesse mês", { status: 404 });

  const { ate } = limitesDoMes(mes);
  const agora = new Date();
  const compactas = ops.map(compactar);
  const opcoesOp = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
  const porDia = porDiaSemana(compactas, opcoesOp).filter((f) => f.n > 0);
  const porHoraF = porHora(compactas, opcoesOp).filter((f) => f.n > 0);
  const simbolos = porSimbolo(compactas, opcoesOp);
  const pdf = await renderToBuffer(
    <RelatorioMensal
      robo={robo}
      mes={mes}
      ultimoDia={ate}
      linhas={linhas}
      ops={ops.slice(0, LIMITE_OPERACOES_PDF)}
      totalOps={ops.length}
      porDia={porDia}
      porHora={porHoraF}
      porSimbolo={simbolos}
      geradoEm={`${formatarData(hojeSP(agora))} ${formatarHora(agora)}`}
    />,
  );

  const mesFechado = mes < mesDe(hojeSP(agora));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="delta-robos-${slug}-${mes}.pdf"`,
      "Cache-Control": mesFechado ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300",
    },
  });
}
