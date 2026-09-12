// lucide-react 1.x não traz ícones de marca: usa genéricos
import { Camera, MessageCircle, Play, Radio } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { Links, VideoYouTube } from "@/lib/tipos";

interface Props {
  links: Links;
  videos: VideoYouTube[];
}

function CardLink({
  href,
  icone,
  titulo,
  descricao,
  acao,
}: {
  href: string;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  acao: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/25"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-muted text-foreground">{icone}</span>
      <div className="flex-1">
        <h3 className="font-semibold">{titulo}</h3>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      <span className="text-sm font-medium underline-offset-4 group-hover:underline">{acao} →</span>
    </a>
  );
}

/** Item 8 da home: WhatsApp, YouTube (3 últimos vídeos), Instagram e Sala ao Vivo. */
export function Comunidade({ links, videos }: Props) {
  const temAlgo =
    links.whatsapp || links.youtube || links.instagram || links.sala_ao_vivo || videos.length > 0;

  return (
    <section id="comunidade" className="conteudo scroll-mt-20 py-8">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Comunidade</h2>
        <p className="text-sm text-muted-foreground">
          Acompanhe os robôs junto com quem opera todo dia.
        </p>
      </div>

      {!temAlgo ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Links da comunidade em breve.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-1 lg:grid-cols-1">
            {links.whatsapp ? (
              <CardLink
                href={links.whatsapp}
                icone={<MessageCircle className="size-5" />}
                titulo="Grupo no WhatsApp"
                descricao="Avisos de operação, resumo do dia e suporte."
                acao="Entrar no grupo"
              />
            ) : null}
            {links.sala_ao_vivo ? (
              <CardLink
                href={links.sala_ao_vivo}
                icone={<Radio className="size-5" />}
                titulo="Sala ao vivo"
                descricao="Acompanhe o pregão em tempo real com a equipe."
                acao="Acessar a sala"
              />
            ) : null}
            {links.instagram ? (
              <CardLink
                href={links.instagram}
                icone={<Camera className="size-5" />}
                titulo="Instagram"
                descricao="Bastidores, fechamentos e novidades."
                acao="Seguir"
              />
            ) : null}
          </div>

          {links.youtube || videos.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 font-semibold">
                  <Play className="size-5" /> Últimos vídeos
                </h3>
                <div className="flex gap-2">
                  {links.proxima_live ? (
                    <a
                      href={links.proxima_live}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ size: "sm" })}
                    >
                      Próxima live
                    </a>
                  ) : null}
                  {links.youtube ? (
                    <a
                      href={links.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ size: "sm", variant: "outline" })}
                    >
                      Ver canal
                    </a>
                  ) : null}
                </div>
              </div>

              {videos.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-3">
                  {videos.map((v) => (
                    <li key={v.id}>
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block overflow-hidden rounded-lg ring-1 ring-foreground/10"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.thumb}
                          alt=""
                          loading="lazy"
                          className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                        <p className="line-clamp-2 p-2 text-xs font-medium leading-snug">{v.titulo}</p>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Os vídeos mais recentes aparecem aqui.</p>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
