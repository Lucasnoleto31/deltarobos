// O estado do simulador na query string, para compartilhar e para os links "Simular com meu capital"
// chegarem preenchidos. Formato canônico, em ordem fixa e com `:` e `,` literais (sem percent-encoding,
// que deixaria a URL ilegível): /simulador?capital=30000&r=apollo:2,orion:1&periodo=12m
//
// - `capital`: inteiro em R$ > 0 e <= 1e9, SÓ DÍGITOS ("30.000" com o ponto de milhar seria lido como
//   R$ 30 e "0x7530" como 30.000; os dois viram null); ausente ou inválido = null (a página pede o
//   capital e nada é simulado sem ele); omitido da URL quando null.
// - `r`: lista `slug` ou `slug:n` separada por vírgula. AUSENTE = todos os robôs válidos com 1. PRESENTE
//   = exatamente o listado: n só dígitos, clampado a 0..MAX_CONTRATOS (inválido = 1; slug sem `:n` = 1),
//   slug desconhecido ignorado, repetido vale o último, não listado = 0. `r=` vazio = nenhum robô.
//   Omitido da URL quando todos valem 1; senão só os com contratos > 0, sempre com `:n`; nenhum = `r=`.
// - `periodo`: 3m | 12m | ano | tudo; ausente ou inválido = "tudo"; omitido da URL quando "tudo".
// O parser aceita também a forma percent-encoded (URLSearchParams decodifica) e espaços à volta. Sem
// "use client": a página do servidor e os testes também usam.

import {
  ehPeriodoSimulador,
  MAX_CONTRATOS,
  PERIODO_SIMULADOR_PADRAO,
  type PeriodoSimulador,
} from "@/lib/stats/simulador";

export interface EstadoSimulador {
  capital: number | null;
  contratos: Record<string, number>;
  periodo: PeriodoSimulador;
}

export const CAPITAL_MAXIMO = 1e9;

const RE_SLUG_LIMPO = /^[a-z0-9-]+$/i;
const RE_INTEIRO = /^\d+$/;

/** Slug como vai na URL: literal quando só tem letras, dígitos e hífen; senão percent-encoded. */
const codificarSlug = (slug: string) => (RE_SLUG_LIMPO.test(slug) ? slug : encodeURIComponent(slug));

/**
 * Inteiro de um texto só com dígitos (depois do trim); "30.000", "1e5", "0x10", "+2", "-3" e vazio = null.
 * É a mesma regra da URL e dos campos do painel: Number() aceitaria grafias que enganam.
 */
export function inteiroDe(texto: string): number | null {
  const t = texto.trim();
  return RE_INTEIRO.test(t) ? Number(t) : null;
}

/**
 * Capital inteiro em R$ > 0 e <= CAPITAL_MAXIMO. Texto: só dígitos (inteiroDe); número já lido (um estado):
 * arredondado. Qualquer outra coisa = null.
 */
export function lerCapital(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? inteiroDe(v) : Number.isFinite(v) ? Math.round(v) : null;
  return n !== null && n > 0 && n <= CAPITAL_MAXIMO ? n : null;
}

/** O mesmo clamp na saída da URL e no campo do painel: inteiro em 0..MAX_CONTRATOS; inválido = 0. */
export function normalizarContratos(n: number | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.min(MAX_CONTRATOS, Math.max(0, Math.round(n)));
}

/** Contratos de `slug:n`: só dígitos, clampado; ausente, vazio ou inválido = 1 (o padrão). */
function lerContratos(texto: string | undefined): number {
  if (texto === undefined) return 1;
  const n = inteiroDe(texto);
  return n === null ? 1 : normalizarContratos(n);
}

/** `r` → contratos por slug conhecido. Ausente = todos com 1; presente = exatamente o listado. */
function lerRobos(r: string | null, slugs: readonly string[]): Record<string, number> {
  const contratos: Record<string, number> = {};
  if (r === null) {
    for (const slug of slugs) contratos[slug] = 1;
    return contratos;
  }
  for (const slug of slugs) contratos[slug] = 0;
  const conhecidos = new Set(slugs);
  for (const item of r.split(",")) {
    const bruto = item.trim();
    if (bruto === "") continue;
    const i = bruto.indexOf(":");
    const slug = (i < 0 ? bruto : bruto.slice(0, i)).trim();
    if (!conhecidos.has(slug)) continue;
    contratos[slug] = lerContratos(i < 0 ? undefined : bruto.slice(i + 1));
  }
  return contratos;
}

/** sp = useSearchParams() (ReadonlyURLSearchParams estende URLSearchParams); slugs = robôs válidos na ordem da página. */
export function lerUrlSimulador(sp: URLSearchParams, slugs: readonly string[]): EstadoSimulador {
  const periodo = sp.get("periodo");
  return {
    capital: lerCapital(sp.get("capital")),
    contratos: lerRobos(sp.get("r"), slugs),
    periodo: ehPeriodoSimulador(periodo) ? periodo : PERIODO_SIMULADOR_PADRAO,
  };
}

/** "/simulador" quando tudo é padrão; senão "/simulador?capital=…&r=…&periodo=…" (só o que difere do padrão). */
export function urlSimulador(e: EstadoSimulador, slugs: readonly string[]): string {
  const partes: string[] = [];

  const capital = lerCapital(e.capital);
  if (capital !== null) partes.push(`capital=${capital}`);

  const contratos = slugs.map((slug) => [slug, normalizarContratos(e.contratos[slug])] as const);
  const padrao = contratos.every(([, n]) => n === 1);
  if (!padrao) {
    const ativos = contratos.filter(([, n]) => n > 0).map(([slug, n]) => `${codificarSlug(slug)}:${n}`);
    partes.push(`r=${ativos.join(",")}`);
  }

  if (e.periodo !== PERIODO_SIMULADOR_PADRAO) partes.push(`periodo=${e.periodo}`);

  return partes.length > 0 ? `/simulador?${partes.join("&")}` : "/simulador";
}

/** Link pré-preenchido de um robô só, sem capital (o visitante digita): "/simulador?r=<slug>:1". */
export function linkSimulador(slug: string): string {
  return `/simulador?r=${codificarSlug(slug)}:1`;
}
