/**
 * Catálogo · modelos (arte a partir de layout pronto do cliente).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; serviço e
 * helpers por `await import()` relativo dentro do handler.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

export const toolsDeModelos = [
  definirTool({
    nome: 'escolher-modelo',
    apelidos: ['prepare-creative'],
    descricao:
      'Acha o modelo pronto do cliente que combina com um tema (e dia), devolvendo os campos de texto a preencher e a identidade da marca. Use quando o cliente tem modelo cadastrado para aquele tema; depois use criar-arte-de-modelo. Se não houver modelo, prefira criar-arte, que monta do zero.',
    schema: z.object({
      projectId: z.number().optional().describe('ID do projeto (preferido). Veja list-projects.'),
      projectHint: z.string().optional().describe('Nome ou parte do nome do projeto, se não souber o id.'),
      theme: z.string().describe('Tema do criativo (ex: "happy hour", "almoço executivo", "delivery").'),
      day: z.string().optional().describe('Dia da semana em PT para desempatar (ex: "sexta", "sabado").'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    // O gate declarado dispara quando projectId vem como número; sem ele o
    // serviço resolve por projectHint — mesmo contrato de sempre.
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { prepareCreative } = await import('../../creatives/arte-rapida')
      return prepareCreative({
        projectId: typeof args.projectId === 'number' ? args.projectId : undefined,
        projectHint: typeof args.projectHint === 'string' ? args.projectHint : undefined,
        theme: args.theme as string,
        day: typeof args.day === 'string' ? args.day : undefined,
      })
    },
  }),

  definirTool({
    nome: 'criar-arte-de-modelo',
    apelidos: ['create-arte-rapida'],
    descricao:
      'Monta a arte em cima de um modelo pronto do cliente (o que veio de escolher-modelo). Devolve a imagem e um link para abrir e ajustar no editor.',
    // Os `.describe()` são o que o modelo lê ao preencher os argumentos — os
    // textos vêm VERBATIM do literal antigo, e o snapshot do
    // validar-registro-mcp.ts confere que a derivação continua idêntica.
    schema: z.object({
      projectId: z.number().describe('ID do projeto.'),
      sourcePageId: z.string().describe('ID da página de template (prepare-creative.page.id).'),
      slotValues: z
        .record(z.any())
        .optional()
        .describe(
          'Valores por slot, com as chaves do template (layerId ou nome da camada). String define texto; objeto aceita {content, fileUrl}. Chaves reservadas: _driveImageId, _imageUrl.',
        ),
      name: z.string().optional().describe('Nome da página gerada (opcional).'),
      imageUrl: z
        .string()
        .optional()
        .describe('URL pública da imagem de fundo. Tem prioridade sobre _driveImageId.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ createArteRapida }, { quemDecidiu }] = await Promise.all([
        import('../../creatives/arte-rapida'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      return createArteRapida({
        projectId,
        sourcePageId: args.sourcePageId as string,
        slotValues: (args.slotValues ?? {}) as Record<string, unknown>,
        name: args.name as string | undefined,
        imageUrl: args.imageUrl as string | undefined,
        decididoPor: await quemDecidiu(projectId, principal),
      })
    },
  }),

  definirTool({
    nome: 'listar-modelos',
    descricao:
      'Lista os modelos do cliente (as páginas que escolher-modelo consegue encontrar) com as tags de tema de cada um. Com incluirNaoMarcadas=true, lista também as páginas comuns — útil para achar uma arte boa e promovê-la com marcar-como-modelo. Clientes sem modelo nenhum dependem de criar-arte (do zero) para tudo.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      incluirNaoMarcadas: z
        .boolean()
        .optional()
        .describe('Inclui páginas que ainda não são modelo (candidatas a promoção).'),
      limit: z.number().optional().describe('Máximo de páginas (default 50, teto 200).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { db } = await import('../../db')
      const projectId = args.projectId as number
      const incluirNaoMarcadas = args.incluirNaoMarcadas === true
      const take = Math.min(typeof args.limit === 'number' ? args.limit : 50, 200)

      const paginas = await db.page.findMany({
        where: {
          Template: { projectId },
          ...(incluirNaoMarcadas ? {} : { isTemplate: true }),
        },
        select: {
          id: true,
          name: true,
          isTemplate: true,
          tags: true,
          updatedAt: true,
          Template: { select: { id: true, name: true, type: true, tags: true } },
        },
        orderBy: [{ isTemplate: 'desc' }, { updatedAt: 'desc' }],
        take,
      })

      const modelos = paginas
        .filter((p) => p.isTemplate)
        .map((p) => ({
          pageId: p.id,
          nome: p.name,
          template: p.Template.name,
          formato: p.Template.type,
          temas: Array.from(new Set([...(p.tags ?? []), ...(p.Template.tags ?? [])])),
        }))
      const candidatas = incluirNaoMarcadas
        ? paginas
            .filter((p) => !p.isTemplate)
            .map((p) => ({
              pageId: p.id,
              nome: p.name,
              template: p.Template.name,
              formato: p.Template.type,
              atualizadaEm: p.updatedAt,
            }))
        : undefined

      return {
        modelos,
        countModelos: modelos.length,
        ...(candidatas ? { candidatas, countCandidatas: candidatas.length } : {}),
        ...(modelos.length === 0
          ? {
              aviso:
                'Este cliente não tem nenhum modelo marcado — criar-arte (do zero) é o único caminho. Considere promover uma arte boa com marcar-como-modelo.',
            }
          : {}),
      }
    },
  }),

  definirTool({
    nome: 'marcar-como-modelo',
    descricao:
      'Promove uma página a MODELO do cliente (ou despromove): modelos são o que escolher-modelo encontra por tema, então uma arte que ficou boa pode virar base das próximas. As tags são o que casa o modelo com o tema pedido (ex: "happy-hour", "almoco-executivo") — sem tag, o modelo não é encontrado por tema.\n\nConfirme com a pessoa antes de marcar: modelo aparece para todos que criam arte deste cliente. Tags enviadas SUBSTITUEM as atuais.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      pageId: z.string().describe('A página a marcar (de criar-arte, ajustar-arte ou listar-modelos).'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Temas do modelo, normalizados com hífen (ex: ["happy-hour", "sexta"]). Substituem as tags atuais.'),
      marcar: z.boolean().optional().describe('true (default) marca como modelo; false despromove.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    // Curadoria, não edição: o modelo passa a valer para todos que criam arte
    // deste cliente. Mesmo gate das três portas equivalentes na web — acesso
    // "curador", como marcar-foto-destaque em fotos.ts.
    acesso: { tipo: 'curador' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ db }, { CreativeError }] = await Promise.all([
        import('../../db'),
        import('../../creatives/errors'),
      ])
      const projectId = args.projectId as number
      const pageId = args.pageId as string
      const marcar = args.marcar !== false

      const page = await db.page.findUnique({
        where: { id: pageId },
        include: { Template: { select: { projectId: true, name: true } } },
      })
      if (!page || page.Template.projectId !== projectId) {
        throw new CreativeError('PAGE_NOT_FOUND', 'Página não encontrada neste cliente.', 404)
      }

      const tags = Array.isArray(args.tags)
        ? (args.tags as string[]).filter((t) => t.trim().length > 0)
        : undefined

      const updated = await db.page.update({
        where: { id: pageId },
        data: {
          isTemplate: marcar,
          ...(tags !== undefined ? { tags } : {}),
        },
        select: { id: true, name: true, isTemplate: true, tags: true },
      })

      const tagsFinais = updated.tags ?? []
      return {
        atualizada: true,
        page: updated,
        mensagem: marcar
          ? `"${updated.name}" agora é modelo do cliente${tagsFinais.length ? ` (temas: ${tagsFinais.join(', ')})` : ''}.`
          : `"${updated.name}" deixou de ser modelo.`,
        ...(marcar && tagsFinais.length === 0
          ? {
              aviso:
                'O modelo ficou SEM tags de tema — escolher-modelo não vai encontrá-lo. Envie tags (ex: "happy-hour") para ele valer.',
            }
          : {}),
      }
    },
  }),
]
