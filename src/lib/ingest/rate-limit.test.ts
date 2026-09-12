import { beforeEach, describe, expect, it } from "vitest";
import { LIMITES_POR_MINUTO, permitir, permitirEndpoint, zerarLimites } from "./rate-limit";

describe("rate limit", () => {
  beforeEach(() => zerarLimites());

  it("permite até o limite e bloqueia depois", () => {
    const t0 = 1_000_000;
    expect(permitir("x", 3, t0).ok).toBe(true);
    expect(permitir("x", 3, t0 + 1).ok).toBe(true);
    expect(permitir("x", 3, t0 + 2)).toMatchObject({ ok: true, restante: 0 });
    expect(permitir("x", 3, t0 + 3)).toMatchObject({ ok: false, restante: 0 });
  });

  it("reinicia depois da janela de 1 min", () => {
    const t0 = 1_000_000;
    permitir("y", 1, t0);
    expect(permitir("y", 1, t0 + 1).ok).toBe(false);
    expect(permitir("y", 1, t0 + 60_000).ok).toBe(true);
  });

  it("chaves independentes por conta e endpoint", () => {
    const t0 = 1_000_000;
    const limite = LIMITES_POR_MINUTO.history;
    for (let i = 0; i < limite; i++) permitirEndpoint("conta-a", "history", t0 + i);
    expect(permitirEndpoint("conta-a", "history", t0 + limite + 1).ok).toBe(false);
    expect(permitirEndpoint("conta-b", "history", t0 + limite + 1).ok).toBe(true);
    expect(permitirEndpoint("conta-a", "heartbeat", t0 + limite + 1).ok).toBe(true);
  });
});
