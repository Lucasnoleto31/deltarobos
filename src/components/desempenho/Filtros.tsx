"use client";

import { cn } from "cn";
import { useState } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import type { Periodo } from "@/lib/stats/periodos";
import type { Base, Unidade } from "@/lib/stats/tipos";
import { PRESETS, estadoDoPreset, presetAtivo } from "./presets-periodo";

export interface EstadoFiltros {
  periodo: Periodo;
  de: string;
  ate: string;
  unidade: Unidade;
  base: Base;
  contratos: number;
}

interface Props {
  estado: EstadoFiltros;
  onChange: (patch: Partial<EstadoFiltros>) => void;
  hoje: string;
  className?: string;
}

const OPCOES_UNIDADE = [
  { valor: "brl", rotulo: "R$" },
  { valor: "pontos", rotulo: "Pontos" },
] as const;
// "líquido" e "bruto" com o nome de leigo (DESIGN.md, seção 7)
const OPCOES_BASE = [
  { valor: "liquido", rotulo: "Custos descontados" },
  { valor: "bruto", rotulo: "Antes dos custos" },
] as const;

const MAXIMO_DE_CONTRATOS = 1000;

// campo de data e de número: borda no fio forte, canto de 6 px
const CAMPO =
  "h-8 rounded-md border border-(--painel-fio-forte) bg-background px-2 text-[0.8125rem] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * O campo de contratos. Guarda o que está sendo digitado até o blur ou o Enter (a lição do campo do
 * simulador, 23/09/2026): controlado só pelo valor confirmado, apagar o "1" para digitar "25" voltava a 1 no
 * meio da digitação. Cada tecla que forma um inteiro a partir de 1 já vale; acima do teto, vale o teto.
 */
function CampoContratos({ valor, onChange }: { valor: number; onChange: (contratos: number) => void }) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  return (
    <label className="flex items-baseline gap-2 whitespace-nowrap text-sutil">
      Contratos
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAXIMO_DE_CONTRATOS}
        step={1}
        value={rascunho ?? String(valor)}
        onChange={(e) => {
          const texto = e.target.value;
          setRascunho(texto);
          const n = Math.floor(Number(texto));
          if (texto.trim() !== "" && Number.isFinite(n) && n >= 1) onChange(Math.min(MAXIMO_DE_CONTRATOS, n));
        }}
        onBlur={() => setRascunho(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn(CAMPO, "w-[4.5rem]")}
      />
    </label>
  );
}

/**
 * Os filtros da aba Desempenho (ficha Mesa, 25/11/2026): período, unidade, com ou sem custos e contratos,
 * numa linha só de texto, sem caixa e sem rótulo em cima de cada grupo. Vão no alto da tela, à direita do
 * título do número, e valem para a tela toda. Eram um painel de duas linhas, com rótulos em caixa alta, as
 * opções em pílula e um botão.
 *
 * - Os contratos eram seis opções (1, 2, 3, 5, 10, Outro) mais um campo; agora é só o campo, que aceita de 1
 *   a 1000 e tem as setas do navegador.
 * - O link para a lista de operações (com a exportação em CSV) saiu daqui: fica no título de "Mais números",
 *   ao lado da contagem de operações.
 * - "Personalizado" abre as duas datas ao lado do período. "Hoje", "Semana" e "Mês" também são um intervalo
 *   de datas por baixo (presets-periodo), e as datas apareciam com eles; agora só aparecem quando a pessoa
 *   escolhe "Personalizado" ou quando o intervalo não é o de nenhum atalho (um mês escolhido nas barras, um
 *   link com datas). Com as datas abertas, a opção acesa continua "Personalizado" mesmo que o intervalo
 *   digitado coincida com o de um atalho.
 */
export function Filtros({ estado, onChange, hoje, className }: Props) {
  const [datasAbertas, setDatasAbertas] = useState(false);
  const preset = presetAtivo(estado, hoje);
  const comDatas = estado.periodo === "personalizado" && (datasAbertas || preset === "personalizado");

  return (
    <div className={cn("flex max-w-full min-w-0 flex-wrap items-baseline gap-x-7 gap-y-3 text-[0.8125rem]", className)}>
      <Segmentado
        ariaLabel="Período"
        opcoes={PRESETS}
        valor={comDatas ? "personalizado" : preset}
        onChange={(escolhido) => {
          setDatasAbertas(escolhido === "personalizado");
          onChange(estadoDoPreset(escolhido, hoje, estado));
        }}
      />
      {comDatas ? (
        <div className="flex items-baseline gap-2 text-sutil">
          <input
            type="date"
            aria-label="Data inicial"
            value={estado.de}
            max={estado.ate || hoje}
            onChange={(e) => onChange({ de: e.target.value })}
            className={CAMPO}
          />
          a
          <input
            type="date"
            aria-label="Data final"
            value={estado.ate}
            min={estado.de || undefined}
            max={hoje}
            onChange={(e) => onChange({ ate: e.target.value })}
            className={CAMPO}
          />
        </div>
      ) : null}
      <Segmentado ariaLabel="Unidade" opcoes={OPCOES_UNIDADE} valor={estado.unidade} onChange={(unidade) => onChange({ unidade })} />
      <Segmentado ariaLabel="Custos" opcoes={OPCOES_BASE} valor={estado.base} onChange={(base) => onChange({ base })} />
      <CampoContratos valor={estado.contratos} onChange={(contratos) => onChange({ contratos })} />
    </div>
  );
}
