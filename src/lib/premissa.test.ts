import { describe, expect, it } from "vitest";
import { custosDaSoma, custosDoRobo, premissaDoRobo, temCusto } from "./premissa";

describe("premissa dos custos", () => {
  it("robô com custo cadastrado está com os custos descontados", () => {
    expect(temCusto(0.25)).toBe(true);
    expect(custosDoRobo(0.25)).toBe("já descontados os custos");
    expect(premissaDoRobo(0.25)).toBe("com 1 contrato por entrada, já descontados os custos");
  });

  it("robô sem custo (zero, nulo ou inválido) está antes dos custos", () => {
    for (const c of [0, null, undefined, Number.NaN, -1]) {
      expect(temCusto(c)).toBe(false);
      expect(custosDoRobo(c)).toBe("antes dos custos");
    }
    expect(premissaDoRobo(0)).toBe("com 1 contrato por entrada, antes dos custos");
  });

  it("numa soma, diz quem ficou sem custo", () => {
    const a = { nome: "A", custoPorContrato: 0.25 };
    const b = { nome: "B", custoPorContrato: 0 };
    const c = { nome: "C", custoPorContrato: null };
    expect(custosDaSoma([a])).toBe("já descontados os custos");
    expect(custosDaSoma([b, c])).toBe("antes dos custos");
    expect(custosDaSoma([a, b])).toBe("já descontados os custos, menos no B, que não tem custo no histórico");
    expect(custosDaSoma([a, b, c])).toBe("já descontados os custos, menos no B e C, que não têm custo no histórico");
    expect(custosDaSoma([])).toBe("antes dos custos");
  });
});
