import type { CSSProperties } from "react";
import { ACENTO, ALERTA, COR_DO_TOM, FIO, FUNDO, MUDO, NEGATIVO, SUTIL, TEXTO, ZERO, partesDoValor } from "@/components/card/cores";
import type { FormatoCard } from "@/components/compartilhar/url-do-card";
import { SIMBOLO_CAMINHOS, SIMBOLO_VIEWBOX } from "@/components/marca/Simbolo";
import { caminhosDaCurva, tamanhoParaCaber, type DadosCardDoDia, type NumeroDoCard } from "@/lib/stats/card-do-dia";

/*
 * A imagem do dia para compartilhar (24/09/2026, pedido do Lucas: "uma imagem pronta ao fim de cada pregão, com a
 * curva real do dia, resultado, MEP e MEN e o número de operações"), desenhada pelo ImageResponse (satori) na rota
 * /api/og/[slug]/[dia]. Só desenha: textos, números e caminhos da curva vêm prontos de montarCardDoDia e de
 * caminhosDaCurva (src/lib/stats/card-do-dia).
 *
 * Ficha Mesa (25/11/2026): a imagem tem a cara do sistema. Fundo quase preto, sem caixa nenhuma; o resultado do
 * dia em número grande, com o sinal e o "R$" mais apagados e os algarismos na cor do texto (negativo, vermelho
 * inteiro); a curva do dia numa linha fina e clara, sem área, sem faixa e sem verde; um fio de 1 px em cima dos
 * números e outro em cima do rodapé. Saíram os selos em pílula ("Parcial", "Conta demo"), que viraram texto na
 * cor de atenção; o degradê verde e vermelho da linha e da área; e a bolinha colorida do fim da curva. O verde da
 * marca fica só no símbolo; verde e vermelho, só nos números de ganho e de perda. A informação é a mesma de antes.
 *
 * Regras do satori que valem aqui: todo div com mais de um filho tem display flex; texto sempre como uma string
 * só (template string), nunca pedaços soltos; nada de <text> dentro do SVG (o resvg não tem fonte), por isso os
 * rótulos de hora são divs em posição absoluta; sem variáveis CSS; lineHeight explícito. A fonte é a padrão do
 * ImageResponse (Geist Regular, um peso só): fontWeight não faz efeito, a hierarquia vem do tamanho e da cor.
 *
 * Medidas prototipadas com o Apollo de 23/09/2026 e com o pior caso (nome "Alaska & Square", −R$ 12.345,67, 1.234
 * operações, MEP e MEN de 5 dígitos, parcial e demo juntos). O story deixa 200 px livres em cima e 260 px embaixo,
 * as zonas que a interface do Instagram cobre; por isso os avisos vão para baixo da data, e não para o cabeçalho.
 *
 * Ajuste do render de verificação (24/09/2026): no quadrado, um MEP de 10 caracteres ("+R$ 344,00") ocupava 218 dos
 * 222 px da célula, e um valor um pouco mais largo quebraria em duas linhas. Os valores da linha de números não
 * quebram (nowrap) e têm um tamanho só, o maior que deixa todos caberem (tamanhoParaCaber, até 40 px, no mínimo
 * 30); os rótulos, idem (até 22 px, no mínimo 18). No caso comum nada muda: 40 e 22 px.
 *
 * Revisão de 25/11/2026: a linha de números tem três, como o dia escolhido em Dia a dia (operações, melhor e pior
 * momento). Saiu "Com ganho", acertos sem o necessário para empatar. No quadrado os três ficam numa fileira, em
 * células de 301 px; no story, as operações numa linha e o melhor e o pior momento na outra, com as células de
 * 460 px de antes (a altura do bloco não muda).
 *
 * Ajustes da revisão (24/09/2026), dentro dos 15% previstos no contrato:
 * - A frase legal é o único aviso de risco da peça que sai do site, e era o menor texto da imagem (18 px no quadrado,
 *   22 no story): no feed ou no WhatsApp, a uns 390 px de largura, virava 6,5 px. Agora tem o tamanho do rodapé
 *   (22 e 26 px), com 8 e 10 px de margem.
 * - Rótulo do eixo preso a uma borda encosta o texto nela: na curva por fechamento o último rótulo nomeia a última
 *   operação, em x = 1, e centralizado na caixa ele ficava 28 px à esquerda do ponto.
 */

/** a largura útil nos dois formatos: 1080 menos 72 px de cada lado */
const LARGURA = 936;

const ALTURA_CURVA: Readonly<Record<FormatoCard, number>> = { quadrado: 270, story: 300 };

const MEDIDAS = {
  quadrado: {
    padding: "64px 72px",
    entreBlocos: 26,
    cabecalho: 48,
    simbolo: [40, 39],
    marca: 28,
    aviso: 24,
    ativo: 28,
    rotuloResultado: 24,
    pontos: 36,
    numero: 40,
    numeroMinimo: 30,
    rotuloNumero: 22,
    rotuloNumeroMinimo: 18,
    /** (936 − 2 × 16) / 3: três células numa linha */
    celula: 301,
    /** o respiro entre o fio e o que vem debaixo dele */
    depoisDoFio: 20,
    nota: 20,
    notaMargem: 10,
    legenda: 20,
    legendaMargem: 8,
    eixo: 20,
    eixoAltura: 30,
    eixoCaixa: 80,
    traco: 3,
    bolinha: 6,
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
    aviso: 28,
    ativo: 34,
    rotuloResultado: 30,
    pontos: 44,
    numero: 56,
    numeroMinimo: 40,
    rotuloNumero: 26,
    rotuloNumeroMinimo: 20,
    /** (936 − 16) / 2: as operações numa linha, o melhor e o pior momento na outra */
    celula: 460,
    depoisDoFio: 32,
    nota: 24,
    notaMargem: 16,
    legenda: 24,
    legendaMargem: 12,
    eixo: 26,
    eixoAltura: 36,
    eixoCaixa: 96,
    traco: 4,
    bolinha: 7,
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

/**
 * "Parcial · até 14:32" e "Conta demo", em texto na cor de atenção. Eram selos em pílula, um deles no verde da
 * marca; desde a ficha Mesa não há pílula, e o verde da marca é só do símbolo.
 */
function Avisos({ dados, m, estilo }: { dados: DadosCardDoDia; m: Medidas; estilo?: CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 28, ...estilo }}>
      {dados.parcial ? (
        <Texto tamanho={m.aviso} cor={ALERTA}>
          {dados.parcial}
        </Texto>
      ) : null}
      {dados.contaDemo ? (
        <Texto tamanho={m.aviso} cor={ALERTA}>
          Conta demo
        </Texto>
      ) : null}
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

/**
 * O resultado do dia em número grande, como o do site: o sinal e o "R$" mais apagados, os algarismos na cor do
 * texto. Negativo fica vermelho inteiro. São dois textos lado a lado, do mesmo tamanho, porque o satori não
 * pinta um pedaço de uma string.
 */
function Resultado({ dados, tamanho, aperto }: { dados: DadosCardDoDia; tamanho: number; aperto: number }) {
  const [prefixo, algarismos] = partesDoValor(dados.resultado);
  const negativo = dados.tomResultado === "negativo";
  return (
    <div style={{ display: "flex", alignItems: "flex-end" }}>
      {prefixo ? (
        <Texto tamanho={tamanho} cor={negativo ? NEGATIVO : MUDO} estilo={{ lineHeight: 1, letterSpacing: aperto, marginRight: Math.round(tamanho * 0.16) }}>
          {prefixo}
        </Texto>
      ) : null}
      <Texto tamanho={tamanho} cor={negativo ? NEGATIVO : TEXTO} estilo={{ lineHeight: 1, letterSpacing: aperto }}>
        {algarismos}
      </Texto>
    </div>
  );
}

/**
 * A curva do dia: uma linha fina na cor do texto, a linha do zero tracejada e a ponta marcada. Até 25/11/2026
 * a linha e a área trocavam de verde para vermelho no zero, com a faixa mín./máx. por trás; na ficha Mesa verde
 * não entra em curva e não há área preenchida.
 */
function Curva({ dados, formato, m }: { dados: DadosCardDoDia; formato: FormatoCard; m: Medidas }) {
  const altura = ALTURA_CURVA[formato];
  const c = caminhosDaCurva(dados.curva, { largura: LARGURA, altura });
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Texto tamanho={m.legenda} cor={SUTIL} estilo={{ marginBottom: m.legendaMargem }}>
        {dados.curva.legenda}
      </Texto>
      <svg width={LARGURA} height={altura} viewBox={`0 0 ${LARGURA} ${altura}`}>
        <line x1={0} y1={c.yZero} x2={LARGURA} y2={c.yZero} stroke={ZERO} strokeWidth={2} strokeDasharray="8 8" />
        <path d={c.linha} fill="none" stroke={TEXTO} strokeWidth={m.traco} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={c.ultimo.x} cy={c.ultimo.y} r={m.bolinha} fill={TEXTO} />
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
  const temAviso = dados.parcial !== null || dados.contaDemo;
  const [nOperacoes, nMep, nMen] = dados.numeros;
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
      {/* cabeçalho: a marca; no quadrado, os avisos à direita */}
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
        {quadrado && temAviso ? <Avisos dados={dados} m={m} /> : null}
      </div>

      {/* o robô, o ativo e a data (no story, os avisos logo abaixo, fora da barra de perfil do Instagram) */}
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
          {temAviso ? <Avisos dados={dados} m={m} estilo={{ marginTop: 20 }} /> : null}
        </div>
      )}

      {/* o resultado do dia, grande; os pontos ao lado (quadrado) ou embaixo (story) */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: m.entreBlocos }}>
        <Texto tamanho={m.rotuloResultado} cor={MUDO}>
          {dados.rotuloResultado}
        </Texto>
        {quadrado ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginTop: 8 }}>
            <Resultado dados={dados} tamanho={tamanhoParaCaber(dados.resultado, 640, 112, 64)} aperto={-3} />
            <Texto tamanho={m.pontos} cor={MUDO} estilo={{ paddingBottom: 6 }}>
              {dados.pontos}
            </Texto>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
            <Resultado dados={dados} tamanho={tamanhoParaCaber(dados.resultado, LARGURA, 150, 80)} aperto={-4} />
            <Texto tamanho={m.pontos} cor={MUDO} estilo={{ marginTop: 12 }}>
              {dados.pontos}
            </Texto>
          </div>
        )}
      </div>

      {/* operações, melhor e pior momento, com a fonte do melhor e do pior; um fio em cima, sem caixa em volta de cada número */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: m.entreBlocos, borderTop: `1px solid ${FIO}`, paddingTop: m.depoisDoFio }}>
        {quadrado ? (
          <div style={{ display: "flex", gap: 16 }}>
            {numero(nOperacoes)}
            {numero(nMep)}
            {numero(nMen)}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {/* a célula das operações fica com a largura de meia linha, alinhada às de baixo */}
            <div style={{ display: "flex", width: m.celula }}>{numero(nOperacoes)}</div>
            <div style={{ display: "flex", gap: 16 }}>
              {numero(nMep)}
              {numero(nMen)}
            </div>
          </div>
        )}
        <Texto tamanho={m.nota} cor={SUTIL} estilo={{ marginTop: m.notaMargem }}>
          {dados.notaMepMen}
        </Texto>
      </div>

      {/* a curva do dia */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: m.entreBlocos }}>
        <Curva dados={dados} formato={formato} m={m} />
      </div>

      {/* rodapé no fim da imagem, com um fio em cima; o que sobra de altura fica entre os rótulos do eixo e ele */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", borderTop: `1px solid ${FIO}`, paddingTop: m.depoisDoFio }}>
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
