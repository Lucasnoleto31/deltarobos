import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { CapitalDoRobo } from "@/lib/consultas/capital";
import { resumirMes } from "@/lib/stats/card-do-dia";
import type { LinhaDiaria } from "@/lib/stats/tipos";
import type { OperacaoPublica, RoboPublico } from "@/lib/tipos";
import { RelatorioMensal } from "./RelatorioMensal";

// O que o PDF do mês escreve, sem gerar o PDF: a árvore do relatório é percorrida e cada <Text> vira uma frase.
// Confere as regras das telas (DESIGN.md, seção 9) no documento que sai do site: os termos que saíram não
// voltam, o resultado vem com a maior queda do mês e os acertos, com o necessário para empatar.

/** as frases do relatório: um texto por <Text>, com os pedaços juntos; componente próprio é chamado */
function frases(no: ReactNode): string[] {
  if (no === null || no === undefined || typeof no === "boolean") return [];
  if (typeof no === "string" || typeof no === "number") return [String(no)];
  if (Array.isArray(no)) return no.flatMap(frases);
  if (!isValidElement(no)) return [];
  const el = no as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") return frases((el.type as (p: unknown) => ReactNode)(el.props));
  const dentro = frases(el.props.children);
  // os primitivos do react-pdf são textos ("TEXT", "VIEW"...): o <Text> junta o que tem dentro numa frase só
  return el.type === "TEXT" ? (dentro.length > 0 ? [dentro.join("")] : []) : dentro;
}

/** um pregão da série diária; ganhos e perdas já com o custo de R$ 0,25 por operação descontado */
function pregao(dia: string, ganhos: number[], perdas: number[]): LinhaDiaria {
  const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const n = ganhos.length + perdas.length;
  return {
    dia,
    pontos_por_contrato: 0,
    resultado_brl_por_contrato: soma(ganhos) + soma(perdas) + n * 0.25,
    custos_brl_por_contrato: n * 0.25,
    n_operacoes: n,
    n_gain: ganhos.length,
    n_loss: perdas.length,
    soma_gain_brl_por_contrato: soma(ganhos),
    soma_loss_brl_por_contrato: soma(perdas),
    maior_gain_brl_por_contrato: ganhos.length > 0 ? Math.max(...ganhos) : 0,
    maior_loss_brl_por_contrato: perdas.length > 0 ? Math.min(...perdas) : 0,
  };
}

const ROBO = {
  slug: "robo-teste",
  nome: "Robô Teste",
  ativo: "WIN",
  ativo_nome: "Mini Índice",
  valor_ponto_brl: 0.2,
  custo_por_contrato: 0.25,
  capital_referencia: 20000,
  conta_tipo: "real",
} as RoboPublico;

const CAPITAL: CapitalDoRobo = { capitalMinimo: 58512, margem: 150, entradas: 36, entradasEm: "2026-07-01T14:00:00Z", maiorQueda: 35408, fator: 1.5 };

function op(id: number, parcial: Partial<OperacaoPublica> = {}): OperacaoPublica {
  return {
    id,
    dia_pregao: "2026-10-01",
    abertura_em: "2026-10-01T13:00:00Z",
    fechamento_em: "2026-10-01T13:04:00Z",
    duracao_seg: 240,
    simbolo: "WINV26",
    lado: "compra",
    preco_entrada: 188645,
    preco_saida: 188795,
    pontos_por_contrato: 150,
    resultado_brl_por_contrato: 30,
    custos_brl_por_contrato: 0.25,
    origem: "mt5",
    ...parcial,
  } as OperacaoPublica;
}

const LINHAS = [pregao("2026-10-01", [24, 24, 24, 24], [-105]), pregao("2026-10-02", [24, 24], [-105, -105]), pregao("2026-10-05", [24, 24, 24, 24, 24, 24], [])];

function relatorio(parcial: { linhas?: LinhaDiaria[]; capital?: CapitalDoRobo | null; ops?: OperacaoPublica[]; hoje?: string; robo?: RoboPublico } = {}) {
  const ops = parcial.ops ?? [op(1), op(2, { lado: "venda", resultado_brl_por_contrato: -104.75 })];
  const resumo = resumirMes({
    mes: "2026-10",
    linhas: parcial.linhas ?? LINHAS,
    hoje: parcial.hoje ?? "2026-11-25",
    feriados: ["2026-10-12"],
    duracoesSeg: ops.filter((o) => o.origem !== "manual").map((o) => o.duracao_seg),
  });
  return frases(
    RelatorioMensal({
      robo: parcial.robo ?? ROBO,
      resumo,
      capital: parcial.capital === undefined ? CAPITAL : parcial.capital,
      ops,
      totalOps: ops.length,
      geradoEm: "25/11/2026 15:00",
      site: "quantsrobos.com",
      legal: "Rentabilidade passada não garante rentabilidade futura.",
    }),
  );
}

const semNbsp = (s: string) => s.replace(/ /g, " ");

describe("RelatorioMensal: o que o PDF escreve", () => {
  it("nenhum termo que saiu do site, nenhum percentual e nenhum travessão longo", () => {
    const saiu =
      /drawdown|payoff|taxa de acerto|win ?rate|\bgains?\b|\bloss(es)?\b|\bbruto\b|l[ií]quido|calmar|[úu]lcera|ru[ií]na|capital de refer[êe]ncia|do capital|m[ée]dia por (m[êe]s|dia)|retorno|sequ[êe]ncia|\bMFE\b|\bMAE\b|\bMEP\b|\bMEN\b|\bMT5\b|\bWIN\b|por contrato por opera/i;
    for (const texto of [relatorio(), relatorio({ capital: null }), relatorio({ hoje: "2026-10-02" }), relatorio({ robo: { ...ROBO, conta_tipo: "demo" } as RoboPublico })]) {
      for (const frase of texto) {
        expect(frase).not.toMatch(saiu);
        expect(frase).not.toContain("%");
        expect(frase).not.toContain("—");
      }
    }
  });

  it("o resultado do mês vem com a premissa, a maior queda de dentro do mês, os dias com ganho e o pior dia", () => {
    const texto = relatorio().map(semNbsp);
    expect(texto).toContain("Resultado do mês");
    // (96 − 105) + (48 − 210) + 144 = −27
    expect(texto).toContain("-R$ 27,00");
    expect(texto).toContain("com 1 contrato por entrada, já descontados os custos");
    expect(texto).toContain("em 3 pregões com operação, de 01/10 a 05/10");
    const i = texto.indexOf("Maior queda no mês");
    expect(i).toBeGreaterThan(-1);
    // caiu R$ 9 no dia 1º e R$ 162 no dia 2; não voltou ao zero até o fim do mês
    expect(texto[i + 1]).toBe("-R$ 171,00");
    expect(texto[i + 2]).toBe("de 01/10 a 02/10; não recuperou no mês");
    expect(texto[texto.indexOf("Dias com ganho") + 1]).toBe("1 de 3");
    expect(texto[texto.indexOf("Pior dia") + 1]).toBe("02/10 · -R$ 162,00");
  });

  it("acertos só com o necessário para empatar; ganho e perda típicos em R$; fator de lucro em frase", () => {
    const texto = relatorio().map(semNbsp);
    const i = texto.indexOf("Acertos");
    expect(i).toBeGreaterThan(-1);
    // 12 de 15 operações com ganho; ganho de R$ 24 contra perda de R$ 105: precisa de 81 de cada 100
    expect(texto[i + 1]).toBe("Pelo tamanho dos ganhos e das perdas, precisava de 81 de cada 100 só para empatar.");
    expect(texto[i + 2]).toBe("80 de cada 100");
    expect(texto[texto.indexOf("Ganho típico e perda típica") + 2]).toBe("+R$ 24,00 e -R$ 105,00");
    // R$ 288 de ganho para R$ 315 de perda
    expect(texto[texto.indexOf("Fator de lucro") + 2]).toBe("ganhou R$ 0,91 para cada R$ 1 perdido");
    expect(texto[texto.indexOf("Resultado médio por operação") + 1]).toBe("O custo considerado é de R$ 0,25 por operação.");
    // a duração é a mediana, como na aba Resumo
    expect(texto[texto.indexOf("Operações") + 1]).toBe("5 por pregão, cada uma dura 4 min, normalmente; operou em 3 de 21 pregões do mês");
  });

  it("acertos e o necessário para empatar que arredondariam para o mesmo número saem com uma casa", () => {
    // 25 de 31 com ganho (80,6) e ganho de R$ 24 contra perda de R$ 102 (precisa de 80,95): os dois dariam 81
    const texto = relatorio({ linhas: [pregao("2026-10-01", Array(25).fill(24), Array(6).fill(-102))] }).map(semNbsp);
    const i = texto.indexOf("Acertos");
    expect(texto[i + 1]).toBe("Pelo tamanho dos ganhos e das perdas, precisava de 81,0 de cada 100 só para empatar.");
    expect(texto[i + 2]).toBe("80,6 de cada 100");
  });

  it("mês sem operação com perda: sem acertos e sem fator de lucro, porque não há com o que comparar", () => {
    const texto = relatorio({ linhas: [pregao("2026-10-01", [24, 24], [])] }).map(semNbsp);
    expect(texto).not.toContain("Acertos");
    expect(texto).not.toContain("Fator de lucro");
    expect(texto).toContain("Ganho típico");
    expect(texto[texto.indexOf("Maior queda no mês") + 1]).toBe("nenhuma");
  });

  it("o capital mínimo é o das telas, com a conta por extenso; sem a conta, a seção não aparece", () => {
    const texto = relatorio().map(semNbsp);
    expect(texto[texto.indexOf("Entradas abertas ao mesmo tempo") + 2]).toBe("até 36");
    const i = texto.indexOf("Capital mínimo");
    expect(texto[i + 1]).toBe(
      "R$ 150 de garantia (a margem) por contrato × 36 entradas, mais a maior queda de todo o histórico (R$ 35.408) × 1,5. Conta feita com o histórico inteiro, na data deste relatório. Quedas futuras podem ser maiores.",
    );
    expect(texto[i + 2]).toBe("R$ 58.512");

    // robô sem medição de entradas (histórico importado): a garantia de 1 contrato, e a linha das entradas não entra
    const semMedicao = relatorio({ capital: { ...CAPITAL, capitalMinimo: 37620, entradas: 1, entradasEm: null, maiorQueda: 24980 } }).map(semNbsp);
    expect(semMedicao).not.toContain("Entradas abertas ao mesmo tempo");
    expect(semMedicao[semMedicao.indexOf("Capital mínimo") + 1]).toMatch(/^R\$ 150 de garantia \(a margem\) por contrato, mais a maior queda de todo o histórico \(R\$ 24\.980\) × 1,5\./);

    expect(relatorio({ capital: null })).not.toContain("Capital para usar o robô");
    expect(relatorio({ capital: { ...CAPITAL, capitalMinimo: null, margem: null } })).not.toContain("Capital mínimo");
  });

  it("mês em andamento: o rótulo diz até que dia vai e a queda aberta diz que ainda não recuperou", () => {
    const texto = relatorio({ hoje: "2026-10-02" }).map(semNbsp);
    expect(texto).toContain("Resultado do mês até 02/10");
    expect(texto).toContain("em 2 pregões com operação, de 01/10 a 02/10 (mês em andamento)");
    expect(texto).toContain("de 01/10 a 02/10; ainda não recuperou");
    expect(texto[texto.indexOf("Operações") + 1]).toContain("operou em 2 de 2 pregões do mês até agora");
  });

  it("a tabela de operações só tem as colunas que o mês preenche, com os nomes da aba Operações", () => {
    const colunas = (texto: string[]) => texto.slice(texto.findIndex((t) => t.startsWith("Operações do mês")) + 1).slice(0, 8);
    expect(colunas(relatorio())).toEqual(["Dia", "Horário", "Lado", "Entrada", "Saída", "Duração", "Pontos", "Resultado"]);
    // histórico importado: sem preço, sem hora de entrada e sem duração
    const importadas = [op(1, { origem: "manual", preco_entrada: null, preco_saida: null }), op(2, { origem: "manual", preco_entrada: null, preco_saida: null })];
    expect(colunas(relatorio({ ops: importadas })).slice(0, 5)).toEqual(["Dia", "Saída às", "Lado", "Pontos", "Resultado"]);
  });
});
