import type { Metadata } from "next";
import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";
import { CabecalhoPagina, CorpoPagina } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";

export const metadata: Metadata = { title: "Página não encontrada" };

/**
 * 404 do site inteiro (24/09/2026, varredura: um endereço errado caía no "404 · This page could not be
 * found." do Next, em inglês e sem marca). Fica na raiz do app, então não passa pelo layout do site — sem
 * barra lateral nem rodapé, que dependem dos parâmetros do banco; a marca e o caminho de volta estão aqui.
 * O 404 de robô continua em (site)/robos/not-found.tsx, dentro do layout.
 *
 * 25/11/2026 (ficha Mesa): a tela mais simples do sistema. A marca na linha de cima, como na barra lateral,
 * o título, uma frase e o link para a visão geral, tudo alinhado à esquerda. Sem ilustração, sem texto
 * centralizado e sem botão: a única saída é um link.
 */
export default function PaginaNaoEncontrada() {
  return (
    <main className="flex-1">
      <div className="border-b">
        <div className="conteudo flex h-12 items-center">
          <Link href="/" className="flex items-center gap-2.5 text-[0.9375rem] font-semibold tracking-tight">
            <Simbolo aria-hidden className="h-5 w-auto text-marca" />
            <span>
              Quants <span className="font-normal text-muted-foreground">Robôs</span>
            </span>
          </Link>
        </div>
      </div>
      <CabecalhoPagina titulo="Página não encontrada" descricao="Não há nada neste endereço." />
      <CorpoPagina className="pt-6 lg:pt-6">
        <p className="text-sm">
          <Link href="/" className={LINK_DO_PAINEL}>
            Ir para a visão geral
          </Link>
        </p>
      </CorpoPagina>
    </main>
  );
}
