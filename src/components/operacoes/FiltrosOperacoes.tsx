"use client";

import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Segmentado } from "@/components/compartilhados/Segmentado";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import type { FiltroLado, FiltroResultado } from "@/lib/consultas/operacoes";
import { ehDia } from "@/lib/stats/periodos";
import { queryDeFiltros, type FiltrosUrl } from "./params";

interface Props {
  slug: string;
  filtros: FiltrosUrl;
  hoje: string;
  className?: string;
}

const RESULTADOS: ReadonlyArray<{ valor: FiltroResultado | "todas"; rotulo: string }> = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "gain", rotulo: "Com ganho" },
  { valor: "loss", rotulo: "Com perda" },
];
const LADOS: ReadonlyArray<{ valor: FiltroLado | "todos"; rotulo: string }> = [
  { valor: "todos", rotulo: "Compra e venda" },
  { valor: "compra", rotulo: "Compra" },
  { valor: "venda", rotulo: "Venda" },
];

// Quanto esperar depois da última mexida numa data antes de buscar: quem digita dia, mês e ano não dispara
// três buscas seguidas.
const ESPERA_MS = 500;
// Digitando o ano, o campo passa por "0002", "0020", "0202" antes de chegar a "2026", e cada um já é uma
// data completa para o navegador. Data anterior a esta é tratada como digitação pela metade.
const PRIMEIRO_DIA_ACEITO = "2000-01-01";

const CAMPO =
  "h-8 rounded-md border border-(--painel-fio-forte) bg-transparent px-2 text-[0.8125rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 invalid:border-alerta";

/**
 * Filtros da lista de operações. O estado mora na URL, então o link é compartilhável.
 *
 * Ficha Mesa (25/11/2026): era um painel com quatro campos rotulados e os botões Filtrar e Limpar. Agora é
 * uma linha sem caixa em cima da tabela: ganho ou perda e compra ou venda em Segmentado (as palavras da
 * tela, no lugar de "Gain" e "Loss"), e o período em dois campos de data discretos. Não há botão de
 * aplicar: escolher uma opção já busca, e a data busca meio segundo depois da última mexida (Enter busca na
 * hora). "Limpar filtros" só aparece quando há o que limpar.
 *
 * Enquanto a busca está a caminho o formulário fica com aria-busy; a página usa isso para apagar um pouco a
 * tabela antiga (peer-aria-busy), que é o sinal de que a escolha foi aceita.
 */
export function FiltrosOperacoes({ slug, filtros, hoje, className }: Props) {
  const router = useRouter();
  const [carregando, iniciar] = useTransition();
  const naUrl = queryDeFiltros(filtros);

  // A tela responde na hora e a URL chega depois. Com busca a caminho ou agendada, vale o que a pessoa
  // escolheu; parado, vale a URL (é o que acerta a tela quando se volta ou avança no navegador).
  const [vista, setVista] = useState(naUrl);
  const [lado, setLado] = useState(filtros.lado);
  const [resultado, setResultado] = useState(filtros.resultado);
  const [de, setDe] = useState(filtros.de ?? "");
  const [ate, setAte] = useState(filtros.ate ?? "");
  // o último período que esta tela mandou buscar
  const [enviado, setEnviado] = useState({ de: filtros.de ?? "", ate: filtros.ate ?? "" });
  const [agendado, setAgendado] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!carregando && !agendado && vista !== naUrl) {
    setVista(naUrl);
    setLado(filtros.lado);
    setResultado(filtros.resultado);
    // As datas só são reescritas quando a URL traz um período que não saiu daqui. Se é o que esta tela
    // mandou, o campo fica como está: a pessoa pode já estar digitando a outra data, e reescrever o campo
    // no meio da digitação apagaria o que ela digitou.
    const daUrl = { de: filtros.de ?? "", ate: filtros.ate ?? "" };
    if (daUrl.de !== enviado.de || daUrl.ate !== enviado.ate) {
      setDe(daUrl.de);
      setAte(daUrl.ate);
      setEnviado(daUrl);
    }
  }

  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );

  const desagendar = () => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = null;
    setAgendado(false);
  };

  const ir = (f: FiltrosUrl) => {
    desagendar();
    setEnviado({ de: f.de ?? "", ate: f.ate ?? "" });
    const query = queryDeFiltros(f);
    // já é o que está na tela, e não há outra busca a caminho para desfazer
    if (query === naUrl && !carregando) return;
    iniciar(() => router.push(`/robos/${slug}/operacoes${query}`, { scroll: false }));
  };

  const dataValida = (v: string) => v === "" || (ehDia(v) && v >= PRIMEIRO_DIA_ACEITO && v <= hoje);
  const periodoValido = (d: string, a: string) => dataValida(d) && dataValida(a) && (d === "" || a === "" || d <= a);

  const mudarPeriodo = (novoDe: string, novoAte: string) => {
    setDe(novoDe);
    setAte(novoAte);
    desagendar();
    // data pela metade, depois de hoje ou período invertido não busca; nos dois últimos casos o navegador
    // marca o campo (min e max), e a borda muda de cor até o período fazer sentido
    if (!periodoValido(novoDe, novoAte)) return;
    setAgendado(true);
    relogio.current = setTimeout(() => ir({ de: novoDe || null, ate: novoAte || null, lado, resultado }), ESPERA_MS);
  };

  // o período que vale para uma busca disparada pelos seletores: o da tela, se faz sentido; senão, o da URL
  const periodo = periodoValido(de, ate) ? { de: de || null, ate: ate || null } : { de: filtros.de, ate: filtros.ate };

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (periodoValido(de, ate)) ir({ de: de || null, ate: ate || null, lado, resultado });
  };

  const limpar = () => {
    setLado(null);
    setResultado(null);
    setDe("");
    setAte("");
    ir({ de: null, ate: null, lado: null, resultado: null });
  };

  return (
    <form
      aria-label="Filtrar operações"
      aria-busy={carregando}
      onSubmit={(e) => e.preventDefault()}
      className={cn("relative flex flex-wrap items-center justify-between gap-x-10 gap-y-3", className)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-10 gap-y-3">
        <Segmentado
          ariaLabel="Resultado da operação"
          opcoes={RESULTADOS}
          valor={resultado ?? "todas"}
          onChange={(v) => {
            const novo = v === "todas" ? null : v;
            setResultado(novo);
            ir({ ...periodo, lado, resultado: novo });
          }}
        />
        <Segmentado
          ariaLabel="Lado da operação"
          opcoes={LADOS}
          valor={lado ?? "todos"}
          onChange={(v) => {
            const novo = v === "todos" ? null : v;
            setLado(novo);
            ir({ ...periodo, lado: novo, resultado });
          }}
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[0.8125rem] text-muted-foreground">
        <label className="flex items-center gap-2">
          De
          <input
            type="date"
            value={de}
            max={ate || hoje}
            onChange={(e) => mudarPeriodo(e.target.value, ate)}
            onKeyDown={aoTeclar}
            className={cn(CAMPO, de && "text-foreground")}
          />
        </label>
        <label className="flex items-center gap-2">
          até
          <input
            type="date"
            value={ate}
            min={de || undefined}
            max={hoje}
            onChange={(e) => mudarPeriodo(de, e.target.value)}
            onKeyDown={aoTeclar}
            className={cn(CAMPO, ate && "text-foreground")}
          />
        </label>
        {lado || resultado || de || ate ? (
          <button type="button" onClick={limpar} className={cn(LINK_DO_PAINEL, "ml-2")}>
            Limpar filtros
          </button>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {carregando ? "Buscando as operações…" : ""}
      </span>
    </form>
  );
}
