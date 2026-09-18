"use client";

import { cn } from "cn";
import { AtualizadoHa } from "@/components/compartilhados/AtualizadoHa";
import { Valor } from "@/components/compartilhados/Valor";
import { useAgora } from "@/hooks/useAgora";
import { formatarNumero, formatarPreco } from "@/lib/formato";
import { pregaoAberto } from "@/lib/stats/pregao";
import { useCasa } from "./CasaAoVivoProvider";

function Separador() {
  return <span aria-hidden className="text-muted-foreground/40">·</span>;
}

/** Item 1 da home: pregão, WIN/WDO agora, robôs posicionados, resultado da casa. */
export function BarraAoVivo() {
  const { estado, feriados, pregaoGeral } = useCasa();
  const agora = useAgora(5000);

  const aberto = agora ? pregaoAberto(agora, pregaoGeral, feriados) : null;
  const resumo = estado.resumo;

  const posicionados =
    resumo?.n_robos_posicionados ??
    Object.values(estado.coleta).filter((c) => c.posicionado).length;

  const ultimoHeartbeat = Object.values(estado.coleta)
    .map((c) => c.ultimo_heartbeat_em)
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);
  const atualizadoEm = estado.ultimaMensagemEm ?? ultimoHeartbeat ?? resumo?.gerado_em ?? null;

  return (
    <div className="border-b bg-muted/40 text-xs">
      <div className="conteudo flex h-9 items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
        <span className={cn("font-medium", aberto ? "text-positivo" : "")}>
          {aberto === null ? "Pregão" : aberto ? "Pregão aberto" : "Pregão fechado"}
        </span>

        {estado.mercado
          .filter((m) => m.preco !== null)
          .map((m) => (
            <span key={m.prefixo_simbolo} className="inline-flex items-center gap-1.5">
              <Separador />
              <span className="font-medium">{m.prefixo_simbolo}</span>
              <span className="tabular-nums">{formatarPreco(m.preco ?? 0)}</span>
              {m.variacao_pct !== null ? (
                <span
                  className={cn(
                    "tabular-nums",
                    m.variacao_pct > 0
                      ? "text-positivo"
                      : m.variacao_pct < 0
                        ? "text-negativo"
                        : "text-muted-foreground",
                  )}
                >
                  {formatarNumero(m.variacao_pct, 2, true)}%
                </span>
              ) : null}
            </span>
          ))}

        <Separador />
        <span className="tabular-nums">
          {posicionados} {posicionados === 1 ? "robô posicionado" : "robôs posicionados"}
        </span>

        {resumo ? (
          <>
            <Separador />
            <span className="inline-flex items-center gap-1">
              Casa hoje
              <Valor valor={resumo.resultado_liquido_por_contrato} className="font-semibold" />
              <span className="text-muted-foreground">/ct</span>
            </span>
          </>
        ) : null}

        <span className="ml-auto pl-3">
          <AtualizadoHa em={atualizadoEm} />
        </span>
      </div>
    </div>
  );
}
