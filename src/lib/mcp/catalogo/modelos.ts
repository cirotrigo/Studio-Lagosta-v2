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
]
