import { ImageResponse } from "next/og";
import { ACENTO, FUNDO, MUDO, TEXTO, corDoResultado as cor } from "@/components/card/cores";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { listarEstatisticas, listarRobos, resumoCasaHoje } from "@/lib/consultas/publico";
import { formatarBRL, formatarDataLonga, formatarHora } from "@/lib/formato";
import { hojeSP } from "@/lib/stats/periodos";
import { valorDia } from "@/lib/stats/serie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// as cores (tokens do tema escuro, a imagem não lê CSS) moram em components/card/cores desde 24/09/2026,
// junto com as da imagem do dia; o comportamento é o mesmo de antes

function brl(v: number): string {
  return formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
}

/**
 * O último pregão com operação, robô a robô, somado por contrato (mesma conta da home).
 * Só é buscado quando o dia de hoje está vazio, para a imagem não ficar de graça no fim de semana.
 */
async function ultimoPregaoDeTodos(hoje: string) {
  const [robos, estatisticas] = await Promise.all([listarRobos(), listarEstatisticas()]);
  const porRobo = new Map(robos.filter((r) => r.status !== "arquivado").map((r) => [r.slug, r]));

  let dia: string | null = null;
  for (const e of estatisticas) {
    if (porRobo.has(e.slug) && e.dia <= hoje && e.n_operacoes > 0 && (dia === null || e.dia > dia)) dia = e.dia;
  }
  if (dia === null) return null;

  const doDia = estatisticas.filter((e) => e.dia === dia && porRobo.has(e.slug));
  const lista = doDia
    .map((e) => {
      const robo = porRobo.get(e.slug)!;
      const o = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
      return { slug: e.slug, nome: robo.nome, valor: valorDia(e, o) };
    })
    .sort((a, b) => b.valor - a.valor);

  return { dia, robos: lista, total: lista.reduce((s, r) => s + r.valor, 0) };
}

/** Imagem OG da home: resultado do dia de todos os robôs. */
export async function GET() {
  const hoje = hojeSP();
  const resumo = await resumoCasaHoje();
  const vivos = (resumo?.robos ?? [])
    .filter((r) => r.status === "ativo" || r.n_operacoes > 0)
    .sort((a, b) => b.resultado_liquido_por_contrato - a.resultado_liquido_por_contrato)
    .map((r) => ({ slug: r.slug, nome: r.nome, valor: r.resultado_liquido_por_contrato }));

  // Sem operação hoje (fim de semana, feriado, antes da abertura) a imagem mostra o último pregão com a
  // data, como a home desde 19/09/2026: um "R$ 0,00" compartilhado no sábado não diz nada.
  const passado = (resumo?.n_operacoes ?? 0) > 0 ? null : await ultimoPregaoDeTodos(hoje);
  const robos = (passado ? passado.robos : vivos).slice(0, 4);
  const total = passado ? passado.total : (resumo?.resultado_liquido_por_contrato ?? 0);
  const rotulo = passado
    ? "Último pregão, todos os robôs, por contrato"
    : "Resultado de hoje, todos os robôs, por contrato";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: FUNDO,
          color: TEXTO,
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width={44} height={43} viewBox={SIMBOLO_VIEWBOX}>
              {SIMBOLO_CAMINHOS.map((d, i) => (
                <path key={i} d={d} fill={ACENTO} />
              ))}
            </svg>
            <span style={{ display: "flex", gap: 8, fontSize: 28, fontWeight: 600 }}>
              <span>Quants</span>
              <span style={{ color: MUDO }}>Robôs</span>
            </span>
          </div>
          <span style={{ fontSize: 22, color: MUDO }}>{formatarDataLonga(passado ? passado.dia : hoje)}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 30, color: MUDO }}>{rotulo}</span>
          <span style={{ fontSize: 96, fontWeight: 700, color: cor(total), letterSpacing: -2 }}>
            {robos.length > 0 ? brl(total) : "Em breve"}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 48 }}>
            {robos.map((r) => (
              <div key={r.slug} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 22, color: MUDO }}>{r.nome}</span>
                <span style={{ fontSize: 40, fontWeight: 700, color: cor(r.valor) }}>
                  {brl(r.valor)}
                </span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 20, color: MUDO }}>
            {passado ? "direto do MetaTrader 5" : `ao vivo do MT5 · ${formatarHora(new Date())}`}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    },
  );
}
