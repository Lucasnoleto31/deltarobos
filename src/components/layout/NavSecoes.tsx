"use client";

import { cn } from "cn";
import { useEffect, useState } from "react";

export interface SecaoNav {
  id: string;
  rotulo: string;
}

interface Props {
  secoes: SecaoNav[];
  /**
   * "traco" (padrão): a barra colada na lateral direita, um traço por seção, o rótulo no hover/foco.
   * "lista": o índice de texto de uma coluna lateral — sai só a lista, porque o <nav> já é da página.
   */
  variante?: "traco" | "lista";
  className?: string;
}

/**
 * O foco acompanha a âncora (19/09/2026): o navegador rola até a seção, mas não move o foco para um
 * <section>, então o próximo Tab voltaria do começo da página. O tabindex="-1" entra na hora do clique,
 * e o preventScroll deixa a rolagem por conta da âncora (o scroll-behavior do CSS).
 */
function focarSecao(id: string) {
  const alvo = document.getElementById(id);
  if (!alvo) return;
  if (!alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
  alvo.focus({ preventScroll: true });
}

/**
 * Qual seção está sendo lida, por IntersectionObserver (19/09/2026): vale a primeira seção que ainda
 * não terminou acima da linha de leitura, 140 px abaixo do topo — ou seja, a que está logo abaixo do
 * cabeçalho. Por isso a raiz é a tela inteira menos esses 140 px: uma seção "sai" quando o fim dela
 * passa da linha, e a de baixo assume. Os 140 px ficam abaixo dos 96 px do scroll-mt das seções, senão
 * a seção anterior continuava com uns pixels na faixa e ficava marcada depois do clique na âncora
 * (medido na Metodologia). Sem faixa curta no topo, a última seção também acende no fim da página,
 * onde já não há rolagem para ela subir.
 * O observador só dispara quando uma seção entra ou sai — não há ouvinte de rolagem, e setState com o
 * mesmo id não re-renderiza: só a troca de seção custa um render.
 * `ids` vem como texto para o efeito não recomeçar a cada render do pai.
 */
function useSecaoAtiva(ids: string): string | null {
  const [ativa, setAtiva] = useState<string | null>(null);

  useEffect(() => {
    const lista = ids.split(",");
    const alvos = lista.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null);
    if (alvos.length === 0) return;

    const visiveis = new Set<string>();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visiveis.add(e.target.id);
          else visiveis.delete(e.target.id);
        }
        const primeira = lista.find((id) => visiveis.has(id));
        // sem nenhuma seção abaixo da linha (topo da página), fica a última marcada
        if (primeira) setAtiva(primeira);
      },
      { rootMargin: "-140px 0px 0px 0px" },
    );
    for (const alvo of alvos) observador.observe(alvo);
    return () => observador.disconnect();
  }, [ids]);

  return ativa;
}

/**
 * A barra de seções da página, inspirada na lateral do site que o Artur mandou em 19/09/2026 sem copiar
 * o desenho: um traço por seção, o rótulo só no hover e no foco, a seção que está sendo lida no verde da
 * Quants. Só a partir de lg — no celular e no tablet quem navega é o cabeçalho.
 *
 * Posição: a barra vive na margem que sobra ao lado do conteúdo (o .conteudo tem 72rem). Os 2,75rem
 * descontados dão o respiro até o painel e cobrem a largura da barra de rolagem, que o 100vw não
 * desconta. O max() com 0,25rem segura a barra dentro da tela em 1024 px, onde não sobra margem: ali
 * ela cai no vão de 24px do .conteudo, sem cobrir painel nem texto (medido em 19/09/2026).
 *
 * Sem JavaScript os links funcionam do mesmo jeito — só não há marca de seção atual.
 */
export function NavSecoes({ secoes, variante = "traco", className }: Props) {
  const ativa = useSecaoAtiva(secoes.map((s) => s.id).join(","));

  if (variante === "lista") {
    return (
      <ol className={cn("space-y-0.5 text-sm", className)}>
        {secoes.map((s) => {
          const atual = s.id === ativa;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={atual ? "true" : undefined}
                onClick={() => focarSecao(s.id)}
                className={cn(
                  "block border-l-2 py-0.5 pl-3 transition-colors motion-reduce:transition-none",
                  atual
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-(--painel-fio-forte) hover:text-foreground",
                )}
              >
                {s.rotulo}
              </a>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <nav
      aria-label="Seções da página"
      className={cn(
        "fixed top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-1 lg:flex",
        "right-[max(0.25rem,calc((100vw_-_72rem)/2_-_2.75rem))]",
        className,
      )}
    >
      {secoes.map((s) => {
        const atual = s.id === ativa;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={atual ? "true" : undefined}
            onClick={() => focarSecao(s.id)}
            className="group relative flex size-6 items-center justify-end rounded-sm"
          >
            {/* O rótulo fica no DOM sempre (leitor de tela lê), só a opacidade muda. Ele aparece a
                partir de 2xl: até lá a margem ao lado do conteúdo é menor que o balão, e ele passava
                por cima da tabela do Comparativo (medido em 1280 em 20/09/2026). O traço, que é o que
                marca a seção, continua em todas as larguras a partir de lg. */}
            <span className="pointer-events-none absolute right-full mr-2 rounded-md border border-(--painel-fio) bg-popover px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-sm transition-opacity duration-200 motion-reduce:transition-none 2xl:group-hover:opacity-100 2xl:group-focus-visible:opacity-100">
              {s.rotulo}
            </span>
            <span
              aria-hidden
              className={cn(
                "h-px transition-all duration-300 motion-reduce:transition-none",
                // 20 px é o traço mais comprido que cabe no vão de 24 px do .conteudo em 1024 px,
                // sem entrar no fio do painel; o alvo do clique continua sendo a caixa de 24 px
                atual ? "w-5 bg-primary" : "w-3.5 bg-(--painel-fio-forte) group-hover:w-5 group-hover:bg-foreground",
              )}
            />
          </a>
        );
      })}
    </nav>
  );
}
