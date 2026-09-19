"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { cn } from "cn";
import { Info } from "lucide-react";
import { useId, useRef, useState } from "react";
import { GLOSSARIO, type ChaveIndicador } from "./glossario";

// "R$ 12" não quebra entre o símbolo e o número num texto passado à mão (o mesmo recurso do SINAL_PRESO
// da aba Faixas: o caractere sai do código, não de um escape escrito no arquivo)
const ESPACO_FIXO = String.fromCharCode(0xa0);

interface Props {
  chave: ChaveIndicador;
  /** caso especial: troca o texto do glossário (o nome continua o do glossário) */
  texto?: string;
  className?: string;
}

/**
 * O "o que é" de um indicador (19/09/2026, Artur: "em todos os cards deve ter uma info sobre o que é"): um
 * i pequeno ao lado do rótulo que abre o nome e a explicação do glossário. Abre ao passar o mouse, ao focar
 * pelo teclado e ao tocar no celular; Esc, tocar fora ou sair com o foco fecha.
 *
 * É o Tooltip do Base UI, controlado: ele já traz o hover só de mouse, o foco visível, o Esc e o clique fora,
 * e o toque entra pelo onClick (o Popover abria no clique, mas não no foco, e as guardas de foco dele
 * prendiam o Tab no balão vazio). O balão vai num portal, então o overflow-hidden do painel não corta.
 * Para leitor de tela o texto também fica no aria-describedby, num span escondido que existe sempre.
 *
 * O ícone tem 14 px e o alvo de toque 24 px (o ::before passa 5 px para cada lado, sem mexer no desenho).
 *
 * ATENÇÃO: é um <button>. Dentro de <a> ou de outro <button> é HTML inválido, e o clique no i ainda
 * dispararia o link. Em cartão que é link, use o link esticado: o <a> fica só no título, com
 * `after:absolute after:inset-0` cobrindo o cartão (o cartão com `relative`), e o i fica por cima com
 * `relative z-10`. Célula que é botão (o mapa de faixas) leva o i fora dela, no cabeçalho.
 */
export function InfoIndicador({ chave, texto, className }: Props) {
  const { nome, texto: padrao } = GLOSSARIO[chave];
  const explicacao = (texto ?? padrao).replace(/R\$ /g, `R$${ESPACO_FIXO}`);
  const [aberto, setAberto] = useState(false);
  const ponteiro = useRef<string>("mouse");
  const idTexto = useId();

  return (
    <Tooltip.Root open={aberto} onOpenChange={setAberto}>
      <Tooltip.Trigger
        delay={120}
        closeDelay={80}
        // o clique é nosso: sem isto o Base UI fecha no pointerdown e o toque reabre logo depois
        closeOnClick={false}
        aria-label={`O que é ${nome}`}
        aria-describedby={idTexto}
        onPointerDown={(e) => {
          ponteiro.current = e.pointerType;
        }}
        onClick={(e) => {
          // mouse já abriu pelo hover: o clique só mantém aberto. Toque, caneta e teclado (detail 0) alternam.
          if (ponteiro.current === "mouse" && e.detail > 0) setAberto(true);
          else setAberto((a) => !a);
        }}
        className={cn(
          "relative inline-flex size-3.5 shrink-0 cursor-help items-center justify-center rounded-full align-[-2px] text-muted-foreground outline-none",
          "transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:text-foreground",
          "before:absolute before:-inset-[5px]",
          className,
        )}
      >
        <Info aria-hidden className="size-3.5" />
        <span id={idTexto} hidden>
          {explicacao}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6} collisionPadding={12} className="z-50">
          {/* mesma família da .dica-caixa dos gráficos, em text-sm: fundo de popover, fio, canto e sombra curta */}
          <Tooltip.Popup
            aria-hidden
            className={cn(
              "w-max max-w-64 origin-(--transform-origin) rounded-xl border border-(--painel-fio-forte) bg-popover px-3 py-2.5 text-left text-sm leading-snug text-popover-foreground",
              "shadow-[0_10px_28px_-14px_rgba(0,0,0,0.55)] outline-none",
              "transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none",
            )}
          >
            <p className="font-semibold text-foreground">{nome}</p>
            <p className="mt-1 text-pretty text-muted-foreground">{explicacao}</p>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * O rótulo com o i logo depois, na mesma linha do texto. O i vai preso à última palavra (word joiner e
 * nowrap), então quando o rótulo quebra ele desce junto e nunca fica sozinho na linha de baixo. Não muda a
 * caixa de quem usa: é um span em linha, e o i tem a altura da letra.
 */
export function RotuloComInfo({
  chave,
  texto,
  children,
  className,
}: {
  chave: ChaveIndicador;
  texto?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={className}>
      {children}
      <span className="whitespace-nowrap">
        &#8288;
        <InfoIndicador chave={chave} texto={texto} className="ml-1" />
      </span>
    </span>
  );
}
