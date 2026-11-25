import { cache } from "react";
import { picoDeEntradasDoRobo } from "@/lib/consultas/entradas";
import { buscarRobo, carregarParametros, listarEstatisticas, listarMercado } from "@/lib/consultas/publico";
import { capitalMinimoRecomendado } from "@/lib/stats/kpis";
import { hojeSP } from "@/lib/stats/periodos";
import { curvaAcumulada, drawdownMaximo } from "@/lib/stats/serie";

export interface CapitalDoRobo {
  /** capital mínimo publicado, inteiro em R$; nulo quando o ativo não tem margem cadastrada */
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

  const hoje = hojeSP();
  const curva = curvaAcumulada(
    linhas.filter((l) => l.dia <= hoje),
    { base: "liquido", unidade: "brl", valorPonto: robo.valor_ponto_brl },
  );
  const maiorQueda = drawdownMaximo(curva).valor;
  const margem = mercado.find((m) => m.prefixo_simbolo === robo.ativo)?.margem_referencia ?? null;
  const entradas = Math.max(1, pico.maximo);

  return {
    capitalMinimo: margem === null ? null : Math.round(capitalMinimoRecomendado(margem, maiorQueda, parametros.fatorSeguranca, entradas)),
    margem,
    entradas,
    entradasEm: pico.maximo > 0 ? pico.quando : null,
    maiorQueda,
    fator: parametros.fatorSeguranca,
  };
});
