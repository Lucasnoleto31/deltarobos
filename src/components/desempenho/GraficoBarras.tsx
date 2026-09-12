"use client";

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
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="rotulo"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            width={58}
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
              <Cell
                key={i}
                fill={contagem ? "var(--info)" : d.valor >= 0 ? "var(--positivo)" : "var(--negativo)"}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
