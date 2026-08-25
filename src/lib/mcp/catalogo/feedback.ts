/**
 * Catálogo · feedback das artes (PR 5 da migração para o registro).
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

export const toolsDeFeedback = [
  definirTool({
    nome: 'ver-feedback-das-artes',
    descricao:
      'Mostra o que as pessoas acharam das artes deste cliente: "gostei" ou "preciso melhorar", com o comentário de quem pediu melhoria, a data e o link da arte. É o relatório para responder "as artes estão agradando?" e, principalmente, para LER os comentários — eles dizem em palavras o que precisa mudar na próxima leva (texto grande demais, foto escura, marca sumida). Sem período, traz as mais recentes. Use antes de propor uma nova leva: repetir o que já foi reprovado é o erro mais caro.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      de: z.string().optional().describe('Data inicial ("AAAA-MM-DD" ou ISO). Opcional.'),
      ate: z.string().optional().describe('Data final ("AAAA-MM-DD" ou ISO). Opcional.'),
      veredito: z
        .enum(['gostei', 'melhorar'])
        .optional()
        .describe('Filtra só os elogios ou só os pedidos de melhoria (opcional).'),
      limit: z.number().optional().describe('Máximo de itens (default 50, teto 200).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ listarFeedbacks, normalizarVeredito }, { formatarBRT }] = await Promise.all([
        import('../../aprendizado/feedback-de-arte'),
        import('../../posts/agenda-acoes'),
      ])
      const projectId = args.projectId as number

      // Mesma leitura de datas de ver-agenda: dia solto é o dia INTEIRO em
      // Brasília, senão "de 10/08" começaria às 21h do dia 9.
      const de =
        typeof args.de === 'string'
          ? new Date(args.de.length === 10 ? `${args.de}T00:00:00-03:00` : args.de)
          : undefined
      const ate =
        typeof args.ate === 'string'
          ? new Date(args.ate.length === 10 ? `${args.ate}T23:59:59-03:00` : args.ate)
          : undefined

      const feedbacks = await listarFeedbacks({
        projectId,
        desde: de,
        ate,
        veredito: normalizarVeredito(args.veredito),
        limit: typeof args.limit === 'number' ? args.limit : 50,
      })

      const itens = feedbacks.map((f) => ({
        opiniao: f.veredito === 'gostei' ? 'gostei' : 'preciso melhorar',
        comentario: f.comentario,
        quando: formatarBRT(new Date(f.quando)),
        quem: f.quem,
        arte: f.arte?.resultUrl ?? null,
        generationId: f.generationId,
        ...(f.arte?.templateName ? { modelo: f.arte.templateName } : {}),
      }))

      const gostei = feedbacks.filter((f) => f.veredito === 'gostei').length
      const melhorar = feedbacks.length - gostei

      return {
        itens,
        total: itens.length,
        resumo: { gostei, precisaMelhorar: melhorar },
        ...(itens.length === 0
          ? {
              mensagem:
                'Ninguém opinou sobre as artes deste cliente ainda. O botão fica no rodapé da arte aberta, na galeria de criativos e na prévia da bancada.',
            }
          : {}),
      }
    },
  }),
]
