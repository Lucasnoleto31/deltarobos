import { describe, expect, it } from "vitest";
import {
  agoraSP,
  diffDias,
  ehDia,
  filtrarPeriodo,
  hojeSP,
  inicioPeriodo,
  somarDias,
  somarMeses,
} from "./periodos";

describe("hojeSP / agoraSP", () => {
  it("02:30Z ainda é o dia anterior em Brasília", () => {
    const d = new Date("2026-09-12T02:30:00Z");
    expect(hojeSP(d)).toBe("2026-09-11");
    const a = agoraSP(d);
    expect(a.hhmm).toBe("23:30");
    expect(a.diaSemana).toBe(5); // sexta
  });

  it("meia-noite em Brasília vira 00:00 e não 24:00", () => {
    const a = agoraSP(new Date("2026-09-12T03:00:00Z"));
    expect(a.dia).toBe("2026-09-12");
    expect(a.hhmm).toBe("00:00");
    expect(a.diaSemana).toBe(6); // sábado
  });
});

describe("ehDia", () => {
  it("aceita só YYYY-MM-DD de um dia que existe", () => {
    expect(ehDia("2026-09-24")).toBe(true);
    expect(ehDia("2028-02-29")).toBe(true); // bissexto
    expect(ehDia("2026-02-30")).toBe(false);
    expect(ehDia("2026-04-31")).toBe(false);
    expect(ehDia("2026-02-29")).toBe(false);
    expect(ehDia("2026-13-01")).toBe(false);
    expect(ehDia("2026-9-1")).toBe(false);
    expect(ehDia(null)).toBe(false);
  });
});

describe("somarDias / somarMeses / diffDias", () => {
  it("atravessa mês e ano", () => {
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarMeses("2026-09-12", -3)).toBe("2026-06-12");
    expect(somarMeses("2026-01-15", -12)).toBe("2025-01-15");
    expect(diffDias("2026-09-01", "2026-09-04")).toBe(3);
  });
});

describe("inicioPeriodo / filtrarPeriodo", () => {
  const hoje = "2026-09-12";

  it("calcula o início de cada período", () => {
    expect(inicioPeriodo("7d", hoje)).toBe("2026-09-06");
    expect(inicioPeriodo("30d", hoje)).toBe("2026-08-14");
    expect(inicioPeriodo("3m", hoje)).toBe("2026-06-12");
    expect(inicioPeriodo("12m", hoje)).toBe("2025-09-12");
    expect(inicioPeriodo("ano", hoje)).toBe("2026-01-01");
    expect(inicioPeriodo("tudo", hoje)).toBeNull();
  });

  it("filtra inclusive e ignora datas futuras", () => {
    const linhas = [
      { dia: "2026-09-05" },
      { dia: "2026-09-06" },
      { dia: "2026-09-12" },
      { dia: "2026-09-13" },
    ];
    expect(filtrarPeriodo(linhas, "7d", hoje).map((l) => l.dia)).toEqual([
      "2026-09-06",
      "2026-09-12",
    ]);
    expect(filtrarPeriodo(linhas, "tudo", hoje)).toHaveLength(3);
  });
});
