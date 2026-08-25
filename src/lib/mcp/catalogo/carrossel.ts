/**
 * Catálogo · carrossel (PR 4 da migração para o registro).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; serviços por
 * `await import()` relativo dentro do handler.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'
import type { SlideSpec } from '../../ai/carousel-service'

export const toolsDeCarrossel = [
  definirTool({
    nome: 'criar-carrossel',
    descricao:
      'Cria um CARROSSEL de Instagram (3 a 8 slides) com visual coerente entre os slides. Funciona em DUAS etapas, e a etapa do meio é a pessoa:\n\n1. Esta tool gera a CAPA (foto pura, SEM texto — é o que faz a série abrir pela imagem) e o SLIDE 2, que é o GUIA: ele define a diagramação, as cores e o tratamento de toda a série.\n2. Você mostra o guia à pessoa (conferir-arte). Aprovado, chame confirmar-estilo-carrossel; os demais slides são gerados copiando o look dele, em paralelo.\n\nNunca pule a confirmação: gerar seis slides no estilo errado custa seis vezes mais que perguntar.\n\nA capa NÃO leva copy (é recusada). Cada slide a partir do 2 precisa de copy e de uma foto real do acervo. Cada slide custa créditos; esta chamada gera 2.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      slides: z
        .array(
          z
            .object({
              ordem: z.number().describe('Posição no carrossel, de 1 a N. 1 = capa.'),
              copy: z
                .array(z.string())
                .describe('Blocos de texto do slide, na ordem de leitura. VAZIO na capa.'),
              driveFileId: z.string().optional().describe('Foto do acervo (de buscar-fotos).'),
              url: z.string().optional().describe('Alternativa: imagem já no Studio.'),
              label: z.string().optional().describe('Rótulo curto da foto.'),
            })
            .strict(),
        )
        .describe('Os slides, de 1 a N. Varie as fotos: repetir a mesma foto entre slides deixa o carrossel monótono.'),
      legenda: z.string().optional().describe('Legenda do post no feed (guardada para o agendamento).'),
      pedido: z.string().optional().describe('Direção de arte adicional para toda a série (opcional).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ iniciarCarrossel }, { enfileirarArte }, { resolverDono }] = await Promise.all([
        import('../../ai/carousel-service'),
        import('../../ai/generation-queue'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      const slidesIn = (args.slides ?? []) as Array<Record<string, unknown>>
      const slides: SlideSpec[] = slidesIn.map((s) => ({
        ordem: Number(s.ordem),
        copy: Array.isArray(s.copy) ? s.copy.filter((c: unknown): c is string => typeof c === 'string') : [],
        driveFileId: typeof s.driveFileId === 'string' ? s.driveFileId : undefined,
        url: typeof s.url === 'string' ? s.url : undefined,
        label: typeof s.label === 'string' ? s.label : undefined,
      }))

      const dono = await resolverDono(projectId, principal)
      const r = await iniciarCarrossel({
        projectId,
        slides,
        legenda: typeof args.legenda === 'string' ? args.legenda : undefined,
        pedido: typeof args.pedido === 'string' ? args.pedido : undefined,
        actorClerkId: dono.clerkId,
      })
      // Duas gerações numa invocação era metade do problema que a fila resolve.
      for (const runnerArgs of r.runnerArgs) {
        await enfileirarArte(runnerArgs)
      }

      return {
        carrosselId: r.carrosselId,
        totalSlides: r.totalSlides,
        gerando: ['capa (slide 1)', 'guia (slide 2)'],
        tempoEstimado: 'cerca de 2 a 3 minutos',
        mensagem: `Capa e guia em produção. Em ~3 minutos, veja o slide 2 com conferir-arte (generationId ${r.guiaGenerationId}) e mostre à pessoa: é ele que define o visual dos outros ${r.totalSlides - 2} slides. Com o OK, chame confirmar-estilo-carrossel com carrosselId=${r.carrosselId}.`,
        guiaGenerationId: r.guiaGenerationId,
        capaGenerationId: r.capaGenerationId,
      }
    },
  }),

  definirTool({
    nome: 'confirmar-estilo-carrossel',
    descricao:
      'Depois que a pessoa aprovou o slide-guia, gera os slides restantes copiando o visual dele — posição do texto, cores, elementos gráficos e tratamento da foto. Os slides saem em paralelo (1 a 3 minutos no total, não por slide).\n\nSó chame com aprovação explícita de quem responde pelo cliente. Se o guia não agradou, NÃO confirme: crie o carrossel de novo com outra direção, ou ajuste o guia com ajustar-arte antes.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      carrosselId: z.string().describe('O carrosselId devolvido por criar-carrossel.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ confirmarEstiloCarrossel }, { enfileirarArte }, { resolverDono }] = await Promise.all([
        import('../../ai/carousel-service'),
        import('../../ai/generation-queue'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      const carrosselId = args.carrosselId as string
      const dono = await resolverDono(projectId, principal)

      const r = await confirmarEstiloCarrossel({ projectId, carrosselId, actorClerkId: dono.clerkId })
      // Até 6 slides. Era o pior caso do teto compartilhado: seis `after()`
      // dividindo os mesmos 300s. Agora todos entram na fila e saem de lá.
      for (const runnerArgs of r.runnerArgs) {
        await enfileirarArte(runnerArgs)
      }

      return {
        gerando: r.gerados.map((g) => `slide ${g.ordem}`),
        tempoEstimado: 'cerca de 2 a 3 minutos (os slides saem em paralelo)',
        mensagem: `Gerando ${r.gerados.length} slide(s) com o look do guia. Acompanhe com ver-carrossel; quando todos estiverem prontos, agende com colocar-na-agenda usando as mídias na ordem.`,
      }
    },
  }),

  definirTool({
    nome: 'ver-carrossel',
    descricao:
      'Situação de um carrossel: quais slides já ficaram prontos, qual está gerando e se a série espera a confirmação do estilo. Quando completo, devolve as imagens NA ORDEM, prontas para colocar-na-agenda.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      carrosselId: z.string().describe('O carrosselId devolvido por criar-carrossel.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { verCarrossel } = await import('../../ai/carousel-service')
      const projectId = args.projectId as number
      const estado = await verCarrossel(projectId, args.carrosselId as string)
      return {
        ...estado,
        dica: estado.esperandoConfirmacao
          ? 'O guia está pronto: mostre-o à pessoa e, com o OK, chame confirmar-estilo-carrossel.'
          : estado.midiasEmOrdem
            ? 'Série completa. Agende com colocar-na-agenda passando estas imagens na ordem e o tipo CARROSSEL.'
            : 'Ainda gerando — consulte de novo em ~1 minuto.',
      }
    },
  }),
]
