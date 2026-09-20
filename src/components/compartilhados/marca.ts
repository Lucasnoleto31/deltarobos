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

/**
 * O subtítulo do hero que o Artur aprovou em 20/09/2026, enquanto o banco não muda.
 *
 * Mesmo caso da troca de marca acima, um passo adiante: o subtítulo que está em `parametros` não
 * tem só a marca errada, é outra frase. O update para o Lucas rodar está em
 * `scripts/textos-quants.sql`; até ele rodar, o site já mostra a frase aprovada.
 *
 * A regra é estreita de propósito: só o texto ANTIGO, letra por letra depois da troca de marca,
 * vira o novo. Qualquer outra coisa que o Lucas escreva no banco passa intacta — inclusive o texto
 * novo, quando o SQL rodar, que é o dia em que esta regra deixa de casar e pode sair daqui.
 */
const SUBTITULO_ANTIGO =
  "Cada operação chega direto do MetaTrader 5 das contas da Quants Robôs, normalizada por contrato. Sem print, sem edição.";

const SUBTITULO_APROVADO =
  "Acompanhe as operações diretamente das contas, com dados atualizados enquanto o mercado acontece.";

/** O subtítulo do hero com a marca atual e com a cópia aprovada no lugar da antiga. */
export function subtituloHero(texto: string): string {
  const comMarca = comMarcaAtual(texto);
  return comMarca === SUBTITULO_ANTIGO ? SUBTITULO_APROVADO : comMarca;
}
