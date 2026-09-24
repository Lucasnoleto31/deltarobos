/**
 * As regras puras do botão "Compartilhar o dia" (24/09/2026): a versão da imagem de hoje, os textos do
 * diálogo e do compartilhamento, e se o navegador aceita compartilhar arquivo. Ficam fora do componente
 * para ter teste (vitest roda em node, sem DOM) e para o Hoje ao vivo e a tela cheia calcularem a versão
 * do mesmo jeito. Sem "use client": nada aqui depende de React.
 */
import { formatarDataLonga } from "@/lib/formato";
import { epochBrasilia, FOLGA_DO_EIXO_SEG } from "@/lib/stats/saldo-dia";
import { DIMENSOES_CARD, versaoDoCard, type FormatoCard } from "@/components/compartilhar/url-do-card";

/** o aviso de quando o compartilhamento do celular recusa o arquivo ou falha (cancelar não é falha) */
export const AVISO_SEM_COMPARTILHAR = "Não deu para compartilhar. Use Baixar imagem.";
export const AVISO_LINK_COPIADO = "Link copiado.";

/**
 * A versão (cache-buster) da imagem de hoje no Hoje ao vivo e na tela cheia: o nº de operações e o
 * instante do último dado, o maior entre a última saída e o último balde da série do EA. Muda quando o dia
 * muda, para a prévia de hoje não vir velha da CDN; o diálogo congela a versão ao abrir.
 *
 * O balde conta só até onde a imagem desenha (revisão de 24/09/2026): o coletor manda baldes até a
 * meia-noite, e com o t cru a versão mudava a cada minuto a noite toda, cada abertura do diálogo virava um
 * pedido fora do cache da CDN (a rota inteira: robô, nove páginas de baldes, operações, render) para uma
 * imagem que não muda mais. O teto é o que a imagem parcial corta: o mais tarde entre o fim do dia do robô
 * (`corte.fim`, fimDoDia) e a última saída, mais a folga do eixo.
 */
export function versaoDoDiaAoVivo(
  ops: ReadonlyArray<{ fechamento_em: string }>,
  baldes: ReadonlyArray<readonly [number, ...unknown[]]>,
  corte: { dia: string; fim: string },
): string {
  let ultimaSaida = 0;
  // o maior fechamento, e não o último da lista: a ordem chega do provider, mas a conta não depende dela
  for (const o of ops) {
    const ms = Date.parse(o.fechamento_em);
    if (Number.isFinite(ms)) ultimaSaida = Math.max(ultimaSaida, Math.floor(ms / 1000));
  }
  let ultimo = ultimaSaida;
  const t = baldes.at(-1)?.[0];
  if (typeof t === "number" && Number.isFinite(t)) {
    const fim = epochBrasilia(corte.dia, corte.fim);
    const teto = Number.isFinite(fim) ? Math.max(fim, ultimaSaida) + FOLGA_DO_EIXO_SEG : t;
    ultimo = Math.max(ultimo, Math.min(t, teto));
  }
  return versaoDoCard(ops.length, ultimo || null);
}

/** "1080 × 1080, para o feed e o WhatsApp" | "1080 × 1920, para stories e status" */
export function dicaDoFormato(formato: FormatoCard): string {
  const { largura, altura } = DIMENSOES_CARD[formato];
  return `${largura} × ${altura}, ${formato === "story" ? "para stories e status" : "para o feed e o WhatsApp"}`;
}

/** largura ÷ altura: a caixa da prévia guarda o lugar da imagem enquanto ela é gerada */
export function proporcaoDoFormato(formato: FormatoCard): number {
  const { largura, altura } = DIMENSOES_CARD[formato];
  return largura / altura;
}

/** o aria-label do botão que abre o diálogo: com o nome e a data, porque a tela pode ter mais de um */
export function rotuloAcessivelDoBotao(nomeRobo: string, dia: string): string {
  return `Compartilhar o dia do ${nomeRobo}, ${formatarDataLonga(dia)}`;
}

/** o alt da prévia: diz o que a imagem traz, sem repetir os números (eles mudam; o alt é da prévia) */
export function textoAlternativoDoCard(nomeRobo: string, dia: string, formato: FormatoCard): string {
  return `Imagem do dia do ${nomeRobo}, ${formatarDataLonga(dia)}, formato ${formato === "story" ? "story (vertical)" : "quadrado"}, com o resultado por contrato, as operações, o MEP, o MEN e a curva do dia.`;
}

/**
 * título e texto que vão junto com o arquivo no compartilhamento do celular (o texto vira a legenda). Robô
 * em conta demo diz isso na legenda também (revisão de 24/09/2026): a legenda pode ser encaminhada sem a
 * imagem, e o site nunca esconde que é demo.
 */
export function textosDoCompartilhamento(
  nomeRobo: string,
  dia: string,
  link: string,
  contaDemo = false,
): { title: string; text: string } {
  const data = formatarDataLonga(dia);
  return {
    title: `${nomeRobo} · ${data}`,
    text: `O dia do ${nomeRobo} em ${data}, por 1 contrato, líquido de custos.${contaDemo ? " Conta demo." : ""} ${link}`,
  };
}

/** o texto da prévia que não carregou: 404 é dia sem operação pública, o resto é falha de rede ou do banco */
export function mensagemDoErroDaPrevia(status: number | null): string {
  return status === 404 ? "Este dia ainda não tem operação fechada." : "A imagem não carregou.";
}

/** a pessoa fechou a folha de compartilhar do celular: não é erro, e nada é avisado */
export function ehCancelamentoDoCompartilhar(e: unknown): boolean {
  return typeof e === "object" && e !== null && "name" in e && (e as { name?: unknown }).name === "AbortError";
}

/** o pedaço do navigator que o teste de suporte usa (o parâmetro deixa testar sem DOM) */
export interface NavegadorQueCompartilha {
  share?: unknown;
  canShare?: (dados?: ShareData) => boolean;
}

/**
 * O navegador compartilha ARQUIVO (Web Share nível 2)? Um canShare com um PNG de teste. Sem share ou sem
 * canShare, ou se o teste lançar (alguns navegadores lançam em vez de devolver false), é não: o botão
 * "Compartilhar" some e ficam "Baixar imagem" e "Copiar link".
 */
export function podeCompartilharArquivos(
  nav: NavegadorQueCompartilha | undefined = typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  try {
    if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
    const teste = new File([new Uint8Array([0])], "teste.png", { type: "image/png" });
    return nav.canShare({ files: [teste] }) === true;
  } catch {
    return false;
  }
}
