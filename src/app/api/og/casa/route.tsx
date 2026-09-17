import { ImageResponse } from "next/og";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { resumoCasaHoje } from "@/lib/consultas/publico";
import { formatarBRL, formatarDataLonga, formatarHora } from "@/lib/formato";
import { hojeSP } from "@/lib/stats/periodos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// as mesmas cores dos tokens do tema escuro (globals.css): a imagem não lê CSS
const FUNDO = "#0a0a0b";
const TEXTO = "#f8f5ef";
const MUDO = "#aca496";
const DOURADO = "#c39a5a";

function cor(v: number): string {
  return v > 0 ? "#53b86f" : v < 0 ? "#e8594b" : MUDO;
}

function brl(v: number): string {
  return formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
}

/** Imagem OG da home: resultado do dia da casa e os robôs. */
export async function GET() {
  const hoje = hojeSP();
  const resumo = await resumoCasaHoje();
  const robos = (resumo?.robos ?? [])
    .filter((r) => r.status === "ativo" || r.n_operacoes > 0)
    .sort((a, b) => b.resultado_liquido_por_contrato - a.resultado_liquido_por_contrato)
    .slice(0, 4);
  const total = resumo?.resultado_liquido_por_contrato ?? 0;

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
            <svg width={40} height={45} viewBox={SIMBOLO_VIEWBOX}>
              {SIMBOLO_CAMINHOS.map((d, i) => (
                <path key={i} d={d} fill={DOURADO} />
              ))}
            </svg>
            <span style={{ fontSize: 28, fontWeight: 600 }}>Delta Robôs</span>
          </div>
          <span style={{ fontSize: 22, color: MUDO }}>{formatarDataLonga(hoje)}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 30, color: MUDO }}>Resultado de hoje da casa, por contrato</span>
          <span style={{ fontSize: 96, fontWeight: 700, color: cor(total), letterSpacing: -2 }}>
            {robos.length > 0 ? brl(total) : "Em breve"}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 48 }}>
            {robos.map((r) => (
              <div key={r.slug} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 22, color: MUDO }}>{r.nome}</span>
                <span style={{ fontSize: 40, fontWeight: 700, color: cor(r.resultado_liquido_por_contrato) }}>
                  {brl(r.resultado_liquido_por_contrato)}
                </span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 20, color: MUDO }}>ao vivo do MT5 · {formatarHora(new Date())}</span>
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
