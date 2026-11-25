import { PaginaNaoEncontrada } from "@/components/robo/PaginaNaoEncontrada";
import { carregarCasa } from "@/lib/consultas/casa";

/**
 * 404 de robô. Fica em /robos, não em /robos/[slug] (19/09/2026): o notFound() sai do layout de [slug],
 * e o not-found de um segmento só pega o que acontece abaixo do layout dele. Dentro de [slug] ele nunca
 * era usado, e a página saía com o 404 padrão do Next, em inglês.
 *
 * 25/11/2026 (ficha Mesa): título, uma frase e o link para a visão geral, alinhados à esquerda como
 * qualquer tela do sistema. Sem ilustração, sem texto centralizado e sem botão: o botão principal da tela
 * já é o da barra lateral, que também lista os robôs que existem.
 *
 * Revisão de 25/11/2026: este limite também pega o 404 da aba Ao vivo de um robô sem acompanhamento ao vivo
 * (SoComColetor), e a tela dizia que o robô não existia. O not-found não recebe o endereço, então a página leva
 * a lista dos robôs cadastrados (endereço, nome e se tem coletor) e o PaginaNaoEncontrada escolhe o texto pelo
 * endereço, no navegador (textoDoNaoEncontrado, em components/robo/nao-encontrado, com teste). A lista vem de
 * carregarCasa, que o layout do site já leu nesta mesma requisição (cache do React): não há leitura nova no banco.
 */
export default async function RoboNaoEncontrado() {
  const { robos } = await carregarCasa();
  return <PaginaNaoEncontrada robos={robos.map((r) => ({ slug: r.slug, nome: r.nome, temColetor: r.tem_coletor }))} />;
}
