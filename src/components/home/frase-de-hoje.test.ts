import { describe, expect, it } from "vitest";
import { fraseDeHoje, type RoboAgora } from "./frase-de-hoje";

const robo = (r: Partial<RoboAgora>): RoboAgora => ({ statusAoVivo: "operando", operouHoje: false, hoje: 0, ...r });
const texto = (r: Partial<RoboAgora>) => {
  const f = fraseDeHoje(robo(r));
  return `${f.antes}${f.valor ?? ""}${f.depois}`;
};

describe("fraseDeHoje", () => {
  it("no horário e sem operação: não promete que o robô está ligado", () => {
    expect(texto({ statusAoVivo: "operando" })).toBe("hoje ainda sem operação");
  });

  it("com operação fechada hoje: o valor e a contagem, no singular e no plural", () => {
    expect(texto({ operouHoje: true, hoje: 240, hojeOperacoes: 3 })).toBe("hoje 240 em 3 operações");
    expect(texto({ operouHoje: true, hoje: -80, hojeOperacoes: 1 })).toBe("hoje -80 em 1 operação");
  });

  it("com posição aberta: em operação agora, com o resultado do dia se já houver", () => {
    expect(fraseDeHoje(robo({ statusAoVivo: "posicionado" }))).toEqual({ antes: "em operação agora", valor: null, depois: "", tom: "info" });
    expect(fraseDeHoje(robo({ statusAoVivo: "posicionado", operouHoje: true, hoje: 50 })).valor).toBe(50);
  });

  it("robô sem coleta: diz até quando há dado", () => {
    expect(texto({ statusAoVivo: "historico", dadosAte: "2026-11-24" })).toBe("sem acompanhamento ao vivo · dados até 24/11");
    expect(texto({ statusAoVivo: "historico" })).toBe("sem acompanhamento ao vivo");
  });

  it("pregão fechado: sem operação hoje, ou o resultado do dia", () => {
    expect(texto({ statusAoVivo: "fora_do_horario" })).toBe("sem operação hoje");
    expect(texto({ statusAoVivo: "fora_do_horario", operouHoje: true, hoje: 10, hojeOperacoes: 2 })).toBe("hoje 10 em 2 operações");
  });

  it("coletor parado e robô pausado são alerta", () => {
    expect(fraseDeHoje(robo({ statusAoVivo: "desconhecido" })).tom).toBe("alerta");
    expect(fraseDeHoje(robo({ statusAoVivo: "pausado" })).tom).toBe("alerta");
  });
});
