/**
 * O nome da marca nos textos que vêm do banco (19/09/2026).
 *
 * O site virou Quants Robôs, mas o subtítulo do hero e o aviso legal moram na tabela `parametros`
 * (chave `textos`), que é do Lucas: até ele rodar o update, esses dois textos ainda diziam "Delta
 * Robôs" e "BTG Pactual" na tela. Em vez de fixar o texto no código (o que tiraria dele a edição
 * pelo banco), o site troca só a marca na hora de mostrar. Quando o update rodar, nenhuma destas
 * trocas encontra nada e a função devolve o texto do banco como está.
 */
const TROCAS: ReadonlyArray<readonly [RegExp, string]> = [
  // a frase do aviso legal fica correta ("vinculado a uma corretora parceira"), não "ao corretora"
  [/vinculad([oa])s? ao BTG Pactual/gi, "vinculad$1 a uma corretora parceira"],
  [/\bBTG Pactual\b/gi, "corretora parceira"],
  [/\bBTG\b/g, "corretora parceira"],
  [/\bDelta Robôs\b/gi, "Quants Robôs"],
  [/\bDelta Flow\b/gi, "Quants"],
  // "da Delta", "pela Delta": a marca sozinha, sem pegar palavra que só começa com Delta
  [/\bDelta\b/g, "Quants"],
];

/** Troca a marca antiga pela atual num texto vindo do banco. */
export function comMarcaAtual(texto: string): string {
  return TROCAS.reduce((t, [de, para]) => t.replace(de, para), texto);
}
