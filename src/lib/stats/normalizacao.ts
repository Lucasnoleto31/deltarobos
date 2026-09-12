/** Divide um valor total pela quantidade de contratos. */
export function porContrato(valor: number, contratos: number): number {
  return contratos > 0 ? valor / contratos : 0;
}

export function pontosParaBrl(pontos: number, valorPonto: number): number {
  return pontos * valorPonto;
}

export function brlParaPontos(brl: number, valorPonto: number): number {
  return valorPonto > 0 ? brl / valorPonto : 0;
}

export function resultadoLiquido(bruto: number, custos: number): number {
  return bruto - custos;
}

/** Preço médio ponderado por volume. */
export function vwap(itens: ReadonlyArray<{ volume: number; preco: number }>): number {
  let volume = 0;
  let soma = 0;
  for (const item of itens) {
    volume += item.volume;
    soma += item.volume * item.preco;
  }
  return volume > 0 ? soma / volume : 0;
}

/** Arredonda "meio pra longe do zero" (2,345 -> 2,35 e -2,345 -> -2,35). */
export function arredondar(valor: number, decimais = 2): number {
  if (valor === 0 || !Number.isFinite(valor)) return 0;
  const fator = 10 ** decimais;
  const magnitude = Math.round((Math.abs(valor) + Number.EPSILON) * fator) / fator;
  return valor < 0 ? -magnitude : magnitude;
}
