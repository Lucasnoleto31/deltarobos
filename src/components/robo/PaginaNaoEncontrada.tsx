"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CabecalhoPagina, CorpoPagina } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";
import { textoDoNaoEncontrado, type RoboDoEndereco } from "./nao-encontrado";

// a área de toque do link cresce pelo ::after até 36 px ou mais, sem o fio descer do texto (DESIGN.md, seção 3)
const ELO = cn(LINK_DO_PAINEL, "relative after:absolute after:-inset-x-2 after:-inset-y-2.5");

/**
 * A tela do 404 de /robos. O servidor não sabe o endereço do 404 (o not-found não recebe parâmetros), então o
 * texto é escolhido aqui, pelo endereço da página, com a lista de robôs que o servidor manda pronta
 * (textoDoNaoEncontrado: robô que não existe, aba Ao vivo de robô sem acompanhamento ao vivo, ou outro endereço
 * de um robô que existe).
 *
 * Título, uma frase e os links, alinhados à esquerda como qualquer tela do sistema (ficha Mesa). Sem ilustração,
 * sem texto centralizado e sem botão: o botão principal da tela já é o da barra lateral.
 */
export function PaginaNaoEncontrada({ robos }: { robos: readonly RoboDoEndereco[] }) {
  const { titulo, descricao, resumo } = textoDoNaoEncontrado(usePathname(), robos);
  return (
    <>
      <CabecalhoPagina titulo={titulo} descricao={descricao} />
      <CorpoPagina className="pt-6 lg:pt-6">
        <p className="text-sm leading-9">
          {resumo ? (
            <>
              <Link href={resumo} className={ELO}>
                Ver o Resumo do robô
              </Link>
              <span className="text-sutil"> · </span>
            </>
          ) : null}
          <Link href="/" className={ELO}>
            Ir para a visão geral
          </Link>
        </p>
      </CorpoPagina>
    </>
  );
}
