import Link from "next/link";
import { CabecalhoPagina, CorpoPagina } from "@/components/sistema/Pagina";
import { LINK_DO_PAINEL } from "@/components/sistema/Painel";

/**
 * 404 de robô. Fica em /robos, não em /robos/[slug] (19/09/2026): o notFound() sai do layout de [slug],
 * e o not-found de um segmento só pega o que acontece abaixo do layout dele. Dentro de [slug] ele nunca
 * era usado, e a página saía com o 404 padrão do Next, em inglês.
 *
 * 25/11/2026 (ficha Mesa): título, uma frase e o link para a visão geral, alinhados à esquerda como
 * qualquer tela do sistema. Sem ilustração, sem texto centralizado e sem botão: o botão principal da tela
 * já é o da barra lateral, que também lista os robôs que existem.
 */
export default function RoboNaoEncontrado() {
  return (
    <>
      <CabecalhoPagina titulo="Robô não encontrado" descricao="Nenhum robô cadastrado tem este endereço." />
      <CorpoPagina className="pt-6 lg:pt-6">
        <p className="text-sm">
          <Link href="/" className={LINK_DO_PAINEL}>
            Ir para a visão geral
          </Link>
        </p>
      </CorpoPagina>
    </>
  );
}
