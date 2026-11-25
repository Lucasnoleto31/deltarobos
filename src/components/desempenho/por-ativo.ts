// "Por ativo" da aba Desempenho (ficha Mesa, 25/11/2026). A lista era por código de contrato (WINQ26,
// WINV26…), e o código muda a cada vencimento: para um robô de um ativo só, era o resultado por mês contado
// de outro jeito, com nomes que o leigo não conhece. Aqui os códigos são juntados no ativo, e a seção só
// aparece quando o robô operou mais de um. Só soma o que porSimbolo já calculou: nenhuma conta nova.

import type { FaixaSimbolo } from "@/lib/stats/operacoes";

/** O ativo do cadastro do robô (tabela robos): o prefixo dos códigos e o nome de leigo. */
export interface AtivoDoRobo {
  /** prefixo dos códigos de contrato, como "WIN" */
  prefixo: string;
  /** nome que vai na tela, como "Mini Índice"; vazio usa o prefixo */
  nome: string;
}

// o vencimento no fim do código de um contrato futuro: a letra do mês e os dois algarismos do ano (WDOZ26)
const VENCIMENTO = /[FGHJKMNQUVXZ]\d{2}$/;

/**
 * A que ativo um código de contrato pertence. O que começa com o prefixo do cadastro é o ativo do robô, com
 * o nome do cadastro. Para o resto não há nome no banco: vale o código sem o vencimento ("WDOZ26" vira "WDO").
 */
export function ativoDoSimbolo(simbolo: string, principal: AtivoDoRobo): string {
  const codigo = simbolo.trim().toUpperCase();
  const prefixo = principal.prefixo.trim().toUpperCase();
  if (prefixo !== "" && codigo.startsWith(prefixo)) return principal.nome.trim() || prefixo;
  return codigo.replace(VENCIMENTO, "") || codigo;
}

/** Junta os códigos de contrato no ativo de cada um, do melhor resultado para o pior. */
export function juntarPorAtivo(faixas: readonly FaixaSimbolo[], principal: AtivoDoRobo): FaixaSimbolo[] {
  const porAtivo = new Map<string, FaixaSimbolo>();
  for (const f of faixas) {
    const ativo = ativoDoSimbolo(f.simbolo, principal);
    const soma = porAtivo.get(ativo) ?? { simbolo: ativo, total: 0, n: 0, nGain: 0 };
    soma.total += f.total;
    soma.n += f.n;
    soma.nGain += f.nGain;
    porAtivo.set(ativo, soma);
  }
  return [...porAtivo.values()].sort((a, b) => b.total - a.total);
}
