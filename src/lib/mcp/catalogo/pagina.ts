/**
 * Catálogo · a página do editor como DADOS (T1 do plano "artes de ponta a ponta pelo MCP", 05/11/2026).
 *
 * Até aqui nenhuma tool remota devolvia as camadas de uma página: `ver-geracao` lê `layers` e não expõe,
 * `revisar-arte` devolve só ids, `escolher-modelo` devolve `slotFields` sem geometria. "Operar pelos dados" começa
 * por ler a arte como dados — e a `versao` que sai daqui é a `versaoEsperada` que `ajustar-arte` exige em `camadas`.
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; db e serviços por `await import()` no handler.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

export const toolsDePagina = [
  definirTool({
    nome: 'ver-pagina',
    descricao:
      'Lê uma PÁGINA do editor como dados: as camadas (id, tipo, nome, visível, travada, ordem, posição, tamanho, rotação, conteúdo, fileUrl, estilo, efeitos, caixa de texto) e a página (formato, largura, altura, fundo, se é modelo, tags), com a `versao` atual e o link do editor. É o ponto de partida para editar pelos dados: ver-pagina → ajustar-arte com `camadas`/`pagina` e `versaoEsperada` = esta `versao` → ver-geracao (a imagem) → ver-pagina de novo. Aceita pageId ou generationId (a página da arte). Não grava nada. Marcas de leitura: `grupo` (camada de um grupo: remover/reordenar são recusados; definir vale) e `grade: true` (célula de grade de fotos: não se edita por aqui). Texto com destaque traz `conteudoMarcado` (o content com as palavras destacadas entre [colchetes]) ao lado do `content` limpo: para mudar o texto ou o destaque, mande o conteúdo com colchetes em ajustar-arte (`definir content` ou slotValues). Página ilegível devolve erro, nunca uma lista vazia.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      pageId: z.string().optional().describe('A página (pageId de compor-arte, criar-arte, criar-arte-de-modelo, ajustar-arte, ver-geracao ou do post).'),
      generationId: z.string().optional().describe('Alternativa ao pageId: o id da arte; a página é a gravada nela.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ db }, { CreativeError }, { getPublicAppUrl }, { lerCamadas }, { versaoDaPagina }, { formatoDaPaginaGravada }, { camadaParaLeitura }, { videoNaPagina }] = await Promise.all([
        import('../../db'),
        import('../../creatives/errors'),
        import('../../creatives/persist'),
        import('../../posts/page-layers'),
        import('../../creatives/revisao/versao'),
        import('../../compositor/formato'),
        import('../../creatives/editar-camadas'),
        import('../../video/pagina-com-video'),
      ])
      const projectId = args.projectId as number
      let pageId = typeof args.pageId === 'string' && args.pageId.trim() ? args.pageId.trim() : null
      const generationId = typeof args.generationId === 'string' && args.generationId.trim() ? args.generationId.trim() : null
      if (!pageId && !generationId) throw new CreativeError('SEM_PAGINA', 'Informe pageId ou generationId.', 400)
      if (!pageId) {
        const gen = await db.generation.findFirst({ where: { id: generationId!, projectId }, select: { fieldValues: true } })
        if (!gen) throw new CreativeError('GERACAO_NAO_ENCONTRADA', 'Arte não encontrada neste cliente.', 404)
        const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
        pageId = typeof fv.pageId === 'string' && fv.pageId.trim() ? fv.pageId.trim() : null
        if (!pageId) throw new CreativeError('GERACAO_SEM_PAGINA', 'Esta arte não tem página editável (arte de IA ou melhoria): nada a ler.', 422, { generationId })
      }
      const page = await db.page.findUnique({
        where: { id: pageId },
        select: { id: true, name: true, width: true, height: true, background: true, layers: true, isTemplate: true, tags: true, thumbnail: true, templateId: true, updatedAt: true, Template: { select: { name: true, projectId: true } } },
      })
      if (!page) throw new CreativeError('PAGE_NOT_FOUND', `Página não encontrada: ${pageId}`, 404)
      // Sem detalhe de QUAL projeto: a existência da página de outro cliente não vaza.
      if (page.Template.projectId !== projectId) throw new CreativeError('PAGINA_DE_OUTRO_PROJETO', 'Esta página não é deste cliente.', 403, { pageId })
      const { camadas, legivel } = lerCamadas(page.layers)
      if (!legivel) throw new CreativeError('CAMADAS_ILEGIVEIS', 'As camadas desta página não puderam ser lidas (codificação inesperada no banco): abra no editor.', 422, { pageId })
      const versao = versaoDaPagina(page)
      const editUrl = `${getPublicAppUrl()}/templates/${page.templateId}/editor?pageId=${encodeURIComponent(page.id)}`
      const avisos: string[] = []
      if (page.isTemplate) avisos.push('Esta página é um MODELO do cliente: ajustar-arte a recusa (modelo se edita no editor).')
      if (videoNaPagina(page.layers) === 'tem-video') avisos.push('Esta página tem vídeo: o render de imagem e ajustar-arte a recusam.')
      return {
        pageId: page.id,
        nome: page.name,
        templateId: page.templateId,
        templateName: page.Template.name,
        formato: formatoDaPaginaGravada({ tags: page.tags, width: page.width, height: page.height }),
        largura: page.width,
        altura: page.height,
        fundo: page.background,
        isTemplate: page.isTemplate,
        tags: page.tags,
        versao,
        editUrl,
        thumbnail: page.thumbnail,
        atualizadaEm: page.updatedAt,
        camadas: (camadas as never[]).map(camadaParaLeitura),
        ...(avisos.length > 0 ? { avisos } : {}),
        comoAjustar: page.isTemplate ? null : `ajustar-arte com projectId ${projectId}, pageId "${page.id}", versaoEsperada "${versao}" e camadas (definir/adicionar/remover/reordenar por id ou nome) e/ou pagina (background, width, height).`,
      }
    },
  }),
]
