/**
 * O render da página cobre a mídia deste post? Só então a invalidação pode
 * devolvê-lo à fila de render.
 *
 * `renderPostArt` grava UMA imagem (`mediaUrls: [url]`). Post com uma mídia ou
 * nenhuma é coberto por esse render; post com várias — o carrossel que nasceu
 * da página e ganhou fotos na agenda — seria reduzido a um slide só.
 *
 * A regra é de CONTAGEM, não de URL: `renderedImageUrl` e `mediaUrls` são
 * gravados por caminhos diferentes (o agendador do editor guarda a URL crua
 * num e a normalizada no outro), e uma comparação que errasse diria "não é o
 * render" de um post que é — a edição da página deixaria de chegar a ele em
 * silêncio, que é o defeito que isto existe para evitar.
 *
 * VÍDEO nunca é coberto: o render da página é imagem. Devolver à fila um post
 * cuja mídia é o MP4 exportado apagaria o vídeo e, como o render recusa página
 * com vídeo, o post terminaria em falha de publicação. Medido em 02/10/2026:
 * zero posts com página e mídia de vídeo em produção — a porta fecha antes de
 * o caminho ganhar uso.
 *
 * Módulo puro: a invalidação (Prisma) e a recomposição (`defasagem.ts`) fazem a
 * MESMA pergunta, e as duas metades divergirem é o defeito de origem.
 */
import { isVideoUrl } from '../media-type'

export function renderDaPaginaCobreAMidia(mediaUrls: readonly unknown[] | null | undefined): boolean {
  const midias = mediaUrls ?? []
  return midias.length <= 1 && !midias.some((u) => typeof u === 'string' && isVideoUrl(u))
}
