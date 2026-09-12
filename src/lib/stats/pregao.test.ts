import { describe, expect, it } from "vitest";
import { coletaParada, dentroDoHorario, ehDiaPregao, pregaoAberto, segundosDesde } from "./pregao";

const feriados = ["2026-09-07", "2026-11-20"];
const horario = { inicio: "09:00:00", fim: "18:00:00" };

describe("ehDiaPregao", () => {
  it("fim de semana não conta", () => {
    expect(ehDiaPregao("2026-09-12", feriados)).toBe(false); // sábado
    expect(ehDiaPregao("2026-09-13", feriados)).toBe(false); // domingo
  });
  it("feriado não conta", () => {
    expect(ehDiaPregao("2026-09-07", feriados)).toBe(false);
  });
  it("dia útil conta", () => {
    expect(ehDiaPregao("2026-09-11", feriados)).toBe(true);
  });
});

describe("dentroDoHorario", () => {
  it("intervalo fechado no início e aberto no fim", () => {
    expect(dentroDoHorario("09:00", "09:00", "18:00")).toBe(true);
    expect(dentroDoHorario("17:59", "09:00", "18:00")).toBe(true);
    expect(dentroDoHorario("18:00", "09:00", "18:00")).toBe(false);
    expect(dentroDoHorario("08:59", "09:00:00", "18:00:00")).toBe(false);
  });
});

describe("pregaoAberto", () => {
  it("sexta 10:00 em Brasília está aberto", () => {
    expect(pregaoAberto(new Date("2026-09-11T13:00:00Z"), horario, feriados)).toBe(true);
  });
  it("sexta 18:30 em Brasília está fechado", () => {
    expect(pregaoAberto(new Date("2026-09-11T21:30:00Z"), horario, feriados)).toBe(false);
  });
  it("feriado fechado mesmo no horário", () => {
    expect(pregaoAberto(new Date("2026-09-07T13:00:00Z"), horario, feriados)).toBe(false);
  });
});

describe("segundosDesde / coletaParada", () => {
  const agora = new Date("2026-09-11T13:10:00Z");

  it("conta segundos e nunca é negativo", () => {
    expect(segundosDesde("2026-09-11T13:09:30Z", agora)).toBe(30);
    expect(segundosDesde("2026-09-11T13:11:00Z", agora)).toBe(0);
    expect(segundosDesde(null, agora)).toBeNull();
    expect(segundosDesde("lixo", agora)).toBeNull();
  });

  it("parado só em pregão e acima de 2 min", () => {
    expect(coletaParada("2026-09-11T13:09:00Z", agora, true)).toBe(false); // 60 s
    expect(coletaParada("2026-09-11T13:07:00Z", agora, true)).toBe(true); // 180 s
    expect(coletaParada(null, agora, true)).toBe(true);
    expect(coletaParada("2026-09-11T10:00:00Z", agora, false)).toBe(false); // pregão fechado
  });
});
