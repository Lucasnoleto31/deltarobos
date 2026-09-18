// lucide-react 1.x não traz ícones de marca: usa genéricos
import { ArrowUpRight, Camera, MessageCircle, Radio } from "lucide-react";
import type { Links, VideoYouTube } from "@/lib/tipos";

interface Props {
  links: Links;
  videos: VideoYouTube[];
}

/**
 * Linha de canal, no desenho da lista agrupada do iOS (Habitto): ícone solto no acento, título e
 * apoio, e a seta de quem sai do site. A linha inteira é o alvo do clique. O ícone não tem caixa
 * tintada atrás nem cor de acento: o dourado fica para a marca e o botão principal (18/09/2026).
 */
function LinhaCanal({
  href,
  icone,
  titulo,
  descricao,
}: {
  href: string;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <li className="sep [--sep:52px]">
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
    </li>
  );
}

/** Item 8 da home: WhatsApp, YouTube (3 últimos vídeos), Instagram e Sala ao Vivo. */
export function Comunidade({ links, videos }: Props) {
  const temCanais = Boolean(links.whatsapp || links.sala_ao_vivo || links.instagram);
  const temVideos = Boolean(links.youtube || videos.length > 0);

  return (
    <section id="comunidade" className="conteudo scroll-mt-20 py-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Comunidade</h2>
      </div>

      {!temCanais && !temVideos ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Links da comunidade em breve.
        </p>
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
                {links.whatsapp ? (
                  <LinhaCanal
                    href={links.whatsapp}
                    icone={<MessageCircle className="size-5" />}
                    titulo="Grupo no WhatsApp"
                    descricao="Avisos de operação, resumo do dia e suporte."
                  />
                ) : null}
                {links.sala_ao_vivo ? (
                  <LinhaCanal
                    href={links.sala_ao_vivo}
                    icone={<Radio className="size-5" />}
                    titulo="Sala ao vivo"
                    descricao="O pregão em tempo real com a equipe."
                  />
                ) : null}
                {links.instagram ? (
                  <LinhaCanal
                    href={links.instagram}
                    icone={<Camera className="size-5" />}
                    titulo="Instagram"
                    descricao="Bastidores e fechamentos."
                  />
                ) : null}
              </ul>
            </div>
          ) : null}

          {temVideos ? (
            <div className="painel-grupo">
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
                  <p className="py-6 text-center text-sm text-muted-foreground">Nenhum vídeo publicado ainda.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
