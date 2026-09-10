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
 * Módulo puro: a invalidação (Prisma) e a recomposição (`defasagem.ts`) fazem a
 * MESMA pergunta, e as duas metades divergirem é o defeito de origem.
 */
export function renderDaPaginaCobreAMidia(mediaUrls: readonly unknown[] | null | undefined): boolean {
  return (mediaUrls?.length ?? 0) <= 1
}
