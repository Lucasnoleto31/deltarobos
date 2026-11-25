"use client";

// O desenho das curvas compartilhadas: a curva de capital, a curva do dia, o patrimônio simulado e a curva do
// dia escolhido no calendário. Nasceu em 17/09/2026 imitando o Gráfico de Patrimônio do Profit (pedido do
// Artur: "o gráfico de performance pode ser estilo profit"), com moldura grafite, cores medidas em prints e as
// abas no rodapé.
//
// Desde a ficha Mesa (25/11/2026; Lucas: "muita cara de IA", "coisas que não são necessárias pode tirar") é o
// mesmo traço do GraficoResultado, a assinatura do sistema: a curva direto sobre o fundo da página, linha fina
// na cor do texto, a maior queda pintada de vermelho na própria linha, guias na cor do fio, eixo de valores à
// direita e a leitura do ponto apontado numa linha de texto acima do desenho, no lugar do título. Saíram a
// moldura, o verde, a área em degradê, a mira em cruz com etiquetas e o rótulo vertical. Cores só por token do
// tema: o desenho vale nos dois temas sem cor própria.
//
// Os nomes (o arquivo, PROFIT, MolduraProfit) são históricos, como o `Painel` que hoje é uma seção sem caixa:
// ficaram para não mexer em quem importa. Aqui só se desenha: cada ponto chega com a posição, o acumulado, a
// distância do topo e a leitura já montados.

import { cn } from "cn";
import { Children, createContext, isValidElement, useContext, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ExtrasDoPonto, FechamentoNaCurva } from "@/lib/stats/saldo-dia";
import { maiorQueda } from "@/lib/stats/serie-casa";
import { Leitura, indiceMaisPerto, passo, type ConteudoDaDica } from "./base";

/**
 * As cores do desenho, por token do tema. O objeto se chama PROFIT desde 17/09/2026, quando guardava as cores
 * medidas no Profit (grafite, verde e vermelho próprios). O nome e as chaves ficaram para não quebrar quem
 * importa; os valores viraram os tokens da ficha Mesa (25/11/2026): o que era a moldura é o fundo da página, a
 * linha é a cor do texto e o vermelho é o da perda.
 */
export const PROFIT = {
  fundo: "var(--background)",
  grade: "var(--painel-fio)",
  zero: "var(--painel-fio-forte)",
  alta: "var(--foreground)",
  baixa: "var(--negativo)",
  texto: "var(--muted-foreground)",
  textoFraco: "var(--sutil)",
  titulo: "var(--foreground)",
  abas: "transparent",
  abasBorda: "var(--painel-fio-forte)",
  abaAtiva: "var(--linha-hover)",
  abaTexto: "var(--muted-foreground)",
} as const;

/**
 * O traço da curva. Até 25/11/2026 cada agrupamento tinha as cores do Profit no mesmo agrupamento: verde
 * acima do zero, vermelho abaixo e a área em degradê. Na ficha Mesa a linha é uma só e verde não entra em
 * curva: `alta` é a cor da linha, `baixa` a da maior queda (e das quedas embaixo, quando ligadas).
 */
export interface CoresDaCurva {
  /** a linha */
  alta: string;
  /** a maior queda, pintada na própria linha, e as barras de quanto a curva ficou abaixo do topo */
  baixa: string;
  /** espessura da linha, em px */
  linha: number;
  /** sem uso desde a ficha Mesa: não há mais área sob a curva */
  areaTopo?: number;
  areaZero?: number;
  /** a guia do zero */
  zero: string;
  zeroLargura: number;
}

const TRACO: CoresDaCurva = { alta: PROFIT.alta, baixa: PROFIT.baixa, linha: 1.6, zero: PROFIT.zero, zeroLargura: 1 };

/** Por operação. Desde a ficha Mesa os dois agrupamentos têm o mesmo traço; as duas constantes ficam para quem as importa. */
export const CURVA_POR_OPERACAO: CoresDaCurva = TRACO;

/** Por dia. O mesmo traço do agrupamento por operação (eram cores e espessuras diferentes, medidas no Profit). */
export const CURVA_POR_DIA: CoresDaCurva = TRACO;

/**
 * Um ponto da curva. Desde 23/09/2026 estende ExtrasDoPonto (src/lib/stats/saldo-dia.ts): `faixa` é o
 * mínimo e o máximo do saldo dentro do balde da série medida pelo EA 1.1.2, e `dente` é o MFE/MAE de uma
 * operação (ou o envelope da fatia) na curva por operação. Os dois são opcionais: ponto sem eles se
 * desenha como sempre. Os campos são declarados lá, e não aqui, para a série (que não é "use client")
 * e o desenho compilarem cada um por si.
 */
export interface PontoDoDesenho extends ExtrasDoPonto {
  /** de 0 a 1 no eixo de baixo */
  posicao: number;
  acumulado: number;
  /** distância até o pico anterior, sempre <= 0 */
  drawdown: number;
  /** a leitura do ponto, na linha de texto acima do desenho */
  dica: ConteudoDaDica;
  /**
   * A data, a hora ou a ordem da operação. Era a etiqueta do eixo de baixo na mira; desde a ficha Mesa
   * (25/11/2026) a mira não tem etiqueta (a leitura já abre com a data ou a hora) e o campo não é desenhado.
   */
  eixo?: string;
}

/** Um ponto marcado em cima da curva (o melhor e o pior momento do dia, por exemplo), com um rótulo curto ao lado. */
export interface MarcadorDaCurva {
  /** de 0 a 1 no eixo de baixo, na mesma régua dos pontos */
  posicao: number;
  /** o valor no eixo vertical, na mesma unidade do acumulado */
  valor: number;
  /** curto, cabe ao lado do ponto */
  rotulo: string;
  tom: "positivo" | "negativo";
}

/**
 * Escala da curva, justa como a do GraficoResultado: 8% além do maior valor (é onde cabe o rótulo da maior
 * queda, escrito acima do pico) e, quando passa abaixo do zero, 5% abaixo do menor. O zero entra sempre.
 */
function escalaDaCurva(valores: number[]) {
  const max = valores.reduce((m, v) => Math.max(m, v), 0);
  const min = valores.reduce((m, v) => Math.min(m, v), 0);
  const amplitude = max - min || 1;
  const p = passo(amplitude, 4);
  const topo = max + amplitude * 0.08;
  const fundo = min < 0 ? min - amplitude * 0.05 : 0;
  const marcas: number[] = [];
  for (let v = Math.ceil(fundo / p) * p; v <= topo; v += p) marcas.push(Math.round(v * 100) / 100 || 0);
  return { marcas, y: (v: number) => ((topo - v) / (topo - fundo)) * 100 };
}

/** Escala das quedas embaixo: do zero até o pior valor arredondado para baixo. */
function escalaDoDrawdown(quedas: number[]) {
  const pior = quedas.reduce((m, q) => Math.min(m, q), 0);
  const p = passo(Math.abs(pior) || 1, 3);
  const fundo = Math.min(-p, Math.floor(pior / p) * p);
  const marcas: number[] = [];
  for (let v = 0; v >= fundo - p / 2; v -= p) marcas.push(Math.round(v * 100) / 100 || 0);
  return { marcas, y: (v: number) => (v / fundo) * 100 };
}

/** Acima disso as quedas embaixo deixam de ser uma barra por ponto (um nó de SVG cada) e viram uma área só. */
export const MAX_BARRAS = 600;

/**
 * A área das quedas de uma série longa (22/09/2026, com a série por operação de até 20 mil pontos):
 * do zero, no alto, até o drawdown de cada ponto, na cor das barras. Coordenadas em % do desenho; o x
 * vai com três casas porque 20 mil pontos em 100 unidades ficam a 0,005 um do outro.
 */
export function caminhoDoDrawdown(pontos: readonly PontoDoDesenho[], y: (drawdown: number) => number): string {
  const n = pontos.length;
  if (n === 0) return "";
  const x = (p: PontoDoDesenho) => (p.posicao * 100).toFixed(3);
  let d = `M${x(pontos[0])},0`;
  for (const p of pontos) d += `L${x(p)},${y(p.drawdown).toFixed(2)}`;
  return `${d}L${x(pontos[n - 1])},0Z`;
}

/**
 * A faixa mín./máx. da série do saldo (23/09/2026): uma área fechada que vai pelos máximos de cada
 * ponto e volta pelos mínimos, em % do desenho, com o x na mesma precisão do traçado (`casas`). Ponto
 * sem faixa entra com o próprio acumulado nas duas pontas, para a área acompanhar a linha sem furo
 * (a série põe faixa só no balde em que o saldo oscilou). Sem nenhum ponto com faixa, "" (nada a
 * desenhar). É uma área só para 1.500 pontos custarem um nó de SVG.
 */
export function caminhoDaFaixa(pontos: readonly PontoDoDesenho[], x: (i: number) => number, y: (v: number) => number, casas: number): string {
  const n = pontos.length;
  if (n === 0 || !pontos.some((p) => p.faixa !== undefined)) return "";
  let ida = "";
  // a volta é montada de trás para a frente: os mínimos em ordem inversa fecham o polígono
  const volta: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = pontos[i];
    const [min, max] = p.faixa ?? [p.acumulado, p.acumulado];
    const px = x(i).toFixed(casas);
    ida += `${i === 0 ? "M" : "L"}${px},${y(max).toFixed(2)}`;
    volta.push(`L${px},${y(min).toFixed(2)}`);
  }
  volta.reverse();
  return `${ida}${volta.join("")}Z`;
}

/**
 * Os dentes de MFE/MAE (23/09/2026): um traço vertical por ponto com `dente`, do `de` (acumulado antes
 * da operação mais o MAE) ao `ate` (mais o MFE), todos num caminho só ("M x,y(de) L x,y(ate)" por
 * ponto): 20 mil operações medidas são um nó de SVG, não 20 mil. "" sem nenhum ponto com dente.
 */
export function caminhoDosDentes(pontos: readonly PontoDoDesenho[], x: (i: number) => number, y: (v: number) => number, casas: number): string {
  let d = "";
  for (let i = 0; i < pontos.length; i++) {
    const dente = pontos[i].dente;
    if (!dente) continue;
    const px = x(i).toFixed(casas);
    d += `M${px},${y(dente.de).toFixed(2)}L${px},${y(dente.ate).toFixed(2)}`;
  }
  return d;
}

/**
 * A linha da curva, em % do desenho. De sempre: a linha nasce no zero, na borda esquerda, antes do
 * primeiro ponto (as curvas por operação e por dia começam do nada). Com `doPrimeiroPonto` (a série do saldo,
 * revisão de 23/09/2026) ela nasce no PRIMEIRO PONTO: o coletor que subiu às 11:30 virava uma rampa de
 * (09:00, R$ 0) até (11:30, o saldo de lá), um caminho que nunca aconteceu e o oposto da "curva real"
 * pedida. Com o primeiro ponto em x = 0 os dois modos desenham a mesma coisa (só some o risco vertical na
 * borda). A `area` (a mesma linha fechada no zero) continua saindo daqui, mas desde a ficha Mesa
 * (25/11/2026) o desenho não a pinta: não há área preenchida sob a curva.
 */
export function caminhoDaLinha(
  pontos: readonly PontoDoDesenho[],
  x: (i: number) => number,
  y: (v: number) => number,
  casas: number,
  zero: number,
  doPrimeiroPonto: boolean,
): { tracado: string; area: string } {
  const n = pontos.length;
  if (n === 0) return { tracado: "", area: "" };
  const z = zero.toFixed(2);
  const x0 = x(0).toFixed(casas);
  let tracado = doPrimeiroPonto ? `M${x0},${y(pontos[0].acumulado).toFixed(2)}` : `M0,${z}`;
  for (let i = doPrimeiroPonto ? 1 : 0; i < n; i++) tracado += `L${x(i).toFixed(casas)},${y(pontos[i].acumulado).toFixed(2)}`;
  const fecho = `L${x(n - 1).toFixed(casas)},${z}Z`;
  // a área começa no zero: no modo de sempre o traçado já começa lá; no outro, desce do zero até o primeiro ponto
  const area = doPrimeiroPonto ? `M${x0},${z}L${tracado.slice(1)}${fecho}` : `${tracado}${fecho}`;
  return { tracado, area };
}

/**
 * O trecho da maior queda, recortado da própria linha (ficha Mesa, 25/11/2026): do ponto `de` (o pico) ao
 * ponto `ate` (o fundo), nas mesmas coordenadas do traçado, para cair exatamente em cima dele. `daBorda` é a
 * queda que começa na partida: o trecho nasce no zero da borda esquerda, como a linha de caminhoDaLinha sem
 * `doPrimeiroPonto`, e passa pelo ponto `de`. "" quando não há trecho (índice fora da lista, fundo antes do
 * pico, ou pico e fundo no mesmo ponto).
 */
export function caminhoDaQueda(
  pontos: readonly PontoDoDesenho[],
  x: (i: number) => number,
  y: (v: number) => number,
  casas: number,
  zero: number,
  de: number,
  ate: number,
  daBorda: boolean,
): string {
  if (de < 0 || ate >= pontos.length || ate < de || (ate === de && !daBorda)) return "";
  const ponto = (i: number) => `${x(i).toFixed(casas)},${y(pontos[i].acumulado).toFixed(2)}`;
  let d = daBorda ? `M0,${zero.toFixed(2)}L${ponto(de)}` : `M${ponto(de)}`;
  for (let i = de + 1; i <= ate; i++) d += `L${ponto(i)}`;
  return d;
}

/**
 * O que a MolduraProfit entrega ao desenho que está dentro dela: o título e a legenda, que ocupam a linha de
 * leitura enquanto nada é apontado, e os controles, que vão à direita dessa linha.
 */
const DaMoldura = createContext<{ titulo?: React.ReactNode; legenda?: React.ReactNode; abas?: React.ReactNode } | null>(null);

/** O trecho vermelho já em coordenadas do desenho: o caminho, onde fica o pico (para o rótulo) e quanto caiu. */
interface QuedaNoDesenho {
  tracado: string;
  x: number;
  y: number;
  valor: number;
}

const SEM_MARCADORES: readonly MarcadorDaCurva[] = [];
const SEM_FECHAMENTOS: readonly FechamentoNaCurva[] = [];

interface Props {
  /** sem uso desde a ficha Mesa (dava nome aos recortes e degradês do SVG, que saíram); fica para não mexer em quem chama */
  id?: string;
  pontos: PontoDoDesenho[];
  /** valores que dimensionam a escala; sem eles, os próprios pontos (os dois agrupamentos dividem a mesma) */
  escalaDe?: number[];
  cores: CoresDaCurva;
  /** altura da curva em px; quem chama pode trocar por uma medida de CSS pondo --alt-curva num elemento em volta */
  altura: number;
  /** altura das barras de quanto a curva ficou abaixo do topo, embaixo dela; 0 esconde */
  alturaDoDrawdown?: number;
  rotulosX: Array<{ x: number; rotulo: string }>;
  /** os valores do eixo da direita: traga a unidade junto ("R$ 40 mil"), porque o eixo não tem título */
  formatarEixo: (v: number) => string;
  /**
   * Formata o eixo das quedas embaixo; sem ele, o mesmo formatarEixo da curva. O simulador
   * (23/09/2026) rotula a curva como patrimônio (capital + acumulado) e as quedas em R$.
   */
  formatarEixoDrawdown?: (v: number) => string;
  /** era o título do eixo, escrito de lado; sem uso desde a ficha Mesa (a unidade vem nos valores do eixo) */
  rotuloVertical?: string;
  rotuloAria: string;
  /** arrastar com o mouse seleciona um trecho (frações de 0 a 1 do eixo) e chama isto */
  aoSelecionar?: (de: number, ate: number) => void;
  /** pontos marcados em cima da curva, com rótulo; entram na escala vertical para nunca ficarem fora do desenho */
  marcadores?: ReadonlyArray<MarcadorDaCurva>;
  /**
   * Um pontinho por operação fechada em cima da linha (a série do saldo do EA, 23/09/2026): a posição
   * na régua do eixo e o valor da linha ali. Sem eles, o desenho de sempre. Não passam pelo zoom por
   * arrasto: nenhuma tela com zoom os manda (a série do saldo é de um dia só, sem arrasto).
   */
  fechamentos?: ReadonlyArray<FechamentoNaCurva>;
  /** desenha a faixa mín./máx. dos pontos que a têm (padrão true) */
  mostrarFaixa?: boolean;
  /** desenha os dentes de MFE/MAE dos pontos que os têm (padrão true) */
  mostrarDentes?: boolean;
  /**
   * A linha nasce no primeiro ponto, e não no zero da borda esquerda (a série do saldo, cujo eixo é o
   * horário do dia: o coletor que subiu no meio do dia não pode virar uma rampa desde a abertura; e o trecho
   * ampliado da curva de capital, que não começa do zero). Ver caminhoDaLinha.
   */
  comecarNoPrimeiroPonto?: boolean;
  /** pinta de vermelho, na própria linha, a maior queda dos pontos desenhados (padrão true) */
  destacarQueda?: boolean;
  /**
   * O trecho da maior queda, quando quem chama já sabe qual é: as posições (0 a 1, na régua dos pontos) do pico
   * e do fundo; pico em 0 é a partida. Com ele o desenho não procura a queda nos pontos. A curva de capital
   * manda a do período, medida dia a dia, que é a dos indicadores da tela: operação a operação a queda dos
   * pontos seria outra (mais funda, por dentro do dia), e a tela teria dois números para a mesma coisa.
   */
  trechoDaQueda?: { de: number; ate: number } | null;
  /** com ele, o valor da maior queda vai escrito ao lado do pico ("maior queda −R$ 4.360"); recebe o valor negativo */
  formatarQueda?: (valor: number) => string;
  /**
   * O valor exato da maior queda (positivo), quando quem chama o tem: os pontos desenhados podem ser fatias
   * (a curva por dia de um período longo junta pregões), e a queda medida neles fica um pouco menor que a do
   * período. Só troca o número escrito.
   */
  valorDaQueda?: number;
  /** o nome escrito ao lado do trecho vermelho (padrão "maior queda") */
  rotuloDaQueda?: string;
}

/**
 * A curva (ficha Mesa, 25/11/2026): uma linha fina na cor do texto e, pintado de vermelho na própria linha, o
 * trecho da maior queda, do ponto mais alto ao mais baixo que veio depois. Sem área, sem degradê, sem verde.
 * As guias são fios e o eixo de valores fica numa calha à direita, a mesma do GraficoResultado (64 px, 80 px a
 * partir de sm): quem alinha um controle à borda direita do gráfico usa `lg:pr-20`. Com `aoSelecionar`,
 * arrastar com o mouse marca um trecho para dar zoom (18/09/2026, "os gráficos são pouco interativos"). Com
 * `alturaDoDrawdown`, embaixo vai o quanto a curva ficou abaixo do topo em cada ponto, em barras vermelhas.
 *
 * Apontar: um fio vertical no ponto, com a bolinha sobre a curva, e a leitura dele na linha de texto acima do
 * desenho (desde 19/09/2026 a leitura não é cartão flutuante: ele cobria o fim da curva). Sem o ponteiro, a
 * linha mostra o título e a legenda que a MolduraProfit em volta recebeu (ou nada): até 25/11/2026 lia o
 * último ponto, o que repetia, em letra miúda, o número grande da tela e a última linha da lista. A leitura
 * entra no lugar do título, como na página inicial ela entra no lugar do número. A altura da linha é
 * reservada para o desenho não pular. No toque, arrastar o dedo move o fio, e ele fica onde o dedo soltou.
 * Saíram a mira em cruz e as etiquetas coloridas nos eixos, que eram do Profit.
 */
export function DesenhoDaCurva({
  pontos,
  escalaDe,
  cores,
  altura,
  alturaDoDrawdown = 0,
  rotulosX,
  formatarEixo,
  formatarEixoDrawdown = formatarEixo,
  rotuloAria,
  aoSelecionar,
  marcadores = SEM_MARCADORES,
  fechamentos = SEM_FECHAMENTOS,
  mostrarFaixa = true,
  mostrarDentes = true,
  comecarNoPrimeiroPonto = false,
  destacarQueda = true,
  trechoDaQueda,
  formatarQueda,
  valorDaQueda,
  rotuloDaQueda = "maior queda",
}: Props) {
  // Onde o ponteiro está, em fração do eixo; o ponto apontado é o mais perto dela, achado a cada
  // desenho (busca binária, custo nulo). Guardar a fração em vez do índice (22/09/2026) é o que deixa
  // trocar a lista de pontos sem remontar: quando a série completa chega no lugar da leve, ou o zoom
  // muda, a mira vai para o ponto novo mais perto do ponteiro em vez de sumir ou apontar outro ponto.
  const [alvo, setAlvo] = useState<number | null>(null);
  // trecho sendo arrastado, em frações do eixo; só com mouse, para não brigar com a rolagem no toque
  const [selecao, setSelecao] = useState<{ de: number; ate: number } | null>(null);
  const inicioDoArrasto = useRef<number | null>(null);
  // a seleção também numa ref: o soltar pode vir antes do React redesenhar o último arrasto
  const selecaoRef = useRef<{ de: number; ate: number } | null>(null);
  const n = pontos.length;
  const comDrawdown = alturaDoDrawdown > 0;
  const moldura = useContext(DaMoldura);

  // O que não muda ao apontar fica montado uma vez (22/09/2026): com a série por operação de até 20 mil
  // pontos, refazer o traçado e a escala a cada movimento do ponteiro travava a mira.
  const desenho = useMemo(() => {
    if (n === 0) return null;
    const x = (i: number) => pontos[i].posicao * 100;
    // os marcadores entram na escala: em série fatiada o pico real pode não estar entre os pontos desenhados.
    // A faixa e os dentes também (23/09/2026): o mínimo do balde e o MAE da operação passam do acumulado, e
    // fora da régua a faixa sairia do desenho
    const valoresDaEscala = [...(escalaDe ?? pontos.map((p) => p.acumulado)), ...marcadores.map((m) => m.valor)];
    for (const p of pontos) {
      if (mostrarFaixa && p.faixa) valoresDaEscala.push(p.faixa[0], p.faixa[1]);
      if (mostrarDentes && p.dente) valoresDaEscala.push(p.dente.de, p.dente.ate);
    }
    const { marcas, y } = escalaDaCurva(valoresDaEscala);
    const zero = y(0);
    // com muitos pontos o x leva uma casa a mais: 20 mil pontos em 100 unidades ficam a 0,005 um do outro
    const casas = n > MAX_BARRAS ? 3 : 2;
    // a linha: do zero na borda esquerda, ou do primeiro ponto (a série do saldo, o trecho ampliado)
    const { tracado } = caminhoDaLinha(pontos, x, y, casas, zero, comecarNoPrimeiroPonto);

    // A maior queda, pintada na própria linha: do pico (índice `de`; `daBorda` quando o pico é a partida, no zero
    // da borda esquerda, que só existe no desenho quando a linha nasce lá) até o fundo (índice `ate`).
    const pintar = (de: number, ate: number, daBorda: boolean): QuedaNoDesenho | null => {
      const d = caminhoDaQueda(pontos, x, y, casas, zero, de, ate, daBorda);
      if (!d) return null;
      const noPico = daBorda ? 0 : pontos[de].acumulado;
      return { tracado: d, x: daBorda ? 0 : x(de), y: daBorda ? zero : y(noPico), valor: noPico - pontos[ate].acumulado };
    };
    let queda: QuedaNoDesenho | null = null;
    if (trechoDaQueda) {
      // quem chama disse onde ela está: os pontos mais perto do pico e do fundo
      const daBorda = trechoDaQueda.de <= 0 && !comecarNoPrimeiroPonto;
      queda = pintar(daBorda ? 0 : indiceMaisPerto(pontos, trechoDaQueda.de), indiceMaisPerto(pontos, trechoDaQueda.ate), daBorda);
    } else if (destacarQueda && trechoDaQueda === undefined) {
      // A dos pontos desenhados, pela mesma conta da página inicial (maiorQueda): do ponto mais alto ao mais
      // baixo que veio depois. A conta parte do zero; quando a linha nasce no primeiro ponto, é ele a partida, e
      // os valores entram descontados dele (senão um trecho todo abaixo de zero contaria como queda desde uma
      // partida que não está no desenho).
      const base = comecarNoPrimeiroPonto ? pontos[0].acumulado : 0;
      const q = maiorQueda(base === 0 ? pontos : pontos.map((p) => ({ acumulado: p.acumulado - base })));
      if (q && q.valor > 0 && q.iFundo > q.iInicio) queda = pintar(Math.max(0, q.iInicio), q.iFundo, q.iInicio < 0 && !comecarNoPrimeiroPonto);
    }

    const escalaDD = comDrawdown ? escalaDoDrawdown(pontos.map((p) => p.drawdown)) : null;
    return {
      x,
      marcas,
      y,
      tracado,
      queda,
      escalaDD,
      larguraDaBarra: Math.min((100 / n) * 0.72, 3),
      // acima de MAX_BARRAS as quedas são uma área só; abaixo, uma barra por ponto
      areaDoDrawdown: escalaDD && n > MAX_BARRAS ? caminhoDoDrawdown(pontos, escalaDD.y) : null,
      // a faixa mín./máx. e os dentes de MFE/MAE (23/09/2026), um caminho cada; "" quando nenhum ponto os tem
      faixa: mostrarFaixa ? caminhoDaFaixa(pontos, x, y, casas) : "",
      dentes: mostrarDentes ? caminhoDosDentes(pontos, x, y, casas) : "",
    };
  }, [pontos, n, escalaDe, marcadores, mostrarFaixa, mostrarDentes, comecarNoPrimeiroPonto, destacarQueda, trechoDaQueda, comDrawdown]);
  if (n === 0 || desenho === null) return null;

  const { x, marcas, y, tracado, queda, escalaDD, larguraDaBarra, areaDoDrawdown, faixa, dentes } = desenho;

  const apontar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    setAlvo((e.clientX - caixa.left) / (caixa.width || 1));
  };
  // o ponto mais perto do ponteiro: com as operações espalhadas dentro de cada dia, o passo entre pontos não
  // é fixo; como eles vêm em ordem de posição, a busca é binária
  const ativo = alvo === null ? null : indiceMaisPerto(pontos, alvo);
  const atual = ativo !== null ? pontos[ativo] : null;
  const ultimo = pontos[n - 1];

  const fracaoDe = (e: ReactPointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - caixa.left) / (caixa.width || 1)));
  };
  const comecarArrasto = (e: ReactPointerEvent<HTMLDivElement>) => {
    apontar(e);
    if (!aoSelecionar || e.pointerType !== "mouse") return;
    inicioDoArrasto.current = fracaoDe(e);
    selecaoRef.current = null;
    setSelecao(null);
  };
  const arrastar = (e: ReactPointerEvent<HTMLDivElement>) => {
    apontar(e);
    if (inicioDoArrasto.current === null) return;
    const f = fracaoDe(e);
    const nova = { de: Math.min(inicioDoArrasto.current, f), ate: Math.max(inicioDoArrasto.current, f) };
    selecaoRef.current = nova;
    setSelecao(nova);
  };
  const soltar = () => {
    const sel = selecaoRef.current;
    inicioDoArrasto.current = null;
    selecaoRef.current = null;
    setSelecao(null);
    if (sel && aoSelecionar && sel.ate - sel.de > 0.02) aoSelecionar(sel.de, sel.ate);
  };

  // o fio vertical no ponto apontado; na curva ele leva a bolinha
  const mira = (naCurva: boolean) =>
    atual && ativo !== null ? (
      <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-(--painel-fio-forte)" style={{ left: `${x(ativo)}%` }}>
        {naCurva ? (
          <i className="absolute left-1/2 size-[9px] -translate-1/2 rounded-full border-2 border-background bg-foreground" style={{ top: `${y(atual.acumulado)}%` }} />
        ) : null}
      </div>
    ) : null;

  return (
    <div className="@container min-w-0">
      {/* Em cima do desenho: à esquerda, o título e a legenda da moldura e, quando se aponta, a leitura do ponto no
          lugar deles (os dois na mesma célula, para a altura ser a do maior e nada pular); à direita, os controles.
          No estreito os controles sobem para uma linha própria. A leitura é texto de 12 px com linha de 16 px, e a
          altura reservada acompanha a largura (uma linha no largo, três no celular). Com dentes na série a leitura
          tem um item a mais (o melhor e o pior momento da operação), só nas operações medidas: a reserva sobe uma
          linha em cada largura (revisão de 23/09/2026), senão o desenho pulava quando o dedo passava de uma
          operação não medida para uma medida */}
      <div className="mb-3 flex flex-col-reverse gap-x-6 gap-y-2 @lg:flex-row @lg:items-start @lg:pr-16 @lg:sm:pr-20">
        <div className={cn("grid min-w-0 flex-1", dentes ? "min-h-[4.375rem] @lg:min-h-[3.25rem] @3xl:min-h-[2.125rem]" : "min-h-[3.25rem] @lg:min-h-[2.125rem] @3xl:min-h-4")}>
          {moldura && (moldura.titulo || moldura.legenda) ? (
            <div className={cn("col-start-1 row-start-1 flex flex-wrap content-start items-baseline gap-x-4 gap-y-0.5 text-[0.8125rem] leading-5", atual && "invisible")}>
              {moldura.titulo ? <div className="min-w-0 text-muted-foreground">{moldura.titulo}</div> : null}
              {/* a legenda continua aria-hidden: quem põe nela um aviso que precisa ser lido já o repete numa região de status */}
              {moldura.legenda ? (
                <div aria-hidden className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sutil">
                  {moldura.legenda}
                </div>
              ) : null}
            </div>
          ) : null}
          <Leitura conteudo={atual ? atual.dica : null} className="pointer-events-none col-start-1 row-start-1" />
        </div>
        {moldura?.abas ? <div className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-2 text-[0.8125rem]">{moldura.abas}</div> : null}
      </div>

      {/* a calha da direita é do eixo de valores */}
      <div
        role="img"
        aria-label={rotuloAria}
        className="pr-16 sm:pr-20"
        // no toque o "sair" vem logo depois de soltar o dedo: o fio fica onde ele parou
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") setAlvo(null);
        }}
      >
        <div
          className="relative cursor-crosshair touch-pan-y"
          style={{ height: `var(--alt-curva, ${altura}px)` }}
          onPointerMove={arrastar}
          onPointerDown={comecarArrasto}
          onPointerUp={soltar}
          onPointerCancel={() => setAlvo(null)}
        >
          {marcas.map((m) => (
            <div
              key={m}
              aria-hidden
              className={cn("absolute inset-x-0 border-t", m === 0 ? "border-dashed" : "border-(--painel-fio)")}
              style={{ top: `${y(m)}%`, ...(m === 0 ? { borderColor: cores.zero, borderTopWidth: cores.zeroLargura } : null) }}
            >
              <span className="absolute top-0 left-full -translate-y-1/2 pl-3 text-xs leading-none whitespace-nowrap text-sutil">{formatarEixo(m)}</span>
            </div>
          ))}
          <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 block size-full overflow-visible">
            {/* a faixa mín./máx. do saldo dentro de cada balde (23/09/2026), por baixo da linha: um véu na cor do
                texto, sem verde nem vermelho */}
            {faixa ? <path d={faixa} fill={cores.alta} fillOpacity={0.1} /> : null}
            {/* os dentes de MFE/MAE (23/09/2026): traço fino por baixo da linha, para o acumulado continuar sendo
                o que se lê primeiro */}
            {dentes ? <path d={dentes} fill="none" stroke="var(--sutil)" strokeOpacity={0.6} strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
            <path d={tracado} fill="none" stroke={cores.alta} strokeWidth={cores.linha} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {queda ? (
              <path d={queda.tracado} fill="none" stroke={cores.baixa} strokeWidth={Math.round((cores.linha + 0.3) * 10) / 10} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ) : null}
          </svg>
          {/* o nome do trecho vermelho, escrito acima do pico; vira para a esquerda na metade direita do desenho */}
          {queda ? (
            <span
              aria-hidden
              className={cn("pointer-events-none absolute -mt-7 text-xs leading-tight whitespace-nowrap text-muted-foreground", queda.x > 50 && "-translate-x-full")}
              style={{ left: `${queda.x}%`, top: `${queda.y}%` }}
            >
              {rotuloDaQueda}
              {formatarQueda ? <b className="font-medium text-negativo"> {formatarQueda(-(valorDaQueda ?? queda.valor))}</b> : null}
            </span>
          ) : null}
          {selecao ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 border-x border-(--painel-fio-forte) bg-(--linha-hover)"
              style={{ left: `${selecao.de * 100}%`, width: `${(selecao.ate - selecao.de) * 100}%` }}
            />
          ) : null}
          {/* Marcadores em HTML, como o ponto apontado: dentro do SVG esticado o círculo viraria uma elipse. Ficam
              antes da mira no DOM para nunca cobri-la, e o círculo some quando o ponteiro cai no ponto desenhado
              mais perto dele (em série fatiada o marcador pode não coincidir com nenhum ponto). O rótulo vira para
              dentro perto da borda direita para não invadir o eixo, e fica do lado oposto ao da linha: num pico a
              linha só desce, então o rótulo vai para cima; num vale só sobe, então vai para baixo. */}
          {marcadores.map((m, i) => {
            const px = m.posicao * 100;
            const cor = m.tom === "positivo" ? "var(--positivo)" : "var(--negativo)";
            const sobOAtivo = ativo === indiceMaisPerto(pontos, m.posicao);
            return (
              <div key={`${m.rotulo}-${i}`} aria-hidden className="pointer-events-none absolute" style={{ left: `${px}%`, top: `${y(m.valor)}%` }}>
                {sobOAtivo ? null : (
                  <div className="absolute top-0 left-0 size-1.5 -translate-1/2 rounded-full" style={{ background: cor, boxShadow: "0 0 0 1.5px var(--background)" }} />
                )}
                <span
                  className={cn("absolute text-[11px] leading-none font-medium whitespace-nowrap", m.tom === "positivo" ? "bottom-0.5" : "top-0.5", px > 85 ? "right-2" : "left-2")}
                  style={{ color: cor }}
                >
                  {m.rotulo}
                </span>
              </div>
            );
          })}
          {/* Os fechamentos em cima da linha da série do saldo (23/09/2026): em HTML, como os marcadores, porque
              no SVG esticado o círculo viraria uma elipse. Pequenos, na cor da linha, com o fundo em volta para
              se destacarem dela; antes da mira no DOM, para nunca cobri-la */}
          {fechamentos.map((f, i) => (
            <div
              key={i}
              aria-hidden
              className="pointer-events-none absolute size-1.5 -translate-1/2 rounded-full bg-foreground"
              style={{ left: `${f.posicao * 100}%`, top: `${y(f.valor)}%`, boxShadow: "0 0 0 1px var(--background)" }}
            />
          ))}
          {/* a ponta da curva: onde o resultado está agora */}
          <i aria-hidden className="pointer-events-none absolute size-[7px] -translate-1/2 rounded-full bg-foreground" style={{ left: `${x(n - 1)}%`, top: `${y(ultimo.acumulado)}%` }} />
          {mira(true)}
        </div>

        {comDrawdown && escalaDD ? (
          <div
            className="relative mt-9 cursor-crosshair touch-pan-y border-t border-(--painel-fio-forte)"
            style={{ height: alturaDoDrawdown }}
            onPointerMove={apontar}
            onPointerDown={apontar}
            onPointerCancel={() => setAlvo(null)}
          >
            <small aria-hidden className="absolute -top-5 left-0 text-[11px] leading-none text-sutil">
              quanto ficou abaixo do ponto mais alto
            </small>
            {escalaDD.marcas
              .filter((m) => m !== 0)
              .map((m) => (
                <div key={m} aria-hidden className="absolute inset-x-0 border-t border-(--painel-fio)" style={{ top: `${escalaDD.y(m)}%` }}>
                  <span className="absolute top-0 left-full -translate-y-1/2 pl-3 text-xs leading-none whitespace-nowrap text-sutil">{formatarEixoDrawdown(m)}</span>
                </div>
              ))}
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 block size-full">
              {/* série longa: uma área só do zero até a queda de cada ponto (o fio marca o apontado);
                  série curta: uma barra por ponto, as outras mais apagadas quando se aponta uma */}
              {areaDoDrawdown !== null ? (
                <path d={areaDoDrawdown} fill={cores.baixa} />
              ) : (
                pontos.map((p, i) =>
                  p.drawdown < 0 ? (
                    <rect
                      key={i}
                      x={(x(i) - larguraDaBarra / 2).toFixed(3)}
                      y="0"
                      width={larguraDaBarra.toFixed(3)}
                      height={escalaDD.y(p.drawdown).toFixed(2)}
                      fill={cores.baixa}
                      opacity={ativo === null || ativo === i ? 1 : 0.55}
                    />
                  ) : null,
                )
              )}
            </svg>
            {mira(false)}
          </div>
        ) : null}

        <div aria-hidden className="relative h-7 text-xs text-sutil">
          {rotulosX.map((m, i) => (
            <span
              key={m.x}
              className={cn("absolute top-2.5 leading-none whitespace-nowrap", i % 2 === 1 && "max-sm:hidden")}
              style={{ left: `${m.x}%`, transform: m.x < 4 ? "none" : "translateX(-50%)" }}
            >
              {m.rotulo}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * O que fica em volta do desenho. Era a moldura grafite do Profit: uma caixa arredondada com o título
 * centralizado em cima, a legenda embaixo e as abas no rodapé. Desde a ficha Mesa (25/11/2026) não há caixa,
 * e a moldura só entrega ao desenho de dentro dela o que recebeu: o título (texto pequeno e cinza) e a legenda
 * ocupam a linha de leitura acima da curva enquanto nada é apontado, e o que vier em `abas` (o seletor de
 * agrupamento) fica à direita dessa linha, alinhado à borda do gráfico. Legenda só quando algo no desenho
 * precisa de explicação. O nome ficou para não mexer em quem chama.
 *
 * A legenda continua aria-hidden: quem põe nela um aviso que precisa ser lido já o repete numa região de
 * status. Controle (botão, link) não vai na legenda; vai em `abas`. Se o filho direto não for um
 * DesenhoDaCurva, a própria moldura escreve o título e os controles em cima e a legenda embaixo.
 */
export function MolduraProfit({
  titulo,
  legenda,
  abas,
  children,
}: {
  titulo?: React.ReactNode;
  legenda?: React.ReactNode;
  abas?: React.ReactNode;
  children: React.ReactNode;
}) {
  const comDesenho = Children.toArray(children).some((c) => isValidElement(c) && c.type === DesenhoDaCurva);
  if (comDesenho) {
    return (
      <div className="min-w-0">
        <DaMoldura.Provider value={{ titulo, legenda, abas }}>{children}</DaMoldura.Provider>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      {titulo || abas ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 lg:pr-20">
          {titulo ? <div className="min-w-0 text-[0.8125rem] text-muted-foreground">{titulo}</div> : null}
          {abas ? <div className="ml-auto flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-2 text-[0.8125rem]">{abas}</div> : null}
        </div>
      ) : null}
      {children}
      {legenda ? (
        <div aria-hidden className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.8125rem] text-sutil">
          {legenda}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Era o risquinho verde e vermelho ao lado do texto da legenda. Com uma linha só no desenho, na cor do
 * texto, não há o que a amostra distinguir, e ícone de enfeite não entra (ficha Mesa, 25/11/2026): não
 * desenha nada. Continua exportada, com a mesma prop, para não quebrar quem a põe na legenda.
 */
export function AmostraDaLinha(props: { cores: CoresDaCurva }) {
  void props;
  return null;
}
