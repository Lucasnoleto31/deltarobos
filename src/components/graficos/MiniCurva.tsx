"use client";

import { cn } from "cn";
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

interface Props {
  /** acumulado ponto a ponto */
  pontos: number[];
  altura?: number;
  className?: string;
}

/** Sparkline do card: verde se terminou positivo, vermelho se negativo. */
export function MiniCurva({ pontos, altura = 44, className }: Props) {
  const idBruto = useId();
  const id = `mini-${idBruto.replace(/[^a-zA-Z0-9]/g, "")}`;

  if (pontos.length < 2) {
    return (
      <div
        className={cn("flex items-center text-xs text-muted-foreground", className)}
        style={{ height: altura }}
      >
        Sem histórico suficiente
      </div>
    );
  }

  const positivo = pontos[pontos.length - 1] >= 0;
  const cor = positivo ? "var(--positivo)" : "var(--negativo)";
  const dados = pontos.map((v, i) => ({ i, v }));

  return (
    <div className={cn("w-full", className)} style={{ height: altura }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={cor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={cor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={cor}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
