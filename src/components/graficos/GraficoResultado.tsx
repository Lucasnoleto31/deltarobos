"use client";

import { cn } from "cn";
import { formatarBRL } from "@/lib/formato";
import { escala, passo } from "./base";

export interface DiaDoGrafico {
  dia: string;
  /** o resultado do pregão */
  valor: number;
  /** o acumulado do período até este pregão */
  acumulado: number;
}

/** A maior queda do período: do ponto mais alto (índice do pregão, ou -1 se é o ponto de partida) até o mais baixo depois dele. */
export interface QuedaDoGrafico {
  iInicio: number;
  iFundo: number;
  valor: number;
}

interface Props {
  dias: DiaDoGrafico[];
  queda?: QuedaDoGrafico | null;
  /** o pregão sob o ponteiro (quem chama mostra a leitura dele; aqui só se desenha a mira) */
  ativo: number | null;
  aoApontar: (indice: number | null) => void;
  /** desenha, embaixo da curva e no mesmo eixo de tempo, o resultado de cada pregão em barras (só faz sentido em período curto) */
  barras?: boolean;
  className?: string;
}

// a altura da curva: quem chama pode fixar com --alt-curva; o padrão é o que sobra na primeira tela
const ALTURA_DA_CURVA = "var(--alt-curva, clamp(14rem, calc(100dvh - 39rem), 30rem))";

const fmtMes = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const mesCurto = (dia: string) => fmtMes.format(new Date(`${dia}T12:00:00Z`)).replace(".", "");
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * A régua da curva, justa: vai do menor ao maior valor com uma folga pequena, e as marcas são os valores
 * redondos que caem dentro. A `escala` das barras arredonda o fundo e o topo para o passo inteiro, e uma
 * curva que mal passa abaixo de zero ganhava um terço do gráfico vazio ("−R$ 50 mil" numa série de −R$ 2 mil).
 * O zero entra sempre, e fica na borda de baixo quando a curva não desce dele.
 */
export function escalaJusta(valores: number[]) {
  const max = valores.reduce((m, v) => Math.max(m, v), 0);
  const min = valores.reduce((m, v) => Math.min(m, v), 0);
  const amplitude = max - min || 1;
  const topo = max + amplitude * 0.08;
  const fundo = min < 0 ? min - amplitude * 0.06 : 0;
  const p = passo(amplitude, 4);
  const marcas: number[] = [];
  for (let v = Math.ceil(fundo / p) * p; v <= topo; v += p) marcas.push(Math.round(v * 100) / 100);
  const y = (v: number) => ((topo - v) / (topo - fundo)) * 100;
  return { marcas, y };
}

/** "R$ 40 mil" a partir de mil: o eixo não precisa dos centavos. */
export function noEixo(v: number): string {
  if (v === 0) return "R$ 0";
  if (Math.abs(v) >= 1000) {
    const mil = Math.abs(v) / 1000;
    return `${v < 0 ? "−" : ""}R$ ${mil.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return formatarBRL(v, { inteiro: true });
}

/**
 * A curva do resultado acumulado (ficha Mesa, 25/11/2026). É a assinatura visual do sistema: uma linha fina
 * na cor do texto e, pintado de vermelho na própria linha, o trecho da maior queda, do ponto mais alto ao
 * mais baixo que veio depois, com o valor escrito ao lado. Quem nunca ouviu "drawdown" vê o que é em vez
 * de ler uma definição. Verde não entra: fica para número de ganho.
 *
 * Sem caixa, sem área preenchida, sem gradiente, sem biblioteca. O desenho é SVG esticado na largura (o traço
 * não estica) e todo texto é HTML, para não deformar. O ponteiro (ou o dedo) escolhe um pregão; a leitura dele
 * fica com quem chama, que troca o número grande da tela. Com `barras`, o resultado de cada pregão aparece
 * embaixo, no mesmo eixo de tempo.
 */
export function GraficoResultado({ dias, queda, ativo, aoApontar, barras = false, className }: Props) {
  const n = dias.length;
  if (n < 2) {
    return (
      <p className={cn("py-16 text-sm text-muted-foreground", className)}>Ainda não há pregões suficientes para desenhar a curva.</p>
    );
  }

  // cada pregão ocupa uma coluna; o ponto fica no meio dela, alinhado com a barra do mesmo dia
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const curva = escalaJusta(dias.map((d) => d.acumulado));
  const f = (v: number) => (Math.round(v * 1000) / 1000).toString();
  const ponto = (i: number) => `${f(x(i))},${f(curva.y(dias[i].acumulado))}`;
  const ultimo = dias[n - 1];

  const linha = dias.map((_, i) => `${i === 0 ? "M" : "L"}${ponto(i)}`).join("");

  // a maior queda: o trecho da linha entre o pico (ou a partida) e o fundo
  const temQueda = queda && queda.valor > 0 && queda.iFundo > queda.iInicio;
  const iPico = temQueda ? Math.max(0, queda.iInicio) : 0;
  const trechoDaQueda = temQueda
    ? Array.from({ length: queda.iFundo - iPico + 1 }, (_, k) => `${k === 0 ? "M" : "L"}${ponto(iPico + k)}`).join("")
    : null;
  const pico = temQueda ? { x: x(iPico), y: curva.y(dias[iPico].acumulado) } : null;

  // embaixo: os anos quando o período passa de um ano e meio, os meses quando é longo, umas seis datas quando é curto
  const rotulos: { i: number; texto: string }[] = [];
  if (n > 400) {
    dias.forEach((d, i) => {
      if (i > 0 && d.dia.slice(0, 4) !== dias[i - 1].dia.slice(0, 4)) rotulos.push({ i, texto: d.dia.slice(0, 4) });
    });
  } else if (n > 70) {
    dias.forEach((d, i) => {
      if (i === 0 || d.dia.slice(0, 7) !== dias[i - 1].dia.slice(0, 7)) rotulos.push({ i, texto: mesCurto(d.dia) });
    });
    // o primeiro mês pode ter poucos pregões e encostar no seguinte
    if (rotulos.length > 1 && x(rotulos[1].i) - x(rotulos[0].i) < 4) rotulos.shift();
  } else {
    const quantos = Math.min(6, n);
    for (let k = 0; k < quantos; k++) {
      const i = Math.round((k / (quantos - 1)) * (n - 1));
      rotulos.push({ i, texto: diaCurto(dias[i].dia) });
    }
  }

  const porDia = barras ? escala(dias.map((d) => d.valor)) : null;
  const larguraDaBarra = (100 / n) * 0.62;

  const apontar = (e: React.PointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const fracao = (e.clientX - caixa.left) / (caixa.width || 1);
    aoApontar(Math.min(n - 1, Math.max(0, Math.floor(fracao * n))));
  };

  return (
    // a calha da direita é do eixo de valores
    <div role="img" aria-label="Curva do resultado acumulado, com a maior queda em vermelho" className={cn("pr-16 sm:pr-20", className)}>
      <div
        className="relative cursor-crosshair touch-pan-y"
        onPointerMove={apontar}
        onPointerDown={apontar}
        onPointerLeave={() => aoApontar(null)}
      >
        <div className="relative" style={{ height: ALTURA_DA_CURVA }}>
          {curva.marcas.map((m) => (
            <div
              key={m}
              aria-hidden
              className={cn("absolute inset-x-0 border-t", m === 0 ? "border-dashed border-(--painel-fio-forte)" : "border-(--painel-fio)")}
              style={{ top: `${curva.y(m)}%` }}
            >
              <span className="absolute top-0 left-full -translate-y-1/2 pl-3 text-xs leading-none whitespace-nowrap text-sutil">
                {noEixo(m)}
              </span>
            </div>
          ))}
          <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 block size-full overflow-visible">
            <path d={linha} fill="none" stroke="var(--foreground)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {trechoDaQueda ? (
              <path d={trechoDaQueda} fill="none" stroke="var(--negativo)" strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ) : null}
          </svg>
          {pico && queda ? (
            <span
              className={cn("absolute -mt-7 text-xs leading-tight whitespace-nowrap text-muted-foreground", pico.x > 50 && "-translate-x-full")}
              style={{ left: `${pico.x}%`, top: `${pico.y}%` }}
            >
              maior queda <b className="font-medium text-negativo">{formatarBRL(-queda.valor, { sinal: true, inteiro: true })}</b>
            </span>
          ) : null}
          {/* a ponta da curva: onde o resultado está hoje */}
          <i aria-hidden className="absolute size-[7px] -translate-1/2 rounded-full bg-foreground" style={{ left: `${x(n - 1)}%`, top: `${curva.y(ultimo.acumulado)}%` }} />
        </div>

        {porDia ? (
          <div className="relative mt-8 h-14 lg:h-16">
            <small className="absolute -top-5 left-0 text-[11px] leading-none text-sutil">resultado de cada dia</small>
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 block size-full">
              {dias.map((d, i) => {
                if (d.valor === 0) return null;
                const zero = porDia.y(0);
                return (
                  <rect
                    key={d.dia}
                    x={f(x(i) - larguraDaBarra / 2)}
                    y={f(Math.min(porDia.y(d.valor), zero))}
                    width={f(larguraDaBarra)}
                    height={f(Math.abs(porDia.y(d.valor) - zero))}
                    fill={d.valor > 0 ? "var(--positivo)" : "var(--negativo)"}
                    opacity={ativo === null || ativo === i ? 1 : 0.55}
                  />
                );
              })}
            </svg>
            <div aria-hidden className="absolute inset-x-0 border-t border-(--painel-fio-forte)" style={{ top: `${porDia.y(0)}%` }} />
          </div>
        ) : null}

        {/* a mira: um fio no pregão apontado, com o ponto sobre a curva */}
        {ativo !== null && ativo < n ? (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-(--painel-fio-forte)" style={{ left: `${x(ativo)}%` }}>
            <i
              className="absolute left-1/2 size-[9px] -translate-1/2 rounded-full border-2 border-background bg-foreground"
              style={{ top: `calc(${ALTURA_DA_CURVA} * ${curva.y(dias[ativo].acumulado) / 100})` }}
            />
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
  );
}
