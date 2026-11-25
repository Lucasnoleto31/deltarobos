"use client";

import { cn } from "cn";
import { useMemo } from "react";
import { escalaJusta, noEixo } from "@/components/graficos/GraficoResultado";
import { formatarBRL } from "@/lib/formato";

/** A curva de um robô no eixo de tempo comum (ver curvaNoEixo, em lib/stats/serie-casa). */
export interface SerieDoComparativo {
  slug: string;
  nome: string;
  /** o acumulado do período em cada pregão do eixo; nulo onde o robô ainda não tem linha */
  acumulado: ReadonlyArray<number | null>;
  /** a maior queda do robô, com o pico e o fundo nos índices do eixo */
  queda: { iInicio: number; iFundo: number; valor: number } | null;
}

interface Props {
  /** o eixo de tempo: todo pregão em que algum robô operou no período */
  dias: readonly string[];
  /** as curvas, na ordem da lista de robôs: sem destaque, a primeira é a de tom mais forte */
  series: readonly SerieDoComparativo[];
  /** o robô em destaque: a linha dele na cor do texto, com o valor da maior queda escrito; as outras apagadas */
  destaque: string | null;
  /** o pregão sob o ponteiro (quem chama mostra a leitura dele; aqui só se desenha a mira) */
  ativo: number | null;
  aoApontar: (indice: number | null) => void;
  /** o robô cuja linha está mais perto do ponteiro, ou cujo nome foi apontado na ponta */
  aoDestacar: (slug: string | null) => void;
  className?: string;
}

// A altura: quem chama fixa com --alt-curva (a página inicial usa a mesma da curva somada, para a tela não
// pular ao trocar de uma para a outra).
const ALTURA = "var(--alt-curva, clamp(14rem, calc(100dvh - 39rem), 30rem))";

// o nome na ponta tem ~13 px; na altura mínima do gráfico (14rem) isto dá 17 px entre um nome e o vizinho
const VAO_ENTRE_NOMES = 7.5;

// Sem robô em destaque, o que distingue uma linha da outra são os tons do texto, do mais forte ao mais leve,
// na ordem da lista (e o nome na ponta). Nunca uma cor por robô.
const TONS = [
  { traco: "var(--foreground)", nome: "text-foreground" },
  { traco: "var(--muted-foreground)", nome: "text-muted-foreground" },
  { traco: "var(--sutil)", nome: "text-sutil" },
] as const;
const tomDe = (i: number) => TONS[Math.min(i, TONS.length - 1)];

const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const mesCurto = (dia: string) => fmtMes.format(new Date(`${dia}T12:00:00Z`)).replace(".", "");
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const f = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** Onde cada nome fica na ponta da linha (0 a 100, de cima para baixo), afastando os que cairiam um sobre o outro. */
function espalhar(pontas: ReadonlyArray<{ slug: string; y: number }>): Map<string, number> {
  const ordem = [...pontas].sort((a, b) => a.y - b.y).map((p) => ({ slug: p.slug, y: Math.min(100, Math.max(0, p.y)) }));
  for (let i = 1; i < ordem.length; i += 1) ordem[i].y = Math.max(ordem[i].y, ordem[i - 1].y + VAO_ENTRE_NOMES);
  // se a fila passou do fundo, volta empurrando de baixo para cima
  const ultimo = ordem.length - 1;
  if (ultimo >= 0 && ordem[ultimo].y > 100) {
    ordem[ultimo].y = 100;
    for (let i = ultimo - 1; i >= 0; i -= 1) ordem[i].y = Math.min(ordem[i].y, ordem[i + 1].y - VAO_ENTRE_NOMES);
  }
  return new Map(ordem.map((p) => [p.slug, p.y]));
}

/**
 * As curvas dos robôs no mesmo gráfico, "lado a lado" (ficha Mesa, 25/11/2026), no desenho do
 * GraficoResultado: uma linha fina por robô, todas no mesmo eixo de tempo e na mesma escala de valor, com o
 * nome escrito na ponta de cada uma. Nunca uma cor por robô, e verde não entra em curva.
 *
 * - Sem robô em destaque, as linhas levam os tons do texto (a primeira da lista é a mais forte) e cada uma
 *   tem o trecho da própria maior queda em vermelho.
 * - Com um robô em destaque (o do ponteiro, ou o da linha da lista apontada), a linha dele fica na cor do
 *   texto, com a maior queda em vermelho e o valor escrito ao lado; as outras ficam apagadas.
 *
 * Sem caixa, sem área preenchida, sem legenda à parte: os nomes na ponta e a lista logo abaixo são a
 * legenda. O ponteiro (ou o dedo) escolhe um pregão e a linha mais perto dele; a leitura fica com quem
 * chama, que troca o número grande da tela. O desenho é SVG esticado na largura (o traço não estica) e todo
 * texto é HTML, para não deformar.
 *
 * 25/11/2026: era o gráfico da página "Comparar robôs", que deixou de existir; hoje é a opção "Lado a lado"
 * da curva da página inicial. A régua e o rótulo do eixo são os que o GraficoResultado exporta.
 */
export function GraficoComparativo({ dias, series, destaque, ativo, aoApontar, aoDestacar, className }: Props) {
  const n = dias.length;

  // o traçado não depende do ponteiro: fica guardado enquanto o período e os robôs não mudam
  const desenho = useMemo(() => {
    const valores: number[] = [];
    for (const s of series) for (const v of s.acumulado) if (v !== null) valores.push(v);
    const escala = escalaJusta(valores);
    const x = (i: number) => ((i + 0.5) / Math.max(1, n)) * 100;
    const linhas = series.map((s, ordem) => {
      const partes: string[] = [];
      let ultimo: number | null = null;
      for (let i = 0; i < s.acumulado.length; i += 1) {
        const v = s.acumulado[i];
        if (v === null) continue;
        partes.push(`${partes.length === 0 ? "M" : "L"}${f(x(i))},${f(escala.y(v))}`);
        ultimo = v;
      }
      // a maior queda: o trecho da linha entre o pico e o fundo (quando ela é a do primeiro pregão, partindo
      // de zero, não há trecho para pintar, mas o valor continua escrito ao lado, como no GraficoResultado)
      const q = s.queda && s.queda.valor > 0 && s.queda.iFundo >= s.queda.iInicio ? s.queda : null;
      const trecho: string[] = [];
      if (q) {
        for (let i = q.iInicio; i <= q.iFundo; i += 1) {
          const v = s.acumulado[i];
          if (v !== null && v !== undefined) trecho.push(`${trecho.length === 0 ? "M" : "L"}${f(x(i))},${f(escala.y(v))}`);
        }
      }
      const noPico = q ? s.acumulado[q.iInicio] : null;
      return {
        slug: s.slug,
        nome: s.nome,
        tom: tomDe(ordem),
        d: partes.join(""),
        ultimo,
        queda: q && noPico !== null && noPico !== undefined ? { d: trecho.join(""), x: x(q.iInicio), y: escala.y(noPico), valor: q.valor } : null,
      };
    });
    const nomes = espalhar(linhas.flatMap((l) => (l.ultimo === null ? [] : [{ slug: l.slug, y: escala.y(l.ultimo) }])));
    return { escala, x, linhas, nomes };
  }, [series, n]);

  if (n < 2 || series.length === 0) {
    return (
      <p className={cn("py-16 text-sm text-muted-foreground", className)}>Ainda não há pregões suficientes para desenhar as curvas.</p>
    );
  }

  const { escala, x, linhas, nomes } = desenho;
  const principal = linhas.find((l) => l.slug === destaque) ?? null;
  // um destaque que não está entre as curvas (robô sem pregão no período) não apaga as outras
  const semDestaque = principal === null;
  const serieDoDestaque = principal ? (series.find((s) => s.slug === principal.slug) ?? null) : null;

  // embaixo: os anos quando o período passa de um ano e meio, os meses quando é longo, umas seis datas quando é curto
  const rotulos: { i: number; texto: string }[] = [];
  if (n > 400) {
    dias.forEach((d, i) => {
      if (i > 0 && d.slice(0, 4) !== dias[i - 1].slice(0, 4)) rotulos.push({ i, texto: d.slice(0, 4) });
    });
  } else if (n > 70) {
    dias.forEach((d, i) => {
      if (i === 0 || d.slice(0, 7) !== dias[i - 1].slice(0, 7)) rotulos.push({ i, texto: mesCurto(d) });
    });
    // o primeiro mês pode ter poucos pregões e encostar no seguinte
    if (rotulos.length > 1 && x(rotulos[1].i) - x(rotulos[0].i) < 4) rotulos.shift();
  } else {
    const quantos = Math.min(6, n);
    for (let k = 0; k < quantos; k += 1) {
      const i = Math.round((k / (quantos - 1)) * (n - 1));
      rotulos.push({ i, texto: diaCurto(dias[i]) });
    }
  }

  // o pregão pela posição horizontal e, nele, a linha mais perto do ponteiro na vertical
  const apontar = (e: React.PointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - caixa.left) / (caixa.width || 1)) * n)));
    const altura = ((e.clientY - caixa.top) / (caixa.height || 1)) * 100;
    let perto: string | null = null;
    let menor = Infinity;
    for (const s of series) {
      const v = s.acumulado[i];
      if (v === null || v === undefined) continue;
      const distancia = Math.abs(escala.y(v) - altura);
      if (distancia < menor) {
        menor = distancia;
        perto = s.slug;
      }
    }
    aoApontar(i);
    aoDestacar(perto);
  };
  const sair = () => {
    aoApontar(null);
    aoDestacar(null);
  };

  const valorNaMira = ativo !== null && ativo < n && serieDoDestaque ? serieDoDestaque.acumulado[ativo] : null;

  return (
    // a calha da direita é do eixo de valores, como no GraficoResultado
    <div
      role="img"
      aria-label="Curvas do resultado acumulado de cada robô no período, na mesma escala, com a maior queda em vermelho"
      className={cn("pr-16 sm:pr-20", className)}
    >
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto]">
        {/* as guias atravessam o desenho e a faixa dos nomes; o valor de cada uma vai na calha */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ height: ALTURA }}>
          {escala.marcas.map((m) => (
            <div
              key={m}
              className={cn("absolute inset-x-0 border-t", m === 0 ? "border-dashed border-(--painel-fio-forte)" : "border-(--painel-fio)")}
              style={{ top: `${escala.y(m)}%` }}
            >
              <span className="absolute top-0 left-full -translate-y-1/2 pl-3 text-xs leading-none whitespace-nowrap text-sutil">
                {noEixo(m)}
              </span>
            </div>
          ))}
        </div>

        <div className="min-w-0">
          <div
            className="relative cursor-crosshair touch-pan-y"
            style={{ height: ALTURA }}
            onPointerMove={apontar}
            onPointerDown={apontar}
            onPointerLeave={sair}
          >
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 block size-full overflow-visible">
              {semDestaque ? (
                <>
                  {/* de trás para a frente: a linha mais forte fica por cima */}
                  {[...linhas].reverse().map((l) => (
                    <path key={l.slug} d={l.d} fill="none" stroke={l.tom.traco} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  ))}
                  {linhas.map((l) =>
                    l.queda && l.queda.d ? (
                      <path key={l.slug} d={l.queda.d} fill="none" stroke="var(--negativo)" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    ) : null,
                  )}
                </>
              ) : (
                <>
                  {/* as apagadas primeiro, a do destaque por cima */}
                  {linhas.map((l) =>
                    l === principal ? null : (
                      <path key={l.slug} d={l.d} fill="none" stroke="var(--sutil)" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    ),
                  )}
                  <path d={principal.d} fill="none" stroke="var(--foreground)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  {principal.queda && principal.queda.d ? (
                    <path d={principal.queda.d} fill="none" stroke="var(--negativo)" strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  ) : null}
                </>
              )}
            </svg>
            {principal?.queda ? (
              <span
                className={cn("absolute -mt-7 text-xs leading-tight whitespace-nowrap text-muted-foreground", principal.queda.x > 50 && "-translate-x-full")}
                style={{ left: `${principal.queda.x}%`, top: `${principal.queda.y}%` }}
              >
                maior queda <b className="font-medium text-negativo">{formatarBRL(-principal.queda.valor, { sinal: true, inteiro: true })}</b>
              </span>
            ) : null}
            {/* a ponta da curva em destaque: onde o resultado dela está hoje */}
            {principal && principal.ultimo !== null ? (
              <i aria-hidden className="absolute size-[7px] -translate-1/2 rounded-full bg-foreground" style={{ left: `${x(n - 1)}%`, top: `${escala.y(principal.ultimo)}%` }} />
            ) : null}
            {/* a mira: um fio no pregão apontado, com o ponto sobre a curva em destaque */}
            {ativo !== null && ativo < n ? (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-(--painel-fio-forte)" style={{ left: `${x(ativo)}%` }}>
                {valorNaMira !== null && valorNaMira !== undefined ? (
                  <i
                    className="absolute left-1/2 size-[9px] -translate-1/2 rounded-full border-2 border-background bg-foreground"
                    style={{ top: `${escala.y(valorNaMira)}%` }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          <div aria-hidden className="relative h-7 text-xs text-sutil">
            {rotulos.map((r, k) => (
              <span
                key={r.i}
                // no celular não cabem doze meses: um sim, um não
                className={cn("absolute top-2.5 -translate-x-1/2 leading-none whitespace-nowrap", rotulos.length > 7 && k % 2 === 1 && "max-sm:hidden")}
                style={{ left: `${x(r.i)}%` }}
              >
                {r.texto}
              </span>
            ))}
          </div>
        </div>

        {/* o nome de cada robô na ponta da linha dele; as cópias invisíveis só dão a largura da faixa */}
        <div aria-hidden className="relative text-[0.8125rem]" style={{ height: ALTURA }} onPointerLeave={() => aoDestacar(null)}>
          {linhas.map((l) => (
            <span key={l.slug} className="invisible block h-0 overflow-hidden pl-2.5 font-medium whitespace-nowrap max-sm:max-w-20">
              {l.nome}
            </span>
          ))}
          {linhas.map((l) => {
            const y = nomes.get(l.slug);
            if (y === undefined) return null;
            return (
              <span
                key={l.slug}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") aoDestacar(l.slug);
                }}
                className={cn(
                  "absolute left-0 max-w-full -translate-y-1/2 truncate py-0.5 pl-2.5 leading-none transition-colors",
                  semDestaque ? l.tom.nome : l === principal ? "font-medium text-foreground" : "text-sutil",
                )}
                style={{ top: `${y}%` }}
              >
                {l.nome}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
