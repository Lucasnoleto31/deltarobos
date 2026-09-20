import { describe, expect, it } from "vitest";
import { comMarcaAtual, subtituloHero } from "./marca";

// Como os textos estão hoje na tabela `parametros`, chave `textos` (lidos do banco em 20/09/2026):
// o subtítulo inteiro, letra por letra, porque é dele que a regra do hero depende; do aviso legal,
// só os dois trechos que citam a marca e a corretora. É o que as funções precisam acertar até o
// Lucas rodar scripts/textos-quants.sql.
const SUBTITULO_NO_BANCO =
  "Cada operação chega direto do MetaTrader 5 das contas da Delta Robôs, normalizada por contrato. Sem print, sem edição.";

const DISCLAIMER_NO_BANCO =
  "Os resultados apresentados neste site são de contas operadas pela Delta Robôs, coletados automaticamente do MetaTrader 5 e exibidos por 1 contrato, líquidos dos custos indicados em cada robô. A Delta Robôs atua por meio de escritório de assessoria de investimentos vinculado ao BTG Pactual; o assessor de investimentos não realiza gestão de recursos nem garante resultados.";

const SUBTITULO_APROVADO =
  "Acompanhe as operações diretamente das contas, com dados atualizados enquanto o mercado acontece.";

describe("comMarcaAtual", () => {
  it("troca a marca antiga pela atual", () => {
    expect(comMarcaAtual(SUBTITULO_NO_BANCO)).toContain("contas da Quants Robôs");
    expect(comMarcaAtual("Ecossistema Delta")).toBe("Ecossistema Quants");
    expect(comMarcaAtual("a carteira da Delta Flow")).toBe("a carteira da Quants");
  });

  it("tira a corretora do aviso legal sem quebrar a concordância", () => {
    const saida = comMarcaAtual(DISCLAIMER_NO_BANCO);
    expect(saida).toContain("vinculado a uma corretora parceira");
    expect(saida).not.toMatch(/delta|btg/i);
  });

  it("não mexe em palavra que só começa com a marca antiga", () => {
    expect(comMarcaAtual("o delta do dia e o Deltamax")).toBe("o delta do dia e o Deltamax");
  });
});

describe("subtituloHero", () => {
  it("põe a cópia aprovada no lugar do subtítulo antigo do banco", () => {
    expect(subtituloHero(SUBTITULO_NO_BANCO)).toBe(SUBTITULO_APROVADO);
  });

  it("também casa se o banco já tiver só a marca corrigida", () => {
    expect(subtituloHero(comMarcaAtual(SUBTITULO_NO_BANCO))).toBe(SUBTITULO_APROVADO);
  });

  it("deixa passar o subtítulo já atualizado, sem mexer", () => {
    // é o que o banco vai devolver depois de scripts/textos-quants.sql: a regra não casa mais
    expect(subtituloHero(SUBTITULO_APROVADO)).toBe(SUBTITULO_APROVADO);
  });

  it("deixa passar qualquer outro texto que o Lucas escreva, só com a marca trocada", () => {
    expect(subtituloHero("Operações ao vivo, direto do MetaTrader 5.")).toBe(
      "Operações ao vivo, direto do MetaTrader 5.",
    );
    expect(subtituloHero("Robôs da Delta Robôs, ao vivo.")).toBe("Robôs da Quants Robôs, ao vivo.");
  });

  it("não casa com o texto antigo cortado nem alongado", () => {
    const quaseIgual = SUBTITULO_NO_BANCO.replace(" Sem print, sem edição.", "");
    expect(subtituloHero(quaseIgual)).toBe(comMarcaAtual(quaseIgual));
    expect(subtituloHero(`${SUBTITULO_NO_BANCO} `)).not.toBe(SUBTITULO_APROVADO);
  });
});
