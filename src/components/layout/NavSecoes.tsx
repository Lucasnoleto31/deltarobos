"use client";

import { cn } from "cn";
import { useEffect, useState } from "react";

export interface SecaoNav {
  id: string;
  rotulo: string;
}

interface Props {
  secoes: SecaoNav[];
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
 * O índice de texto da Metodologia: uma linha por seção, a que está sendo lida com o fio da marca à
 * esquerda. Sai só a lista, porque o <nav aria-label="Seções"> já é da própria página.
 *
 * 20/09/2026: o componente tinha duas variantes, e a prop que escolhia entre elas saiu junto com a
 * segunda — a barra de traços colada na lateral direita da home e do Comparativo, que o Artur viu nos
 * prints e não quis. A navegação do site passou a ser a barra lateral do Cabecalho, e um indicador de
 * seção solto no meio da tela virava outra coisa no mesmo lugar. Sobrou um uso só: a Metodologia.
 *
 * Sem JavaScript os links funcionam do mesmo jeito — só não há marca de seção atual.
 */
export function NavSecoes({ secoes, className }: Props) {
  const ativa = useSecaoAtiva(secoes.map((s) => s.id).join(","));

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
