/**
 * Por qual template o editor abre a página de um post (21/09/2026).
 *
 * `SocialPost.templateId` é gravado na criação do post e nada o reaponta: a
 * peça das avulsas que ganha data (`moverPaginaParaSemana`, chamado por
 * `agendarPost` DEPOIS de criar o post) e a remarcada (`refilarPaginasDoPost`)
 * mudam só `Page.templateId`. Com a coluna, "Editar Template" abria a pasta
 * ANTIGA, o editor não achava o `pageId` lá e caía na primeira página daquele
 * template — outra peça.
 *
 * A página diz onde mora; a coluna só vale para post sem página. Quem consulta
 * o post precisa trazer `PageRef: { select: { templateId: true } }`. É leitura:
 * não reescreve o post, então vale para o congelado e para todo post antigo,
 * sem backfill.
 */
export function comTemplateDaPagina<P extends { templateId: number | null; PageRef?: { templateId: number } | null }>({
  PageRef,
  ...post
}: P) {
  return { ...post, templateId: PageRef?.templateId ?? post.templateId }
}
