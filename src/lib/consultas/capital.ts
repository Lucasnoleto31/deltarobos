import { cache } from "react";
import { carregarCasa } from "@/lib/consultas/casa";
import { picoDeEntradasDoRobo, type PicoDoRobo } from "@/lib/consultas/entradas";
import { buscarRobo, carregarParametros, listarEstatisticas, listarMercado } from "@/lib/consultas/publico";
import { capitalMinimoRecomendado } from "@/lib/stats/kpis";
import { hojeSP } from "@/lib/stats/periodos";
import { curvaAcumulada, drawdownMaximo } from "@/lib/stats/serie";
import type { EstatisticaPublica, MercadoPublico, RoboPublico } from "@/lib/tipos";

export interface CapitalDoRobo {
  /** capital mínimo publicado, inteiro em R$; nulo quando o ativo não tem margem cadastrada ou a leitura das entradas falhou */
  capitalMinimo: number | null;
  /** margem (garantia) por contrato do ativo, em R$; nula se não cadastrada */
  margem: number | null;
  /** o máximo de entradas que o robô já teve abertas ao mesmo tempo (1 quando não há medição) */
  entradas: number;
  /** quando foi esse máximo (ISO), ou nulo sem medição */
  entradasEm: string | null;
  /** a maior queda de todo o histórico, em R$, com 1 contrato por entrada e já com custos */
  maiorQueda: number;
  /** o fator de segurança aplicado à maior queda (parâmetro do site) */
  fator: number;
}

/** A conta, com tudo já lido: a mesma para um robô só e para a lista inteira. */
function montarCapital(
  robo: Pick<RoboPublico, "ativo" | "valor_ponto_brl">,
  linhas: readonly EstatisticaPublica[],
  mercado: readonly MercadoPublico[],
  fator: number,
  /** nulo quando a leitura das entradas falhou: aí o capital fica desconhecido em vez de contar 1 entrada */
  pico: PicoDoRobo | null,
  hoje: string,
): CapitalDoRobo {
  const curva = curvaAcumulada(
    linhas.filter((l) => l.dia <= hoje),
    { base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl },
  );
  const maiorQueda = drawdownMaximo(curva).valor;
  const margem = mercado.find((m) => m.prefixo_simbolo === robo.ativo)?.margem_referencia ?? null;
  const entradas = Math.max(1, pico?.maximo ?? 0);
  return {
    capitalMinimo: margem === null || pico === null ? null : Math.round(capitalMinimoRecomendado(margem, maiorQueda, fator, entradas)),
    margem,
    entradas,
    entradasEm: pico && pico.maximo > 0 ? pico.quando : null,
    maiorQueda,
    fator,
  };
}

/**
 * O capital mínimo de um robô e as parcelas da conta (25/11/2026), num lugar só, para o cabeçalho do robô,
 * o Resumo, Quedas e risco, a lista da página inicial e o simulador mostrarem o mesmo número:
 *   margem por contrato x o máximo de entradas que o robô já teve abertas + maior queda x fator.
 * Com cache por requisição: o layout e a aba pedem na mesma renderização. Nulo se o robô não existe.
 */
export const capitalDoRobo = cache(async (slug: string): Promise<CapitalDoRobo | null> => {
  const [robo, linhas, mercado, parametros, pico] = await Promise.all([
    buscarRobo(slug),
    listarEstatisticas(slug),
    listarMercado(),
    carregarParametros(),
    picoDeEntradasDoRobo(slug),
  ]);
  if (!robo) return null;
  return montarCapital(robo, linhas, mercado, parametros.fatorSeguranca, pico, hojeSP());
});

/**
 * O capital de cada robô que aparece no site, pelo slug: para a lista da página inicial e para o simulador.
 * Reaproveita o que a casca do site já leu (carregarCasa) e só busca, a mais, as entradas abertas de cada robô.
 */
export const capitaisDaCasa = cache(async (): Promise<Record<string, CapitalDoRobo>> => {
  const casa = await carregarCasa();
  const visiveis = casa.robos.filter((r) => r.status !== "arquivado");
  const picos = await Promise.all(visiveis.map((r) => picoDeEntradasDoRobo(r.slug)));
  return Object.fromEntries(
    visiveis.map((r, i) => [
      r.slug,
      montarCapital(
        r,
        casa.estatisticas.filter((e) => e.slug === r.slug),
        casa.mercado,
        casa.parametros.fatorSeguranca,
        picos[i],
        casa.hoje,
      ),
    ]),
  );
});
