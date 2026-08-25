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
]
