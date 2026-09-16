"use client";

import { useId } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatarBRL, formatarPontos } from "@/lib/formato";
import type { Unidade } from "@/lib/stats/tipos";

export interface DadoBarra {
  rotulo: string;
  valor: number;
  n?: number;
}

interface Props {
  dados: DadoBarra[];
  unidade: Unidade;
  altura?: number;
  /** barras sempre neutras (histograma de contagem) */
  contagem?: boolean;
}

function formatar(v: number, unidade: Unidade, contagem: boolean): string {
  if (contagem) return `${Math.round(v)} op.`;
  return unidade === "brl" ? formatarBRL(v, { inteiro: Math.abs(v) >= 1000 }) : `${formatarPontos(v)} pts`;
}

/** Barras verticais coloridas pelo sinal (mensal, dia da semana, hora, histograma). */
export function GraficoBarras({ dados, unidade, altura = 220, contagem = false }: Props) {
  // um id por gráfico: a página de desempenho tem vários, e os gradientes não podem colidir
  const idBruto = useId();
  const id = `barra-${idBruto.replace(/[^a-zA-Z0-9]/g, "")}`;
  const preenchimento = (v: number) => `url(#${id}-${contagem ? "info" : v >= 0 ? "pos" : "neg"})`;

  if (dados.length === 0) {
    return (
      <div className="grid place-items-center text-sm text-muted-foreground" style={{ height: altura }}>
        Sem dados no período.
      </div>
    );
  }

  return (
    <div style={{ height: altura }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {/* defs direto no gráfico: o Recharts só reconhece filhos diretos. Barra com gradiente no eixo
              vertical, forte na ponta do valor e esmaecida junto do zero (kit estético, bloco 4). */}
          <defs>
            <linearGradient id={`${id}-pos`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--positivo)" stopOpacity={0.95} />
              <stop offset="100%" stopColor="var(--positivo)" stopOpacity={0.35} />
            </linearGradient>
            <linearGradient id={`${id}-neg`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--negativo)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--negativo)" stopOpacity={0.95} />
            </linearGradient>
            <linearGradient id={`${id}-info`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--info)" stopOpacity={0.95} />
              <stop offset="100%" stopColor="var(--info)" stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
          <XAxis
            dataKey="rotulo"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            width={72}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => (contagem ? String(v) : unidade === "brl" ? formatarBRL(v, { inteiro: true }) : formatarPontos(v))}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(v) => [formatar(Number(v), unidade, contagem), contagem ? "Operações" : "Resultado"]}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {dados.map((d, i) => (
              <Cell key={i} fill={preenchimento(d.valor)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
