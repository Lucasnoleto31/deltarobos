// lucide-react 1.x não traz ícones de marca: usa genéricos
import { ArrowUpRight, Camera, MessageCircle, Radio } from "lucide-react";
import { RevelarNaRolagem } from "@/components/compartilhados/RevelarNaRolagem";
import type { Links, VideoYouTube } from "@/lib/tipos";

interface Props {
  links: Links;
  videos: VideoYouTube[];
}

/**
 * Linha de canal, no desenho da lista agrupada do iOS (Habitto): ícone solto no acento, título e
 * apoio, e a seta de quem sai do site. A linha inteira é o alvo do clique. O ícone não tem caixa
 * tintada atrás nem cor de acento: o acento fica para a marca e o botão principal (18/09/2026; desde
 * 19/09/2026 é o verde da Quants, antes o dourado).
 * A descrição diz o que o canal publica, nada além (19/09/2026: saíram "suporte", "em tempo real",
 * que repetia o "ao vivo" do título, e "bastidores").
 * A linha entra ao rolar, uma depois da outra (19/09/2026). Quem se mexe é o conteúdo, não o <li>: o fio
 * que separa as linhas é um ::after do próprio <li> e, levando ele junto, os fios apareciam fora do
 * lugar enquanto a linha subia. Os 8 px em vez dos 12 padrão são porque o painel tem overflow: hidden.
 */
function LinhaCanal({
  href,
  icone,
  titulo,
  descricao,
  indice,
}: {
  href: string;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  indice: number;
}) {
  return (
    <li className="sep [--sep:52px]">
      <RevelarNaRolagem indice={indice} desloca={8}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="linha-interativa flex min-h-[64px] items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="grid w-6 shrink-0 place-items-center text-muted-foreground">{icone}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium leading-tight">{titulo}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{descricao}</span>
          </span>
          <ArrowUpRight aria-hidden className="size-4 shrink-0 text-foreground/30" />
        </a>
      </RevelarNaRolagem>
    </li>
  );
}

/** Item 8 da home: WhatsApp, YouTube (3 últimos vídeos), Instagram e Sala ao Vivo. */
export function Comunidade({ links, videos }: Props) {
  // a lista existe para a cascata contar direito: com os três em JSX condicional, faltar um deixava
  // buraco no atraso do seguinte (19/09/2026)
  const canais = [
    links.whatsapp
      ? {
          href: links.whatsapp,
          icone: <MessageCircle className="size-5" />,
          titulo: "Grupo no WhatsApp",
          descricao: "Avisos de operação e resumo do dia.",
        }
      : null,
    links.sala_ao_vivo
      ? {
          href: links.sala_ao_vivo,
          icone: <Radio className="size-5" />,
          titulo: "Sala ao vivo",
          descricao: "O pregão com a equipe.",
        }
      : null,
    links.instagram
      ? { href: links.instagram, icone: <Camera className="size-5" />, titulo: "Instagram", descricao: "Fechamentos." }
      : null,
  ].filter((c) => c !== null);
  const temCanais = canais.length > 0;
  const temVideos = Boolean(links.youtube || videos.length > 0);

  return (
    // o scroll-mt-20 saiu em 19/09/2026: quem desconta o cabeçalho é o scroll-padding-top do html
    <section id="comunidade" className="conteudo py-8">
      <RevelarNaRolagem className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Comunidade</h2>
      </RevelarNaRolagem>

      {!temCanais && !temVideos ? (
        <p className="painel p-5 text-sm text-muted-foreground">Nenhum canal cadastrado.</p>
      ) : (
        // As duas colunas têm altura parecida por construção: três linhas de canal de um lado, uma
        // fileira de vídeos do outro. Nada estica para preencher (era o vazio do painel de vídeos).
        <div className="grid items-start gap-x-4 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
          {temCanais ? (
            <div className="painel-grupo">
              <div className="painel-cabeca">
                <h3 className="painel-titulo">Canais</h3>
              </div>
              <ul className="painel overflow-hidden">
                {canais.map((c, i) => (
                  <LinhaCanal key={c.titulo} {...c} indice={i} />
                ))}
              </ul>
            </div>
          ) : null}

          {temVideos ? (
            // o bloco de vídeos entra inteiro, um pouco depois das linhas de canal: as miniaturas em
            // cascata, uma a uma, ficavam agitadas demais (19/09/2026)
            <RevelarNaRolagem className="painel-grupo" atraso={140}>
              <div className="painel-cabeca">
                <h3 className="painel-titulo">Últimos vídeos</h3>
                <div className="painel-acao">
                  {links.proxima_live ? (
                    <a
                      href={links.proxima_live}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      Próxima live
                    </a>
                  ) : null}
                  {links.youtube ? (
                    <a
                      href={links.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Ver canal <ArrowUpRight aria-hidden className="size-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="painel p-3 sm:p-4">
                {videos.length > 0 ? (
                  <ul className="grid gap-3 sm:grid-cols-3">
                    {videos.map((v) => (
                      <li key={v.id}>
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <span className="block overflow-hidden rounded-lg border border-(--painel-fio)">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={v.thumb}
                              alt=""
                              width={320}
                              height={180}
                              loading="lazy"
                              decoding="async"
                              className="aspect-video w-full object-cover transition-opacity group-hover:opacity-85"
                            />
                          </span>
                          <span className="mt-2 line-clamp-2 block text-xs font-medium leading-snug text-muted-foreground transition-colors group-hover:text-foreground">
                            {v.titulo}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nenhum vídeo publicado.</p>
                )}
              </div>
            </RevelarNaRolagem>
          ) : null}
        </div>
      )}
    </section>
  );
}
