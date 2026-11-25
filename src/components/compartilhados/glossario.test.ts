import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatarPct } from "@/lib/formato";
import { LIMITE_APERTADO } from "@/lib/stats/simulador";
import { GLOSSARIO, type ChaveIndicador } from "./glossario";

// as regras mecânicas do texto do "o que é" (19/09/2026); o tom (leigo, sem marketing) se confere lendo
const entradas = Object.entries(GLOSSARIO) as Array<[ChaveIndicador, (typeof GLOSSARIO)[ChaveIndicador]]>;

/** o código de src, fora do próprio glossário e dos testes: onde uma chave precisa aparecer para continuar aqui */
function codigoQueCitaOGlossario(): string {
  const raiz = join(process.cwd(), "src");
  const arquivos = readdirSync(raiz, { recursive: true, encoding: "utf-8" }).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !/compartilhados[\\/]glossario\.ts$/.test(f),
  );
  return arquivos.map((f) => readFileSync(join(raiz, f), "utf-8")).join("\n");
}

/** primeira palavra, sem acento de caixa e sem pontuação em volta */
function primeiraPalavra(s: string): string {
  return (s.trim().split(/\s+/)[0] ?? "").toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]/gu, "");
}

// 25/11/2026 (ficha Mesa, DESIGN.md seção 7): o jargão que saiu da tela. As palavras valem em qualquer caixa;
// as siglas, só em maiúsculas ("men" e "win" não são palavras do texto, mas a sigla não pode casar por acaso)
const PALAVRAS_DE_JARGAO =
  /\b(drawdowns?|payoff|scores?|lotes?|faixas?|gains?|loss(?:es)?|trades?|heatmap|flutuantes?|volatilidade|taxa de acerto|recovery factor|ulcer index|brut[oa]s?|l[ií]quid[oa]s?|acumulad[oa]s?)\b/i;
const SIGLAS_DE_JARGAO = /\b(DD|MEP|MEN|MFE|MAE|WIN|WDO)\b/;
const temJargao = (s: string) => PALAVRAS_DE_JARGAO.test(s) || SIGLAS_DE_JARGAO.test(s);
/** os trechos entre parênteses do texto, com os parênteses */
const parenteses = (s: string) => s.match(/\([^)]*\)/g) ?? [];

describe("glossário de indicadores", () => {
  it("tem entradas", () => {
    expect(entradas.length).toBeGreaterThan(20);
  });

  // revisão de 25/11/2026: as chaves dos indicadores que saíram do site saíram daqui. Uma chave fica enquanto
  // alguma tela a cita, entre aspas ("drawdown", info="drawdown") ou como GLOSSARIO.drawdown; quando a última
  // tela deixa de citá-la, ela sai do tipo e do GLOSSARIO
  it("toda chave é citada por alguma tela", () => {
    const codigo = codigoQueCitaOGlossario();
    const semUso = entradas
      .map(([chave]) => chave)
      .filter((chave) => !new RegExp(`["'\`]${chave}["'\`]|GLOSSARIO\\.${chave}\\b`).test(codigo));
    expect(semUso).toEqual([]);
  });

  // a premissa dos custos vem de src/lib/premissa, escrita junto do número: o robô sem custo cadastrado está
  // antes dos custos, e um texto fixo do glossário afirmaria o contrário no balão dele
  it.each(entradas)("%s: não afirma que os custos estão descontados", (_chave, e) => {
    expect(e.texto).not.toMatch(/descontados os custos|com o custo considerado/i);
  });

  it.each(entradas)("%s: texto de 20 a 260 caracteres, terminando em ponto", (_chave, e) => {
    expect(e.nome.trim().length).toBeGreaterThan(0);
    expect(e.texto.length).toBeGreaterThanOrEqual(20);
    expect(e.texto.length).toBeLessThanOrEqual(260);
    expect(e.texto.endsWith(".")).toBe(true);
    expect(e.texto).toBe(e.texto.trim());
  });

  it.each(entradas)("%s: sem símbolo de conta nem exclamação", (_chave, e) => {
    expect(e.texto).not.toMatch(/[÷×!]/);
  });

  it.each(entradas)("%s: não começa repetindo o nome", (_chave, e) => {
    expect(primeiraPalavra(e.texto)).not.toBe(primeiraPalavra(e.nome));
  });

  // a marca mudou em 19/09/2026: nada de nome antigo nem de corretora pelo nome
  it.each(entradas)("%s: sem marca antiga nem corretora pelo nome", (_chave, e) => {
    expect(`${e.nome} ${e.texto}`).not.toMatch(/delta|btg/i);
  });

  // 25/11/2026 (ficha Mesa; Lucas: "para um leigo está muito difícil de entender"): o nome é o título do balão
  // que abre quando alguém toca no rótulo da tela, e por isso não leva jargão nem "por contrato"
  it.each(entradas)("%s: o nome não leva jargão", (_chave, e) => {
    expect(temJargao(e.nome)).toBe(false);
    expect(e.nome).not.toMatch(/por contrato/i);
  });

  // o termo técnico aparece no máximo uma vez, entre parênteses, para quem o conhece de outro lugar
  it.each(entradas)("%s: no texto, o termo técnico só entre parênteses e uma vez", (_chave, e) => {
    expect(temJargao(e.texto.replace(/\([^)]*\)/g, ""))).toBe(false);
    expect(parenteses(e.texto).filter(temJargao).length).toBeLessThanOrEqual(1);
    expect(e.texto).not.toMatch(/por contrato, l|líquido de custos/i);
  });

  // a tela dizia "Maior queda" e o balão abria com "Drawdown máximo"; "Acertos" abria "Taxa de acerto". O nome
  // de cada chave é o rótulo que a tela põe nela (PainelResultado, PainelCasa, ComoEleOpera, PainelRisco,
  // CabecalhoRobo, HojeAoVivo, DiaEscolhido, PainelSimulador e Como funciona)
  it("o nome é o rótulo da tela", () => {
    const rotulos: Partial<Record<ChaveIndicador, string>> = {
      drawdown: "Maior queda",
      capitalMinimo: "Capital mínimo",
      taxaAcerto: "Acertos",
      fatorLucro: "Fator de lucro",
      piorDia: "Pior dia",
      diasPositivos: "Dias com ganho",
      diasNegativos: "Dias com perda",
      sequenciaDiasNegativos: "Maior sequência de dias com perda",
      mep: "Melhor momento do dia",
      men: "Pior momento do dia",
      flutuante: "Resultado da operação aberta",
      semaforoCapital: "Cabe, apertado ou não cabe",
    };
    for (const [chave, rotulo] of Object.entries(rotulos) as Array<[ChaveIndicador, string]>) {
      expect(GLOSSARIO[chave].nome, chave).toBe(rotulo);
    }
  });

  // 25/11/2026 (revisão dos indicadores, DESIGN.md seção 9): os indicadores que entraram e os que mudaram de
  // nome, com o rótulo que as telas usam ("ganho típico", "perda típica", "maior perda numa operação")
  it("os indicadores da revisão de 25/11/2026 têm o nome da tela", () => {
    const rotulos: Partial<Record<ChaveIndicador, string>> = {
      ganhoPorQueda: "Ganho para cada R$ 1 da maior queda",
      mesesComGanho: "Meses com ganho",
      piorMes: "Pior mês",
      quedaAtual: "Abaixo do topo hoje",
      diaRuimTipico: "Um dia ruim típico",
      acertoParaEmpatar: "Acertos para empatar",
      resultadoPorOperacao: "Resultado médio por operação",
      entradasAbertas: "Entradas abertas ao mesmo tempo",
      pregoesOperados: "Pregões em que operou",
      andamJuntos: "Robôs que andam juntos",
      ganhoMedio: "Ganho típico",
      perdaMedia: "Perda típica",
      maiorPerda: "Maior perda numa operação",
      duracaoMedia: "Duração típica",
    };
    for (const [chave, rotulo] of Object.entries(rotulos) as Array<[ChaveIndicador, string]>) {
      expect(GLOSSARIO[chave].nome, chave).toBe(rotulo);
    }
  });

  // a regra do capital mínimo (Lucas, 25/11/2026): garantia por contrato x o máximo de entradas abertas ao
  // mesmo tempo + maior queda com folga. O texto cita as três parcelas e a premissa
  it("capital mínimo cita a garantia (a margem), as entradas abertas e a maior queda", () => {
    const t = GLOSSARIO.capitalMinimo.texto;
    expect(t).toMatch(/1 contrato por entrada/);
    expect(t).toMatch(/garantia/);
    expect(t).toMatch(/\(a margem\)/);
    expect(t).toMatch(/entradas que ele já teve abertas ao mesmo tempo/);
    expect(t).toMatch(/maior queda/);
    expect(GLOSSARIO.entradasAbertas.texto).toMatch(/1 contrato por entrada/);
  });

  // acertos nunca aparecem sem o necessário para empatar: o próprio texto dos acertos manda olhar para ele
  it("acertos apontam para o necessário para empatar", () => {
    expect(GLOSSARIO.taxaAcerto.texto).toMatch(/para empatar/);
    expect(GLOSSARIO.acertoParaEmpatar.texto).toMatch(/ganho típico/);
    expect(GLOSSARIO.acertoParaEmpatar.texto).toMatch(/perda típica/);
  });

  // nada de valor de ativo escrito à mão (quanto vale o ponto, a garantia): isso vem do banco e muda sem deploy
  it.each(entradas)("%s: sem valor de ativo fixo no texto", (_chave, e) => {
    expect(e.texto).not.toMatch(/cada ponto vale R\$|é R\$ 0,|R\$ 150/);
  });

  it("o termo técnico fica no texto, entre parênteses, para quem já conhece", () => {
    expect(GLOSSARIO.drawdown.texto).toMatch(/\([^)]*drawdown[^)]*\)/);
    expect(GLOSSARIO.taxaAcerto.texto).toMatch(/\([^)]*taxa de acerto[^)]*\)/);
    expect(GLOSSARIO.flutuante.texto).toMatch(/\([^)]*flutuante[^)]*\)/);
  });

  // a duração típica do Resumo é a mediana das operações medidas (duracaoTipica), e não a média: o texto diz isso
  it("duração típica é a do meio, não a média", () => {
    const t = GLOSSARIO.duracaoMedia.texto;
    expect(t).toMatch(/metade das operações dura menos do que isso, metade dura mais/);
    expect(t).not.toMatch(/médi[oa]/i);
  });

  // 21/09/2026: o contador conta entradas ainda abertas, e o texto tem que dizer que não é contrato
  it("operações em aberto: cada entrada conta 1, e não é número de contratos", () => {
    const e = GLOSSARIO.operacoesEmAberto;
    expect(e.nome).toBe("Operações em aberto");
    expect(e.texto).toMatch(/conta 1/);
    expect(e.texto).toMatch(/contratos/);
  });

  // 22/09/2026: MEP/MEN com duas fontes (tick a tick pelo coletor 1.1.0, ou por fechamento) e o MAE da operação.
  // 25/11/2026 (ficha Mesa): na tela são o melhor e o pior momento do dia e o pior momento da operação (a coluna
  // da aba Operações); a sigla saiu do nome e fica uma vez no texto, entre parênteses, e "pontos por contrato"
  // virou "em pontos"
  it("melhor e pior momento do dia citam as duas fontes; o da operação é em pontos", () => {
    for (const chave of ["mep", "men"] as const) {
      const e = GLOSSARIO[chave];
      expect(e.texto).toMatch(/movimento do preço/);
      expect(e.texto).toMatch(/operação fechada/);
    }
    expect(GLOSSARIO.mep.texto).toMatch(/\([^)]*MEP[^)]*\)/);
    expect(GLOSSARIO.men.texto).toMatch(/\([^)]*MEN[^)]*\)/);
    expect(GLOSSARIO.mae.nome).toBe("Pior momento da operação");
    expect(GLOSSARIO.mae.texto).toMatch(/\([^)]*MAE[^)]*\)/);
    expect(GLOSSARIO.mae.texto).toMatch(/em pontos/);
    expect(GLOSSARIO.mae.texto).toMatch(/enquanto ela esteve aberta/);
    expect(GLOSSARIO.mae.texto).toMatch(/contra/);
  });

  // 23/09/2026: a curva do dia com duas fontes (série do saldo do EA 1.1.2 a cada 5 s, ou por fechamento).
  // 25/11/2026 (ficha Mesa): o nome é o título que a tela põe em cima dela
  it("curva do dia cita as duas fontes", () => {
    expect(GLOSSARIO.curvaDoDia.nome).toBe("Saldo ao longo do dia");
    expect(GLOSSARIO.curvaDoDia.texto).toMatch(/5 segundos/);
    expect(GLOSSARIO.curvaDoDia.texto).toMatch(/operação por operação/);
  });

  // o texto do "cabe, apertado ou não cabe" cita o limite à mão: se LIMITE_APERTADO mudar, o texto muda junto.
  // E diz a quarta resposta (semaforoDe, "sem_avaliacao"): sem o capital mínimo de um robô escolhido, não há
  // veredito
  it("o limite de apertado do texto é o do simulador, e o texto diz quando não dá para avaliar", () => {
    expect(GLOSSARIO.semaforoCapital.texto).toContain(`${formatarPct(LIMITE_APERTADO, 0)} do capital`);
    expect(GLOSSARIO.semaforoCapital.texto).toMatch(/não uma garantia/);
    expect(GLOSSARIO.semaforoCapital.texto).toMatch(/sem o capital mínimo de algum robô escolhido, não dá para avaliar/i);
  });
});
