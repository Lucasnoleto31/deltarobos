"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FiltroLado, FiltroResultado } from "@/lib/consultas/operacoes";
import { queryDeFiltros, type FiltrosUrl } from "./params";

interface Props {
  slug: string;
  filtros: FiltrosUrl;
  hoje: string;
}

// os rótulos são os da barra de filtros do Desempenho e do Simulador (13/10/2026): caixa alta, 11 px, apagados
const rotulo = "flex flex-col gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase";
// o campo volta ao tamanho e à caixa do texto normal dentro do rótulo em caixa alta
const campo =
  "h-9 rounded-lg border bg-background px-2.5 text-sm font-normal tracking-normal text-foreground normal-case tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

/** Filtros da lista de operações. O estado mora na URL, então o link é compartilhável. */
export function FiltrosOperacoes({ slug, filtros, hoje }: Props) {
  const router = useRouter();
  const [de, setDe] = useState(filtros.de ?? "");
  const [ate, setAte] = useState(filtros.ate ?? "");
  const [lado, setLado] = useState<FiltroLado | "">(filtros.lado ?? "");
  const [resultado, setResultado] = useState<FiltroResultado | "">(filtros.resultado ?? "");

  const aplicar = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(
      `/robos/${slug}/operacoes${queryDeFiltros({
        de: de || null,
        ate: ate || null,
        lado: lado || null,
        resultado: resultado || null,
      })}`,
    );
  };

  const limpar = () => {
    setDe("");
    setAte("");
    setLado("");
    setResultado("");
    router.push(`/robos/${slug}/operacoes`);
  };

  return (
    <form onSubmit={aplicar} className="flex flex-wrap items-end gap-3 painel p-4 sm:p-5">
      <label className={rotulo}>
        De
        <input type="date" value={de} max={ate || hoje} onChange={(e) => setDe(e.target.value)} className={campo} />
      </label>
      <label className={rotulo}>
        Até
        <input type="date" value={ate} min={de || undefined} max={hoje} onChange={(e) => setAte(e.target.value)} className={campo} />
      </label>
      <label className={rotulo}>
        Lado
        <select value={lado} onChange={(e) => setLado(e.target.value as FiltroLado | "")} className={campo}>
          <option value="">Todos</option>
          <option value="compra">Compra</option>
          <option value="venda">Venda</option>
        </select>
      </label>
      <label className={rotulo}>
        Resultado
        <select value={resultado} onChange={(e) => setResultado(e.target.value as FiltroResultado | "")} className={campo}>
          <option value="">Todos</option>
          <option value="gain">Gain</option>
          <option value="loss">Loss</option>
        </select>
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="lg">
          Filtrar
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={limpar}>
          Limpar
        </Button>
      </div>
    </form>
  );
}
