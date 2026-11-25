import { describe, expect, it } from "vitest";
import { formatarBRL } from "@/lib/formato";
import { classificarFaixa, DESCRICAO_CLASSE, drawdownPorOperacao, PARAMETROS_FAIXAS_PADRAO, rotuloFaixa, validarFaixas } from "./faixas";
import type { OperacaoCompacta } from "./operacoes";

// [dia, hora, diaSemana, pontos, brl, custos, duracao, lado, simbolo]
function op(dia: string, diaSemana: number, hora: number, liquido: number): OperacaoCompacta {
  return [dia, hora, diaSemana, liquido / 0.2, liquido, 0, 60, 1, "WINV26"];
}

function serie(diaSemana: number, hora: number, valores: number[], mes = "2026-09"): OperacaoCompacta[] {
  return valores.map((v, i) => op(`${mes}-${String((i % 28) + 1).padStart(2, "0")}`, diaSemana, hora, v));
}

describe("drawdownPorOperacao / rotuloFaixa", () => {
  it("drawdown da curva operação a operação", () => {
    expect(drawdownPorOperacao([10, -8, 10, -8])).toBe(8);
    expect(drawdownPorOperacao([30, 30, 30])).toBe(0);
    expect(drawdownPorOperacao([-50, -50])).toBe(100);
    expect(drawdownPorOperacao([])).toBe(0);
  });
  it("rótulo em pt-BR", () => {
    expect(rotuloFaixa(1, 9)).toBe("Segunda 09:00");
    expect(rotuloFaixa(5, 17)).toBe("Sexta 17:00");
  });
});

describe("classificarFaixa (parâmetros padrão)", () => {
  const p = PARAMETROS_FAIXAS_PADRAO;
  it("amostra mínima", () => {
    expect(classificarFaixa({ n: 39, acerto: 1, recuperacao: null, ddRelativo: 0 }, p).classe).toBeNull();
  });
  it("qualquer condição de evitar decide sozinha", () => {
    expect(classificarFaixa({ n: 40, acerto: 0.3, recuperacao: 5, ddRelativo: 1 }, p).classe).toBe("evitar");
    expect(classificarFaixa({ n: 40, acerto: 0.9, recuperacao: 0.3, ddRelativo: 1 }, p).classe).toBe("evitar");
    expect(classificarFaixa({ n: 40, acerto: 0.9, recuperacao: 5, ddRelativo: 7 }, p).classe).toBe("evitar");
  });
  it("ligar exige as três condições", () => {
    expect(classificarFaixa({ n: 40, acerto: 0.6, recuperacao: 1, ddRelativo: 3 }, p).classe).toBe("ligar");
    expect(classificarFaixa({ n: 40, acerto: 0.6, recuperacao: 1, ddRelativo: 5 }, p).classe).toBe("cautela"); // DD relativo alto demais pra ligar
    expect(classificarFaixa({ n: 40, acerto: 0.6, recuperacao: null, ddRelativo: null }, p).classe).toBe("ligar"); // recuperação infinita
  });
  it("cautela e neutro", () => {
    expect(classificarFaixa({ n: 40, acerto: 0.5, recuperacao: 0.7, ddRelativo: 1 }, p).classe).toBe("cautela");
    expect(classificarFaixa({ n: 40, acerto: 0.45, recuperacao: 0.7, ddRelativo: 1 }, p).classe).toBe("neutro");
    expect(classificarFaixa({ n: 40, acerto: 0.5, recuperacao: 0.5, ddRelativo: 1 }, p).classe).toBe("neutro");
  });
  it("parâmetros customizados", () => {
    const solto = { ...p, amostraMinima: 5, ligar: { acertoMin: 0.5, recuperacaoMin: 0.5, ddRelativoMax: 10 } };
    expect(classificarFaixa({ n: 5, acerto: 0.5, recuperacao: 0.5, ddRelativo: 5 }, solto).classe).toBe("ligar");
    // evitar continua valendo antes de ligar: DD relativo 9 > 6 do padrão
    expect(classificarFaixa({ n: 5, acerto: 0.5, recuperacao: 0.5, ddRelativo: 9 }, solto).classe).toBe("evitar");
  });

  // 25/11/2026 (ficha Mesa): o motivo era a conta em símbolos ("acerto 60% ≥ 58%, recuperação 1.00 ≥ 0.85, DD
  // relativo 3.0x ≤ 4x") e por isso tinha saído da tela; agora é uma frase com as palavras da tela
  it("o motivo é uma frase de leigo, com os números em pt-BR", () => {
    const m = (f: Parameters<typeof classificarFaixa>[0]) => classificarFaixa(f, p).motivo;
    // sem classe: poucas operações, ou nenhuma
    expect(m({ n: 12, acerto: 1, recuperacao: null, ddRelativo: 0 })).toBe("poucas operações para confiar: 12, e o mínimo é 40");
    expect(m({ n: 0, acerto: 0, recuperacao: 0, ddRelativo: null })).toBe("nenhuma operação neste dia e horário");
    // Evitar: a regra que decidiu, com o limite ao lado
    expect(m({ n: 40, acerto: 0.3, recuperacao: 5, ddRelativo: 1 })).toBe("só 30% das operações terminaram com ganho (o limite é 38%)");
    expect(m({ n: 40, acerto: 0, recuperacao: -1, ddRelativo: 1 })).toBe("nenhuma operação terminou com ganho (o limite é 38%)");
    expect(m({ n: 40, acerto: 0.9, recuperacao: 0.3, ddRelativo: 1 })).toBe("o resultado cobre só 30% da maior queda (o limite é 40%)");
    expect(m({ n: 40, acerto: 0.9, recuperacao: -0.5, ddRelativo: 1 })).toBe("a soma das operações deu perda");
    expect(m({ n: 40, acerto: 0.9, recuperacao: 0, ddRelativo: 1 })).toBe("a soma das operações não deu ganho");
    expect(m({ n: 40, acerto: 0.9, recuperacao: 5, ddRelativo: 7 })).toBe("a maior queda foi 7 vezes a típica dos dias e horários (o limite é 6 vezes)");
    // Ligar: as três medidas, em palavras
    expect(m({ n: 40, acerto: 0.6, recuperacao: 1, ddRelativo: 3 })).toBe(
      "60% das operações terminaram com ganho, o resultado cobre a maior queda inteira e ela foi 3 vezes a típica dos dias e horários",
    );
    expect(m({ n: 40, acerto: 0.62, recuperacao: 3.24, ddRelativo: 0.6 })).toBe(
      "62% das operações terminaram com ganho, o resultado é 3,2 vezes a maior queda e ela não passou da típica dos dias e horários",
    );
    expect(m({ n: 40, acerto: 0.6, recuperacao: 0.9, ddRelativo: 1.5 })).toBe(
      "60% das operações terminaram com ganho, o resultado cobre 90% da maior queda e ela foi 1,5 vez a típica dos dias e horários",
    );
    // sem queda (recuperação infinita) não há o que comparar com a típica
    expect(m({ n: 40, acerto: 1, recuperacao: null, ddRelativo: null })).toBe("todas as operações terminaram com ganho e não houve queda no caminho");
    // Cautela: o que passou e o que faltou para Ligar
    expect(m({ n: 40, acerto: 0.6, recuperacao: 1, ddRelativo: 5 })).toBe(
      "60% das operações terminaram com ganho e o resultado cobre a maior queda inteira; para Ligar faltou a maior queda ficar em até 4 vezes a típica dos dias e horários",
    );
    expect(m({ n: 40, acerto: 0.5, recuperacao: 0.7, ddRelativo: 1 })).toBe(
      "50% das operações terminaram com ganho e o resultado cobre 70% da maior queda; para Ligar faltou chegar a 58% das operações com ganho e o resultado cobrir 85% da maior queda",
    );
    // Neutro: o que ficou abaixo do mínimo de Cautela
    expect(m({ n: 40, acerto: 0.45, recuperacao: 0.7, ddRelativo: 1 })).toBe("só 45% das operações terminaram com ganho (Cautela pede 48%)");
    expect(m({ n: 40, acerto: 0.5, recuperacao: 0.5, ddRelativo: 1 })).toBe("o resultado cobre só 50% da maior queda (Cautela pede 60%)");
    expect(m({ n: 40, acerto: 0.45, recuperacao: 0.5, ddRelativo: 1 })).toBe(
      "só 45% das operações terminaram com ganho (Cautela pede 48%) e o resultado cobre só 50% da maior queda (Cautela pede 60%)",
    );
    // porcentagem que arredondaria igual ao limite ganha uma casa, para a frase não se contradizer
    expect(m({ n: 40, acerto: 0.479, recuperacao: 0.7, ddRelativo: 1 })).toBe("só 47,9% das operações terminaram com ganho (Cautela pede 48%)");
  });

  it("a descrição de cada classe fala em tamanho da posição, sem \"lote\"", () => {
    expect(DESCRICAO_CLASSE).toEqual({
      ligar: "Passou em todos os critérios · tamanho sugerido da posição: 100%",
      cautela: "Passou em parte dos critérios · tamanho sugerido da posição: 60%",
      neutro: "Abaixo do mínimo de Cautela · tamanho sugerido da posição: 35%",
      evitar: "Caiu em um dos limites para não operar · tamanho sugerido da posição: 0%",
    });
  });
});

describe("validarFaixas", () => {
  // segunda 9h: 40 gains de +30 em 2 meses -> ligar (recuperação infinita)
  const boa = [...serie(1, 9, Array(20).fill(30), "2026-08"), ...serie(1, 9, Array(20).fill(30), "2026-09")];
  // terça 10h: 40 losses de -50 -> evitar (acerto 0%)
  const ruim = serie(2, 10, Array(40).fill(-50));
  // quarta 11h: 50 ops alternando +10/-8 -> acerto 50%, recuperação 50/8 -> cautela
  const meio = serie(3, 11, Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 10 : -8)));
  // quinta 12h: só 3 ops -> sem classificação
  const poucas = serie(4, 12, [5, 5, 5]);
  // fora da grade (sábado) é ignorada
  const fora = serie(6, 9, [100]);

  const r = validarFaixas([...boa, ...ruim, ...meio, ...poucas, ...fora]);
  const f = (d: number, h: number) => r.faixas.find((x) => x.diaSemana === d && x.hora === h)!;

  it("monta 45 faixas e conta só as operações da grade", () => {
    expect(r.faixas).toHaveLength(45);
    expect(r.nOperacoes).toBe(40 + 40 + 50 + 3);
    expect(r.comDados).toHaveLength(3);
    expect(r.parametros).toEqual(PARAMETROS_FAIXAS_PADRAO);
  });

  it("métricas por faixa e mediana de drawdown", () => {
    expect(f(1, 9)).toMatchObject({ n: 40, acerto: 1, dd: 0, recuperacao: null, classe: "ligar", lote: 1 });
    expect(f(2, 10)).toMatchObject({ n: 40, acerto: 0, dd: 2000, recuperacao: -1, classe: "evitar", lote: 0 });
    expect(f(3, 11)).toMatchObject({ n: 50, acerto: 0.5, dd: 8, recuperacao: 50 / 8, classe: "cautela", lote: 0.6 });
    expect(r.medianaDd).toBe((8 + 2000) / 2);
    expect(f(3, 11).ddRelativo).toBeCloseTo(8 / 1004);
    expect(f(4, 12).classe).toBeNull();
    // os motivos em frase de leigo (25/11/2026; eram "amostra de 3 operações, mínimo 40" e "acerto 0% abaixo de 38%")
    expect(f(4, 12).motivo).toBe("poucas operações para confiar: 3, e o mínimo é 40");
    expect(f(2, 10).motivo).toBe("nenhuma operação terminou com ganho (o limite é 38%)");
    expect(f(1, 9).motivo).toBe("todas as operações terminaram com ganho e não houve queda no caminho");
    expect(f(3, 11).motivo).toBe("50% das operações terminaram com ganho e o resultado é 6,3 vezes a maior queda; para Ligar faltou chegar a 58% das operações com ganho");
    expect(f(5, 17).motivo).toBe("nenhuma operação neste dia e horário");
  });

  it("contagem, melhores e insights", () => {
    expect(r.contagem).toEqual({ ligar: 1, cautela: 1, neutro: 0, evitar: 1 });
    expect(r.melhores[0].rotulo).toBe("Segunda 09:00");
    expect(r.insights.some((i) => i.chave === "ligar")).toBe(true);
    expect(r.insights.find((i) => i.chave === "pior-hora")?.texto).toContain("10h");
  });

  it("insights em frases de leigo, com as mesmas chaves (ficha Mesa, 25/11/2026)", () => {
    const texto = (chave: string) => r.insights.find((i) => i.chave === chave)?.texto;
    expect(r.insights.map((i) => i.chave)).toEqual(["horas", "dias", "ligar", "evitar", "pior-hora"]);
    expect(texto("horas")).toBe("As maiores notas estão nas operações que começam às 9h, às 10h e às 11h.");
    expect(texto("dias")).toBe("Segunda e quarta são os dias da semana em que mais meses terminaram com ganho.");
    expect(texto("ligar")).toBe(
      "1 dia e horário ficou como Ligar. Para isso, pelo menos 58% das operações têm de terminar com ganho, o resultado tem de cobrir pelo menos 85% da maior queda e ela não pode passar de 4 vezes a típica dos dias e horários.",
    );
    expect(texto("evitar")).toBe("1 dia e horário ficou como Evitar: poucas operações com ganho, resultado que cobre pouco da maior queda ou queda muito acima da típica.");
    expect(texto("pior-hora")).toBe(`As operações que começam às 10h têm o pior resultado médio: ${formatarBRL(-50, { sinal: true })} por operação.`);
  });

  it("insights contam em palavras: nenhum, um, vários", () => {
    // só a quarta 11h (Cautela): nenhum Ligar e nenhum Evitar
    const soCautela = validarFaixas(meio);
    expect(soCautela.insights.find((i) => i.chave === "ligar")?.texto.startsWith("Nenhum dia e horário ficou como Ligar. Para isso, ")).toBe(true);
    expect(soCautela.insights.find((i) => i.chave === "evitar")?.texto).toBe("Nenhum dia e horário ficou como Evitar.");
    expect(soCautela.insights.find((i) => i.chave === "horas")?.texto).toBe("As maiores notas estão nas operações que começam às 11h.");
    // dois Evitar
    const dois = validarFaixas([...ruim, ...serie(4, 14, Array(40).fill(-10))]);
    expect(dois.insights.find((i) => i.chave === "evitar")?.texto.startsWith("2 dias e horários ficaram como Evitar: ")).toBe(true);
  });

  it("insight da abertura: a maior queda das 9h e 10h comparada com a típica, em palavras", () => {
    // segunda 9h cai 2.000 antes de subir; três horários de quarta têm queda de 8: a típica é 8
    const funda = serie(1, 9, [...Array(20).fill(-100), ...Array(20).fill(150)]);
    const rasas = [11, 12, 13].flatMap((h) => serie(3, h, Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 10 : -8))));
    const v = validarFaixas([...funda, ...rasas]);
    expect(v.medianaDd).toBe(8);
    expect(v.insights.find((i) => i.chave === "abertura")?.texto).toBe(
      "Nas operações que começam às 9h e às 10h a maior queda é grande: em média, 250 vezes a típica dos dias e horários.",
    );
  });

  it("nenhum texto leva sigla, símbolo ou o jargão antigo", () => {
    const sigla = /\bDD\b|LIGAR|EVITAR|[≥≤∞]|\d\.\d{1,2}(?!\d)|\dx\b/;
    const jargao = /drawdown|rebaixamento|recuperação|acerto|expectativa|estabilidade|faixa|lote|score|payoff|gain|loss/i;
    const textos = [...r.faixas.map((x) => x.motivo), ...r.insights.map((i) => i.texto), ...Object.values(DESCRICAO_CLASSE)];
    expect(textos.length).toBe(45 + 5 + 4);
    for (const t of textos) {
      expect(t).not.toMatch(sigla);
      expect(t).not.toMatch(jargao);
    }
  });

  it("lista vazia", () => {
    const v = validarFaixas([]);
    expect(v.comDados).toHaveLength(0);
    expect(v.insights).toHaveLength(0);
    expect(v.melhores).toHaveLength(0);
    expect(v.medianaDd).toBe(0);
  });
});
