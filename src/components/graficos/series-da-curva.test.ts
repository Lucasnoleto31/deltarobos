import { describe, expect, it } from "vitest";
import { formatarBRL, formatarData, formatarNumero, formatarPontos } from "@/lib/formato";
import { curvaPorOperacao, hora as horaDaOperacao, type OperacaoCompacta } from "@/lib/stats/operacoes";
import type { OpcoesSerie } from "@/lib/stats/tipos";
import { tomDe, type ConteudoDaDica } from "./base";
import type { PontoDoDesenho } from "./CurvaProfit";
import { expandirSerie, seriePorOperacao, seriePorOperacaoCompacta } from "./series-da-curva";

// A série por operação como era até 18/09/2026, com a dica escrita no servidor, congelada aqui para
// provar que a forma compacta (números no HTML, dica escrita no navegador) mostra a mesma coisa.
function seriePorOperacaoDeAntes(ops: readonly OperacaoCompacta[], opcoes: OpcoesSerie, dias: readonly string[]): PontoDoDesenho[] {
  if (ops.length === 0) return [];
  const fmt = (v: number) =>
    opcoes.unidade === "brl" ? formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v, true)} pts`;
  const fatiar = <T,>(itens: T[], max = 240): T[][] => {
    if (itens.length <= max) return itens.map((i) => [i]);
    const tamanho = itens.length / max;
    return Array.from({ length: max }, (_, k) => {
      const de = Math.floor(k * tamanho);
      return itens.slice(de, Math.max(de + 1, Math.floor((k + 1) * tamanho)));
    });
  };
  const soma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  const curva = curvaPorOperacao(ops, opcoes);
  const total = curva.length;
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
          : `${formatarData(primeiro.dia)} a ${formatarData(ultimo.dia)}`,
      subtitulo: uma
        ? `Operação ${formatarNumero(ultimo.ordem)} de ${formatarNumero(total)}`
        : `Operações ${formatarNumero(primeiro.ordem)} a ${formatarNumero(ultimo.ordem)} de ${formatarNumero(total)}`,
      linhas: [
        { rotulo: uma ? "Na operação" : "Neste trecho", valor: fmt(valor), tom: tomDe(valor) },
        { rotulo: "Acumulado", valor: fmt(ultimo.acumulado), tom: tomDe(ultimo.acumulado) },
        {
          rotulo: "Drawdown",
          valor: drawdown < 0 ? fmt(drawdown) : "no topo",
          tom: drawdown < 0 ? ("negativo" as const) : ("neutro" as const),
        },
      ],
    };
    return { posicao: ultimo.posicao, acumulado: ultimo.acumulado, drawdown, dica };
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

describe("série por operação compacta", () => {
  it.each(casos)("reconstrói a mesma dica que a série antiga: $nome", ({ ops, dias, opcoes }) => {
    const antes = seriePorOperacaoDeAntes(ops, opcoes, dias);
    const compacta = seriePorOperacaoCompacta(ops, opcoes, dias);
    // o que vai no HTML é JSON: a volta tem de passar pela serialização
    const depois = expandirSerie(JSON.parse(JSON.stringify(compacta)), opcoes);

    expect(depois).toHaveLength(antes.length);
    depois.forEach((p, i) => {
      expect(p.dica).toEqual(antes[i].dica);
      expect(Math.abs(p.posicao - antes[i].posicao)).toBeLessThan(1e-4);
      // dinheiro com 2 casas: igual ao centavo
      expect(p.acumulado).toBeCloseTo(antes[i].acumulado, 2);
      expect(p.drawdown).toBeCloseTo(antes[i].drawdown, 2);
    });
  });

  it.each(casos)("seriePorOperacao continua dando exatamente a série antiga: $nome", ({ ops, dias, opcoes }) => {
    expect(seriePorOperacao(ops, opcoes, dias)).toEqual(seriePorOperacaoDeAntes(ops, opcoes, dias));
  });

  it("manda só números arredondados e cada dia uma vez", () => {
    const { ops, dias } = gerarOperacoes(140, () => 100);
    const compacta = seriePorOperacaoCompacta(ops, brl, dias);
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

  it("série vazia", () => {
    expect(seriePorOperacaoCompacta([], brl, [])).toEqual({ dias: [], total: 0, pontos: [] });
    expect(expandirSerie({ dias: [], total: 0, pontos: [] }, brl)).toEqual([]);
  });
});
