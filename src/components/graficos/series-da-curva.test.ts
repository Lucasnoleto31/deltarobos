import { describe, expect, it } from "vitest";
import { formatarBRL, formatarData, formatarDataCurta, formatarNumero, formatarPontos } from "@/lib/formato";
import { curvaPorOperacao, hora as horaDaOperacao, valorOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
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
