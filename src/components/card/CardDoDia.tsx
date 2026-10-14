import type { CSSProperties } from "react";
import { ACENTO, COR_DO_TOM, FUNDO, MUDO, NEGATIVO, POSITIVO, TEXTO, ZERO } from "@/components/card/cores";
import type { FormatoCard } from "@/components/compartilhar/url-do-card";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { caminhosDaCurva, tamanhoParaCaber, type DadosCardDoDia, type NumeroDoCard } from "@/lib/stats/card-do-dia";

/*
 * A imagem do dia para compartilhar (24/09/2026, pedido do Lucas: "uma imagem pronta ao fim de cada pregão, com a
 * curva real do dia, resultado, MEP e MEN e o número de operações"), desenhada pelo ImageResponse (satori) na rota
 * /api/og/[slug]/[dia]. Só desenha: textos, números e caminhos da curva vêm prontos de montarCardDoDia e de
 * caminhosDaCurva (src/lib/stats/card-do-dia).
 *
 * Regras do satori que valem aqui: todo div com mais de um filho tem display flex; texto sempre como uma string
 * só (template string), nunca pedaços soltos; nada de <text> dentro do SVG (o resvg não tem fonte), por isso os
 * rótulos de hora são divs em posição absoluta; sem variáveis CSS; lineHeight explícito. A fonte é a padrão do
 * ImageResponse (Geist Regular, um peso só): fontWeight não faz efeito, a hierarquia vem do tamanho e da cor.
 *
 * Medidas prototipadas com o Apollo de 23/09/2026 e com o pior caso (nome "Alaska & Square", −R$ 12.345,67, 1.234
 * operações, MEP e MEN de 5 dígitos, parcial e demo juntos). O story deixa 200 px livres em cima e 260 px embaixo,
 * as zonas que a interface do Instagram cobre; por isso os selos vão para baixo da data, e não para o cabeçalho.
 *
 * Ajuste do render de verificação (24/09/2026): no quadrado, um MEP de 10 caracteres ("+R$ 344,00") ocupava 218 dos
 * 222 px da célula, e um valor um pouco mais largo quebraria em duas linhas. Os valores da linha de números não
 * quebram (nowrap) e têm um tamanho só, o maior que deixa os quatro caberem (tamanhoParaCaber, até 40 px, no mínimo
 * 30); os rótulos, idem (até 22 px, no mínimo 18). No caso comum nada muda: 40 e 22 px.
 *
 * Ajustes da revisão (24/09/2026), dentro dos 15% previstos no contrato:
 * - A frase legal é o único aviso de risco da peça que sai do site, e era o menor texto da imagem (18 px no quadrado,
 *   22 no story): no feed ou no WhatsApp, a uns 390 px de largura, virava 6,5 px. Agora tem o tamanho do rodapé
 *   (22 e 26 px), com 8 e 10 px de margem. Custa 6 px de altura; a folga medida era de 49 px no quadrado e 40 no
 *   story.
 * - O traço da curva tem um gradiente próprio (card-cor-linha) com uma faixa neutra (MUDO) da largura do traço, mais
 *   1 px de borda suavizada de cada lado, em volta do zero. Com o corte seco no zero, o saldo parado em zero (antes da primeira entrada, ou a origem da curva
 *   por fechamento) saía com a metade de cima verde e a de baixo vermelha, um sublinhado vermelho no começo de um
 *   dia positivo. Zero é neutro, como a bolinha do fim (tomDoValor). A área e a faixa continuam cortadas no zero.
 * - Rótulo do eixo preso a uma borda encosta o texto nela: na curva por fechamento o último rótulo nomeia a última
 *   operação, em x = 1, e centralizado na caixa ele ficava 28 px à esquerda do ponto.
 */

/** a largura útil nos dois formatos: 1080 menos 72 px de cada lado */
const LARGURA = 936;

const ALTURA_CURVA: Readonly<Record<FormatoCard, number>> = { quadrado: 280, story: 300 };

const MEDIDAS = {
  quadrado: {
    padding: "64px 72px",
    entreBlocos: 28,
    cabecalho: 48,
    simbolo: [40, 39],
    marca: 28,
    selo: 22,
    seloPadding: "6px 16px",
    ativo: 28,
    rotuloResultado: 24,
    pontos: 36,
    numero: 40,
    numeroMinimo: 30,
    rotuloNumero: 22,
    rotuloNumeroMinimo: 18,
    /** (936 − 3 × 16) / 4: quatro células numa linha */
    celula: 222,
    nota: 20,
    notaMargem: 10,
    legenda: 20,
    legendaMargem: 10,
    eixo: 20,
    eixoAltura: 30,
    eixoCaixa: 80,
    traco: 4,
    bolinha: 7,
    rodape: 22,
    legal: 22,
    legalMargem: 8,
  },
  story: {
    padding: "200px 72px 260px",
    entreBlocos: 40,
    cabecalho: 56,
    simbolo: [48, 47],
    marca: 34,
    selo: 26,
    seloPadding: "8px 20px",
    ativo: 34,
    rotuloResultado: 30,
    pontos: 44,
    numero: 56,
    numeroMinimo: 40,
    rotuloNumero: 26,
    rotuloNumeroMinimo: 20,
    /** (936 − 16) / 2: grade 2 × 2 */
    celula: 460,
    nota: 24,
    notaMargem: 16,
    legenda: 24,
    legendaMargem: 12,
    eixo: 26,
    eixoAltura: 36,
    eixoCaixa: 96,
    traco: 5,
    bolinha: 8,
    rodape: 26,
    legal: 26,
    legalMargem: 10,
  },
} as const;

type Medidas = (typeof MEDIDAS)[FormatoCard];

/** um texto numa linha só (ou quebrando, se não couber), com a altura de linha explícita que o satori pede */
function Texto({ tamanho, cor = TEXTO, estilo, children }: { tamanho: number; cor?: string; estilo?: CSSProperties; children: string }) {
  return <div style={{ display: "flex", fontSize: tamanho, color: cor, lineHeight: 1.15, ...estilo }}>{children}</div>;
}

function Selo({ texto, cor, borda, m }: { texto: string; cor: string; borda: string; m: Medidas }) {
  return (
    <div style={{ display: "flex", fontSize: m.selo, color: cor, border: `2px solid ${borda}`, borderRadius: 999, padding: m.seloPadding, lineHeight: 1.15 }}>
      {texto}
    </div>
  );
}

function Selos({ dados, m, estilo }: { dados: DadosCardDoDia; m: Medidas; estilo?: CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 12, ...estilo }}>
      {dados.parcial ? <Selo texto={dados.parcial} cor={ACENTO} borda={ACENTO} m={m} /> : null}
      {dados.contaDemo ? <Selo texto="Conta demo" cor={TEXTO} borda={MUDO} m={m} /> : null}
    </div>
  );
}

/** o maior tamanho que deixa todos os textos caberem na célula: um tamanho só para a linha inteira */
function tamanhoComum(textos: readonly string[], largura: number, maximo: number, minimo: number): number {
  return Math.min(...textos.map((t) => tamanhoParaCaber(t, largura, maximo, minimo)));
}

function Numero({ n, tamanhoValor, tamanhoRotulo }: { n: NumeroDoCard; tamanhoValor: number; tamanhoRotulo: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
      <Texto tamanho={tamanhoValor} cor={n.tom ? COR_DO_TOM[n.tom] : TEXTO} estilo={{ lineHeight: 1.1, whiteSpace: "nowrap" }}>
        {n.valor}
      </Texto>
      <Texto tamanho={tamanhoRotulo} cor={MUDO} estilo={{ marginTop: 6 }}>
        {n.rotulo}
      </Texto>
    </div>
  );
}

function Curva({ dados, formato, m }: { dados: DadosCardDoDia; formato: FormatoCard; m: Medidas }) {
  const altura = ALTURA_CURVA[formato];
  const c = caminhosDaCurva(dados.curva, { largura: LARGURA, altura });
  // a área e a faixa trocam de cor exatamente no zero: verde acima, vermelho abaixo, como a curva do site
  const limitar = (v: number) => Math.min(1, Math.max(0, v));
  const corte = limitar(c.yZero / altura);
  // o traço tem uma faixa neutra da largura dele em volta do zero (mais 1 px de cada lado, a borda suavizada do
  // traço): saldo parado no zero não sai meio verde, meio vermelho (revisão de 24/09/2026)
  const meiaFaixa = m.traco / 2 + 1;
  const acimaDoZero = limitar((c.yZero - meiaFaixa) / altura);
  const abaixoDoZero = limitar((c.yZero + meiaFaixa) / altura);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Texto tamanho={m.legenda} cor={MUDO} estilo={{ marginBottom: m.legendaMargem }}>
        {dados.curva.legenda}
      </Texto>
      <svg width={LARGURA} height={altura} viewBox={`0 0 ${LARGURA} ${altura}`}>
        <defs>
          <linearGradient id="card-cor" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={altura}>
            <stop offset={corte} stopColor={POSITIVO} />
            <stop offset={corte} stopColor={NEGATIVO} />
          </linearGradient>
          <linearGradient id="card-cor-linha" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={altura}>
            <stop offset={0} stopColor={POSITIVO} />
            <stop offset={acimaDoZero} stopColor={POSITIVO} />
            <stop offset={acimaDoZero} stopColor={MUDO} />
            <stop offset={abaixoDoZero} stopColor={MUDO} />
            <stop offset={abaixoDoZero} stopColor={NEGATIVO} />
            <stop offset={1} stopColor={NEGATIVO} />
          </linearGradient>
        </defs>
        {c.faixa ? <path d={c.faixa} fill="url(#card-cor)" fillOpacity={0.22} /> : null}
        <path d={c.area} fill="url(#card-cor)" fillOpacity={0.1} />
        <line x1={0} y1={c.yZero} x2={LARGURA} y2={c.yZero} stroke={ZERO} strokeWidth={2} strokeDasharray="8 8" />
        <path d={c.linha} fill="none" stroke="url(#card-cor-linha)" strokeWidth={m.traco} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={c.ultimo.x} cy={c.ultimo.y} r={m.bolinha} fill={COR_DO_TOM[dados.curva.tomFinal]} />
      </svg>
      <div style={{ display: "flex", position: "relative", width: LARGURA, height: m.eixoAltura }}>
        {c.rotulosX.map((r) => {
          // a caixa do rótulo fica presa às bordas; presa, o texto encosta no lado da borda, para ficar sob o
          // ponto que ele nomeia (a última operação da curva por fechamento está em x = 1; revisão de 24/09/2026)
          const esquerda = Math.min(LARGURA - m.eixoCaixa, Math.max(0, r.x - m.eixoCaixa / 2));
          const alinhar = esquerda <= 0 ? "flex-start" : esquerda >= LARGURA - m.eixoCaixa ? "flex-end" : "center";
          return (
            <div
              key={`${r.texto}-${r.x}`}
              style={{
                display: "flex",
                position: "absolute",
                top: 6,
                left: esquerda,
                width: m.eixoCaixa,
                justifyContent: alinhar,
                fontSize: m.eixo,
                color: MUDO,
                lineHeight: 1.15,
              }}
            >
              {r.texto}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface PropsCardDoDia {
  dados: DadosCardDoDia;
  formato: FormatoCard;
}

export function CardDoDia({ dados, formato }: PropsCardDoDia) {
  const m = MEDIDAS[formato];
  const quadrado = formato === "quadrado";
  const temSelo = dados.parcial !== null || dados.contaDemo;
  const [nNumero, nAcerto, nMep, nMen] = dados.numeros;
  const tamanhoValor = tamanhoComum(
    dados.numeros.map((n) => n.valor),
    m.celula,
    m.numero,
    m.numeroMinimo,
  );
  const tamanhoRotulo = tamanhoComum(
    dados.numeros.map((n) => n.rotulo),
    m.celula,
    m.rotuloNumero,
    m.rotuloNumeroMinimo,
  );
  const numero = (n: NumeroDoCard) => <Numero n={n} tamanhoValor={tamanhoValor} tamanhoRotulo={tamanhoRotulo} />;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: FUNDO,
        color: TEXTO,
        padding: m.padding,
      }}
    >
      {/* cabeçalho: a marca; no quadrado, os selos à direita */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: m.cabecalho }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width={m.simbolo[0]} height={m.simbolo[1]} viewBox={SIMBOLO_VIEWBOX}>
            {SIMBOLO_CAMINHOS.map((d, i) => (
              <path key={i} d={d} fill={ACENTO} />
            ))}
          </svg>
          <div style={{ display: "flex", gap: 8 }}>
            <Texto tamanho={m.marca}>Quants</Texto>
            <Texto tamanho={m.marca} cor={MUDO}>
              Robôs
            </Texto>
          </div>
        </div>
        {quadrado && temSelo ? <Selos dados={dados} m={m} /> : null}
      </div>

      {/* o robô, o ativo e a data (no story, os selos logo abaixo, fora da barra de perfil do Instagram) */}
      {quadrado ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: m.entreBlocos }}>
          <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 20 }}>
            <Texto tamanho={tamanhoParaCaber(dados.nome, 620, 60, 40)} estilo={{ lineHeight: 1 }}>
              {dados.nome}
            </Texto>
            <Texto tamanho={m.ativo} cor={MUDO} estilo={{ paddingBottom: 4 }}>
              {dados.ativo}
            </Texto>
          </div>
          <Texto tamanho={m.ativo} cor={MUDO} estilo={{ marginTop: 10 }}>
            {dados.data}
          </Texto>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", marginTop: m.entreBlocos }}>
          <Texto tamanho={tamanhoParaCaber(dados.nome, LARGURA, 84, 48)} estilo={{ lineHeight: 1 }}>
            {dados.nome}
          </Texto>
          <Texto tamanho={m.ativo} cor={MUDO} estilo={{ marginTop: 14 }}>
            {dados.ativo}
          </Texto>
          <Texto tamanho={m.ativo} cor={MUDO} estilo={{ marginTop: 6 }}>
            {dados.data}
          </Texto>
          {temSelo ? <Selos dados={dados} m={m} estilo={{ marginTop: 20 }} /> : null}
        </div>
      )}

      {/* o resultado do dia, grande e colorido; os pontos ao lado (quadrado) ou embaixo (story) */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: m.entreBlocos }}>
        <Texto tamanho={m.rotuloResultado} cor={MUDO}>
          {dados.rotuloResultado}
        </Texto>
        {quadrado ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginTop: 6 }}>
            <Texto
              tamanho={tamanhoParaCaber(dados.resultado, 640, 112, 64)}
              cor={COR_DO_TOM[dados.tomResultado]}
              estilo={{ lineHeight: 1, letterSpacing: -2 }}
            >
              {dados.resultado}
            </Texto>
            <Texto tamanho={m.pontos} cor={MUDO} estilo={{ paddingBottom: 6 }}>
              {dados.pontos}
            </Texto>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            <Texto
              tamanho={tamanhoParaCaber(dados.resultado, LARGURA, 150, 80)}
              cor={COR_DO_TOM[dados.tomResultado]}
              estilo={{ lineHeight: 1, letterSpacing: -3 }}
            >
              {dados.resultado}
            </Texto>
            <Texto tamanho={m.pontos} cor={MUDO} estilo={{ marginTop: 10 }}>
              {dados.pontos}
            </Texto>
          </div>
        )}
      </div>

      {/* operações, acerto, MEP e MEN, com a fonte do MEP/MEN */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: m.entreBlocos }}>
        {quadrado ? (
          <div style={{ display: "flex", gap: 16 }}>
            {numero(nNumero)}
            {numero(nAcerto)}
            {numero(nMep)}
            {numero(nMen)}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ display: "flex", gap: 16 }}>
              {numero(nNumero)}
              {numero(nAcerto)}
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {numero(nMep)}
              {numero(nMen)}
            </div>
          </div>
        )}
        <Texto tamanho={m.nota} cor={MUDO} estilo={{ marginTop: m.notaMargem }}>
          {dados.notaMepMen}
        </Texto>
      </div>

      {/* a curva do dia */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: m.entreBlocos }}>
        <Curva dados={dados} formato={formato} m={m} />
      </div>

      {/* rodapé no fim da imagem; o paddingTop garante 24 px livres depois dos rótulos do eixo */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", paddingTop: 24 }}>
        <Texto tamanho={m.rodape} cor={MUDO}>
          {dados.rodape}
        </Texto>
        <Texto tamanho={m.legal} cor={MUDO} estilo={{ marginTop: m.legalMargem }}>
          {dados.legal}
        </Texto>
      </div>
    </div>
  );
}
