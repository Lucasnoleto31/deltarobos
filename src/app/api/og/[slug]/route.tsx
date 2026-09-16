import { ImageResponse } from "next/og";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { formatarBRL, formatarHora, formatarNumero, formatarPct } from "@/lib/formato";
import { calcularKpis } from "@/lib/stats/kpis";
import { hojeSP } from "@/lib/stats/periodos";
import { resumirCardRobo } from "@/lib/stats/resumo-robo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// as mesmas cores dos tokens do tema escuro (globals.css): a imagem não lê CSS
const FUNDO = "#00162e";
const TEXTO = "#f8f5ef";
const MUDO = "#aca496";
const DOURADO = "#c39a5a";

function cor(v: number): string {
  return v > 0 ? "#53b86f" : v < 0 ? "#e8594b" : MUDO;
}

function brl(v: number): string {
  return formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
}

/** Imagem OG do robô com o resultado do dia (spec §8.8). Cache de 60s. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) return new Response("robô não encontrado", { status: 404 });

  const hoje = hojeSP();
  const linhas = await listarEstatisticas(slug);
  const opcoes = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
  const r = resumirCardRobo(linhas, opcoes, hoje);
  const k = calcularKpis(linhas, opcoes, { hoje, capitalReferencia: robo.capital_referencia });
  const emBreve = robo.status === "em_breve";

  const Stat = ({ rotulo, valor, tom }: { rotulo: string; valor: string; tom: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 22, color: MUDO }}>{rotulo}</span>
      <span style={{ fontSize: 44, fontWeight: 700, color: tom }}>{valor}</span>
    </div>
  );

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
          <span style={{ fontSize: 22, color: MUDO }}>
            {robo.ativo_nome} · {robo.ativo}
            {robo.conta_tipo === "demo" ? " · conta demo" : ""}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 30, color: MUDO }}>{emBreve ? "Em breve" : "Resultado de hoje, por contrato"}</span>
          <span style={{ fontSize: 96, fontWeight: 700, color: emBreve ? MUDO : cor(r.hoje), letterSpacing: -2 }}>
            {emBreve ? robo.nome : brl(r.hoje)}
          </span>
          {emBreve ? null : <span style={{ fontSize: 34, fontWeight: 600 }}>{robo.nome}</span>}
        </div>

        {emBreve ? (
          <span style={{ fontSize: 24, color: MUDO }}>Estatísticas assim que a primeira operação fechar.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 56 }}>
              <Stat rotulo="Mês" valor={brl(r.mes)} tom={cor(r.mes)} />
              <Stat rotulo="Acumulado" valor={brl(r.acumulado)} tom={cor(r.acumulado)} />
              <Stat rotulo="Acerto" valor={formatarPct(k.taxaAcerto, 0)} tom={TEXTO} />
              <Stat rotulo="Operações" valor={formatarNumero(k.nOperacoes)} tom={TEXTO} />
            </div>
            <span style={{ fontSize: 20, color: MUDO }}>líquido de custos · {formatarHora(new Date())}</span>
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    },
  );
}
