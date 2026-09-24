import { describe, expect, it } from "vitest";
import {
  AVISO_SEM_COMPARTILHAR,
  dicaDoFormato,
  ehCancelamentoDoCompartilhar,
  mensagemDoErroDaPrevia,
  podeCompartilharArquivos,
  proporcaoDoFormato,
  rotuloAcessivelDoBotao,
  textoAlternativoDoCard,
  textosDoCompartilhamento,
  versaoDoDiaAoVivo,
} from "./regras-do-compartilhar";

// datas fixas (24/09/2026): nada de relógio nos testes
const T_1430 = Math.floor(Date.parse("2026-09-24T17:30:00Z") / 1000);
const T_1432 = Math.floor(Date.parse("2026-09-24T17:32:05Z") / 1000);
/** o dia do robô vai até as 18:00 (o mais tarde entre o horário dele e o pregão do ativo) */
const CORTE = { dia: "2026-09-24", fim: "18:00" };
const epoch = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("versaoDoDiaAoVivo", () => {
  it("sem operação e sem balde: só o nº de operações", () => {
    expect(versaoDoDiaAoVivo([], [], CORTE)).toBe("0");
  });

  it("com operação e sem série: o minuto da última saída", () => {
    const ops = [{ fechamento_em: "2026-09-24T12:00:00Z" }, { fechamento_em: "2026-09-24T17:30:00Z" }];
    expect(versaoDoDiaAoVivo(ops, [], CORTE)).toBe(`2-${Math.floor(T_1430 / 60)}`);
  });

  it("o balde mais recente que a última saída manda", () => {
    const ops = [{ fechamento_em: "2026-09-24T17:30:00Z" }];
    expect(versaoDoDiaAoVivo(ops, [[T_1432, 0, 0, 0]], CORTE)).toBe(`1-${Math.floor(T_1432 / 60)}`);
  });

  it("a saída mais recente que o último balde manda, mesmo fora de ordem na lista", () => {
    const ops = [{ fechamento_em: "2026-09-24T17:32:05Z" }, { fechamento_em: "2026-09-24T12:00:00Z" }];
    expect(versaoDoDiaAoVivo(ops, [[T_1430, 0, 0, 0]], CORTE)).toBe(`2-${Math.floor(T_1432 / 60)}`);
  });

  it("fechamento ilegível não quebra a conta", () => {
    expect(versaoDoDiaAoVivo([{ fechamento_em: "xyz" }], [], CORTE)).toBe("1");
  });

  it("muda no máximo uma vez por minuto", () => {
    const ops = [{ fechamento_em: "2026-09-24T17:30:00Z" }];
    expect(versaoDoDiaAoVivo(ops, [[T_1430 + 5, 0, 0, 0]], CORTE)).toBe(versaoDoDiaAoVivo(ops, [[T_1430 + 55, 0, 0, 0]], CORTE));
  });

  it("depois do pregão o balde não muda a versão: o coletor manda até a meia-noite, a imagem para em 18:10", () => {
    // zeragem às 18:00 BRT (21:00Z); baldes às 21:00 e às 23:59 BRT dão a mesma versão, a das 18:10
    const ops = [{ fechamento_em: "2026-09-24T12:00:00Z" }, { fechamento_em: "2026-09-24T21:00:00Z" }];
    const esperada = `2-${Math.floor(epoch("2026-09-24T21:10:00Z") / 60)}`;
    expect(versaoDoDiaAoVivo(ops, [[epoch("2026-09-25T00:00:00Z"), 0, 0, 0]], CORTE)).toBe(esperada);
    expect(versaoDoDiaAoVivo(ops, [[epoch("2026-09-25T02:59:50Z"), 0, 0, 0]], CORTE)).toBe(esperada);
    // até lá, o balde ainda conta (a imagem parcial vai até o fim do dia do robô mais a folga)
    expect(versaoDoDiaAoVivo(ops, [[epoch("2026-09-24T21:05:30Z"), 0, 0, 0]], CORTE)).toBe(`2-${Math.floor(epoch("2026-09-24T21:05:30Z") / 60)}`);
  });

  it("saída depois do fim do dia estica o teto junto, como o corte da imagem", () => {
    const ops = [{ fechamento_em: "2026-09-24T21:20:00Z" }];
    const balde = epoch("2026-09-24T21:25:00Z");
    expect(versaoDoDiaAoVivo(ops, [[balde, 0, 0, 0]], CORTE)).toBe(`1-${Math.floor(balde / 60)}`);
  });
});

describe("textos do diálogo", () => {
  it("dica do formato", () => {
    expect(dicaDoFormato("quadrado")).toBe("1080 × 1080, para o feed e o WhatsApp");
    expect(dicaDoFormato("story")).toBe("1080 × 1920, para stories e status");
  });

  it("proporção da caixa da prévia", () => {
    expect(proporcaoDoFormato("quadrado")).toBe(1);
    expect(proporcaoDoFormato("story")).toBeCloseTo(0.5625, 6);
  });

  it("aria-label do botão com o nome e a data por extenso", () => {
    expect(rotuloAcessivelDoBotao("Apollo", "2026-09-23")).toBe("Compartilhar o dia do Apollo, 23 de setembro de 2026");
  });

  it("alt da prévia diz o formato", () => {
    expect(textoAlternativoDoCard("Apollo", "2026-09-23", "story")).toContain("formato story (vertical)");
    expect(textoAlternativoDoCard("Apollo", "2026-09-23", "quadrado")).toContain("formato quadrado");
    expect(textoAlternativoDoCard("Apollo", "2026-09-23", "quadrado")).toContain("23 de setembro de 2026");
  });

  it("título e texto do compartilhamento levam o link e o 'por 1 contrato, líquido de custos'", () => {
    const t = textosDoCompartilhamento("Apollo", "2026-09-23", "https://www.quantsrobos.com/robos/apollo");
    expect(t.title).toBe("Apollo · 23 de setembro de 2026");
    expect(t.text).toBe(
      "O dia do Apollo em 23 de setembro de 2026, por 1 contrato, líquido de custos. https://www.quantsrobos.com/robos/apollo",
    );
  });

  it("robô em conta demo: a legenda diz 'Conta demo.' antes do link", () => {
    const t = textosDoCompartilhamento("Orion", "2026-09-23", "https://www.quantsrobos.com/robos/orion", true);
    expect(t.text).toBe(
      "O dia do Orion em 23 de setembro de 2026, por 1 contrato, líquido de custos. Conta demo. https://www.quantsrobos.com/robos/orion",
    );
    expect(textosDoCompartilhamento("Orion", "2026-09-23", "x", false).text).not.toContain("demo");
  });

  it("erro da prévia: 404 é dia sem operação, o resto é falha", () => {
    expect(mensagemDoErroDaPrevia(404)).toBe("Este dia ainda não tem operação fechada.");
    expect(mensagemDoErroDaPrevia(503)).toBe("A imagem não carregou.");
    expect(mensagemDoErroDaPrevia(null)).toBe("A imagem não carregou.");
  });

  it("o aviso de falha manda baixar", () => {
    expect(AVISO_SEM_COMPARTILHAR).toContain("Baixar imagem");
  });
});

describe("ehCancelamentoDoCompartilhar", () => {
  it("AbortError é cancelamento", () => {
    expect(ehCancelamentoDoCompartilhar(new DOMException("cancelado", "AbortError"))).toBe(true);
    expect(ehCancelamentoDoCompartilhar({ name: "AbortError" })).toBe(true);
  });

  it("o resto é erro", () => {
    expect(ehCancelamentoDoCompartilhar(new DOMException("negado", "NotAllowedError"))).toBe(false);
    expect(ehCancelamentoDoCompartilhar(new Error("x"))).toBe(false);
    expect(ehCancelamentoDoCompartilhar(null)).toBe(false);
    expect(ehCancelamentoDoCompartilhar("AbortError")).toBe(false);
  });
});

describe("podeCompartilharArquivos", () => {
  const share = () => Promise.resolve();

  it("sem navigator, sem share ou sem canShare: não", () => {
    expect(podeCompartilharArquivos(undefined)).toBe(false);
    expect(podeCompartilharArquivos({ canShare: () => true })).toBe(false);
    expect(podeCompartilharArquivos({ share })).toBe(false);
  });

  it("canShare com o PNG de teste decide", () => {
    let recebido: ShareData | undefined;
    expect(
      podeCompartilharArquivos({
        share,
        canShare: (d) => {
          recebido = d;
          return true;
        },
      }),
    ).toBe(true);
    expect(recebido?.files?.[0]?.type).toBe("image/png");
    expect(podeCompartilharArquivos({ share, canShare: () => false })).toBe(false);
  });

  it("canShare que lança é não", () => {
    expect(
      podeCompartilharArquivos({
        share,
        canShare: () => {
          throw new TypeError("arquivos não suportados");
        },
      }),
    ).toBe(false);
  });
});
