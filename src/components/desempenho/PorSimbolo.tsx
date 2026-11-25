import { cn } from "cn";
import { Valor } from "@/components/compartilhados/Valor";
import { formatarNumero, formatarPct } from "@/lib/formato";
import type { FaixaSimbolo } from "@/lib/stats/operacoes";
import type { Unidade } from "@/lib/stats/tipos";

interface Props {
  faixas: FaixaSimbolo[];
  unidade: Unidade;
  limite?: number;
}

/**
 * O resultado de cada item de uma lista (os ativos do robô, ou os códigos de contrato), uma linha por item
 * (ficha Mesa, 25/11/2026): nome e apoio à esquerda, uma barra chapada na proporção do resultado e o valor à
 * direita, com um fio entre as linhas. Era uma lista dentro de um painel, com a barra sobre um trilho
 * arredondado. A numeração 01–06 da frente saiu em 19/09/2026: a ordem e o tamanho das barras já dizem a
 * posição.
 */
export function PorSimbolo({ faixas, unidade, limite = 6 }: Props) {
  const lista = faixas.slice(0, limite);
  if (lista.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Sem operações no período.</p>;
  }
  const maior = Math.max(...lista.map((f) => Math.abs(f.total)), 1);

  return (
    <ul>
      {lista.map((f) => {
        const largura = Math.max(1, Math.round((Math.abs(f.total) / maior) * 100));
        return (
          <li
            key={f.simbolo}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 gap-y-2 border-b border-(--painel-fio) py-3 text-sm lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_9rem]"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{f.simbolo}</span>
              <span className="block text-[0.8125rem] text-sutil">
                {formatarNumero(f.n)} {f.n === 1 ? "operação" : "operações"} · {formatarPct(f.n > 0 ? f.nGain / f.n : 0, 0)} com ganho
              </span>
            </span>
            <Valor valor={f.total} unidade={unidade} inteiro={Math.abs(f.total) >= 1000} className="text-right font-medium lg:col-start-3" />
            {/* no celular a barra desce para debaixo do nome; a partir de lg fica entre o nome e o valor */}
            <span aria-hidden className="col-span-2 block h-1.5 lg:col-span-1 lg:col-start-2 lg:row-start-1">
              {f.total !== 0 ? (
                <span className={cn("block h-full rounded-[2px]", f.total > 0 ? "bg-positivo" : "bg-negativo")} style={{ width: `${largura}%` }} />
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
