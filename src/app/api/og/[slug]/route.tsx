import { ImageResponse } from "next/og";
import { formatarDiaCurto } from "@/components/home/datas";
import { ACENTO, ALERTA, FIO, FUNDO, MUDO, NEGATIVO, TEXTO, corDoResultado as cor, partesDoValor } from "@/components/card/cores";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { buscarRobo, listarEstatisticas } from "@/lib/consultas/publico";
import { formatarBRL, formatarHora } from "@/lib/formato";
import { comoOperou, tamanhoParaCaber, tempoDeHistorico } from "@/lib/stats/card-do-dia";
import { hojeSP } from "@/lib/stats/periodos";
import { resumirCardRobo } from "@/lib/stats/resumo-robo";
import { curvaAcumulada, drawdownMaximo, valorDia } from "@/lib/stats/serie";
import type { OpcoesSerie } from "@/lib/stats/tipos";
import type { EstatisticaPublica } from "@/lib/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// as cores (tokens do tema escuro, a imagem não lê CSS) moram em components/card/cores desde 24/09/2026,
// junto com as da imagem do dia; desde a ficha Mesa (25/11/2026) são as do sistema novo

/** a largura útil da imagem: 1200 menos 64 px de cada lado */
const LARGURA = 1072;
/** o vão entre os fatos da linha de baixo */
const VAO = 44;
/** os tamanhos do rótulo, do valor e da nota de cada fato, quando a linha cabe sem encolher */
const ROTULO = 22;
const VALOR = 36;
const NOTA = 20;

function brl(v: number): string {
  return formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });
}

/** Último dia com operação até hoje, somado (mesma conta da home). */
function ultimoPregao(
  linhas: readonly EstatisticaPublica[],
  o: OpcoesSerie,
  hoje: string,
): { dia: string; valor: number } | null {
  let dia: string | null = null;
  for (const l of linhas) {
    if (l.dia <= hoje && l.n_operacoes > 0 && (dia === null || l.dia > dia)) dia = l.dia;
  }
  if (dia === null) return null;
  const valor = linhas.filter((l) => l.dia === dia).reduce((s, l) => s + valorDia(l, o), 0);
  return { dia, valor };
}

interface FatoDaImagem {
  rotulo: string;
  valor: string;
  tom: string;
  /** a linha pequena debaixo do valor: o que o número precisa ter ao lado para não enganar */
  nota?: string;
}

/**
 * Imagem OG do robô com o resultado do dia (spec §8.8). Cache de 60s.
 *
 * Desde a ficha Mesa (25/11/2026) tem a composição das telas do sistema, sem caixa: a marca e o ativo em cima;
 * o nome do robô e de quando é o número; o número grande, com o sinal e o "R$" mais apagados e a premissa
 * embaixo; e, depois de um fio, os fatos numa linha.
 *
 * Revisão dos indicadores (25/11/2026, DESIGN.md seção 9): a imagem vai para quem nunca abriu o site, então
 * segue as regras das telas. A premissa diz "com 1 contrato por entrada". O resultado desde o início vem com o
 * tamanho do histórico ("em 9 meses") e com a maior queda ao lado, que diz se já recuperou. Os acertos vêm com
 * o necessário para empatar ("83 de cada 100" e, embaixo, "precisa de 81 para empatar"); sem ganho ou sem
 * perda para comparar, não aparecem. Saiu o total de operações, que não ajuda a decidir, e o código do ativo
 * ("WIN"), que fica só pelo nome.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const robo = await buscarRobo(slug);
  if (!robo) return new Response("robô não encontrado", { status: 404 });

  const hoje = hojeSP();
  const linhas = await listarEstatisticas(slug);
  const opcoes = { base: "liquido" as const, unidade: "brl" as const, valorPonto: robo.valor_ponto_brl };
  const ateHoje = linhas.filter((l) => l.dia <= hoje);
  const r = resumirCardRobo(linhas, opcoes, hoje);
  const queda = drawdownMaximo(curvaAcumulada(ateHoje, opcoes));
  const operou = comoOperou(ateHoje);
  const historico = tempoDeHistorico(ateHoje, hoje);
  const emBreve = robo.status === "em_breve";

  // Sem operação hoje (fim de semana, feriado, antes da abertura), a imagem mostra o último pregão com
  // a data, como a home desde 19/09/2026. Um "R$ 0,00" compartilhado no sábado não diz nada.
  const ultimo = ultimoPregao(linhas, opcoes, hoje);
  const passado = linhas.some((l) => l.dia === hoje && l.n_operacoes > 0) ? null : ultimo;
  const destaque = passado ? passado.valor : r.hoje;
  const quando = passado ? `último pregão · ${formatarDiaCurto(passado.dia)}` : `resultado de hoje · ${formatarHora(new Date())}`;
  const [prefixo, algarismos] = partesDoValor(brl(destaque));
  const negativo = destaque < 0;

  const nomeDoMes = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const mes = nomeDoMes.charAt(0).toUpperCase() + nomeDoMes.slice(1);

  const fatos: FatoDaImagem[] = [
    { rotulo: mes, valor: brl(r.mes), tom: cor(r.mes) },
    { rotulo: "Desde o início", valor: brl(r.acumulado), tom: cor(r.acumulado), nota: historico ? `em ${historico.texto}` : undefined },
    {
      rotulo: "Maior queda",
      valor: queda.valor > 0 ? brl(-queda.valor) : "nenhuma",
      tom: queda.valor > 0 ? NEGATIVO : MUDO,
      nota: queda.valor > 0 ? (queda.recuperacao ? "já recuperou" : "ainda não recuperou") : undefined,
    },
  ];
  // acertos nunca aparecem sem o necessário para empatar
  if (operou.acertos !== null && operou.paraEmpatar !== null) {
    fatos.push({
      rotulo: "Acertos",
      valor: `${Math.round(operou.acertos * 100)} de cada 100`,
      tom: TEXTO,
      nota: `precisa de ${Math.round(operou.paraEmpatar * 100)} para empatar`,
    });
  }

  // A linha de fatos numa linha só: cada fato tem a largura do texto mais largo dele (rótulo, valor ou nota), e
  // a soma, contada em caracteres do tamanho do valor, decide se os três tamanhos encolhem juntos (até 28 px).
  const emCaracteresDoValor = fatos.reduce((t, f) => t + Math.max(f.valor.length, (f.rotulo.length * ROTULO) / VALOR, ((f.nota?.length ?? 0) * NOTA) / VALOR), 0);
  const valorPx = tamanhoParaCaber("0".repeat(Math.ceil(emCaracteresDoValor)), LARGURA - VAO * (fatos.length - 1), VALOR, 28);
  const rotuloPx = Math.round((valorPx * ROTULO) / VALOR);
  const notaPx = Math.round((valorPx * NOTA) / VALOR);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
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
            <span style={{ display: "flex", gap: 8, fontSize: 28 }}>
              <span>Quants</span>
              <span style={{ color: MUDO }}>Robôs</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 22 }}>
            <span style={{ color: MUDO }}>{robo.ativo_nome || robo.ativo}</span>
            {robo.conta_tipo === "demo" ? <span style={{ color: ALERTA }}>Conta demo</span> : null}
          </div>
        </div>

        {/* o robô, de quando é o número e o número grande, como o do site: sinal e moeda mais apagados; negativo, vermelho inteiro */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
            <span style={{ fontSize: 44, lineHeight: 1.1 }}>{robo.nome}</span>
            <span style={{ fontSize: 28, lineHeight: 1.1, color: MUDO, paddingBottom: 4 }}>{emBreve ? "em breve" : quando}</span>
          </div>
          {emBreve ? null : (
            <div style={{ display: "flex", alignItems: "flex-end", marginTop: 18 }}>
              {prefixo ? (
                <span style={{ fontSize: 120, lineHeight: 1, letterSpacing: -4, marginRight: 20, color: negativo ? NEGATIVO : MUDO }}>{prefixo}</span>
              ) : null}
              <span style={{ fontSize: 120, lineHeight: 1, letterSpacing: -4, color: negativo ? NEGATIVO : TEXTO }}>{algarismos}</span>
            </div>
          )}
          <span style={{ fontSize: 24, color: MUDO, marginTop: 18 }}>
            {emBreve
              ? "Os números aparecem assim que a primeira operação fechar."
              : "com 1 contrato por entrada, já descontados os custos · direto do MetaTrader 5"}
          </span>
        </div>

        {emBreve ? null : (
          // os fatos, depois de um fio: cada um com o que precisa ter ao lado
          <div style={{ display: "flex", gap: VAO, marginTop: "auto", borderTop: `1px solid ${FIO}`, paddingTop: 24 }}>
            {fatos.map((f) => (
              <div key={f.rotulo} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: rotuloPx, lineHeight: 1.15, color: MUDO }}>{f.rotulo}</span>
                <span style={{ fontSize: valorPx, lineHeight: 1.15, color: f.tom, whiteSpace: "nowrap" }}>{f.valor}</span>
                {f.nota ? <span style={{ fontSize: notaPx, lineHeight: 1.15, color: MUDO, whiteSpace: "nowrap" }}>{f.nota}</span> : null}
              </div>
            ))}
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
