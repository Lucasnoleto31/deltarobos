import { describe, expect, it } from "vitest";
import { formatarPct } from "@/lib/formato";
import { LIMITE_APERTADO } from "@/lib/stats/simulador";
import { GLOSSARIO, type ChaveIndicador } from "./glossario";

// as regras mecânicas do texto do "o que é" (19/09/2026); o tom (leigo, sem marketing) se confere lendo
const entradas = Object.entries(GLOSSARIO) as Array<[ChaveIndicador, (typeof GLOSSARIO)[ChaveIndicador]]>;

/** primeira palavra, sem acento de caixa e sem pontuação em volta */
function primeiraPalavra(s: string): string {
  return (s.trim().split(/\s+/)[0] ?? "").toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]/gu, "");
}

// 25/11/2026 (ficha Mesa, DESIGN.md seção 7): o jargão que saiu da tela. As palavras valem em qualquer caixa;
// as siglas, só em maiúsculas ("men" e "win" não são palavras do texto, mas a sigla não pode casar por acaso)
const PALAVRAS_DE_JARGAO =
  /\b(drawdowns?|payoff|scores?|lotes?|faixas?|gains?|loss(?:es)?|trades?|heatmap|flutuantes?|volatilidade|taxa de acerto|recovery factor|ulcer index|brut[oa]s?|l[ií]quid[oa]s?|acumulad[oa]s?)\b/i;
const SIGLAS_DE_JARGAO = /\b(DD|MEP|MEN|MFE|MAE|WIN|WDO)\b/;
const temJargao = (s: string) => PALAVRAS_DE_JARGAO.test(s) || SIGLAS_DE_JARGAO.test(s);
/** os trechos entre parênteses do texto, com os parênteses */
const parenteses = (s: string) => s.match(/\([^)]*\)/g) ?? [];

describe("glossário de indicadores", () => {
  it("tem entradas", () => {
    expect(entradas.length).toBeGreaterThan(40);
  });

  it.each(entradas)("%s: texto de 20 a 260 caracteres, terminando em ponto", (_chave, e) => {
    expect(e.nome.trim().length).toBeGreaterThan(0);
    expect(e.texto.length).toBeGreaterThanOrEqual(20);
    expect(e.texto.length).toBeLessThanOrEqual(260);
    expect(e.texto.endsWith(".")).toBe(true);
    expect(e.texto).toBe(e.texto.trim());
  });

  it.each(entradas)("%s: sem símbolo de conta nem exclamação", (_chave, e) => {
    expect(e.texto).not.toMatch(/[÷×!]/);
  });

  it.each(entradas)("%s: não começa repetindo o nome", (_chave, e) => {
    expect(primeiraPalavra(e.texto)).not.toBe(primeiraPalavra(e.nome));
  });

  // a marca mudou em 19/09/2026: nada de nome antigo nem de corretora pelo nome
  it.each(entradas)("%s: sem marca antiga nem corretora pelo nome", (_chave, e) => {
    expect(`${e.nome} ${e.texto}`).not.toMatch(/delta|btg/i);
  });

  // 25/11/2026 (ficha Mesa; Lucas: "para um leigo está muito difícil de entender"): o nome é o título do balão
  // que abre quando alguém toca no rótulo da tela, e por isso não leva jargão nem "por contrato"
  it.each(entradas)("%s: o nome não leva jargão", (_chave, e) => {
    expect(temJargao(e.nome)).toBe(false);
    expect(e.nome).not.toMatch(/por contrato/i);
  });

  // o termo técnico aparece no máximo uma vez, entre parênteses, para quem o conhece de outro lugar
  it.each(entradas)("%s: no texto, o termo técnico só entre parênteses e uma vez", (_chave, e) => {
    expect(temJargao(e.texto.replace(/\([^)]*\)/g, ""))).toBe(false);
    expect(parenteses(e.texto).filter(temJargao).length).toBeLessThanOrEqual(1);
    expect(e.texto).not.toMatch(/por contrato, l|líquido de custos/i);
  });

  // a tela dizia "Maior queda" e o balão abria com "Drawdown máximo"; "Acertos" abria "Taxa de acerto"; "Nota",
  // "Score". O nome de cada chave em uso é o rótulo que a tela põe nela (KpisRobo, PainelDesempenho,
  // PainelResultado, PainelComparativo, HojeAoVivo, TabelaOperacoes, CabecalhoRobo, PainelSimulador)
  it("o nome é o rótulo da tela", () => {
    const rotulos: Partial<Record<ChaveIndicador, string>> = {
      drawdown: "Maior queda",
      drawdownPct: "Maior queda, em % do capital",
      taxaAcerto: "Acertos",
      payoff: "Ganho médio contra perda média",
      fatorLucro: "Fator de lucro",
      operacoes: "Operações",
      mediaMensal: "Média por mês",
      sequenciaDiasNegativos: "Maior sequência de dias com perda",
      retorno: "Retorno sobre o capital",
      capitalMinimo: "Capital mínimo",
      contratosPadrao: "Contratos por operação",
      mep: "Melhor momento do dia",
      men: "Pior momento do dia",
      // as chaves sem uso na tela seguem o vocabulário da seção 7 do DESIGN.md
      faixa: "Dia e horário",
      score: "Nota",
      lote: "Tamanho sugerido da posição",
      bruto: "Antes dos custos",
      liquido: "Já descontados os custos",
      porContrato: "Com 1 contrato",
      diasPositivos: "Dias com ganho",
      volatilidade: "Variação de um dia para o outro",
    };
    for (const [chave, rotulo] of Object.entries(rotulos) as Array<[ChaveIndicador, string]>) {
      expect(GLOSSARIO[chave].nome, chave).toBe(rotulo);
    }
  });

  it("o termo técnico fica no texto, entre parênteses, para quem já conhece", () => {
    expect(GLOSSARIO.drawdown.texto).toMatch(/\([^)]*drawdown[^)]*\)/);
    expect(GLOSSARIO.taxaAcerto.texto).toMatch(/\([^)]*taxa de acerto[^)]*\)/);
    expect(GLOSSARIO.payoff.texto).toMatch(/\([^)]*payoff[^)]*\)/);
    expect(GLOSSARIO.volatilidade.texto).toMatch(/\([^)]*volatilidade[^)]*\)/);
  });

  // 21/09/2026: o contador conta entradas ainda abertas, e o texto tem que dizer que não é contrato
  it("operações em aberto: cada entrada conta 1, e não é número de contratos", () => {
    const e = GLOSSARIO.operacoesEmAberto;
    expect(e.nome).toBe("Operações em aberto");
    expect(e.texto).toMatch(/conta 1/);
    expect(e.texto).toMatch(/contratos/);
  });

  // 22/09/2026: MEP/MEN com duas fontes (tick a tick pelo coletor 1.1.0, ou por fechamento) e MFE/MAE.
  // 25/11/2026 (ficha Mesa): na tela são o melhor e o pior momento, do dia e da operação; a sigla saiu do nome
  // e fica uma vez no texto, entre parênteses, e "pontos por contrato" virou "em pontos"
  it("melhor e pior momento do dia citam as duas fontes; os da operação são em pontos", () => {
    for (const chave of ["mep", "men"] as const) {
      const e = GLOSSARIO[chave];
      expect(e.texto).toMatch(/movimento do preço/);
      expect(e.texto).toMatch(/operação fechada/);
    }
    expect(GLOSSARIO.mep.texto).toMatch(/\([^)]*MEP[^)]*\)/);
    expect(GLOSSARIO.men.texto).toMatch(/\([^)]*MEN[^)]*\)/);
    expect(GLOSSARIO.mfe.nome).toBe("Melhor momento da operação");
    expect(GLOSSARIO.mae.nome).toBe("Pior momento da operação");
    expect(GLOSSARIO.mfe.texto).toMatch(/\([^)]*MFE[^)]*\)/);
    expect(GLOSSARIO.mae.texto).toMatch(/\([^)]*MAE[^)]*\)/);
    for (const chave of ["mfe", "mae"] as const) {
      const e = GLOSSARIO[chave];
      expect(e.texto).toMatch(/em pontos/);
      expect(e.texto).toMatch(/enquanto ela esteve aberta/);
    }
    expect(GLOSSARIO.mfe.texto).toMatch(/a favor/);
    expect(GLOSSARIO.mae.texto).toMatch(/contra/);
  });

  // 23/09/2026: a curva do dia com duas fontes (série do saldo do EA 1.1.2 a cada 5 s, ou por fechamento), a
  // faixa mín./máx. de cada balde e os dentes de MFE/MAE nas curvas por operação.
  // 25/11/2026 (ficha Mesa): o nome da curva do dia é o título que a tela põe em cima dela, e o dos dentes
  // deixou de levar as siglas
  it("curva do dia cita as duas fontes; faixa e dentes descrevem o desenho", () => {
    expect(GLOSSARIO.curvaDoDia.nome).toBe("Saldo ao longo do dia");
    expect(GLOSSARIO.curvaDoDia.texto).toMatch(/5 segundos/);
    expect(GLOSSARIO.curvaDoDia.texto).toMatch(/operação por operação/);
    expect(GLOSSARIO.faixaSaldo.texto).toMatch(/menor e o maior/);
    expect(GLOSSARIO.dentesExcursao.nome).toBe("Melhor e pior momento de cada operação");
    expect(GLOSSARIO.dentesExcursao.texto).toMatch(/\([^)]*MAE e MFE[^)]*\)/);
    expect(GLOSSARIO.dentesExcursao.texto).toMatch(/MetaTrader/);
    expect(GLOSSARIO.dentesExcursao.texto).toMatch(/aberta/);
  });

  it("o lote sai da constante das faixas", () => {
    expect(GLOSSARIO.lote.texto).toContain("100% em Ligar");
    expect(GLOSSARIO.lote.texto).toContain("0% em Evitar");
  });

  // o texto do "cabe, apertado ou não cabe" cita o limite à mão: se LIMITE_APERTADO mudar, o texto muda junto
  it("o limite de apertado do texto é o do simulador", () => {
    expect(GLOSSARIO.semaforoCapital.texto).toContain(`${formatarPct(LIMITE_APERTADO, 0)} do capital`);
    expect(GLOSSARIO.semaforoCapital.texto).toMatch(/não uma garantia/);
  });
});
