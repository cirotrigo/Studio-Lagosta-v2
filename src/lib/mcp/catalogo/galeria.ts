/**
 * Catálogo · gestão da GALERIA de artes (17/11/2026).
 *
 * Até aqui o conector via UMA arte por id (ver-geracao) e não apagava nenhuma: o agente que compunha uma
 * peça de teste e cancelava o post ficava com a arte na galeria, sem saída. `listar-artes` é a leitura;
 * `apagar-arte` é destrutiva e fica FORA do perfil só-rascunho (`TOOLS_DRAFT_ONLY` é allowlist).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; db e serviços por `await import()` no handler.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

export const toolsDeGaleria = [
  definirTool({
    nome: 'listar-artes',
    descricao:
      'Lista as artes da GALERIA de um cliente, da mais recente para a mais antiga: generationId, nome, formato, situação, data de criação (Brasília), URL da imagem, o pageId e o link do editor quando a arte tem página, e se ela está EM USO por algum post da agenda (`posts`: postId, situação — rascunho/agendado/publicando/publicado/falhou —, horário e se já foi para o Zernio). `podeApagar` adianta se apagar-arte aceitaria a arte. Filtros opcionais: período de criação (`de`/`ate`) e texto do `nome` (nome do arquivo ou do modelo). Paginada: `limite` (padrão 20, máximo 50) e `pagina`; `temMais` diz se há mais. Fotos de cena do acervo não aparecem (não são arte). Não grava nada. Para o andamento e os detalhes de UMA arte, use ver-geracao.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      de: z.string().optional().describe('Criadas a partir de ("AAAA-MM-DD", dia de Brasília, ou ISO).'),
      ate: z.string().optional().describe('Criadas até ("AAAA-MM-DD", dia inteiro, ou ISO).'),
      nome: z.string().optional().describe('Texto contido no nome da arte (sem diferenciar maiúsculas).'),
      limite: z.number().int().min(1).optional().describe('Quantas por página (padrão 20, máximo 50).'),
      pagina: z.number().int().min(1).optional().describe('Página, a partir de 1 (padrão 1).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ listarArtesDaGaleria }, { getPublicAppUrl }] = await Promise.all([
        import('../../creatives/galeria'),
        import('../../creatives/persist'),
      ])
      return listarArtesDaGaleria({
        projectId: args.projectId as number,
        de: typeof args.de === 'string' ? args.de : undefined,
        ate: typeof args.ate === 'string' ? args.ate : undefined,
        nome: typeof args.nome === 'string' ? args.nome : undefined,
        limite: typeof args.limite === 'number' ? args.limite : undefined,
        pagina: typeof args.pagina === 'number' ? args.pagina : undefined,
        appUrl: getPublicAppUrl(),
      })
    },
  }),

  definirTool({
    nome: 'apagar-arte',
    descricao:
      'APAGA UMA arte da galeria (o generationId vem de listar-artes ou de quem a criou): o arquivo no Drive, a imagem no armazenamento e a arte na galeria. É ação DESTRUTIVA e SEM DESFAZER: confirme com a pessoa antes, citando a arte (nome e data), e nunca apague por conta própria nem em lote. Com `simular: true` nada é gravado: a resposta diz o que seria apagado e o que impediria — use antes de confirmar.\n\nRecusa, com o código e o motivo: arte em uso por post que ainda está na agenda (rascunho, agendado, publicando, publicado ou falhou) — ARTE_EM_USO_NA_AGENDA; arte de post que já foi para o Zernio — ARTE_EM_POST_NO_ZERNIO; arte ainda sendo gerada; foto de cena do acervo; e arte de outro cliente (não encontrada). Para liberar uma arte presa a rascunho ou agendado, o post sai da agenda antes (cancelar-post) ou recebe outra arte (trocar-arte-do-post); arte de post publicado não se apaga.\n\nA PÁGINA da peça (a que abre no editor) NÃO é apagada: continua na pasta de templates, e a resposta traz o link dela. Quando a imagem da arte é também a miniatura dessa página, o arquivo da imagem é mantido e a resposta avisa. Apaga uma arte por chamada.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente dono da arte.'),
      generationId: z.string().min(1).describe('A arte a apagar (generationId de listar-artes).'),
      simular: z.boolean().optional().describe('true = só mostra o que seria apagado e o que impede; nada é gravado.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ apagarArteDaGaleria }, { getPublicAppUrl }] = await Promise.all([
        import('../../creatives/galeria'),
        import('../../creatives/persist'),
      ])
      return apagarArteDaGaleria({
        projectId: args.projectId as number,
        generationId: args.generationId as string,
        simular: args.simular === true,
        appUrl: getPublicAppUrl(),
      })
    },
  }),
]
