"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { useAgora } from "@/hooks/useAgora";
import { pregaoAberto } from "@/lib/stats/pregao";
import { statusAoVivo } from "@/lib/stats/status-robo";
import { CardRobo } from "./CardRobo";
import { useCasa } from "./CasaAoVivoProvider";
import type { DadosCardRobo } from "./tipos";

interface Props {
  cards: DadosCardRobo[];
}

const LIMITE_FILTROS = 6;

/**
 * Item 3 da home: grid responsivo de robôs, ordenado pelo mês, com os
 * números do dia atualizados pelo realtime. Com mais de 6 robôs aparecem
 * filtro por ativo e busca. Nada de robô hardcoded.
 */
export function GradeRobos({ cards }: Props) {
  const { estado, feriados, pregaoPorAtivo, pregaoGeral } = useCasa();
  const agora = useAgora(5000);
  const [ativo, setAtivo] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const ativos = useMemo(() => [...new Set(cards.map((c) => c.ativo))].sort(), [cards]);

  const mesclados = useMemo(() => {
    return cards.map((card) => {
      const vivo = estado.resumo?.robos.find((r) => r.slug === card.slug);
      const coleta = estado.coleta[card.slug];
      const hoje = vivo ? vivo.resultado_liquido_por_contrato : card.hoje;
      const delta = hoje - card.hoje; // operações fechadas depois do render do servidor
      return {
        ...card,
        hoje,
        mes: card.mes + delta,
        acumulado: card.acumulado + delta,
        posicionado: coleta?.posicionado ?? vivo?.posicionado ?? card.posicionado,
        ultimoHeartbeatEm: coleta?.ultimo_heartbeat_em ?? card.ultimoHeartbeatEm,
      };
    });
  }, [cards, estado.resumo, estado.coleta]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return mesclados
      .filter((c) => ativo === "todos" || c.ativo === ativo)
      .filter((c) => !termo || c.nome.toLowerCase().includes(termo) || c.slug.includes(termo))
      .sort((a, b) => {
        const aBreve = a.status === "em_breve" ? 1 : 0;
        const bBreve = b.status === "em_breve" ? 1 : 0;
        if (aBreve !== bBreve) return aBreve - bBreve;
        return b.mes - a.mes;
      });
  }, [mesclados, ativo, busca]);

  const mostrarFiltros = cards.length > LIMITE_FILTROS;

  return (
    <section id="robos" className="conteudo scroll-mt-20 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Os robôs</h2>
          <p className="text-sm text-muted-foreground">
            Resultado por 1 contrato, líquido de custos. Ordenado pelo mês.
          </p>
        </div>

        {mostrarFiltros ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segmentado
              ariaLabel="Filtrar por ativo"
              opcoes={[{ valor: "todos", rotulo: "Todos" }, ...ativos.map((a) => ({ valor: a, rotulo: a }))]}
              valor={ativo}
              onChange={setAtivo}
            />
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar robô"
                aria-label="Buscar robô"
                className="h-8 w-40 rounded-lg border bg-background pr-2 pl-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </label>
          </div>
        ) : null}
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {cards.length === 0 ? "Nenhum robô cadastrado ainda." : "Nenhum robô bate com o filtro."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((card) => {
            const pregao = pregaoPorAtivo[card.ativo] ?? pregaoGeral;
            const aberto = agora ? pregaoAberto(agora, pregao, feriados) : false;
            const status = statusAoVivo({
              status: card.status,
              posicionado: card.posicionado,
              ultimoHeartbeatEm: card.ultimoHeartbeatEm,
              horarioInicio: card.horarioInicio,
              horarioFim: card.horarioFim,
              pregaoAberto: aberto,
              agora: agora ?? new Date(0),
            });
            return (
              <li key={card.slug}>
                <CardRobo card={card} status={status} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
