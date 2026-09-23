import { describe, expect, it } from "vitest";
import { formatarBRL, formatarData, formatarDataCurta, formatarMfeMae, formatarNumero, formatarPontos } from "@/lib/formato";
import { curvaPorOperacao, hora as horaDaOperacao, valorOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
import { epochBrasilia, janelaDoDia, type BaldeReduzido } from "@/lib/stats/saldo-dia";
import type { LinhaDiaria, OpcoesSerie } from "@/lib/stats/tipos";
import { tomDe, type ConteudoDaDica } from "./base";
import type { PontoDoDesenho } from "./CurvaProfit";
import {
  PONTOS_FIEL,
  PONTOS_LEVE,
  expandirSerie,
  extremosPorOperacao,
  fatiar,
  limitesDaFatia,
  marcadoresDoSaldo,
  serieDoSaldoParaDesenho,
  seriePorDia,
  seriePorOperacao,
  seriePorOperacaoCompacta,
} from "./series-da-curva";

// A série por operação como era até 18/09/2026, com a dica escrita no servidor e reduzida a 240
// pontos, congelada aqui para provar que a forma compacta (números no HTML, dica escrita no navegador)
// mostra a mesma coisa quando se pede a série leve. Os rótulos são os de 19/09/2026 ("3 operações
// (205ª a 207ª)" e "Resultado" no lugar de "Neste trecho", e a etiqueta da mira no eixo de baixo); os
// números continuam os de antes.
function seriePorOperacaoDeAntes(ops: readonly OperacaoCompacta[], opcoes: OpcoesSerie, dias: readonly string[]): PontoDoDesenho[] {
  if (ops.length === 0) return [];
  const fmt = (v: number) =>
    opcoes.unidade === "brl" ? formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v, true)} pts`;
  // A referência já com a divisão em inteiros (22/09/2026): a de antes fazia `Math.floor((k + 1) * (n / max))`
  // e perdia o último item em ~5% dos tamanhos (245, 999, 603...). Nos tamanhos destes casos as duas
  // divisões são iguais, então as comparações abaixo continuam provando o mesmo.
  const fatiar = <T,>(itens: T[], max = 240): T[][] => {
    const n = itens.length;
    if (n <= max) return itens.map((i) => [i]);
    return Array.from({ length: max }, (_, k) => {
      const de = Math.floor((k * n) / max);
      return itens.slice(de, Math.max(de + 1, Math.floor(((k + 1) * n) / max)));
    });
  };
  const soma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  const curva = curvaPorOperacao(ops, opcoes);
  const total = curva.length;
  const umDiaSo = curva[0].dia === curva[total - 1].dia;
  const ordinal = (k: number) => `${formatarNumero(k)}ª`;
  const intervalo = (de: string, ate: string) =>
    de.slice(0, 4) === ate.slice(0, 4) ? `${formatarDataCurta(de)} a ${formatarData(ate)}` : `${formatarData(de)} a ${formatarData(ate)}`;
  const indiceDoDia = new Map(dias.map((d, k) => [d, k]));
  const opsNoDia = new Map<string, number>();
  for (const p of curva) opsNoDia.set(p.dia, (opsNoDia.get(p.dia) ?? 0) + 1);
  const casam = dias.length > 0 && curva.every((p) => indiceDoDia.has(p.dia));
  let pico = 0;
  let diaAtual = "";
  let noDia = 0;
  const brutos = curva.map((p, i) => {
    if (p.dia !== diaAtual) {
      diaAtual = p.dia;
      noDia = 0;
    }
    noDia += 1;
    pico = Math.max(pico, p.acumulado);
    const posicao = casam
      ? ((indiceDoDia.get(p.dia) ?? 0) + noDia / (opsNoDia.get(p.dia) ?? 1)) / dias.length
      : (i + 1) / total;
    return {
      dia: p.dia,
      ordem: p.indice,
      hora: horaDaOperacao(ops[i]),
      valor: p.acumulado - (i > 0 ? curva[i - 1].acumulado : 0),
      acumulado: p.acumulado,
      drawdown: Math.min(0, p.acumulado - pico),
      posicao,
    };
  });
  return fatiar(brutos).map((fatia): PontoDoDesenho => {
    const primeiro = fatia[0];
    const ultimo = fatia[fatia.length - 1];
    const valor = soma(fatia.map((p) => p.valor));
    const drawdown = fatia.reduce((m, p) => Math.min(m, p.drawdown), 0);
    const uma = fatia.length === 1;
    const dica: ConteudoDaDica = {
      titulo: uma
        ? `${formatarData(ultimo.dia)} · aberta às ${ultimo.hora}h`
        : primeiro.dia === ultimo.dia
          ? formatarData(ultimo.dia)
          : intervalo(primeiro.dia, ultimo.dia),
      subtitulo: uma
        ? `${ordinal(ultimo.ordem)} operação`
        : `${formatarNumero(fatia.length)} operações (${ordinal(primeiro.ordem)} a ${ordinal(ultimo.ordem)})`,
      linhas: [
        { rotulo: "Resultado", valor: fmt(valor), tom: tomDe(valor) },
        { rotulo: "Acumulado", valor: fmt(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
        {
          rotulo: "Drawdown",
          valor: drawdown < 0 ? fmt(drawdown) : "no topo",
          tom: drawdown < 0 ? ("negativo" as const) : ("neutro" as const),
        },
      ],
    };
    return {
      posicao: ultimo.posicao,
      acumulado: ultimo.acumulado,
      drawdown,
      dica,
      eixo: umDiaSo ? ordinal(ultimo.ordem) : formatarData(ultimo.dia),
    };
  });
}

// Gerador determinístico: pontos em múltiplos de 5 (WIN, R$ 0,20 o ponto) e custos quebrados, que
// deixam o acumulado com resíduo de ponto flutuante, como na base real.
function gerarOperacoes(nDias: number, porDia: (d: number) => number, semente = 7): { ops: OperacaoCompacta[]; dias: string[] } {
  let s = semente;
  const aleatorio = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const ops: OperacaoCompacta[] = [];
  const dias: string[] = [];
  const inicio = Date.UTC(2026, 1, 13);
  for (let d = 0; d < nDias; d++) {
    const dia = new Date(inicio + d * 86_400_000).toISOString().slice(0, 10);
    dias.push(dia);
    for (let k = 0; k < porDia(d); k++) {
      const pontos = Math.round((aleatorio() - 0.47) * 80) * 5;
      const brl = pontos * 0.2;
      const custos = [0.37, 0.25, 1.07, 0.5][Math.floor(aleatorio() * 4)];
      ops.push([dia, 9 + Math.floor(aleatorio() * 9), new Date(`${dia}T12:00:00Z`).getUTCDay(), pontos, brl, custos, 120, aleatorio() > 0.5 ? 1 : -1, "WINV26"]);
    }
  }
  return { ops, dias };
}

const brl: OpcoesSerie = { base: "liquido", unidade: "brl", valorPonto: 0.2 };

/** Uma linha da série diária com o resultado dado, 10 operações e 6 gains. */
function linhaDiaria(dia: string, resultado: number): LinhaDiaria {
  return {
    dia,
    pontos_por_contrato: resultado / 0.2,
    resultado_brl_por_contrato: resultado,
    custos_brl_por_contrato: 0,
    n_operacoes: 10,
    n_gain: 6,
    n_loss: 4,
    soma_gain_brl_por_contrato: Math.max(0, resultado),
    soma_loss_brl_por_contrato: Math.min(0, resultado),
    maior_gain_brl_por_contrato: Math.max(0, resultado),
    maior_loss_brl_por_contrato: Math.min(0, resultado),
  };
}

/** `n` pregões seguidos a partir de 01/12/2025, -50 a cada três dias e +40 nos outros. */
function linhasDiarias(n: number): LinhaDiaria[] {
  const inicio = Date.UTC(2025, 11, 1);
  return Array.from({ length: n }, (_, d) => linhaDiaria(new Date(inicio + d * 86_400_000).toISOString().slice(0, 10), d % 3 === 0 ? -50 : 40));
}

/** "1.234ª" -> 1234 */
const numeroDoOrdinal = (t: string) => Number(t.replace(/\./g, "").replace("ª", ""));

/** Os ordinais que a dica cita: [de, ate] da fatia, ou [n, n] da operação única. */
function ordinaisDaDica(p: PontoDoDesenho): [number, number] {
  const sub = p.dica.subtitulo ?? "";
  const fatia = /^(\S+) operações \((\S+) a (\S+)\)$/.exec(sub);
  if (fatia) {
    const [, quantas, de, ate] = fatia;
    expect(numeroDoOrdinal(ate) - numeroDoOrdinal(de) + 1).toBe(Number(quantas.replace(/\./g, "")));
    return [numeroDoOrdinal(de), numeroDoOrdinal(ate)];
  }
  const uma = /^(\S+) operação$/.exec(sub);
  expect(uma).not.toBeNull();
  const n = numeroDoOrdinal(uma![1]);
  return [n, n];
}

const casos: Array<{ nome: string; ops: OperacaoCompacta[]; dias: readonly string[]; opcoes: OpcoesSerie }> = (() => {
  const curta = gerarOperacoes(5, () => 30); // 150 ops: uma operação por ponto, com hora na dica
  const media = gerarOperacoes(6, () => 50); // 300 ops: fatias de 1 e de 2 misturadas
  const longa = gerarOperacoes(140, (d) => 40 + ((d * 37) % 160)); // ~15 mil ops, acumulado acima de R$ 1.000
  return [
    { nome: "semana (150 operações)", ...curta, opcoes: brl },
    { nome: "fatias de 1 e 2 (300 operações)", ...media, opcoes: brl },
    { nome: "série longa", ...longa, opcoes: brl },
    { nome: "operação fora da série diária", ops: longa.ops.slice(0, 2000), dias: longa.dias.slice(1, 20), opcoes: brl },
    { nome: "em pontos", ...media, opcoes: { base: "liquido", unidade: "pontos", valorPonto: 0.2 } },
  ];
})();

describe("série por operação compacta (série leve, 240 pontos)", () => {
  it.each(casos)("reconstrói a mesma dica que a série antiga: $nome", ({ ops, dias, opcoes }) => {
    const antes = seriePorOperacaoDeAntes(ops, opcoes, dias);
    const compacta = seriePorOperacaoCompacta(ops, opcoes, dias, { maxPontos: PONTOS_LEVE });
    // o que vai no HTML é JSON: a volta tem de passar pela serialização
    const depois = expandirSerie(JSON.parse(JSON.stringify(compacta)), opcoes);

    expect(depois).toHaveLength(antes.length);
    depois.forEach((p, i) => {
      expect(p.dica).toEqual(antes[i].dica);
      expect(p.eixo).toBe(antes[i].eixo);
      expect(Math.abs(p.posicao - antes[i].posicao)).toBeLessThan(1e-4);
      // dinheiro com 2 casas: igual ao centavo
      expect(p.acumulado).toBeCloseTo(antes[i].acumulado, 2);
      expect(p.drawdown).toBeCloseTo(antes[i].drawdown, 2);
    });
  });

  it.each(casos)("seriePorOperacao com PONTOS_LEVE dá exatamente a série antiga: $nome", ({ ops, dias, opcoes }) => {
    expect(seriePorOperacao(ops, opcoes, dias, PONTOS_LEVE)).toEqual(seriePorOperacaoDeAntes(ops, opcoes, dias));
  });

  it("manda só números arredondados e cada dia uma vez", () => {
    const { ops, dias } = gerarOperacoes(140, () => 100);
    const compacta = seriePorOperacaoCompacta(ops, brl, dias, { maxPontos: PONTOS_LEVE });
    expect(compacta.total).toBe(ops.length);
    expect(compacta.pontos).toHaveLength(240);
    expect(new Set(compacta.dias).size).toBe(compacta.dias.length);
    for (const [posicao] of compacta.pontos) expect(Math.round(posicao * 1e5) / 1e5).toBe(posicao);
    // a dica escrita tinha ~340 bytes por ponto; os números, bem menos
    expect(JSON.stringify(compacta).length / 240).toBeLessThan(60);
  });

  it("resíduo em volta de número redondo vai inteiro (escala do drawdown e rótulo do eixo)", () => {
    // 0,1 não é exato em binário: o acumulado passa perto de 1.000 e de -300 com resíduo
    const ops: OperacaoCompacta[] = [
      ...Array.from({ length: 30 }, (): OperacaoCompacta => ["2026-09-14", 10, 1, -5, -10.1, 0.1, 60, 1, "WINV26"]),
      ...Array.from({ length: 130 }, (): OperacaoCompacta => ["2026-09-15", 11, 2, 50, 10.1, 0.1, 60, 1, "WINV26"]),
    ];
    const dias = ["2026-09-14", "2026-09-15"];
    const antes = seriePorOperacaoDeAntes(ops, brl, dias);
    const compacta = seriePorOperacaoCompacta(ops, brl, dias);
    const redondo = (v: number) => Math.round(v * 20) / 20;
    const comResiduo = antes.filter((p) => p.acumulado !== redondo(p.acumulado) || p.drawdown !== redondo(p.drawdown));
    expect(comResiduo.length).toBeGreaterThan(0);
    compacta.pontos.forEach(([, acumulado, drawdown], i) => {
      expect(acumulado).toBe(antes[i].acumulado);
      expect(drawdown).toBe(antes[i].drawdown);
    });
  });

  it("o ponto diz quantas operações junta e quais, sem \"Neste trecho\" (19/09/2026)", () => {
    const { ops, dias } = gerarOperacoes(6, () => 50); // 300 operações em 240 pontos: fatias de 1 e de 2
    const pontos = seriePorOperacao(ops, brl, dias, PONTOS_LEVE);
    const textos = pontos.flatMap((p) => [p.dica.titulo, p.dica.subtitulo ?? "", ...p.dica.linhas.map((l) => l.rotulo)]);
    expect(textos.some((t) => /trecho/i.test(t))).toBe(false);
    const duas = pontos.find((p) => p.dica.subtitulo?.startsWith("2 "));
    expect(duas?.dica.subtitulo).toMatch(/^2 operações \(\d+ª a \d+ª\)$/);
    expect(duas?.dica.linhas[0].rotulo).toBe("Resultado");
    const uma = pontos.find((p) => p.dica.subtitulo?.endsWith("ª operação"));
    expect(uma?.dica.titulo).toMatch(/^\d{2}\/\d{2}\/\d{4} · aberta às \d+h$/);
    // série de vários dias: a mira mostra a data; a de um dia só (o calendário), a ordem
    expect(pontos[0].eixo).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const doDia = seriePorOperacao(ops.slice(0, 50), brl, [dias[0]]);
    expect(doDia[doDia.length - 1].eixo).toBe("50ª");
  });

  it("série por dia: o ponto de vários dias diz quantos e o intervalo", () => {
    const linhas = linhasDiarias(600);
    const { pontos } = seriePorDia(linhas, brl);
    expect(pontos).toHaveLength(240);
    expect(pontos[0].dica.titulo).toBe("2 dias (01/12 a 02/12/2025)");
    expect(pontos[0].dica.subtitulo).toBeUndefined();
    expect(pontos[0].dica.linhas.map((l) => l.rotulo)).toEqual(["Resultado", "Operações", "Acumulado", "Drawdown"]);
    // o ponto que atravessa a virada do ano leva as duas datas inteiras
    expect(pontos.some((p) => /^\d+ dias \(\d{2}\/12\/2025 a \d{2}\/01\/2026\)$/.test(p.dica.titulo))).toBe(true);
    const umDia = seriePorDia(linhas.slice(0, 5), brl).pontos[0];
    expect(umDia.dica.titulo).toBe("01/12/2025");
    expect(umDia.dica.subtitulo).toBe("segunda-feira");
    expect(umDia.eixo).toBe("01/12/2025");
  });

  it("série vazia", () => {
    expect(seriePorOperacaoCompacta([], brl, [])).toEqual({ dias: [], total: 0, pontos: [] });
    expect(expandirSerie({ dias: [], total: 0, pontos: [] }, brl)).toEqual([]);
  });
});

describe("operação por operação (22/09/2026)", () => {
  it("as constantes do contrato", () => {
    expect(PONTOS_LEVE).toBe(240);
    expect(PONTOS_FIEL).toBe(20_000);
  });

  it("fatiar e limitesDaFatia: fatias contíguas que cobrem tudo, uma por item quando cabe", () => {
    const itens = Array.from({ length: 1000 }, (_, i) => i);
    const fatias = fatiar(itens, 240);
    expect(fatias).toHaveLength(240);
    expect(fatias.flat()).toEqual(itens);
    for (let k = 0; k < 240; k++) {
      const [de, ate] = limitesDaFatia(k, 1000, 240);
      expect(fatias[k]).toEqual(itens.slice(de, ate));
      if (k > 0) expect(de).toBe(limitesDaFatia(k - 1, 1000, 240)[1]);
    }
    expect(limitesDaFatia(0, 1000, 240)[0]).toBe(0);
    expect(limitesDaFatia(239, 1000, 240)[1]).toBe(1000);
    // cabe: cada item é uma fatia
    expect(fatiar(itens.slice(0, 7), 240)).toEqual(itens.slice(0, 7).map((i) => [i]));
    expect(limitesDaFatia(3, 7, 240)).toEqual([3, 4]);
    expect(fatiar([], 240)).toEqual([]);
  });

  it("fatiar cobre tudo, sem buraco nem sobreposição, para todo n até 6·max (245, 999 e 603 perdiam o último item)", () => {
    // A fórmula com `n / max` em ponto flutuante dava n - 1 no fim da última fatia em ~5% dos pares. A
    // varredura é em aritmética pura (milhões de fatias) e junta os pares que falharem; um expect por fatia
    // levava mais de 10 s.
    const falhas: string[] = [];
    for (const max of [8, 240, 600, PONTOS_FIEL]) {
      const tamanhos =
        max === PONTOS_FIEL
          ? [20_001, 20_005, 20_011, 20_017, 20_018, 20_101, 21_003, 22_222, 30_007, 40_003, 60_000, 120_000]
          : Array.from({ length: 6 * max + 5 }, (_, i) => i + 1);
      for (const n of tamanhos) {
        const fatias = Math.min(n, max);
        let fim = 0;
        let contiguas = true;
        for (let k = 0; k < fatias; k++) {
          const [de, ate] = limitesDaFatia(k, n, max);
          if (de !== fim || ate <= de) {
            contiguas = false;
            break;
          }
          fim = ate;
        }
        if (!contiguas || fim !== n) falhas.push(`${n}/${max}`);
      }
    }
    expect(falhas).toEqual([]);
    // e o fatiar em si, nos tamanhos em que a fórmula antiga perdia o último item
    for (const [n, max] of [
      [245, 240],
      [246, 240],
      [490, 240],
      [505, 240],
      [999, 240],
      [1010, 240],
      [603, 600],
      [626, 600],
      [20_005, PONTOS_FIEL],
    ]) {
      const itens = Array.from({ length: n }, (_, i) => i);
      const fatias = fatiar(itens, max);
      expect(fatias).toHaveLength(max);
      expect(fatias.flat()).toEqual(itens);
    }
  });

  it("245 e 999 operações: a última aparece na leve, e a leve termina onde a fiel termina", () => {
    for (const [nDias, porDia] of [
      [5, 49],
      [9, 111],
    ] as const) {
      const { ops, dias } = gerarOperacoes(nDias, () => porDia);
      const viaJson = (maxPontos: number) =>
        expandirSerie(JSON.parse(JSON.stringify(seriePorOperacaoCompacta(ops, brl, dias, { maxPontos }))), brl);
      const leve = viaJson(PONTOS_LEVE);
      const fiel = viaJson(PONTOS_FIEL);
      expect(leve).toHaveLength(PONTOS_LEVE);
      expect(ordinaisDaDica(leve[leve.length - 1])[1]).toBe(ops.length);
      expect(leve[leve.length - 1].acumulado).toBe(fiel[fiel.length - 1].acumulado);
      expect(leve[leve.length - 1].posicao).toBe(1);
    }
  });

  it("série por dia com 245 pregões desenha o último dia", () => {
    const linhas = linhasDiarias(245);
    const { pontos, dias, curva } = seriePorDia(linhas, brl);
    expect(pontos).toHaveLength(PONTOS_LEVE);
    expect(pontos[pontos.length - 1].eixo).toBe(formatarData(dias[244]));
    expect(pontos[pontos.length - 1].acumulado).toBe(curva[244].acumulado);
    expect(pontos[pontos.length - 1].posicao).toBe(1);
  });

  it("operações com os dias fora de ordem caem no espaçamento uniforme: o traçado nunca anda para trás", () => {
    const op = (dia: string, hora: number): OperacaoCompacta => [dia, hora, 1, 10, 2, 0.1, 60, 1, "WINV26"];
    const dias = ["2026-09-21", "2026-09-22"];
    // um dia com uma operação e outro com três: em ordem, cada dia ocupa a largura dele
    const emOrdem = seriePorOperacao([op("2026-09-21", 10), op("2026-09-22", 9), op("2026-09-22", 11), op("2026-09-22", 15)], brl, dias);
    [0.5, 0.5 + 1 / 6, 0.5 + 2 / 6, 1].forEach((esperada, i) => expect(emOrdem[i].posicao).toBeCloseTo(esperada, 10));
    // uma operação de 21/09 fechada depois de uma de 22/09: por dia, a posição voltaria de 0,67 para 0,5
    const foraDeOrdem = seriePorOperacao([op("2026-09-22", 9), op("2026-09-21", 10), op("2026-09-22", 11), op("2026-09-22", 15)], brl, dias);
    expect(foraDeOrdem.map((p) => p.posicao)).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("a leve e a fiel levam os mesmos extremos: o menor e o maior acumulado de todas as operações", () => {
    const { ops, dias } = gerarOperacoes(250, () => 80); // 20 mil: a fiel tem uma operação por ponto
    const leve = seriePorOperacaoCompacta(ops, brl, dias, { maxPontos: PONTOS_LEVE });
    const fiel = seriePorOperacaoCompacta(ops, brl, dias);
    expect(leve.extremos).toEqual(fiel.extremos);
    const acumulados = expandirSerie(fiel, brl).map((p) => p.acumulado);
    expect(fiel.extremos).toEqual([Math.min(0, ...acumulados), Math.max(0, ...acumulados)]);
    // os pontos da leve, sozinhos, não chegam lá (ela só guarda o fim de cada fatia): é por isso que os
    // extremos vão junto, para a régua da curva ser a mesma antes e depois de a fiel chegar
    const daLeve = expandirSerie(leve, brl).map((p) => p.acumulado);
    expect(Math.min(0, ...daLeve) > fiel.extremos![0] || Math.max(0, ...daLeve) < fiel.extremos![1]).toBe(true);
    // e a curva que recebe as operações no navegador acha os mesmos, sem montar a série
    const [menor, maior] = extremosPorOperacao(ops, brl);
    expect(menor).toBeCloseTo(fiel.extremos![0], 2);
    expect(maior).toBeCloseTo(fiel.extremos![1], 2);
    expect(extremosPorOperacao([], brl)).toEqual([0, 0]);
    // os extremos sobrevivem ao JSON da rota
    expect(JSON.parse(JSON.stringify(fiel)).extremos).toEqual(fiel.extremos);
  });

  it("5 operações dão 5 pontos, 1ª a 5ª, cada um com a hora em que abriu", () => {
    const { ops, dias } = gerarOperacoes(2, (d) => (d === 0 ? 2 : 3));
    const pontos = seriePorOperacao(ops, brl, dias);
    expect(pontos).toHaveLength(5);
    expect(pontos.map((p) => p.dica.subtitulo)).toEqual(["1ª operação", "2ª operação", "3ª operação", "4ª operação", "5ª operação"]);
    pontos.forEach((p, i) => {
      expect(p.dica.titulo).toBe(`${formatarData(ops[i][0])} · aberta às ${horaDaOperacao(ops[i])}h`);
      expect(p.eixo).toBe(formatarData(ops[i][0]));
    });
    // a mesma série pela forma compacta, depois do JSON: a hora vai no sétimo número
    const compacta = JSON.parse(JSON.stringify(seriePorOperacaoCompacta(ops, brl, dias)));
    expect(compacta.pontos.every((p: number[]) => p.length === 7)).toBe(true);
    expect(expandirSerie(compacta, brl).map((p) => p.dica)).toEqual(pontos.map((p) => p.dica));
  });

  it("até PONTOS_FIEL cada ponto é uma operação; acima disso agrupa", () => {
    const { ops, dias } = gerarOperacoes(150, () => 100); // 15 mil
    const fiel = seriePorOperacaoCompacta(ops, brl, dias);
    expect(fiel.total).toBe(15_000);
    expect(fiel.pontos).toHaveLength(15_000);
    expect(fiel.pontos.every((p) => p.length === 7)).toBe(true);
    const pontos = expandirSerie(fiel, brl);
    expect(pontos[0].dica.subtitulo).toBe("1ª operação");
    expect(pontos[14_999].dica.subtitulo).toBe("15.000ª operação");

    const maior = gerarOperacoes(250, () => 100); // 25 mil
    const agrupada = seriePorOperacaoCompacta(maior.ops, brl, maior.dias);
    expect(agrupada.total).toBe(25_000);
    expect(agrupada.pontos).toHaveLength(PONTOS_FIEL);
    const ultimo = expandirSerie(agrupada, brl)[PONTOS_FIEL - 1];
    expect(ultimo.dica.subtitulo).toMatch(/^2 operações \(24\.999ª a 25\.000ª\)$/);
  });

  it("1.000 operações em 240 pontos: fatias contíguas, da 1ª à 1.000ª, com os ordinais e os números batendo", () => {
    const { ops, dias } = gerarOperacoes(10, () => 100);
    const compacta = seriePorOperacaoCompacta(ops, brl, dias, { maxPontos: 240 });
    expect(compacta.pontos).toHaveLength(240);
    const pontos = expandirSerie(JSON.parse(JSON.stringify(compacta)), brl);
    const curva = curvaPorOperacao(ops, brl);
    let esperado = 1;
    pontos.forEach((p, k) => {
      const [de, ate] = ordinaisDaDica(p);
      expect(de).toBe(esperado);
      esperado = ate + 1;
      // os ordinais da dica são os da divisão que montou a série
      expect([de - 1, ate]).toEqual(limitesDaFatia(k, 1000, 240));
      // e o ponto é mesmo o da última operação da fatia, com o resultado das operações dela
      expect(p.acumulado).toBeCloseTo(curva[ate - 1].acumulado, 2);
      const resultado = ops.slice(de - 1, ate).reduce((s, op) => s + valorOperacao(op, brl), 0);
      expect(p.dica.linhas[0].valor).toBe(formatarBRL(resultado, { sinal: true, inteiro: Math.abs(resultado) >= 1000 }));
    });
    expect(ordinaisDaDica(pontos[0])[0]).toBe(1);
    expect(ordinaisDaDica(pontos[239])[1]).toBe(1000);
  });

  it("a leve e a fiel do mesmo conjunto dão o mesmo acumulado final e o mesmo drawdown mínimo", () => {
    const { ops, dias } = gerarOperacoes(140, (d) => 40 + ((d * 37) % 160));
    const viaJson = (maxPontos: number) =>
      expandirSerie(JSON.parse(JSON.stringify(seriePorOperacaoCompacta(ops, brl, dias, { maxPontos }))), brl);
    const leve = viaJson(PONTOS_LEVE);
    const fiel = viaJson(PONTOS_FIEL);
    expect(leve).toHaveLength(240);
    expect(fiel).toHaveLength(ops.length);
    expect(leve[leve.length - 1].acumulado).toBe(fiel[fiel.length - 1].acumulado);
    expect(leve[leve.length - 1].posicao).toBe(fiel[fiel.length - 1].posicao);
    const minimo = (ps: PontoDoDesenho[]) => ps.reduce((m, p) => Math.min(m, p.drawdown), 0);
    expect(minimo(leve)).toBe(minimo(fiel));
    expect(minimo(fiel)).toBeLessThan(0);
    // e a fiel diz a ordem de cada operação, uma por ponto
    fiel.forEach((p, i) => expect(ordinaisDaDica(p)).toEqual([i + 1, i + 1]));
  });

  it("série de dois dias mantém a proporção do eixo: cada dia com a largura da série por dia", () => {
    const { ops, dias } = gerarOperacoes(2, (d) => (d === 0 ? 10 : 30));
    const fiel = seriePorOperacao(ops, brl, dias);
    expect(fiel).toHaveLength(40);
    // o primeiro dia ocupa a metade esquerda: a 10ª operação termina em 0,5 e a 40ª em 1
    for (const p of fiel.slice(0, 10)) {
      expect(p.posicao).toBeGreaterThan(0);
      expect(p.posicao).toBeLessThanOrEqual(0.5);
    }
    for (const p of fiel.slice(10)) {
      expect(p.posicao).toBeGreaterThan(0.5);
      expect(p.posicao).toBeLessThanOrEqual(1);
    }
    expect(fiel[9].posicao).toBeCloseTo(0.5, 10);
    expect(fiel[39].posicao).toBeCloseTo(1, 10);
    // dentro do dia, espalhadas por igual
    expect(fiel[0].posicao).toBeCloseTo(0.05, 10);
    expect(fiel[10].posicao).toBeCloseTo(0.5 + 1 / 60, 10);
    // agrupada em 8 fatias de 5, cada ponto fica na posição da última operação da fatia
    const leve = seriePorOperacao(ops, brl, dias, 8);
    expect(leve).toHaveLength(8);
    expect(leve[1].posicao).toBeCloseTo(0.5, 10);
    expect(leve[7].posicao).toBeCloseTo(1, 10);
    expect(leve.map((p) => p.posicao)).toEqual([4, 9, 14, 19, 24, 29, 34, 39].map((i) => fiel[i].posicao));
    // em ordem crescente, que é o que a busca binária do desenho supõe
    for (let i = 1; i < fiel.length; i++) expect(fiel[i].posicao).toBeGreaterThan(fiel[i - 1].posicao);
  });

  it("seriePorOperacao com 15.000 operações roda em menos de 300 ms", () => {
    const { ops, dias } = gerarOperacoes(150, () => 100);
    // aquece (formatadores, JIT) e mede o melhor de três, para uma pausa da máquina não valer como medida
    seriePorOperacao(ops, brl, dias);
    let melhor = Infinity;
    for (let r = 0; r < 3; r++) {
      const inicio = performance.now();
      const pontos = seriePorOperacao(ops, brl, dias);
      melhor = Math.min(melhor, performance.now() - inicio);
      expect(pontos).toHaveLength(15_000);
    }
    expect(melhor).toBeLessThan(300);
  });
});

describe("dentes de MFE/MAE (23/09/2026)", () => {
  const dia = "2026-09-23";
  /** operação do dia (WIN, R$ 0,20 o ponto) com custo fixo e, quando dados, o MFE e o MAE em pontos nas posições 9/10 */
  const op = (hora: number, pontos: number, mfe?: number | null, mae?: number | null): OperacaoCompacta =>
    mfe === undefined && mae === undefined
      ? [dia, hora, 3, pontos, pontos * 0.2, 0.5, 60, 1, "WINV26"]
      : [dia, hora, 3, pontos, pontos * 0.2, 0.5, 60, 1, "WINV26", mfe ?? null, mae ?? null];
  const ultimaLinha = (p: PontoDoDesenho) => p.dica.linhas[p.dica.linhas.length - 1];

  it("operação com posições 9/10 vira dentes[k] com de = antes + mae × 0,2 e ate = antes + mfe × 0,2", () => {
    const ops = [op(9, 50), op(10, -20, 200, -75), op(11, 30)];
    const compacta = seriePorOperacaoCompacta(ops, brl, [dia], { arredondar: false });
    const antes = valorOperacao(ops[0], brl); // 10 − 0,5 = 9,5: o acumulado antes da 2ª
    expect(compacta.dentes).toEqual([[1, antes + -75 * 0.2, antes + 200 * 0.2, 200, -75]]);
    const pontos = expandirSerie(compacta, brl);
    expect(pontos[1].dente).toEqual({ de: antes - 15, ate: antes + 40, mfe: 200, mae: -75 });
    // a linha "MFE / MAE" vem por último, depois de Resultado, Acumulado e Drawdown
    expect(pontos[1].dica.linhas.map((l) => l.rotulo)).toEqual(["Resultado", "Acumulado", "Drawdown", "MFE / MAE"]);
    expect(ultimaLinha(pontos[1])).toEqual({ rotulo: "MFE / MAE", valor: formatarMfeMae(200, -75) });
    expect(pontos[0].dente).toBeUndefined();
    expect(pontos[2].dente).toBeUndefined();
    expect(pontos[0].dica.linhas.map((l) => l.rotulo)).toEqual(["Resultado", "Acumulado", "Drawdown"]);
    // seriePorOperacao (sem arredondar) tem o mesmo dente
    expect(seriePorOperacao(ops, brl, [dia])[1].dente).toEqual(pontos[1].dente);
  });

  it("fatia de 2+ operações vira o envelope: menor de, maior ate, maior MFE, menor MAE, rotulado (extremos)", () => {
    const ops = [op(9, 50, 100, -20), op(10, -20, 200, -75), op(11, 30, 40, -300), op(12, 10)];
    const compacta = seriePorOperacaoCompacta(ops, brl, [dia], { arredondar: false, maxPontos: 2 });
    const curva = curvaPorOperacao(ops, brl);
    // fatia 0 = 1ª e 2ª: a 1ª parte do zero, a 2ª do acumulado da 1ª
    const de0 = Math.min(-20 * 0.2, curva[0].acumulado + -75 * 0.2);
    const ate0 = Math.max(100 * 0.2, curva[0].acumulado + 200 * 0.2);
    // fatia 1 = 3ª e 4ª: só a 3ª medida
    const de1 = curva[1].acumulado + -300 * 0.2;
    const ate1 = curva[1].acumulado + 40 * 0.2;
    expect(compacta.dentes).toEqual([
      [0, de0, ate0, 200, -75],
      [1, de1, ate1, 40, -300],
    ]);
    const pontos = expandirSerie(compacta, brl);
    expect(pontos[0].dente).toEqual({ de: de0, ate: ate0, mfe: 200, mae: -75 });
    expect(ultimaLinha(pontos[0])).toEqual({ rotulo: "MFE / MAE (extremos)", valor: formatarMfeMae(200, -75) });
    expect(ultimaLinha(pontos[1])).toEqual({ rotulo: "MFE / MAE (extremos)", valor: formatarMfeMae(40, -300) });
  });

  it("operação sem excursão não gera dente; série sem nenhuma medição não leva o campo e expande igual", () => {
    const { ops, dias } = gerarOperacoes(3, () => 10);
    const compacta = seriePorOperacaoCompacta(ops, brl, dias);
    expect("dentes" in compacta).toBe(false);
    const pontos = expandirSerie(compacta, brl);
    expect(pontos.every((p) => p.dente === undefined && !p.dica.linhas.some((l) => l.rotulo.startsWith("MFE")))).toBe(true);
    // uma só medida no meio de várias: um dente só, no ponto dela
    const umaMedida: OperacaoCompacta[] = [...ops.slice(0, 5), [dias[0], 12, 3, 15, 3, 0.5, 60, 1, "WINV26", 90, -10], ...ops.slice(5)];
    const c = seriePorOperacaoCompacta(umaMedida, brl, dias);
    expect(c.dentes).toHaveLength(1);
    expect(c.dentes![0][0]).toBe(5);
    expect(expandirSerie(c, brl).filter((p) => p.dente).map((p) => p.dica.subtitulo)).toEqual(["6ª operação"]);
  });

  it("leve (240) e fiel do mesmo conjunto: o envelope da leve contém os dentes da fiel; o JSON preserva", () => {
    // 300 operações, todas medidas de forma determinística
    const base = gerarOperacoes(6, () => 50);
    const ops = base.ops.map((o, i): OperacaoCompacta => [o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8], (i * 37) % 400, -((i * 53) % 250)]);
    const { dias } = base;
    const leve = seriePorOperacaoCompacta(ops, brl, dias, { arredondar: false, maxPontos: PONTOS_LEVE });
    const fiel = seriePorOperacaoCompacta(ops, brl, dias, { arredondar: false });
    expect(fiel.dentes).toHaveLength(300);
    expect(leve.dentes).toHaveLength(240);
    const daFiel = new Map(fiel.dentes!.map((d) => [d[0], d]));
    for (const [k, de, ate, mfeK, maeK] of leve.dentes!) {
      const [i, f] = limitesDaFatia(k, 300, 240);
      const dentro = Array.from({ length: f - i }, (_, j) => daFiel.get(i + j)!);
      expect(de).toBe(Math.min(...dentro.map((d) => d[1])));
      expect(ate).toBe(Math.max(...dentro.map((d) => d[2])));
      expect(mfeK).toBe(Math.max(...dentro.map((d) => d[3])));
      expect(maeK).toBe(Math.min(...dentro.map((d) => d[4])));
    }
    // a fiel: um dente por operação, do acumulado antes dela
    const curva = curvaPorOperacao(ops, brl);
    fiel.dentes!.forEach(([k, de, ate, m, a], i) => {
      expect(k).toBe(i);
      const antes = i > 0 ? curva[i - 1].acumulado : 0;
      expect(de).toBe(antes + a * 0.2);
      expect(ate).toBe(antes + m * 0.2);
    });
    // com arredondar (o que a página e a rota serializam): de/ate com 2 casas, e o JSON devolve o mesmo
    const serializada = seriePorOperacaoCompacta(ops, brl, dias, { maxPontos: PONTOS_LEVE });
    for (const [, de, ate] of serializada.dentes!) {
      expect(Math.round(de * 100) / 100).toBe(de);
      expect(Math.round(ate * 100) / 100).toBe(ate);
    }
    const viaJson = JSON.parse(JSON.stringify(serializada));
    expect(viaJson.dentes).toEqual(serializada.dentes);
    const pontos = expandirSerie(viaJson, brl);
    expect(pontos.every((p) => p.dente !== undefined)).toBe(true);
    expect(pontos.every((p) => ultimaLinha(p).rotulo.startsWith("MFE / MAE"))).toBe(true);
    // a fatia de 2 diz "(extremos)", a de 1 não
    expect(ultimaLinha(pontos.find((p) => p.dica.subtitulo?.startsWith("2 "))!).rotulo).toBe("MFE / MAE (extremos)");
    expect(ultimaLinha(pontos.find((p) => p.dica.subtitulo?.endsWith("ª operação"))!).rotulo).toBe("MFE / MAE");
    // dente malformado no JSON é ignorado sem derrubar a série
    expect(expandirSerie({ ...viaJson, dentes: [[999, 0, 1, 1, -1], [0, "x", 1, 1, -1], [1, 0, 1]] }, brl)).toHaveLength(240);
  });

  it("em pontos a conversão é × contratos", () => {
    const ops = [op(9, 50, 200, -75)];
    const emPontos: OpcoesSerie = { base: "liquido", unidade: "pontos", valorPonto: 0.2, contratos: 2 };
    const pontos = seriePorOperacao(ops, emPontos, [dia]);
    expect(pontos[0].dente).toEqual({ de: -150, ate: 400, mfe: 200, mae: -75 });
    expect(pontos[0].acumulado).toBe(valorOperacao(ops[0], emPontos));
    expect(ultimaLinha(pontos[0]).valor).toBe(formatarMfeMae(200, -75));
  });

  it("os extremos da série (e extremosPorOperacao) contêm os dentes: a régua não muda ao abrir Por operação (revisão de 23/09/2026)", () => {
    // uma operação de +50 pts (R$ 9,50 líquidos) que chegou a −400 pts (R$ −80) e a +100 pts (R$ 20) enquanto aberta
    const ops = [op(9, 50, 100, -400), op(10, 20)];
    const compacta = seriePorOperacaoCompacta(ops, brl, [dia], { arredondar: false });
    expect(compacta.extremos).toEqual([-80, 20]);
    expect(extremosPorOperacao(ops, brl)).toEqual([-80, 20]);
    // a leve e a fiel do mesmo conjunto levam os mesmos extremos, e o JSON os preserva
    const leve = seriePorOperacaoCompacta(ops, brl, [dia], { maxPontos: 1 });
    expect(leve.extremos).toEqual(compacta.extremos);
    expect(JSON.parse(JSON.stringify(leve)).extremos).toEqual([-80, 20]);
    // sem medição, os extremos são só os acumulados, como antes
    expect(extremosPorOperacao([op(9, 50), op(10, -100)], brl)).toEqual([valorOperacao(op(9, 50), brl) + valorOperacao(op(10, -100), brl), valorOperacao(op(9, 50), brl)]);
  });
});

describe("série do saldo (23/09/2026)", () => {
  const dia = "2026-09-23";
  const janela = janelaDoDia(dia, { inicio: "09:00", fim: "18:00" }, [], 5);
  const t1 = epochBrasilia(dia, "10:41:35");
  const baldes: BaldeReduzido[] = [
    [t1, -30, 10, 5, 1, t1],
    [t1 + 5, 5, 40, 40, 1, t1 + 5],
    // um grupo de 4 baldes (10:41:45 a 10:42:00): o valor é o do último, e é nele que o ponto se desenha
    [t1 + 10, 20, 60, 25, 4, t1 + 25],
  ];
  const fmt = (v: number) => formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });

  it("posições pela janela (no último balde do grupo), faixa mín./máx., dica com a hora e o grupo, eixo com a mesma hora", () => {
    const pontos = serieDoSaldoParaDesenho(baldes, { janela, unidade: "brl", bucketSeg: 5, comFaixa: true });
    expect(pontos).toHaveLength(3);
    // 10:41:35 está a 1 h 41 min 35 s (6.095 s) do início das 9 h, numa janela de 9 h (32.400 s)
    expect(pontos[0].posicao).toBeCloseTo(6095 / 32400, 12);
    expect(pontos[1].posicao).toBeCloseTo(6100 / 32400, 12);
    // o grupo: a posição do ÚLTIMO balde (10:42:00), não a do primeiro (revisão de 23/09/2026)
    expect(pontos[2].posicao).toBeCloseTo(6120 / 32400, 12);
    expect(pontos.map((p) => p.acumulado)).toEqual([5, 40, 25]);
    expect(pontos.map((p) => p.drawdown)).toEqual([0, 0, -15]);
    expect(pontos.map((p) => p.faixa)).toEqual([
      [-30, 10],
      [5, 40],
      [20, 60],
    ]);
    expect(pontos[0].dica).toEqual({
      titulo: "10:41:35",
      subtitulo: undefined,
      linhas: [
        { rotulo: "Saldo", valor: fmt(5), tom: "positivo" },
        { rotulo: "Faixa", valor: `${fmt(-30)} a ${fmt(10)}` },
      ],
    });
    expect(pontos[0].eixo).toBe("10:41:35");
    expect(pontos[2].dica.titulo).toBe("10:41:45");
    expect(pontos[2].dica.subtitulo).toBe("4 intervalos de 5 s");
    expect(pontos[2].eixo).toBe("10:41:45");
    // em pontos, o formatador de pontos
    const emPontos = serieDoSaldoParaDesenho(baldes, { janela, unidade: "pontos", bucketSeg: 5, comFaixa: true });
    expect(emPontos[0].dica.linhas[0].valor).toBe(`${formatarPontos(5, true)} pts`);
    expect(emPontos[0].dica.linhas[1].valor).toBe(`${formatarPontos(-30, true)} pts a ${formatarPontos(10, true)} pts`);
  });

  it("comFaixa = false (aproximado) não põe faixa nem a linha; min = max também não", () => {
    const semFaixa = serieDoSaldoParaDesenho(baldes, { janela, unidade: "brl", bucketSeg: 5, comFaixa: false });
    expect(semFaixa.every((p) => !("faixa" in p))).toBe(true);
    expect(semFaixa[0].dica.linhas.map((l) => l.rotulo)).toEqual(["Saldo"]);
    expect(semFaixa.map((p) => p.acumulado)).toEqual([5, 40, 25]);
    const plano = serieDoSaldoParaDesenho([[t1, 7, 7, 7, 1, t1]], { janela, unidade: "brl", bucketSeg: 5, comFaixa: true });
    expect(plano[0].faixa).toBeUndefined();
    expect(serieDoSaldoParaDesenho([], { janela, unidade: "brl", bucketSeg: 5, comFaixa: true })).toEqual([]);
  });

  it("marcadoresDoSaldo acha o pico e o vale, na régua da janela", () => {
    expect(marcadoresDoSaldo(baldes, janela)).toEqual([
      { posicao: 6105 / 32400, valor: 60, rotulo: "MEP", tom: "positivo" },
      { posicao: 6095 / 32400, valor: -30, rotulo: "MEN", tom: "negativo" },
    ]);
    expect(marcadoresDoSaldo([[t1, 1, 5, 3]], janela).map((m) => m.rotulo)).toEqual(["MEP"]);
    expect(marcadoresDoSaldo([[t1, -5, -1, -3]], janela).map((m) => m.rotulo)).toEqual(["MEN"]);
    // o subtítulo do grupo e a legenda não usam a palavra "balde" (texto público; revisão de 23/09/2026)
    const pontos = serieDoSaldoParaDesenho(baldes, { janela, unidade: "brl", bucketSeg: 5, comFaixa: true });
    for (const p of pontos) expect(`${p.dica.titulo} ${p.dica.subtitulo ?? ""}`).not.toMatch(/balde/i);
    expect(marcadoresDoSaldo([], janela)).toEqual([]);
  });
});
