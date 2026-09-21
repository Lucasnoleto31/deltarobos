import { describe, expect, it } from "vitest";
import {
  abertasAoVivo,
  abertasDaCasa,
  contarPosicionados,
  rotuloOperacoesEmAberto,
  somarAbertas,
  totalAbertas,
} from "./posicoes";

// sexta 11/09/2026, 10:00 em Brasília, pregão aberto
const agora = new Date("2026-09-11T13:00:00Z");
const sinalEmDia = "2026-09-11T12:59:50Z"; // 10 s atrás
const sinalVelho = "2026-09-11T12:50:00Z"; // 10 min atrás: coletor parado

describe("totalAbertas", () => {
  it("soma o n_abertas dos grupos", () => {
    expect(totalAbertas([{ n_abertas: 2 }, { n_abertas: 1 }])).toBe(3);
  });

  it("lista vazia é 0", () => {
    expect(totalAbertas([])).toBe(0);
  });

  it("grupo sem n_abertas (snapshot antigo) conta 0, sem quebrar", () => {
    expect(totalAbertas([{}, { n_abertas: null }, { n_abertas: undefined }, { n_abertas: 2 }])).toBe(2);
  });

  it("lixo não vira número: NaN, negativo e fração", () => {
    expect(totalAbertas([{ n_abertas: Number.NaN }, { n_abertas: -3 }, { n_abertas: 2.7 }])).toBe(2);
  });
});

describe("rotuloOperacoesEmAberto", () => {
  it("singular e plural em pt-BR", () => {
    expect(rotuloOperacoesEmAberto(1)).toBe("1 operação em aberto");
    expect(rotuloOperacoesEmAberto(3)).toBe("3 operações em aberto");
  });

  it("zero e inválido devolvem null: nada a mostrar", () => {
    expect(rotuloOperacoesEmAberto(0)).toBeNull();
    expect(rotuloOperacoesEmAberto(-1)).toBeNull();
    expect(rotuloOperacoesEmAberto(Number.NaN)).toBeNull();
  });

  it("número grande sai formatado em pt-BR", () => {
    expect(rotuloOperacoesEmAberto(1000)).toBe("1.000 operações em aberto");
  });
});

describe("contarPosicionados e somarAbertas", () => {
  const robos = [
    { posicionado: true, n_posicoes_abertas: 2 },
    { posicionado: false, n_posicoes_abertas: 0 },
    { posicionado: true }, // snapshot antigo: só o booleano
    { posicionado: false, n_posicoes_abertas: 1 }, // coleta mais fresca que o booleano
  ];

  it("posicionado é quem tem entrada aberta, pelo número ou, sem ele, pelo booleano", () => {
    expect(contarPosicionados(robos)).toBe(3);
    expect(contarPosicionados([])).toBe(0);
  });

  it("a soma tolera o campo ausente", () => {
    expect(somarAbertas(robos)).toBe(3);
    expect(somarAbertas([])).toBe(0);
  });
});

describe("abertasAoVivo", () => {
  it("fora do pregão não mostra, mesmo com sinal em dia", () => {
    expect(abertasAoVivo(3, sinalEmDia, agora, false)).toBe(0);
  });

  it("pregão aberto e coletor em dia: o número passa", () => {
    expect(abertasAoVivo(3, sinalEmDia, agora, true)).toBe(3);
  });

  it("coletor parado (sem sinal há mais de 2 min, ou nunca): some", () => {
    expect(abertasAoVivo(3, sinalVelho, agora, true)).toBe(0);
    expect(abertasAoVivo(3, null, agora, true)).toBe(0);
    expect(abertasAoVivo(3, undefined, agora, true)).toBe(0);
  });

  it("sem relógio (servidor e hidratação) não há ao vivo, como o selo Posicionado", () => {
    expect(abertasAoVivo(3, sinalEmDia, null, true)).toBe(0);
    expect(abertasAoVivo(3, sinalVelho, null, true)).toBe(0);
    expect(abertasAoVivo(3, sinalVelho, null, false)).toBe(0);
  });

  it("zero e inválido continuam 0", () => {
    expect(abertasAoVivo(0, sinalEmDia, agora, true)).toBe(0);
    expect(abertasAoVivo(Number.NaN, sinalEmDia, agora, true)).toBe(0);
  });
});

describe("abertasDaCasa", () => {
  const coleta = {
    apollo: { ultimo_heartbeat_em: sinalEmDia, n_posicoes_abertas: 2 },
    orion: { ultimo_heartbeat_em: sinalVelho, n_posicoes_abertas: 1 },
    alaska: { ultimo_heartbeat_em: null },
  };
  const robos = [
    { slug: "apollo", status: "ativo", n_posicoes_abertas: 1 },
    { slug: "orion", status: "ativo", n_posicoes_abertas: 1 },
    { slug: "alaska", status: "ativo", n_posicoes_abertas: 0 },
  ];

  it("o mapa de coleta manda no número (o hook funde o resumo nele); o coletor parado zera o robô", () => {
    const r = abertasDaCasa(coleta, robos, agora, true);
    expect(r.porRobo).toEqual({ apollo: 2, orion: 0, alaska: 0 });
    expect(r.total).toBe(2);
  });

  it("sem número na coleta vale o do resumo", () => {
    const r = abertasDaCasa({ apollo: { ultimo_heartbeat_em: sinalEmDia } }, robos, agora, true);
    expect(r.porRobo.apollo).toBe(1);
  });

  it("robô só no resumo não tem sinal conhecido: fica 0", () => {
    expect(abertasDaCasa({}, robos, agora, true).total).toBe(0);
  });

  it("sem relógio (servidor e hidratação) tudo zera, mesmo em pregão com sinal em dia", () => {
    expect(abertasDaCasa(coleta, robos, null, true).total).toBe(0);
    expect(abertasDaCasa({}, robos, null, true).total).toBe(0);
  });

  it("fora do pregão tudo zera", () => {
    expect(abertasDaCasa(coleta, robos, agora, false).total).toBe(0);
  });

  it("robô pausado, em breve ou arquivado no cadastro fica 0, como o selo dele", () => {
    for (const status of ["pausado", "em_breve", "arquivado"]) {
      const r = abertasDaCasa(coleta, [{ slug: "apollo", status, n_posicoes_abertas: 2 }], agora, true);
      expect(r.porRobo.apollo).toBe(0);
    }
  });

  it("robô fora do resumo (em breve ou arquivado, que o resumo não traz) fica 0 mesmo com a coleta em dia", () => {
    const soOutros = [{ slug: "orion", status: "ativo", n_posicoes_abertas: 1 }];
    const r = abertasDaCasa(coleta, soOutros, agora, true);
    expect(r.porRobo.apollo).toBe(0);
    expect(r.total).toBe(0); // orion tem o coletor parado
  });

  it("só sem resumo nenhum (RPC falhou) a coleta decide sozinha", () => {
    expect(abertasDaCasa(coleta, [], agora, true).porRobo.apollo).toBe(2);
  });
});
