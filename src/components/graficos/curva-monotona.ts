/**
 * Traçado suave que não passa do ponto: a mesma conta do `curveMonotoneX` do d3, que o recharts
 * usava no type="monotone" da MiniCurva. Refeito à mão em 18/09/2026 para o recharts (~100 KB gz)
 * sair da home e do embed; a conta é a mesma, então a curva do cartão não muda.
 */

// o d3 trata zero como positivo aqui
function sinal(x: number): number {
  return x < 0 ? -1 : 1;
}

/** Inclinação num ponto interno, limitada para a curva não ultrapassar os vizinhos. */
function tangenteInterna(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  const h0 = x1 - x0;
  const h1 = x2 - x1;
  const s0 = (y1 - y0) / (h0 || (h1 < 0 ? -0 : 0));
  const s1 = (y2 - y1) / (h1 || (h0 < 0 ? -0 : 0));
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sinal(s0) + sinal(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** Inclinação na ponta, a partir da tangente do vizinho. */
function tangenteDaPonta(x0: number, y0: number, x1: number, y1: number, t: number): number {
  const h = x1 - x0;
  return h ? ((3 * (y1 - y0)) / h - t) / 2 : t;
}

// três casas bastam para um viewBox de 100 de largura
const n3 = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * `d` de um <path> que passa pelos pontos (xs[i], ys[i]) com curva monótona. Um ponto só vira
 * "M x,y"; dois viram reta, como no d3.
 */
export function caminhoMonotono(xs: number[], ys: number[]): string {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return "";
  let d = `M${n3(xs[0])},${n3(ys[0])}`;
  if (n === 1) return d;
  if (n === 2) return `${d}L${n3(xs[1])},${n3(ys[1])}`;

  const t = new Array<number>(n);
  for (let i = 1; i < n - 1; i++) {
    t[i] = tangenteInterna(xs[i - 1], ys[i - 1], xs[i], ys[i], xs[i + 1], ys[i + 1]);
  }
  t[0] = tangenteDaPonta(xs[0], ys[0], xs[1], ys[1], t[1]);
  t[n - 1] = tangenteDaPonta(xs[n - 2], ys[n - 2], xs[n - 1], ys[n - 1], t[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3;
    d +=
      `C${n3(xs[i] + dx)},${n3(ys[i] + dx * t[i])},` +
      `${n3(xs[i + 1] - dx)},${n3(ys[i + 1] - dx * t[i + 1])},` +
      `${n3(xs[i + 1])},${n3(ys[i + 1])}`;
  }
  return d;
}
