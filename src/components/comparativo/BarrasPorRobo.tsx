"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RotuloComInfo } from "@/components/compartilhados/InfoIndicador";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { Valor } from "@/components/compartilhados/Valor";
import { PERIODOS_RESUMO, type PeriodoFechado } from "@/components/robo/periodos-resumo";
import { corDoRobo } from "@/lib/cores-robo";
import { formatarNumero } from "@/lib/formato";
import { PontoDoRobo } from "./PontoDoRobo";
import type { ResumoPorPeriodo } from "./resumo-por-periodo";

export interface RoboParaBarras {
  slug: string;
  nome: string;
  ativo: string;
  /** robos.ordem: a cor do robô (corDoRobo), nunca pelo slug */
  ordem: number;
  /** já somado no servidor: a série diária não desce ao navegador (18/09/2026) */
  porPeriodo: ResumoPorPeriodo;
}

interface Props {
  robos: RoboParaBarras[];
}

const OPCOES = PERIODOS_RESUMO.filter((p) => p.valor !== "hoje") as ReadonlyArray<{ valor: PeriodoFechado; rotulo: string }>;

/**
 * Os robôs lado a lado num período só (18/09/2026, "deixe o comparativo mais intuitivo e útil"): uma
 * barra por robô, do maior para o menor, com o resultado, as operações e os pregões do recorte. Sem
 * curva: aqui a pergunta é "qual rendeu mais neste mês", e a barra responde de relance.
 * 19/09/2026: o "por 1 contrato, líquido de custos" saiu daqui; a página já diz isso uma vez no topo. O
 * número da posição também saiu: a ordem da lista já diz.
 * 13/10/2026 (mídia kit da Zeve, "cor por robô"): a barra é a cor do robô, com o ponto da mesma cor ao lado do
 * nome, e o número pinta pelo sinal. Como a cor da barra não diz mais o sinal, a barra diz pela direção: com
 * robô no negativo, o trilho ganha a marca do zero e o negativo cresce para a esquerda dela, o positivo para a
 * direita, na mesma escala. Sem nenhum negativo, tudo nasce da esquerda, como antes.
 */
export function BarrasPorRobo({ robos }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoFechado>("mes");

  const linhas = useMemo(
    () => robos.map((r) => ({ ...r, ...r.porPeriodo[periodo] })).sort((a, b) => b.total - a.total),
    [robos, periodo],
  );

  // a escala: o maior positivo à direita do zero e o maior negativo à esquerda dele
  const comDias = linhas.filter((l) => l.nDias > 0);
  const maiorAlta = Math.max(0, ...comDias.map((l) => l.total));
  const maiorBaixa = Math.max(0, ...comDias.map((l) => -l.total));
  const escala = maiorAlta + maiorBaixa > 0 ? maiorAlta + maiorBaixa : 1;
  /** onde fica o zero no trilho, em % da largura (0 = tudo positivo, 100 = tudo negativo) */
  const zero = (maiorBaixa / escala) * 100;

  return (
    <section className="painel">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5">
        <h2 className="font-semibold">
          <RotuloComInfo chave="quemRendeuMais">Quem rendeu mais</RotuloComInfo>
        </h2>
        <Segmentado ariaLabel="Período" opcoes={OPCOES} valor={periodo} onChange={setPeriodo} />
      </div>
      <ol className="p-4 sm:p-5">
        {linhas.map((r) => {
          const largura = r.nDias === 0 ? 0 : Math.max(2, Math.round((Math.abs(r.total) / escala) * 100));
          const esquerda = r.total >= 0 ? zero : Math.max(0, zero - largura);
          return (
            <li key={r.slug} className="sep [--sep:0px] grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_auto] items-center gap-4 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/robos/${r.slug}`} className="flex items-center gap-2 font-medium hover:underline">
                  <PontoDoRobo ordem={r.ordem} />
                  <span className="truncate">{r.nome}</span>
                </Link>
                <span className="pl-4 text-xs text-muted-foreground">{r.ativo}</span>
              </div>
              <div className="relative h-2 rounded-full bg-muted">
                {zero > 0 && zero < 100 ? (
                  <span aria-hidden className="absolute -inset-y-1 w-px bg-(--painel-fio-forte)" style={{ left: `${zero}%` }} />
                ) : null}
                <div
                  className="absolute inset-y-0 rounded-full transition-[left,width] duration-500 motion-reduce:transition-none"
                  style={{ left: `${esquerda}%`, width: `${largura}%`, background: corDoRobo(r.ordem) }}
                />
              </div>
              <div className="w-32 text-right">
                {r.nDias === 0 ? (
                  <span className="text-muted-foreground">sem operações</span>
                ) : (
                  <>
                    <Valor valor={r.total} inteiro={Math.abs(r.total) >= 1000} className="font-semibold" />
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {formatarNumero(r.nOps)} op · {formatarNumero(r.nDias)} {r.nDias === 1 ? "pregão" : "pregões"}
                    </p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
