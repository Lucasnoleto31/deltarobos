import { describe, expect, it } from "vitest";
import { lerEndereco, textoDoNaoEncontrado, type RoboDoEndereco } from "./nao-encontrado";

// nomes de exemplo: no site, a lista vem do banco
const ROBOS: RoboDoEndereco[] = [
  { slug: "robo-ao-vivo", nome: "Robô A", temColetor: true },
  { slug: "robo-historico", nome: "Robô B", temColetor: false },
];

describe("lerEndereco", () => {
  it("separa o robô e a aba", () => {
    expect(lerEndereco("/robos/robo-a/hoje")).toEqual({ slug: "robo-a", aba: "hoje" });
    expect(lerEndereco("/robos/robo-a/hoje/")).toEqual({ slug: "robo-a", aba: "hoje" });
    expect(lerEndereco("/robos/robo-a")).toEqual({ slug: "robo-a", aba: null });
  });
  it("fora de /robos, ou com o endereço quebrado, não é de robô nenhum", () => {
    expect(lerEndereco("/simulador")).toBeNull();
    expect(lerEndereco(null)).toBeNull();
    expect(lerEndereco("/robos/%E0%A4%A/hoje")).toBeNull();
  });
});

describe("textoDoNaoEncontrado", () => {
  // revisão de 25/11/2026: a aba Ao vivo de um robô que existe dizia "Nenhum robô cadastrado tem este endereço"
  it("aba Ao vivo de robô sem acompanhamento ao vivo: diz isso e leva ao Resumo dele, sem dizer que ele não existe", () => {
    const t = textoDoNaoEncontrado("/robos/robo-historico/hoje", ROBOS);
    expect(t.titulo).toBe("Robô B não tem acompanhamento ao vivo");
    expect(t.descricao).toBe("Por isso este robô não tem a aba Ao vivo. O resultado e o histórico dele estão no Resumo.");
    expect(t.resumo).toBe("/robos/robo-historico");
    expect(`${t.titulo} ${t.descricao}`).not.toMatch(/não encontrado|nenhum robô/i);
  });

  it("robô que não existe, em qualquer aba: robô não encontrado, sem link para Resumo", () => {
    for (const caminho of ["/robos/nao-existe", "/robos/nao-existe/hoje", "/qualquer"]) {
      expect(textoDoNaoEncontrado(caminho, ROBOS)).toEqual({
        titulo: "Robô não encontrado",
        descricao: "Nenhum robô cadastrado tem este endereço.",
        resumo: null,
      });
    }
  });

  it("robô que existe, em outro endereço: página não encontrada, com o link para o Resumo", () => {
    // com coletor a aba Ao vivo existe; se ela der 404 por outro motivo, o texto não fala em acompanhamento
    expect(textoDoNaoEncontrado("/robos/robo-ao-vivo/hoje", ROBOS)).toEqual({
      titulo: "Página não encontrada",
      descricao: "Robô A não tem uma aba neste endereço.",
      resumo: "/robos/robo-ao-vivo",
    });
    expect(textoDoNaoEncontrado("/robos/robo-historico", ROBOS).titulo).toBe("Página não encontrada");
  });

  it("sem a lista de robôs (leitura que falhou), nada se afirma sobre o robô além de não achá-lo", () => {
    expect(textoDoNaoEncontrado("/robos/robo-historico/hoje", []).titulo).toBe("Robô não encontrado");
  });
});
