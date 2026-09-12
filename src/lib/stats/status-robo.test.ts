import { describe, expect, it } from "vitest";
import { statusAoVivo, type EntradaStatus } from "./status-robo";

// sexta 11/09/2026, 10:00 em Brasília
const agora = new Date("2026-09-11T13:00:00Z");
const base: EntradaStatus = {
  status: "ativo",
  posicionado: false,
  ultimoHeartbeatEm: "2026-09-11T12:59:50Z",
  horarioInicio: "09:05:00",
  horarioFim: "17:30:00",
  pregaoAberto: true,
  agora,
};

describe("statusAoVivo", () => {
  it("cadastro manda: em breve, pausado, arquivado", () => {
    expect(statusAoVivo({ ...base, status: "em_breve" })).toBe("em_breve");
    expect(statusAoVivo({ ...base, status: "pausado", posicionado: true })).toBe("pausado");
    expect(statusAoVivo({ ...base, status: "arquivado" })).toBe("arquivado");
  });

  it("pregão fechado = fora do horário, mesmo sem heartbeat", () => {
    expect(statusAoVivo({ ...base, pregaoAberto: false, ultimoHeartbeatEm: null })).toBe(
      "fora_do_horario",
    );
  });

  it("coletor parado em pregão = desconhecido", () => {
    expect(statusAoVivo({ ...base, ultimoHeartbeatEm: "2026-09-11T12:50:00Z" })).toBe(
      "desconhecido",
    );
    expect(statusAoVivo({ ...base, ultimoHeartbeatEm: null })).toBe("desconhecido");
  });

  it("posicionado vence operando", () => {
    expect(statusAoVivo({ ...base, posicionado: true })).toBe("posicionado");
  });

  it("fora da janela do robô", () => {
    expect(statusAoVivo({ ...base, horarioInicio: "10:30:00", horarioFim: "12:00:00" })).toBe(
      "fora_do_horario",
    );
  });

  it("operando no caso normal e sem janela definida", () => {
    expect(statusAoVivo(base)).toBe("operando");
    expect(statusAoVivo({ ...base, horarioInicio: null, horarioFim: null })).toBe("operando");
  });
});
