import type { VideoYouTube } from "@/lib/tipos";

/**
 * Últimos vídeos de um canal via RSS público (sem API key).
 * Cache de 1h pelo fetch do Next. Qualquer erro devolve lista vazia.
 */
export async function ultimosVideos(canalId: string, limite = 3): Promise<VideoYouTube[]> {
  if (!canalId) return [];
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(canalId)}`,
      { next: { revalidate: 3600 }, headers: { accept: "application/atom+xml, application/xml" } },
    );
    if (!res.ok) return [];
    const xml = await res.text();
    return parsearFeed(xml).slice(0, limite);
  } catch (e) {
    console.warn("[youtube] falha ao ler RSS", e instanceof Error ? e.message : e);
    return [];
  }
}

function desescapar(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

/** Parser mínimo do Atom do YouTube: uma <entry> por vídeo. */
export function parsearFeed(xml: string): VideoYouTube[] {
  const videos: VideoYouTube[] = [];
  const entradas = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  for (const entrada of entradas) {
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entrada)?.[1];
    const titulo = /<title>([\s\S]*?)<\/title>/.exec(entrada)?.[1];
    const publicado = /<published>([^<]+)<\/published>/.exec(entrada)?.[1];
    if (!id || !titulo) continue;
    videos.push({
      id,
      titulo: desescapar(titulo),
      url: `https://www.youtube.com/watch?v=${id}`,
      publicadoEm: publicado ?? "",
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  return videos;
}
