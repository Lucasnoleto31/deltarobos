import { describe, expect, it } from "vitest";
import { MAX_CONTRATOS } from "@/lib/stats/simulador";
import {
  CAPITAL_MAXIMO,
  inteiroDe,
  lerCapital,
  lerUrlSimulador,
  linkSimulador,
  normalizarContratos,
  urlSimulador,
  type EstadoSimulador,
} from "./simulador-url";

const SLUGS = ["apollo", "orion", "alaska"] as const;

const ler = (qs: string) => lerUrlSimulador(new URLSearchParams(qs), SLUGS);

describe("lerUrlSimulador", () => {
  it("lê o formato canônico", () => {
    expect(ler("capital=30000&r=apollo:2,orion:1&periodo=12m")).toEqual({
      capital: 30000,
      contratos: { apollo: 2, orion: 1, alaska: 0 },
      periodo: "12m",
    });
  });

  it("sem nada: capital null, todos os robôs com 1, período tudo", () => {
    expect(ler("")).toEqual({ capital: null, contratos: { apollo: 1, orion: 1, alaska: 1 }, periodo: "tudo" });
  });

  it("r ausente = todos com 1; r= vazio = nenhum", () => {
    expect(ler("capital=5000").contratos).toEqual({ apollo: 1, orion: 1, alaska: 1 });
    expect(ler("r=").contratos).toEqual({ apollo: 0, orion: 0, alaska: 0 });
    expect(ler("r=,,").contratos).toEqual({ apollo: 0, orion: 0, alaska: 0 });
  });

  it("r presente = exatamente o listado: não listado é 0, slug sem :n é 1", () => {
    expect(ler("r=orion").contratos).toEqual({ apollo: 0, orion: 1, alaska: 0 });
    expect(ler("r=orion,apollo:3").contratos).toEqual({ apollo: 3, orion: 1, alaska: 0 });
  });

  it("slug desconhecido é ignorado; repetido vale o último", () => {
    expect(ler("r=zeus:4,apollo:2").contratos).toEqual({ apollo: 2, orion: 0, alaska: 0 });
    expect(ler("r=apollo:2,apollo:5").contratos).toEqual({ apollo: 5, orion: 0, alaska: 0 });
    expect(ler("r=apollo:2,apollo:0").contratos).toEqual({ apollo: 0, orion: 0, alaska: 0 });
  });

  it("contratos: só dígitos, clampado a 0..MAX_CONTRATOS; qualquer outra grafia vira 1", () => {
    expect(ler(`r=apollo:${MAX_CONTRATOS * 5}`).contratos.apollo).toBe(MAX_CONTRATOS);
    expect(ler("r=apollo:0").contratos.apollo).toBe(0);
    expect(ler("r=apollo:007").contratos.apollo).toBe(7);
    expect(ler("r=apollo:abc").contratos.apollo).toBe(1);
    expect(ler("r=apollo:").contratos.apollo).toBe(1);
    expect(ler("r=apollo:Infinity").contratos.apollo).toBe(1);
    // Number() leria estas como -3, 3, 16, 100 e 2: nenhuma é um inteiro escrito, então valem o padrão
    expect(ler("r=apollo:-3").contratos.apollo).toBe(1);
    expect(ler("r=apollo:2.6").contratos.apollo).toBe(1);
    expect(ler("r=apollo:0x10").contratos.apollo).toBe(1);
    expect(ler("r=apollo:1e2").contratos.apollo).toBe(1);
    // "+" literal (%2B) não é dígito; "+" solto na query é espaço para o URLSearchParams e some no trim
    expect(ler("r=apollo:%2B2").contratos.apollo).toBe(1);
    expect(ler("r=apollo:+2").contratos.apollo).toBe(2);
  });

  it("capital: inteiro só com dígitos, > 0 e <= 1e9; o resto é null", () => {
    expect(ler("capital=30000").capital).toBe(30000);
    expect(ler("capital=1000000000").capital).toBe(CAPITAL_MAXIMO);
    expect(ler("capital=1000000001").capital).toBeNull();
    expect(ler("capital=0").capital).toBeNull();
    expect(ler("capital=abc").capital).toBeNull();
    expect(ler("capital=").capital).toBeNull();
    expect(ler("capital=Infinity").capital).toBeNull();
    expect(ler("capital=NaN").capital).toBeNull();
    // grafias que Number() aceitaria e enganariam: "30.000" seria R$ 30, "0x7530" seria R$ 30.000
    expect(ler("capital=30.000").capital).toBeNull();
    expect(ler("capital=30000.4").capital).toBeNull();
    expect(ler("capital=0x7530").capital).toBeNull();
    expect(ler("capital=0b111").capital).toBeNull();
    expect(ler("capital=1e9").capital).toBeNull();
    expect(ler("capital=-5000").capital).toBeNull();
    // "+" literal (%2B) não é dígito; "+" solto na query é espaço para o URLSearchParams e some no trim
    expect(ler("capital=%2B30000").capital).toBeNull();
    expect(ler("capital=+30000").capital).toBe(30000);
  });

  it("período inválido ou fora do conjunto do simulador vira tudo", () => {
    expect(ler("periodo=3m").periodo).toBe("3m");
    expect(ler("periodo=ano").periodo).toBe("ano");
    expect(ler("periodo=7d").periodo).toBe("tudo");
    expect(ler("periodo=personalizado").periodo).toBe("tudo");
    expect(ler("periodo=xyz").periodo).toBe("tudo");
    expect(ler("periodo=").periodo).toBe("tudo");
  });

  it("aceita a forma percent-encoded e espaços à volta", () => {
    expect(ler("r=apollo%3A2%2Corion%3A1").contratos).toEqual({ apollo: 2, orion: 1, alaska: 0 });
    expect(ler("r=apollo%3A2%2Corion").contratos).toEqual({ apollo: 2, orion: 1, alaska: 0 });
    expect(ler("r=%20apollo%20:%202%20,%20orion").contratos).toEqual({ apollo: 2, orion: 1, alaska: 0 });
    expect(ler("capital=%2030000%20").capital).toBe(30000);
  });

  it("tolera lixo: chaves repetidas, parâmetros estranhos e valores sem sentido", () => {
    const e = ler("capital=abc&capital=xyz&r=::,:3,apollo::2,orion:1:2&periodo=3m&periodo=tudo&foo=bar");
    expect(e.capital).toBeNull();
    // "apollo::2" → n = ":2" inválido → 1; "orion:1:2" → n = "1:2" inválido → 1
    expect(e.contratos).toEqual({ apollo: 1, orion: 1, alaska: 0 });
    expect(e.periodo).toBe("3m");
  });

  it("sem robôs válidos nada quebra", () => {
    expect(lerUrlSimulador(new URLSearchParams("r=apollo:2"), [])).toEqual({ capital: null, contratos: {}, periodo: "tudo" });
  });
});

describe("urlSimulador", () => {
  const padrao: EstadoSimulador = { capital: null, contratos: { apollo: 1, orion: 1, alaska: 1 }, periodo: "tudo" };

  it("tudo padrão = /simulador", () => {
    expect(urlSimulador(padrao, SLUGS)).toBe("/simulador");
  });

  it("escreve só o que difere do padrão, na ordem capital, r, periodo, com : e , literais", () => {
    expect(urlSimulador({ capital: 30000, contratos: { apollo: 2, orion: 1, alaska: 0 }, periodo: "12m" }, SLUGS)).toBe(
      "/simulador?capital=30000&r=apollo:2,orion:1&periodo=12m",
    );
    expect(urlSimulador({ ...padrao, capital: 30000 }, SLUGS)).toBe("/simulador?capital=30000");
    expect(urlSimulador({ ...padrao, periodo: "ano" }, SLUGS)).toBe("/simulador?periodo=ano");
  });

  it("r sai quando algum robô difere de 1, com :n sempre (inclusive :1), só os > 0, na ordem dos slugs", () => {
    expect(urlSimulador({ ...padrao, contratos: { apollo: 1, orion: 0, alaska: 1 } }, SLUGS)).toBe("/simulador?r=apollo:1,alaska:1");
    expect(urlSimulador({ ...padrao, contratos: { alaska: 2, apollo: 1, orion: 1 } }, SLUGS)).toBe("/simulador?r=apollo:1,orion:1,alaska:2");
  });

  it("nenhum robô > 0 = r= vazio", () => {
    expect(urlSimulador({ ...padrao, contratos: { apollo: 0, orion: 0, alaska: 0 } }, SLUGS)).toBe("/simulador?r=");
    expect(urlSimulador({ ...padrao, contratos: {} }, SLUGS)).toBe("/simulador?r=");
  });

  it("capital inválido no estado é omitido; contratos são clampados e slugs desconhecidos ignorados", () => {
    expect(urlSimulador({ ...padrao, capital: 0 }, SLUGS)).toBe("/simulador");
    expect(urlSimulador({ ...padrao, capital: -10 }, SLUGS)).toBe("/simulador");
    expect(urlSimulador({ ...padrao, capital: 12345.6 }, SLUGS)).toBe("/simulador?capital=12346");
    expect(urlSimulador({ ...padrao, contratos: { apollo: 1, orion: 1, alaska: 1, zeus: 9 } }, SLUGS)).toBe("/simulador");
    expect(urlSimulador({ ...padrao, contratos: { apollo: MAX_CONTRATOS + 1, orion: 1, alaska: 1 } }, SLUGS)).toBe(
      `/simulador?r=apollo:${MAX_CONTRATOS},orion:1,alaska:1`,
    );
  });

  it("ida e volta: ler(url(e)) == e e url(ler(qs)) == qs", () => {
    const estados: EstadoSimulador[] = [
      padrao,
      { capital: 30000, contratos: { apollo: 2, orion: 1, alaska: 0 }, periodo: "12m" },
      { capital: 1000, contratos: { apollo: 0, orion: 0, alaska: 0 }, periodo: "3m" },
      { capital: null, contratos: { apollo: 0, orion: 1, alaska: 0 }, periodo: "tudo" },
      { capital: CAPITAL_MAXIMO, contratos: { apollo: 1, orion: 1, alaska: 1 }, periodo: "ano" },
    ];
    for (const e of estados) {
      const url = urlSimulador(e, SLUGS);
      const qs = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
      expect(lerUrlSimulador(new URLSearchParams(qs), SLUGS)).toEqual(e);
    }
    for (const qs of ["capital=30000&r=apollo:2,orion:1&periodo=12m", "r=", "periodo=3m", "capital=500&r=orion:1"]) {
      expect(urlSimulador(lerUrlSimulador(new URLSearchParams(qs), SLUGS), SLUGS)).toBe(`/simulador?${qs}`);
    }
  });

  it("a URL escrita é lida igual por URLSearchParams (: e , não precisam de encoding)", () => {
    const url = urlSimulador({ capital: 30000, contratos: { apollo: 2, orion: 1, alaska: 0 }, periodo: "12m" }, SLUGS);
    const sp = new URL(`https://exemplo.com.br${url}`).searchParams;
    expect(sp.get("r")).toBe("apollo:2,orion:1");
    expect(sp.get("capital")).toBe("30000");
    expect(sp.get("periodo")).toBe("12m");
  });

  it("slug fora de [a-z0-9-] vai percent-encoded e volta igual", () => {
    const slugs = ["robô x", "apollo"];
    const url = urlSimulador({ capital: null, contratos: { "robô x": 2, apollo: 0 }, periodo: "tudo" }, slugs);
    expect(url).toBe("/simulador?r=rob%C3%B4%20x:2");
    expect(lerUrlSimulador(new URL(`https://exemplo.com.br${url}`).searchParams, slugs).contratos).toEqual({ "robô x": 2, apollo: 0 });
  });
});

describe("linkSimulador", () => {
  it("um robô só, com 1 contrato e sem capital", () => {
    expect(linkSimulador("apollo")).toBe("/simulador?r=apollo:1");
    expect(linkSimulador("Orion-2")).toBe("/simulador?r=Orion-2:1");
    expect(linkSimulador("robô x")).toBe("/simulador?r=rob%C3%B4%20x:1");
  });

  it("o link lido pelo parser marca só aquele robô", () => {
    const url = linkSimulador("orion");
    expect(lerUrlSimulador(new URL(`https://exemplo.com.br${url}`).searchParams, SLUGS)).toEqual({
      capital: null,
      contratos: { apollo: 0, orion: 1, alaska: 0 },
      periodo: "tudo",
    });
  });
});

describe("inteiroDe e normalizarContratos: a regra dos campos do painel é a da URL", () => {
  it("inteiroDe aceita só dígitos, com espaços à volta", () => {
    expect(inteiroDe("30000")).toBe(30000);
    expect(inteiroDe(" 02 ")).toBe(2);
    expect(inteiroDe("0")).toBe(0);
    for (const t of ["", "  ", "30.000", "30000.5", "1e5", "0x10", "+2", "-3", "abc", "Infinity"]) {
      expect(inteiroDe(t)).toBeNull();
    }
  });

  it("normalizarContratos clampa a 0..MAX_CONTRATOS e arredonda; inválido é 0", () => {
    expect(normalizarContratos(2)).toBe(2);
    expect(normalizarContratos(2.6)).toBe(3);
    expect(normalizarContratos(-1)).toBe(0);
    expect(normalizarContratos(MAX_CONTRATOS + 1)).toBe(MAX_CONTRATOS);
    expect(normalizarContratos(undefined)).toBe(0);
    expect(normalizarContratos(Number.NaN)).toBe(0);
  });
});

describe("lerCapital", () => {
  it("texto só com dígitos ou número já lido; null, undefined, vazio, zero, negativo e acima do teto viram null", () => {
    expect(lerCapital(30000)).toBe(30000);
    expect(lerCapital("30000")).toBe(30000);
    expect(lerCapital(" 30000 ")).toBe(30000);
    expect(lerCapital(29999.5)).toBe(30000);
    expect(lerCapital("30.000")).toBeNull();
    expect(lerCapital("30000.5")).toBeNull();
    expect(lerCapital(null)).toBeNull();
    expect(lerCapital(undefined)).toBeNull();
    expect(lerCapital("   ")).toBeNull();
    expect(lerCapital(0)).toBeNull();
    expect(lerCapital("0")).toBeNull();
    expect(lerCapital(-1)).toBeNull();
    expect(lerCapital(CAPITAL_MAXIMO + 1)).toBeNull();
    expect(lerCapital(Number.NaN)).toBeNull();
  });
});
