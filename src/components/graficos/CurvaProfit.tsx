"use client";

// O desenho da curva no estilo do Gráfico de Patrimônio do Relatório de Performance do Profit, trazido
// do Zeve Hub (17/09/2026, pedido do Artur: "o gráfico de performance pode ser estilo profit (por
// operação, por dia) e as cores; vc fez no hub então é aquele estilo"). Do Profit ficaram o desenho e o
// gesto: título no alto, legenda embaixo, abas no rodapé, mira em cruz com as etiquetas nos eixos, área
// em degradê até o zero. As cores, medidas pixel a pixel em prints do Profit (moldura grafite nos dois
// temas), saíram em 13/10/2026 com o mídia kit da Zeve: agora são os tokens do tema (globals.css). Aqui
// só se desenha: cada ponto chega com a posição, o acumulado, o drawdown e a leitura já montados.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ExtrasDoPonto, FechamentoNaCurva } from "@/lib/stats/saldo-dia";
import { Leitura, indiceMaisPerto, mistura, passo, type ConteudoDaDica } from "./base";

/**
 * As cores da moldura e do desenho, em tokens do tema desde 13/10/2026 (até 12/10/2026: os hex medidos no
 * Profit, grafite #222222 com verde #22e57d e vermelho #ff5858, iguais no claro e no escuro). A moldura agora
 * acompanha o tema: o fundo é o chão do site, um degrau abaixo do cartão que a contém nos dois temas, com o
 * fio do painel em volta; o resultado pinta no verde e no vermelho do site; o que é interação (aba ativa,
 * seleção do zoom) e a linha da curva de capital ficam no acento azul. Os nomes são os de antes porque o
 * calendário, a curva do dia e o simulador os usam na própria legenda.
 *
 * Contraste (medido com os tokens): o texto apagado sobre o fundo dá 5,5:1 no claro e 7,8:1 no escuro, e
 * sobre a barra das abas 5,1:1 e 6,7:1; a aba ativa é branco sobre o azul, 5,4:1; a linha do acento passa de
 * 5:1 sobre o fundo nos dois temas.
 */
export const PROFIT = {
  /** o poço do gráfico: a cor do chão (#F5F7FC no claro, #050915 no escuro) */
  fundo: "var(--background)",
  /** o fio em volta da moldura */
  borda: "var(--painel-fio)",
  grade: mistura("--foreground", 10),
  zero: mistura("--foreground", 26),
  alta: "var(--positivo)",
  baixa: "var(--negativo)",
  /** a linha da curva de capital quando quem chama não pede outra cor */
  acento: "var(--info)",
  texto: "var(--muted-foreground)",
  // o separador medido no Profit (#505050) saiu em 19/09/2026: 1,57:1 sobre as abas; o "|" usa o textoFraco
  textoFraco: "var(--muted-foreground)",
  titulo: "var(--foreground)",
  abas: "var(--muted)",
  abasBorda: "var(--painel-fio-forte)",
  abaAtiva: "var(--primary)",
  abaAtivaTexto: "var(--primary-foreground)",
  abaTexto: "var(--muted-foreground)",
  /** as etiquetas da mira nos eixos: invertidas, o texto do site como fundo */
  mira: "var(--foreground)",
  miraTexto: "var(--background)",
  /**
   * O texto sobre a etiqueta verde ou vermelha do último valor: o cartão, branco no claro e marinho no escuro.
   * Com o verde e o vermelho de cada tema: 5,0:1 e 4,8:1 no claro, 8,3:1 e 5,0:1 no escuro (o branco sobre o
   * verde do escuro dava 2,3:1).
   */
  sobreCor: "var(--card)",
} as const;

/**
 * Classes do botão pequeno dentro da moldura ("Ver tudo", "Tentar de novo"): o fio forte em volta, o texto do
 * site e o foco de todo o site (o contorno do :focus-visible do globals.css). Até 12/10/2026 o anel era branco,
 * para aparecer no grafite; na moldura clara ele sumiria.
 */
export const BOTAO_DA_MOLDURA =
  "rounded-full border border-(--painel-fio-forte) px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-(--linha-hover)";

/** Linha e área da curva: cada agrupamento com a espessura e a força da área que o Profit usa nele. */
export interface CoresDaCurva {
  alta: string;
  baixa: string;
  linha: number;
  areaTopo: number;
  areaZero: number;
  zero: string;
  zeroLargura: number;
  /**
   * A linha numa cor só (13/10/2026): o acento na curva de capital, a cor do robô (corDoRobo) onde a série é
   * de um robô. Sem ela, como sempre: a linha é verde acima do zero e vermelha abaixo. A área continua verde
   * acima e vermelha abaixo nos dois casos: o sinal do resultado não muda de cor.
   */
  linhaCor?: string;
}

/** Por operação: linha de 1,5 px e área leve, as proporções do print da central de ajuda da Nelogica. */
export const CURVA_POR_OPERACAO: CoresDaCurva = {
  alta: PROFIT.alta,
  baixa: PROFIT.baixa,
  linha: 1.5,
  areaTopo: 0.26,
  areaZero: 0.04,
  zero: PROFIT.zero,
  zeroLargura: 2,
};

/**
 * Por dia: linha de 2 px e área mais forte, como no Profit do Artur agrupado por dia. A área desceu de 0,39
 * para 0,3 em 13/10/2026: com o verde do site, mais forte que o #00bb00 medido, ela brigava com a linha.
 */
export const CURVA_POR_DIA: CoresDaCurva = {
  alta: PROFIT.alta,
  baixa: PROFIT.baixa,
  linha: 2,
  areaTopo: 0.3,
  areaZero: 0.05,
  zero: PROFIT.zero,
  zeroLargura: 1,
};

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
  /** a leitura do ponto, na linha fixa no alto da moldura */
  dica: ConteudoDaDica;
  /** o que a etiqueta do eixo de baixo diz na mira: a data, a hora ou a ordem da operação */
  eixo?: string;
}

/** Um ponto marcado em cima da curva (o MEP e o MEN do dia, por exemplo), com um rótulo curto ao lado. */
export interface MarcadorDaCurva {
  /** de 0 a 1 no eixo de baixo, na mesma régua dos pontos */
  posicao: number;
  /** o valor no eixo vertical, na mesma unidade do acumulado */
  valor: number;
  /** curto, cabe ao lado do ponto: "MEP", "MEN" */
  rotulo: string;
  tom: "positivo" | "negativo";
}

/** Escala da curva: só 5% além do maior valor e, quando passa abaixo do zero, 5% abaixo do menor. */
function escalaDaCurva(valores: number[]) {
  const max = valores.reduce((m, v) => Math.max(m, v), 0);
  const min = valores.reduce((m, v) => Math.min(m, v), 0);
  const amplitude = max - min || 1;
  const p = passo(amplitude, 5);
  const topo = max + amplitude * 0.05;
  const fundo = min < 0 ? min - amplitude * 0.05 : 0;
  const marcas: number[] = [];
  for (let v = Math.ceil(fundo / p) * p; v <= topo; v += p) marcas.push(Math.round(v * 100) / 100 || 0);
  return { marcas, y: (v: number) => ((topo - v) / (topo - fundo)) * 100 };
}

/** Escala das barras do drawdown: do zero até o pior valor arredondado para baixo. */
function escalaDoDrawdown(quedas: number[]) {
  const pior = quedas.reduce((m, q) => Math.min(m, q), 0);
  const p = passo(Math.abs(pior) || 1, 3);
  const fundo = Math.min(-p, Math.floor(pior / p) * p);
  const marcas: number[] = [];
  for (let v = 0; v >= fundo - p / 2; v -= p) marcas.push(Math.round(v * 100) / 100 || 0);
  return { marcas, y: (v: number) => (v / fundo) * 100 };
}

/** Acima disso o drawdown deixa de ser uma barra por ponto (um nó de SVG cada) e vira uma área só. */
export const MAX_BARRAS = 600;

/**
 * A área do drawdown de uma série longa (22/09/2026, com a série por operação de até 20 mil pontos):
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
 * A linha e a área da curva, em % do desenho. De sempre: a linha nasce no zero, na borda esquerda, antes do
 * primeiro ponto (as curvas por operação e por dia começam do nada). Com `doPrimeiroPonto` (a série do saldo,
 * revisão de 23/09/2026) ela nasce no PRIMEIRO PONTO: o coletor que subiu às 11:30 virava uma rampa de
 * (09:00, R$ 0) até (11:30, o saldo de lá), com a área pintada embaixo, um caminho que nunca aconteceu e o
 * oposto da "curva real" pedida; a área vai do zero sob o primeiro ponto até o zero sob o último. Com o
 * primeiro ponto em x = 0 os dois modos desenham a mesma coisa (só some o risco vertical na borda).
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

const SEM_MARCADORES: readonly MarcadorDaCurva[] = [];
const SEM_FECHAMENTOS: readonly FechamentoNaCurva[] = [];

/**
 * A régua da direita. `evitar` são as alturas (em %) das etiquetas de valor que ficam por cima dela: a marca
 * que cairia debaixo de uma etiqueta não é escrita (24/09/2026: "1.131" da etiqueta encostava no "1.000" da
 * régua e virava um número só). A largura da coluna continua vindo de todas as marcas, para não pular.
 */
function EixoProfit({
  marcas,
  y,
  altura,
  formatar,
  evitar = [],
}: {
  marcas: number[];
  y: (v: number) => number;
  altura: number;
  formatar: (v: number) => string;
  evitar?: number[];
}) {
  // a etiqueta tem uns 18 px de altura; em % da altura do gráfico
  const limiar = (20 / altura) * 100;
  const visiveis = marcas.filter((m) => !evitar.some((e) => Math.abs(y(m) - e) < limiar));
  return (
    <div aria-hidden className="relative text-[11px] tabular-nums" style={{ height: altura, color: PROFIT.texto }}>
      {marcas.map((m) => (
        <span key={m} className="invisible block h-0 leading-none whitespace-nowrap">
          {formatar(m)}
        </span>
      ))}
      {visiveis.map((m) => (
        <span key={m} className="absolute left-0 -translate-y-1/2 leading-none whitespace-nowrap" style={{ top: `${y(m)}%` }}>
          {formatar(m)}
        </span>
      ))}
    </div>
  );
}

/**
 * A etiqueta no eixo da direita, na altura do valor; encosta no desenho, como a do Profit. Até 12/10/2026 a cor
 * do texto saía da luminância do hex do fundo; com os tokens quem chama diz as duas.
 */
function EtiquetaDoEixo({ topo, fundo, texto, children }: { topo: number; fundo: string; texto: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="absolute -left-1 -translate-y-1/2 rounded-[3px] px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums"
      style={{ top: `${topo}%`, background: fundo, color: texto }}
    >
      {children}
    </span>
  );
}

function RotuloVertical({ altura, children }: { altura: number; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="flex items-center justify-center overflow-hidden text-[10px] whitespace-nowrap max-sm:w-0"
      style={{ height: altura, color: PROFIT.textoFraco, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
    >
      {children}
    </div>
  );
}

interface Props {
  id: string;
  pontos: PontoDoDesenho[];
  /** valores que dimensionam a escala; sem eles, os próprios pontos (os dois agrupamentos dividem a mesma) */
  escalaDe?: number[];
  cores: CoresDaCurva;
  altura: number;
  /** altura das barras do drawdown embaixo; 0 esconde */
  alturaDoDrawdown?: number;
  rotulosX: Array<{ x: number; rotulo: string }>;
  formatarEixo: (v: number) => string;
  /**
   * Formata o eixo do drawdown embaixo; sem ele, o mesmo formatarEixo da curva. O simulador
   * (23/09/2026) rotula a curva como patrimônio (capital + acumulado) e o drawdown em R$.
   */
  formatarEixoDrawdown?: (v: number) => string;
  rotuloVertical: string;
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
   * A linha e a área nascem no primeiro ponto, e não no zero da borda esquerda (a série do saldo, cujo eixo é o
   * horário do dia: o coletor que subiu no meio do dia não pode virar uma rampa desde a abertura). Ver caminhoDaLinha.
   */
  comecarNoPrimeiroPonto?: boolean;
}

/**
 * Linha com área em degradê até o zero, verde acima e vermelha abaixo, e o drawdown em barras vermelhas no
 * mesmo eixo de tempo. A linha é verde e vermelha como a área, ou de uma cor só quando `cores.linhaCor` vem
 * (13/10/2026: o acento na curva de capital, a cor do robô onde a série é de um robô). Com `aoSelecionar`,
 * arrastar com o mouse marca um trecho para dar zoom (18/09/2026, "os gráficos são pouco interativos").
 *
 * Apontar, desde 19/09/2026, é como no Profit ("esses gráficos consegue deixar estilo do profit?"):
 * mira em cruz tracejada no ponto, a etiqueta do valor no eixo da direita e a da data (ou da hora, ou
 * da ordem) no eixo de baixo, e a leitura do ponto numa linha fixa no alto da moldura. Sem o ponteiro,
 * a linha mostra o último ponto e a etiqueta colorida do último valor fica sempre no eixo: o resultado
 * não some mais debaixo da dica. No toque, arrastar o dedo move a mira, e ela fica onde o dedo soltou.
 */
export function DesenhoDaCurva({
  id,
  pontos,
  escalaDe,
  cores,
  altura,
  alturaDoDrawdown = 0,
  rotulosX,
  formatarEixo,
  formatarEixoDrawdown = formatarEixo,
  rotuloVertical,
  rotuloAria,
  aoSelecionar,
  marcadores = SEM_MARCADORES,
  fechamentos = SEM_FECHAMENTOS,
  mostrarFaixa = true,
  mostrarDentes = true,
  comecarNoPrimeiroPonto = false,
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

  // O que não muda ao apontar fica montado uma vez (22/09/2026): com a série por operação de até 20 mil
  // pontos, refazer o traçado, a escala e a etiqueta mais larga a cada movimento do ponteiro travava a mira.
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
    // a linha e a área: do zero na borda esquerda, ou do primeiro ponto (a série do saldo)
    const { tracado, area } = caminhoDaLinha(pontos, x, y, casas, zero, comecarNoPrimeiroPonto);
    let maior = 0;
    let menor = 0;
    // a coluna do eixo reserva a largura da etiqueta mais larga, para ela não invadir o rótulo vertical
    let etiquetaMaisLarga = "";
    for (const p of pontos) {
      if (p.acumulado > maior) maior = p.acumulado;
      if (p.acumulado < menor) menor = p.acumulado;
      const t = formatarEixo(p.acumulado);
      if (t.length > etiquetaMaisLarga.length) etiquetaMaisLarga = t;
    }
    const escalaDD = escalaDoDrawdown(pontos.map((p) => p.drawdown));
    return {
      x,
      marcas,
      y,
      zero,
      tracado,
      area,
      topoDaCurva: y(maior),
      fundoDaCurva: y(menor),
      escalaDD,
      larguraDaBarra: Math.min((100 / n) * 0.72, 3),
      // acima de MAX_BARRAS o drawdown é uma área só; abaixo, as barras de sempre
      areaDoDrawdown: n > MAX_BARRAS ? caminhoDoDrawdown(pontos, escalaDD.y) : null,
      etiquetaMaisLarga,
      // a faixa mín./máx. e os dentes de MFE/MAE (23/09/2026), um caminho cada; "" quando nenhum ponto os tem
      faixa: mostrarFaixa ? caminhoDaFaixa(pontos, x, y, casas) : "",
      dentes: mostrarDentes ? caminhoDosDentes(pontos, x, y, casas) : "",
    };
  }, [pontos, n, escalaDe, marcadores, formatarEixo, mostrarFaixa, mostrarDentes, comecarNoPrimeiroPonto]);
  if (n === 0 || desenho === null) return null;

  const { x, marcas, y, zero, tracado, area, topoDaCurva, fundoDaCurva, escalaDD, larguraDaBarra, areaDoDrawdown, etiquetaMaisLarga, faixa, dentes } = desenho;
  const comDrawdown = alturaDoDrawdown > 0;

  const apontar = (e: ReactPointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    setAlvo((e.clientX - caixa.left) / (caixa.width || 1));
  };
  // o ponto mais perto do ponteiro: com as operações espalhadas dentro de cada dia, o passo entre pontos não
  // é fixo; como eles vêm em ordem de posição, a busca é binária
  const ativo = alvo === null ? null : indiceMaisPerto(pontos, alvo);
  const atual = ativo !== null ? pontos[ativo] : null;
  const ultimo = pontos[n - 1];
  const corDoValor = (v: number) => (v >= 0 ? cores.alta : cores.baixa);

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

  return (
    <div
      role="img"
      aria-label={rotuloAria}
      className="@container grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2"
      // no toque o "sair" vem logo depois de soltar o dedo: a mira fica onde ele parou
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") setAlvo(null);
      }}
    >
      {/* A altura reservada acompanha a largura (uma linha no largo, três no celular), para o desenho não pular.
          Com dentes na série a dica tem uma linha a mais ("MFE / MAE"), só nas operações medidas: a reserva sobe
          uma linha em cada largura (revisão de 23/09/2026), senão o desenho pulava ~18 px quando o dedo passava de
          uma operação não medida para uma medida */}
      {/* nas cores do tema desde 13/10/2026 (antes, a paleta da moldura grafite) */}
      <Leitura
        conteudo={(atual ?? ultimo).dica}
        className={`col-span-3 mb-2 ${dentes ? "min-h-[70px] @md:min-h-[52px] @3xl:min-h-[34px]" : "min-h-[52px] @md:min-h-[34px] @3xl:min-h-4"}`}
      />
      <div
        className={`relative touch-pan-y ${aoSelecionar ? "cursor-crosshair" : ""}`}
        style={{ height: altura }}
        onPointerMove={arrastar}
        onPointerDown={comecarArrasto}
        onPointerUp={soltar}
        onPointerCancel={() => setAlvo(null)}
      >
        {/* as guias pontilhadas, como nas barras (base.tsx): desde 13/10/2026 os dois desenhos falam a mesma língua */}
        {marcas
          .filter((m) => m !== 0)
          .map((m) => (
            <div key={m} aria-hidden className="absolute inset-x-0 border-t border-dotted" style={{ top: `${y(m)}%`, borderColor: PROFIT.grade }} />
          ))}
        {/* As cores vão no style, e não nos atributos de apresentação do SVG: são tokens (var() e color-mix()) */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <clipPath id={`${id}-acima`}>
              <rect x="0" y="0" width="100" height={Math.max(0, zero)} />
            </clipPath>
            <clipPath id={`${id}-abaixo`}>
              <rect x="0" y={Math.max(0, zero)} width="100" height={Math.max(0, 100 - zero)} />
            </clipPath>
            <linearGradient id={`${id}-alta`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={topoDaCurva} y2={zero}>
              <stop offset="0" style={{ stopColor: cores.alta, stopOpacity: cores.areaTopo }} />
              <stop offset="1" style={{ stopColor: cores.alta, stopOpacity: cores.areaZero }} />
            </linearGradient>
            <linearGradient id={`${id}-baixa`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={zero} y2={fundoDaCurva}>
              <stop offset="0" style={{ stopColor: cores.baixa, stopOpacity: cores.areaZero }} />
              <stop offset="1" style={{ stopColor: cores.baixa, stopOpacity: cores.areaTopo }} />
            </linearGradient>
          </defs>
          <line x1="0" x2="100" y1={zero} y2={zero} style={{ stroke: cores.zero }} strokeWidth={cores.zeroLargura} vectorEffect="non-scaling-stroke" />
          {/* a faixa mín./máx. do saldo dentro de cada balde (23/09/2026), antes da área para ficar por baixo dela:
              verde acima do zero, vermelha abaixo, no mesmo corte das áreas */}
          {faixa ? (
            <>
              <path d={faixa} style={{ fill: cores.alta }} fillOpacity={0.18} clipPath={`url(#${id}-acima)`} />
              <path d={faixa} style={{ fill: cores.baixa }} fillOpacity={0.18} clipPath={`url(#${id}-abaixo)`} />
            </>
          ) : null}
          <path d={area} fill={`url(#${id}-alta)`} clipPath={`url(#${id}-acima)`} />
          <path d={area} fill={`url(#${id}-baixa)`} clipPath={`url(#${id}-abaixo)`} />
          {/* os dentes de MFE/MAE (23/09/2026): traço fino por cima da área e por baixo da linha, para o
              acumulado continuar sendo o que se lê primeiro */}
          {dentes ? (
            <path d={dentes} fill="none" style={{ stroke: PROFIT.texto }} strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ) : null}
          {cores.linhaCor ? (
            <path d={tracado} fill="none" style={{ stroke: cores.linhaCor }} strokeWidth={cores.linha} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ) : (
            <>
              <path d={tracado} fill="none" style={{ stroke: cores.alta }} strokeWidth={cores.linha} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${id}-acima)`} />
              <path d={tracado} fill="none" style={{ stroke: cores.baixa }} strokeWidth={cores.linha} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#${id}-abaixo)`} />
            </>
          )}
        </svg>
        {/* o trecho do zoom no acento: é interação, não resultado */}
        {selecao ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 border-x"
            style={{ left: `${selecao.de * 100}%`, width: `${(selecao.ate - selecao.de) * 100}%`, background: mistura("--info", 12), borderColor: PROFIT.acento }}
          />
        ) : null}
        {/* Marcadores em HTML, como o ponto ativo: dentro do SVG esticado o círculo viraria uma elipse. Ficam antes
            do ponto ativo no DOM para nunca cobrirem o ponto ativo, e o círculo some quando o hover cai no ponto
            desenhado mais perto dele (em série fatiada o marcador pode não coincidir com nenhum ponto). O rótulo
            vira para dentro perto da borda direita para não invadir o eixo, e fica do lado oposto ao da linha:
            num pico a linha só desce, então o rótulo vai para cima; num vale só sobe, então vai para baixo. */}
        {marcadores.map((m, i) => {
          const px = m.posicao * 100;
          const cor = m.tom === "positivo" ? cores.alta : cores.baixa;
          const sobOAtivo = ativo === indiceMaisPerto(pontos, m.posicao);
          return (
            <div key={`${m.rotulo}-${i}`} aria-hidden className="pointer-events-none absolute" style={{ left: `${px}%`, top: `${y(m.valor)}%` }}>
              {sobOAtivo ? null : (
                <div
                  className="absolute top-0 left-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: cor, boxShadow: `0 0 0 1.5px ${PROFIT.fundo}` }}
                />
              )}
              <span
                className={`absolute text-[10px] leading-none font-semibold whitespace-nowrap ${m.tom === "positivo" ? "bottom-px" : "top-px"} ${px > 85 ? "right-2" : "left-2"}`}
                style={{ color: cor }}
              >
                {m.rotulo}
              </span>
            </div>
          );
        })}
        {/* Os fechamentos em cima da linha da série do saldo (23/09/2026): em HTML, como os marcadores, porque
            no SVG esticado o círculo viraria uma elipse. Pequenos, na cor do texto, com o fio do fundo em volta
            para se destacarem da linha; antes do ponto ativo no DOM, para nunca cobri-lo */}
        {fechamentos.map((f, i) => (
          <div
            key={i}
            aria-hidden
            className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${f.posicao * 100}%`, top: `${y(f.valor)}%`, background: PROFIT.titulo, opacity: 0.9, boxShadow: `0 0 0 1px ${PROFIT.fundo}` }}
          />
        ))}
        {/* a mira em cruz do Profit: as duas linhas tracejadas finas se cruzam no ponto */}
        {atual && ativo !== null ? (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-dashed" style={{ left: `${x(ativo)}%`, borderColor: PROFIT.textoFraco }} />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ top: `${y(atual.acumulado)}%`, borderColor: PROFIT.textoFraco }} />
            {/* o ponto pelo sinal do valor, com o fio do fundo em volta para se soltar da linha */}
            <div
              aria-hidden
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${x(ativo)}%`, top: `${y(atual.acumulado)}%`, background: corDoValor(atual.acumulado), boxShadow: `0 0 0 2px ${PROFIT.fundo}` }}
            />
          </>
        ) : null}
      </div>
      {/* no eixo, a etiqueta do último valor, verde ou vermelha pelo sinal, fica sempre; a da mira, invertida
          (a cor do texto como fundo), vem por cima quando se aponta */}
      <div className="relative">
        <EixoProfit
          marcas={marcas}
          y={y}
          altura={altura}
          formatar={formatarEixo}
          evitar={atual ? [y(ultimo.acumulado), y(atual.acumulado)] : [y(ultimo.acumulado)]}
        />
        <span aria-hidden className="invisible block h-0 overflow-hidden px-1.5 text-[11px] font-medium whitespace-nowrap tabular-nums">
          {etiquetaMaisLarga}
        </span>
        <EtiquetaDoEixo topo={y(ultimo.acumulado)} fundo={corDoValor(ultimo.acumulado)} texto={PROFIT.sobreCor}>
          {formatarEixo(ultimo.acumulado)}
        </EtiquetaDoEixo>
        {atual ? (
          <EtiquetaDoEixo topo={y(atual.acumulado)} fundo={PROFIT.mira} texto={PROFIT.miraTexto}>
            {formatarEixo(atual.acumulado)}
          </EtiquetaDoEixo>
        ) : null}
      </div>
      <RotuloVertical altura={altura}>{rotuloVertical}</RotuloVertical>

      {comDrawdown ? (
        <>
          <div
            className="relative mt-4 touch-pan-y border-t"
            style={{ height: alturaDoDrawdown, borderColor: PROFIT.zero }}
            onPointerMove={apontar}
            onPointerDown={apontar}
            onPointerCancel={() => setAlvo(null)}
          >
            {escalaDD.marcas
              .filter((m) => m !== 0)
              .map((m) => (
                <div key={m} aria-hidden className="absolute inset-x-0 border-t border-dotted" style={{ top: `${escalaDD.y(m)}%`, borderColor: PROFIT.grade }} />
              ))}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
              {/* série longa: uma área só do zero até o drawdown de cada ponto (a mira tracejada marca o apontado);
                  série curta: uma barra por ponto, a apontada mais forte */}
              {areaDoDrawdown !== null ? (
                <path d={areaDoDrawdown} style={{ fill: PROFIT.baixa }} fillOpacity={0.62} />
              ) : (
                pontos.map((p, i) =>
                  p.drawdown < 0 ? (
                    <rect
                      key={i}
                      x={(x(i) - larguraDaBarra / 2).toFixed(3)}
                      y="0"
                      width={larguraDaBarra.toFixed(3)}
                      height={escalaDD.y(p.drawdown).toFixed(2)}
                      style={{ fill: PROFIT.baixa }}
                      fillOpacity={atual && ativo === i ? 0.95 : 0.62}
                    />
                  ) : null,
                )
              )}
            </svg>
            {atual && ativo !== null ? (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-dashed" style={{ left: `${x(ativo)}%`, borderColor: PROFIT.textoFraco }} />
            ) : null}
          </div>
          <div className="mt-4">
            <EixoProfit marcas={escalaDD.marcas} y={escalaDD.y} altura={alturaDoDrawdown} formatar={formatarEixoDrawdown} />
          </div>
          <div className="mt-4">
            <RotuloVertical altura={alturaDoDrawdown}>Drawdown</RotuloVertical>
          </div>
        </>
      ) : null}

      <div aria-hidden className="relative mt-1.5 h-4 text-[11px] tabular-nums" style={{ color: PROFIT.texto }}>
        {rotulosX.map((m, i) => (
          <span
            key={m.x}
            className={`absolute whitespace-nowrap ${i % 2 === 1 ? "max-sm:hidden" : ""}`}
            style={{ left: `${m.x}%`, transform: m.x < 4 ? "none" : "translateX(-50%)" }}
          >
            {m.rotulo}
          </span>
        ))}
        {/* a etiqueta da mira no eixo de baixo; o deslocamento proporcional mantém a caixa dentro do desenho nas pontas */}
        {atual?.eixo && ativo !== null ? (
          <span
            className="absolute -top-0.5 rounded-[3px] px-1.5 py-0.5 font-medium whitespace-nowrap"
            style={{ left: `${x(ativo)}%`, transform: `translateX(-${x(ativo)}%)`, background: PROFIT.mira, color: PROFIT.miraTexto }}
          >
            {atual.eixo}
          </span>
        ) : null}
      </div>
      <div />
      <div />
    </div>
  );
}

/**
 * A moldura do Profit: título centralizado em cima, legenda embaixo do gráfico e, quando há, as abas no rodapé.
 * Até 12/10/2026 era grafite nos dois temas; desde 13/10/2026 é o poço do tema (PROFIT.fundo) com o fio do
 * painel em volta, e o texto é o do site. O título pode trazer o i do "o que é" (19/09/2026, RotuloComInfo),
 * que já vem nas cores do tema: as que o grafite pedia (cinza da moldura, branco no foco) saíram junto.
 */
export function MolduraProfit({
  titulo,
  legenda,
  abas,
  children,
}: {
  titulo: React.ReactNode;
  legenda?: React.ReactNode;
  abas?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border" style={{ background: PROFIT.fundo, borderColor: PROFIT.borda }}>
      <p className="px-4 pt-3 pb-2 text-center text-xs font-semibold" style={{ color: PROFIT.titulo }}>
        {titulo}
      </p>
      <div className="px-3">{children}</div>
      {legenda ? (
        <div aria-hidden className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-2 text-[11px]" style={{ color: PROFIT.textoFraco }}>
          {legenda}
        </div>
      ) : (
        <div className="h-3" />
      )}
      {abas}
    </div>
  );
}

/** O risquinho da legenda, com as cores do agrupamento: vermelho e verde, ou a cor só da linha (`linhaCor`). */
export function AmostraDaLinha({ cores }: { cores: CoresDaCurva }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <polyline points="1,4 4,8 7,5" style={{ stroke: cores.linhaCor ?? cores.baixa }} />
      <polyline points="7,5 10,2 12,4 15,1" style={{ stroke: cores.linhaCor ?? cores.alta }} />
    </svg>
  );
}
