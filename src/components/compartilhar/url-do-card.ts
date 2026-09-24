// O formato, as dimensões, a URL e o nome do arquivo da imagem do dia para compartilhar (24/09/2026). Sem
// "use client" de propósito: a rota /api/og/[slug]/[dia] (servidor), o CardDoDia (desenho) e o botão
// CompartilharDia (navegador) leem daqui, e os três precisam concordar no formato e no tamanho.

export type FormatoCard = "quadrado" | "story";

export const FORMATOS_CARD: ReadonlyArray<{ valor: FormatoCard; rotulo: string }> = [
  { valor: "quadrado", rotulo: "Quadrado" },
  { valor: "story", rotulo: "Story" },
];

/** quadrado: feed do Instagram e WhatsApp; story: stories e status */
export const DIMENSOES_CARD: Readonly<Record<FormatoCard, { largura: number; altura: number }>> = {
  quadrado: { largura: 1080, altura: 1080 },
  story: { largura: 1080, altura: 1920 },
};

/** "story" -> story; qualquer outra coisa (null, "", "STORY", "xyz") -> quadrado */
export function formatoDoParametro(v: string | null | undefined): FormatoCard {
  return v === "story" ? "story" : "quadrado";
}

/** caminho relativo da imagem; a versão só muda a URL (cache-buster), o servidor a ignora */
export function urlDoCard(slug: string, dia: string, formato: FormatoCard, versao?: string): string {
  return `/api/og/${encodeURIComponent(slug)}/${dia}?formato=${formato}${versao ? `&v=${encodeURIComponent(versao)}` : ""}`;
}

/** `quants-${slug}-${dia}-${formato}.png` (slug com [^a-z0-9-] trocado por "-") */
export function nomeDoArquivo(slug: string, dia: string, formato: FormatoCard): string {
  return `quants-${slug.replace(/[^a-z0-9-]/g, "-")}-${dia}-${formato}.png`;
}

/**
 * Cache-buster da imagem de hoje: `${n}` ou `${n}-${minuto do último dado}`. Muda quando fecha operação ou chega
 * dado novo, no máximo uma vez por minuto (a CDN guarda por URL; a rota de hoje fica 60 s em cache).
 */
export function versaoDoCard(nOperacoes: number, ultimoDadoEpochSeg?: number | null): string {
  if (ultimoDadoEpochSeg === null || ultimoDadoEpochSeg === undefined || !Number.isFinite(ultimoDadoEpochSeg)) return `${nOperacoes}`;
  return `${nOperacoes}-${Math.floor(ultimoDadoEpochSeg / 60)}`;
}
