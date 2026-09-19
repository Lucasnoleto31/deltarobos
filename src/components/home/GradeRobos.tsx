"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { useAgora } from "@/hooks/useAgora";
import { formatarBRL } from "@/lib/formato";
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
 * filtro por ativo e busca. Nada de robô hardcoded. Com o pregão do ativo fechado e sem operação
 * hoje, o cartão mostra o último pregão do robô (19/09/2026); o robô sem coletor (selo Histórico)
 * nunca opera ao vivo, então mostra o último pregão também com o pregão aberto.
 */
export function GradeRobos({ cards }: Props) {
  const { estado, feriados, pregaoPorAtivo, pregaoGeral, pregaoAbertoNoServidor, hoje: hojeDaCasa } = useCasa();
  const agora = useAgora(5000);
  const [ativo, setAtivo] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const ativos = useMemo(() => [...new Set(cards.map((c) => c.ativo))].sort(), [cards]);

  const mesclados = useMemo(() => {
    return cards.map((card) => {
      const vivo = estado.resumo?.robos.find((r) => r.slug === card.slug);
      const coleta = estado.coleta[card.slug];
      const hoje = vivo ? vivo.resultado_liquido_por_contrato : card.hoje;
      // Mês e acumulado do servidor já trazem o card.hoje; entra só o que o resumo tem além dele. Se o
      // resumo já é de outro dia (página montada ontem, lida hoje), o dia do servidor fica onde está e o
      // resumo entra inteiro: antes o resultado de ontem saía do mês e do acumulado (19/09/2026).
      const delta = vivo ? hoje - (estado.resumo?.dia === hojeDaCasa ? card.hoje : 0) : 0;
      return {
        ...card,
        hoje,
        hojeOperacoes: vivo?.n_operacoes,
        hojeGains: vivo?.n_gain,
        mes: card.mes + delta,
        acumulado: card.acumulado + delta,
        posicionado: coleta?.posicionado ?? vivo?.posicionado ?? card.posicionado,
        ultimoHeartbeatEm: coleta?.ultimo_heartbeat_em ?? card.ultimoHeartbeatEm,
      };
    });
  }, [cards, estado.resumo, estado.coleta, hojeDaCasa]);

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

  // o subtítulo é o fato do mês, não a descrição da seção ("Resultado por 1 contrato... ordenado pelo mês"
  // o Artur achou descritivo demais, 18/09/2026). A regra do por contrato e do líquido está no hero.
  const lider = mesclados
    .filter((c) => c.status !== "em_breve" && c.nDias > 0)
    .reduce<(typeof mesclados)[number] | null>((m, c) => (m === null || c.mes > m.mes ? c : m), null);
  const nomeDoMes = new Date(`${hojeDaCasa}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const subtitulo =
    lider && lider.mes > 0
      ? `${lider.nome} lidera ${nomeDoMes}: ${formatarBRL(lider.mes, { sinal: true, inteiro: Math.abs(lider.mes) >= 1000 })} por contrato.`
      : lider
        ? `Em ${nomeDoMes}, ninguém no positivo até agora.`
        : "Resultado por 1 contrato, líquido de custos.";

  return (
    <section id="robos" className="conteudo scroll-mt-20 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Os robôs</h2>
          <p className="text-sm text-muted-foreground">{subtitulo}</p>
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
        <p className="painel p-5 text-sm text-muted-foreground">
          {cards.length === 0 ? "Nenhum robô cadastrado." : "Nenhum robô bate com o filtro."}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((card, i) => {
            const pregao = pregaoPorAtivo[card.ativo] ?? pregaoGeral;
            const aberto = agora ? pregaoAberto(agora, pregao, feriados) : false;
            // para o número do cartão, sem relógio vale o que o servidor calculou, como no hero: antes da
            // abertura o HTML já chega com o último pregão (19/09/2026)
            const fechado = agora ? !aberto : !pregaoAbertoNoServidor;
            const operouHoje = (card.hojeOperacoes ?? 0) > 0 || card.hoje !== 0;
            const status = statusAoVivo({
              status: card.status,
              posicionado: card.posicionado,
              ultimoHeartbeatEm: card.ultimoHeartbeatEm,
              horarioInicio: card.horarioInicio,
              horarioFim: card.horarioFim,
              pregaoAberto: aberto,
              agora: agora ?? new Date(0),
              temColetor: card.temColetor,
            });
            return (
              <li key={card.slug}>
                <CardRobo
                  card={card}
                  status={status}
                  hojeOperacoes={card.hojeOperacoes}
                  hojeGains={card.hojeGains}
                  ultimoPregao={(fechado || !card.temColetor) && !operouHoje ? card.ultimoPregao : null}
                  atraso={Math.min(i, 8) * 70}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
