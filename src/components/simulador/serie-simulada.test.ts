import { describe, expect, it } from "vitest";
import { formatarBRL, formatarData, formatarDataCurta, formatarPct } from "@/lib/formato";
import { curvaSimulada, type PontoSimulado } from "@/lib/stats/simulador";
import { PONTOS_LEVE, rotulosDeData } from "@/components/graficos/series-da-curva";
import { pontosDaSimulacao } from "./serie-simulada";

const CAPITAL = 10000;

const fmt = (v: number) => formatarBRL(v, { sinal: true, inteiro: Math.abs(v) >= 1000 });

function serieDe(valores: Array<[string, number]>, capital = CAPITAL): PontoSimulado[] {
  return curvaSimulada(
    valores.map(([dia, valor]) => ({ dia, valor })),
    capital,
  );
}

describe("pontosDaSimulacao", () => {
  it("série vazia = nada para desenhar", () => {
    expect(pontosDaSimulacao([], CAPITAL)).toEqual({ pontos: [], dias: [], rotulosX: [] });
  });

  it("um ponto por dia: posição (i+1)/n, acumulado 0-based, drawdown e etiqueta do eixo", () => {
    const serie = serieDe([
      ["2026-09-01", 300],
      ["2026-09-02", -500],
      ["2026-09-03", 100],
    ]);
    const { pontos, dias, rotulosX } = pontosDaSimulacao(serie, CAPITAL);
    expect(dias).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(pontos.map((p) => p.posicao)).toEqual([1 / 3, 2 / 3, 1]);
    // o zero do desenho é o capital inicial: vai o acumulado, não o patrimônio
    expect(pontos.map((p) => p.acumulado)).toEqual([300, -200, -100]);
    expect(pontos.map((p) => p.drawdown)).toEqual([0, -500, -400]);
    expect(pontos.map((p) => p.eixo)).toEqual(["01/09/2026", "02/09/2026", "03/09/2026"]);
    expect(rotulosX).toEqual(rotulosDeData(dias));
  });

  it("a leitura de um dia: data e dia da semana, patrimônio, resultado, acumulado e drawdown em R$ e % do capital inicial", () => {
    const serie = serieDe([
      ["2026-09-01", 300],
      ["2026-09-02", -500],
    ]);
    const [topo, fundo] = pontosDaSimulacao(serie, CAPITAL).pontos;

    expect(topo.dica.titulo).toBe(formatarData("2026-09-01"));
    expect(topo.dica.subtitulo).toBe("terça-feira");
    expect(topo.dica.linhas).toEqual([
      { rotulo: "Patrimônio", valor: formatarBRL(10300, { inteiro: true }), tom: "neutro" },
      { rotulo: "Resultado", valor: fmt(300), tom: "positivo" },
      { rotulo: "Acumulado", valor: fmt(300), tom: "positivo" },
      { rotulo: "Drawdown", valor: "no topo", tom: "neutro" },
    ]);

    expect(fundo.dica.subtitulo).toBe("quarta-feira");
    expect(fundo.dica.linhas).toEqual([
      { rotulo: "Patrimônio", valor: formatarBRL(9800, { inteiro: true }), tom: "neutro" },
      { rotulo: "Resultado", valor: fmt(-500), tom: "negativo" },
      { rotulo: "Acumulado", valor: fmt(-200), tom: "negativo" },
      { rotulo: "Drawdown", valor: `${fmt(-500)} · ${formatarPct(0.05, 1)}`, tom: "negativo" },
    ]);
    expect(fundo.dica.linhas[3].valor).toContain("5,0%");
  });

  it("dia zerado tem tom neutro no resultado", () => {
    const [p] = pontosDaSimulacao(serieDe([["2026-09-01", 0]]), CAPITAL).pontos;
    expect(p.dica.linhas[1]).toEqual({ rotulo: "Resultado", valor: fmt(0), tom: "neutro" });
    expect(p.dica.linhas[3].valor).toBe("no topo");
  });

  it("sem capital válido a linha do drawdown fica só em R$", () => {
    const serie = serieDe(
      [
        ["2026-09-01", 100],
        ["2026-09-02", -150],
      ],
      0,
    );
    const [, p] = pontosDaSimulacao(serie, 0).pontos;
    expect(p.dica.linhas[3].valor).toBe(fmt(-150));
  });

  it("série longa vira no máximo PONTOS_LEVE fatias, com o drawdown mínimo e o resultado somado da fatia", () => {
    const valores: Array<[string, number]> = [];
    const inicio = new Date("2024-01-01T00:00:00Z");
    for (let i = 0; i < 600; i += 1) {
      const d = new Date(inicio);
      d.setUTCDate(d.getUTCDate() + i);
      // sobe 100 e cai 130 alternando: o pior dia de cada fatia é sempre uma queda
      valores.push([d.toISOString().slice(0, 10), i % 2 === 0 ? 100 : -130]);
    }
    const serie = serieDe(valores);
    const { pontos, dias } = pontosDaSimulacao(serie, CAPITAL);

    expect(dias).toHaveLength(600);
    expect(pontos).toHaveLength(PONTOS_LEVE);
    expect(pontos[pontos.length - 1].posicao).toBe(1);
    expect(pontos[pontos.length - 1].acumulado).toBe(serie[serie.length - 1].acumulado);
    expect(pontos[pontos.length - 1].eixo).toBe(formatarData(serie[serie.length - 1].dia));

    // cada fatia: o drawdown é o menor dos dias dela e o resultado é a soma; o acumulado é o do último dia
    const tamanho = 600 / PONTOS_LEVE;
    const primeira = serie.slice(0, Math.floor(tamanho) === tamanho ? tamanho : 2);
    const p0 = pontos[0];
    expect(p0.drawdown).toBe(Math.min(...primeira.map((p) => p.drawdown)));
    expect(p0.acumulado).toBe(primeira[primeira.length - 1].acumulado);
    expect(p0.dica.linhas[1].rotulo).toBe("Resultado da fatia");
    expect(p0.dica.linhas[1].valor).toBe(fmt(primeira.reduce((s, p) => s + p.valor, 0)));
    expect(p0.dica.titulo).toBe(`${primeira.length} dias (${formatarDataCurta(primeira[0].dia)} a ${formatarData(primeira[primeira.length - 1].dia)})`);
    expect(p0.dica.subtitulo).toBeUndefined();
    // a % do drawdown da fatia é sobre o capital inicial
    expect(p0.dica.linhas[3].valor).toBe(`${fmt(p0.drawdown)} · ${formatarPct(-p0.drawdown / CAPITAL, 1)}`);
  });

  it("fatia que cruza a virada do ano escreve as duas datas inteiras", () => {
    const valores: Array<[string, number]> = [];
    // 480 dias a partir de 21/12: fatias de exatamente 2 dias, e a sexta junta 31/12/2025 com 01/01/2026
    const inicio = new Date("2025-12-21T00:00:00Z");
    for (let i = 0; i < PONTOS_LEVE * 2; i += 1) {
      const d = new Date(inicio);
      d.setUTCDate(d.getUTCDate() + i);
      valores.push([d.toISOString().slice(0, 10), 10]);
    }
    const { pontos } = pontosDaSimulacao(serieDe(valores), CAPITAL);
    // a primeira fatia junta 21/12/2025 e 22/12/2025 (mesmo ano: data curta + data inteira)
    expect(pontos[0].dica.titulo).toBe("2 dias (21/12 a 22/12/2025)");
    // a fatia que junta 31/12/2025 e 01/01/2026 escreve as duas inteiras
    const virada = pontos.find((p) => p.dica.titulo.includes("31/12/2025"));
    expect(virada?.dica.titulo).toBe("2 dias (31/12/2025 a 01/01/2026)");
  });
});
