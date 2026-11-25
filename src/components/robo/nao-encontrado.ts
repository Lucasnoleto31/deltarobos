/**
 * O texto do 404 de /robos (revisão de 25/11/2026), escolhido pelo endereço. O mesmo limite pega dois casos
 * diferentes, porque o notFound() sai do layout de [slug] e o not-found de um segmento só pega o que vem abaixo do
 * layout dele:
 *
 * - o robô não existe (o layout não acha o slug): "Robô não encontrado";
 * - o robô existe, mas não tem acompanhamento ao vivo, e o endereço é o da aba Ao vivo (/robos/[slug]/hoje): o
 *   SoComColetor responde 404. Até esta revisão a tela dizia "Nenhum robô cadastrado tem este endereço", o que é
 *   falso. Agora diz que ele não tem acompanhamento ao vivo e leva ao Resumo dele. É o que acontece com todo link
 *   de "Compartilhar o dia" de um robô que deixou de ter coletor.
 *
 * Um robô que existe, num endereço que não existe, cai num terceiro texto, que também leva ao Resumo dele.
 */

/** O que o 404 precisa saber de cada robô cadastrado: o endereço, o nome e se ele tem a aba Ao vivo. */
export interface RoboDoEndereco {
  slug: string;
  nome: string;
  /** robos.tem_coletor: só o robô acompanhado ao vivo tem a aba Ao vivo (/robos/[slug]/hoje) */
  temColetor: boolean;
}

export interface TextoDoNaoEncontrado {
  titulo: string;
  descricao: string;
  /** o endereço do Resumo do robô, quando o robô existe; nulo quando não existe */
  resumo: string | null;
}

/** "/robos/apollo/hoje" → slug "apollo" e aba "hoje"; nulo fora de /robos/… */
export function lerEndereco(caminho: string | null | undefined): { slug: string; aba: string | null } | null {
  const m = /^\/robos\/([^/]+)(?:\/([^/]+))?\/?$/.exec(caminho ?? "");
  if (!m) return null;
  try {
    return { slug: decodeURIComponent(m[1]), aba: m[2] ?? null };
  } catch {
    // endereço com "%" quebrado: não é de robô nenhum
    return null;
  }
}

export function textoDoNaoEncontrado(caminho: string | null | undefined, robos: readonly RoboDoEndereco[]): TextoDoNaoEncontrado {
  const endereco = lerEndereco(caminho);
  const robo = endereco ? robos.find((r) => r.slug === endereco.slug) : undefined;
  if (!endereco || !robo) {
    return { titulo: "Robô não encontrado", descricao: "Nenhum robô cadastrado tem este endereço.", resumo: null };
  }
  const resumo = `/robos/${encodeURIComponent(robo.slug)}`;
  if (endereco.aba === "hoje" && !robo.temColetor) {
    return {
      titulo: `${robo.nome} não tem acompanhamento ao vivo`,
      descricao: "Por isso este robô não tem a aba Ao vivo. O resultado e o histórico dele estão no Resumo.",
      resumo,
    };
  }
  return { titulo: "Página não encontrada", descricao: `${robo.nome} não tem uma aba neste endereço.`, resumo };
}
