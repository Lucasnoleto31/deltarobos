"use client";

import { useState } from "react";
import { Valor } from "@/components/compartilhados/Valor";
import { LINK_DO_PAINEL, Painel } from "@/components/sistema/Painel";
import { formatarData, formatarNumero } from "@/lib/formato";

// quantos dias a lista mostra antes do "Ver os 10"
const NO_TOPO = 5;

interface Props {
  id: string;
  titulo: string;
  itens: { dia: string; valor: number; n: number }[];
  /** escolher um dia da lista abre esse dia no calendário */
  aoEscolher: (dia: string) => void;
  className?: string;
}

/**
 * Os melhores ou os piores dias do histórico inteiro, em linhas com fio (ficha Mesa, 25/11/2026): a data, o
 * número de operações e o resultado. A linha é o controle: escolher um dia leva o calendário até ele. Eram
 * dois cartões com uma barra debaixo de cada dia; a barra saiu (o valor ao lado já diz o tamanho) e o
 * "mostrar os 10" virou a ação do título de cada lista.
 *
 * 19/09/2026: o número da posição não aparece (a ordem da lista já diz) e a lista não repete "os 5 primeiros
 * do histórico", que ficava errado embaixo de "Piores dias"; o recorte, "desde o início", vai ao lado do título.
 */
export function ListaDeDias({ id, titulo, itens, aoEscolher, className }: Props) {
  const [todos, setTodos] = useState(false);
  const mostrados = todos ? itens : itens.slice(0, NO_TOPO);
  const idLista = `${id}-lista`;

  return (
    <Painel
      id={id}
      titulo={titulo}
      apoio="desde o início"
      corpo=""
      className={className}
      acao={
        itens.length > NO_TOPO ? (
          <button type="button" onClick={() => setTodos((v) => !v)} aria-expanded={todos} aria-controls={idLista} className={LINK_DO_PAINEL}>
            {todos ? `Ver só os ${NO_TOPO}` : `Ver os ${formatarNumero(itens.length)}`}
          </button>
        ) : undefined
      }
    >
      <ol id={idLista}>
        {mostrados.map((i) => (
          <li key={i.dia} className="border-b border-(--painel-fio)">
            <button
              type="button"
              onClick={() => aoEscolher(i.dia)}
              className="-mx-3 grid h-12 w-[calc(100%+1.5rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-md px-3 text-left text-sm outline-none transition-colors hover:bg-(--linha-hover) focus-visible:bg-(--linha-hover) focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{formatarData(i.dia)}</span>
                <span className="ml-3 text-[0.8125rem] text-sutil">
                  {formatarNumero(i.n)} {i.n === 1 ? "operação" : "operações"}
                </span>
              </span>
              <Valor valor={i.valor} inteiro={Math.abs(i.valor) >= 1000} className="font-medium" />
            </button>
          </li>
        ))}
      </ol>
    </Painel>
  );
}
