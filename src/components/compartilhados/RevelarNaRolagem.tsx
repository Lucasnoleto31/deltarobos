"use client";

import { cn } from "cn";
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";

/**
 * Aparecer ao rolar (19/09/2026, pedido do Artur com o zero7 como referência: "as coisas aparecendo
 * quando scroola"). Sem biblioteca nenhuma — nada de AOS, GSAP ou Lenis: o efeito é uma transição de
 * CSS (.revelar, no globals.css) que este componente liga e desliga por um atributo.
 *
 * O bloco NASCE VISÍVEL no HTML — sem JavaScript, ou com movimento reduzido, ele fica exatamente onde
 * está. Quem esconde é a PRIMEIRA leitura do observador, e só de quem ainda está abaixo da dobra:
 * esconder um bloco que a pessoa já está vendo faria ele sumir e voltar (a hidratação acontece depois
 * da primeira pintura, então a piscada seria visível). O preço é que o que já nasce na tela não ganha
 * entrada — o movimento da primeira tela é o cartão do hero, que se anima pelo CSS desde a primeira
 * pintura, sem piscar.
 *
 * Revela uma vez só e larga o elemento (unobserve): depois da entrada não roda mais nada na rolagem.
 * O estado vive no DOM, não em useState — a rolagem não re-renderiza React em lugar nenhum.
 */

/** Um observador por margem, compartilhado: as ~16 entradas da home usam um IntersectionObserver só. */
const OBSERVADORES = new Map<string, IntersectionObserver>();

function observadorDe(margem: string): IntersectionObserver {
  const guardado = OBSERVADORES.get(margem);
  if (guardado) return guardado;
  const obs = new IntersectionObserver(
    (entradas, esse) => {
      for (const entrada of entradas) {
        const el = entrada.target as HTMLElement;
        if (entrada.isIntersecting) {
          el.dataset.revelar = "ok";
          esse.unobserve(el);
          continue;
        }
        // Primeira leitura e o bloco ainda está abaixo da tela: esconde agora, para entrar quando
        // subir. A conta usa o boundingClientRect que a própria entrada traz (nada de medir o DOM na
        // mão, que forçaria um layout por bloco) e compara com a altura real da janela, não com o
        // rootBounds — este já vem com os -10% da margem, e um bloco parado nessa faixa está na tela.
        if (!el.dataset.revelar && entrada.boundingClientRect.top >= window.innerHeight) {
          el.dataset.revelar = "espera";
        }
      }
    },
    { rootMargin: margem },
  );
  OBSERVADORES.set(margem, obs);
  return obs;
}

/**
 * useLayoutEffect no navegador, useEffect no servidor: o React avisa se o de layout roda no SSR. É o de
 * layout para o observador começar a olhar ainda no quadro da hidratação — a decisão de esconder ou não
 * é dele, e quanto antes ela acontece, menos chance de alguém ver o bloco de baixo antes de sumir.
 */
const useEfeitoAntesDaPintura = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Dispara um pouco antes de o bloco encostar na borda de baixo, para a entrada terminar na tela. */
export const MARGEM_PADRAO = "0px 0px -10% 0px";

/**
 * O atraso de cada item de uma lista, para ela entrar em cascata. O teto existe porque a lista longa
 * revela item a item conforme a rolagem desce: somar 70 ms por índice deixaria os últimos lentos.
 * Fica aqui dentro (e não exportada) de propósito: este arquivo é "use client", e função exportada
 * daqui não pode ser CHAMADA por uma página de servidor — por isso a cascata entra pela prop indice.
 */
function atrasoDaCascata(i: number, passo = 70, teto = 4): number {
  return Math.min(i, teto) * passo;
}

interface Props {
  children: ReactNode;
  /**
   * A tag do elemento criado. Dentro de <ul>/<ol> use "li", e dentro de uma grade envolva o item pelo
   * próprio filho: um <div> a mais no meio de um grid/flex muda o layout.
   */
  como?: "div" | "li" | "article" | "section" | "p";
  className?: string;
  /** posição do item numa lista: é o jeito de fazer a lista entrar em cascata. */
  indice?: number;
  /** ms de espera antes de revelar, quando o atraso não vem de uma lista. Vence o indice. */
  atraso?: number;
  /** px de deslocamento vertical. Padrão 12; use 8 dentro de um painel, que corta o que passa da borda. */
  desloca?: number;
  /** rootMargin do observador, quando a padrão não servir. */
  margem?: string;
}

export function RevelarNaRolagem({
  children,
  como = "div",
  className,
  indice,
  atraso = indice === undefined ? 0 : atrasoDaCascata(indice),
  desloca,
  margem = MARGEM_PADRAO,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useEfeitoAntesDaPintura(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const obs = observadorDe(margem);
    obs.observe(el);
    return () => obs.unobserve(el);
  }, [margem]);

  const Tag = como as ElementType;
  const estilo = {
    ...(atraso ? { "--revelar-atraso": `${atraso}ms` } : null),
    ...(desloca === undefined ? null : { "--revelar-dy": `${desloca}px` }),
  } as CSSProperties;

  return (
    <Tag ref={ref} className={cn("revelar", className)} style={estilo}>
      {children}
    </Tag>
  );
}
