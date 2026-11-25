import { renderToBuffer } from "@react-pdf/renderer";
import { comMarcaAtual } from "@/components/compartilhados/marca";
import { capitalDoRobo } from "@/lib/consultas/capital";
import { buscarRobo, carregarParametros, listarEstatisticas, listarFeriados } from "@/lib/consultas/publico";
import { ehMes, listarOperacoesDoMes } from "@/lib/consultas/relatorios";
import { formatarData, formatarHora } from "@/lib/formato";
import { RelatorioMensal } from "@/lib/relatorios/RelatorioMensal";
import { enderecoCurto, fraseLegalCurta, resumirMes } from "@/lib/stats/card-do-dia";
import { hojeSP, mesDe } from "@/lib/stats/periodos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** O PDF lista até isso de operações; acima, o resumo fica e a lista completa vai na planilha (CSV). */
const LIMITE_OPERACOES_PDF = 1000;

/**
 * GET /api/relatorios/[slug]/[mes]/pdf — o relatório do mês em PDF, gerado das operações públicas.
 *
 * 25/11/2026: os números do mês saem de resumirMes (src/lib/stats/card-do-dia), com as regras das telas
 * (resultado com a maior queda de dentro do mês, acertos com o necessário para empatar), e o capital mínimo é o
 * das telas (capitalDoRobo). Aqui só se buscam os dados; quem desenha é o RelatorioMensal.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; mes: string }> }) {
  const { slug, mes } = await params;
  if (!ehMes(mes)) return new Response("mês inválido, use YYYY-MM", { status: 400 });

  const robo = await buscarRobo(slug);
  if (!robo) return new Response("robô não encontrado", { status: 404 });

  const agora = new Date();
  const hoje = hojeSP(agora);
  const [linhas, ops, feriados, parametros, capital] = await Promise.all([
    listarEstatisticas(slug),
    listarOperacoesDoMes(slug, mes),
    listarFeriados(),
    // o texto legal não derruba o relatório: sem ele vale a frase padrão do código
    carregarParametros(),
    // o capital mínimo também não: sem a conta, a seção não aparece
    capitalDoRobo(slug).catch(() => null),
  ]);
  const resumo = resumirMes({
    mes,
    linhas,
    hoje,
    feriados,
    // o histórico importado não tem hora de entrada: fica fora da duração
    duracoesSeg: ops.filter((o) => o.origem !== "manual").map((o) => o.duracao_seg),
  });
  if (resumo.dias.length === 0) return new Response("sem operações nesse mês", { status: 404 });

  const pdf = await renderToBuffer(
    <RelatorioMensal
      robo={robo}
      resumo={resumo}
      capital={capital}
      ops={ops.slice(0, LIMITE_OPERACOES_PDF)}
      totalOps={ops.length}
      geradoEm={`${formatarData(hoje)} ${formatarHora(agora)}`}
      site={enderecoCurto(process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin)}
      legal={fraseLegalCurta(comMarcaAtual(parametros.textos.disclaimer))}
    />,
  );

  const mesFechado = mes < mesDe(hoje);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="quants-robos-${slug}-${mes}.pdf"`,
      "Cache-Control": mesFechado ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300",
    },
  });
}
