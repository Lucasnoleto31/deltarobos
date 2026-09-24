import { ImageResponse } from "next/og";
import { CardDoDia } from "@/components/card/CardDoDia";
import { comMarcaAtual } from "@/components/compartilhados/marca";
import { DIMENSOES_CARD, formatoDoParametro } from "@/components/compartilhar/url-do-card";
import {
  buscarRobo,
  carregarParametros,
  listarExposicaoDia,
  listarMercado,
  listarOperacoesDoDia,
  listarSaldoDoDia,
} from "@/lib/consultas/publico";
import { montarCardDoDia, type DadosCardDoDia } from "@/lib/stats/card-do-dia";
import { ehDia, hojeSP } from "@/lib/stats/periodos";
import type { HorarioPregao } from "@/lib/stats/pregao";

export const runtime = "nodejs";
// sem revalidate do Next: o cache muda por dia (hoje curto, dia passado longo) e vai nos headers
export const dynamic = "force-dynamic";

/** o pregão quando o ativo não está em mercado_publico (o mesmo padrão das telas) */
const PREGAO_PADRAO: HorarioPregao = { inicio: "09:00", fim: "18:00" };

/**
 * GET /api/og/[slug]/[dia] — a imagem do dia para compartilhar (24/09/2026, pedido do Lucas: "uma imagem pronta ao
 * fim de cada pregão ... é o que alimenta a live, o WhatsApp e o Instagram sem montar nada na mão"). PNG com a
 * marca, o robô, a data, o resultado líquido por contrato, operações, acerto, MEP, MEN e a curva real do dia (a
 * mesma do Hoje ao vivo), em ?formato=quadrado (1080×1080, o padrão) ou ?formato=story (1080×1920). Qualquer outro
 * parâmetro, como o v= que o botão põe para a prévia de hoje não vir velha, é ignorado aqui.
 *
 * Respostas: 400 dia inválido ou futuro; 404 robô desconhecido ou dia sem operação pública; 503 sem cache (e
 * Retry-After) quando o banco falha, como a rota do saldo: as consultas normalmente engolem o erro e devolvem lista
 * vazia, o que aqui viraria um 404 ou uma imagem errada guardada no CDN. Por isso todo dado é buscado ANTES do
 * ImageResponse: um erro dentro do stream já sairia com status 200.
 *
 * Cache: hoje, 60 s no CDN e nada no navegador (o dia ainda muda; o botão troca o v= quando fecha operação ou
 * chega dado novo); dia passado não muda mais, então 1 dia no CDN, 1 h no navegador e uma semana de SWR.
 *
 * Só dados públicos, das views *_publico: nada de número de conta, magic, volume ou contratos.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; dia: string }> }): Promise<Response> {
  const { slug, dia } = await params;
  if (!ehDia(dia)) return new Response("dia inválido, use YYYY-MM-DD", { status: 400 });
  const agora = new Date();
  const hoje = hojeSP(agora);
  if (dia > hoje) return new Response("dia futuro", { status: 400 });

  const url = new URL(req.url);
  const formato = formatoDoParametro(url.searchParams.get("formato"));

  let dados: DadosCardDoDia | null;
  try {
    // buscarRobo dentro do try e com lancarErro, como na rota do saldo: o 404 é só para consulta que respondeu e não achou
    const robo = await buscarRobo(slug, { lancarErro: true });
    if (!robo) return new Response("robô não encontrado", { status: 404 });
    const [ops, saldo, exposicao, mercado, parametros] = await Promise.all([
      listarOperacoesDoDia(slug, dia, { lancarErro: true }),
      listarSaldoDoDia(slug, dia, { lancarErro: true }),
      listarExposicaoDia(slug, { dia, lancarErro: true }),
      listarMercado({ lancarErro: true }),
      // o texto legal não derruba a imagem: sem ele vale o texto padrão do código
      carregarParametros(),
    ]);
    if (ops.length === 0) return new Response("sem operação pública neste dia", { status: 404 });
    const m = mercado.find((x) => x.prefixo_simbolo === robo.ativo);
    const pregao: HorarioPregao = m ? { inicio: m.pregao_inicio, fim: m.pregao_fim } : PREGAO_PADRAO;
    dados = montarCardDoDia({
      robo,
      dia,
      agora,
      pregao,
      operacoes: ops,
      saldo: { baldes: saldo.baldes, aproximado: saldo.aproximado },
      exposicao: exposicao[0] ?? null,
      disclaimer: comMarcaAtual(parametros.textos.disclaimer),
      site: process.env.NEXT_PUBLIC_SITE_URL || url.origin,
    });
  } catch (e) {
    console.warn(`[card] ${slug}/${dia}: ${e instanceof Error ? e.message : String(e)}`);
    return new Response("dados indisponíveis no momento, tente de novo", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "5" },
    });
  }
  if (!dados) return new Response("sem operação pública neste dia", { status: 404 });

  const { largura, altura } = DIMENSOES_CARD[formato];
  // o ImageResponse faz headers.set com o que vem aqui: o valor substitui o cache padrão dele
  return new ImageResponse(<CardDoDia dados={dados} formato={formato} />, {
    width: largura,
    height: altura,
    headers: {
      "Cache-Control":
        dia === hoje ? "public, max-age=0, s-maxage=60, stale-while-revalidate=60" : "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
