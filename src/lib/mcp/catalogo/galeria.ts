/**
 * Catálogo · gestão da GALERIA de artes (17/11/2026).
 *
 * Até aqui o conector via UMA arte por id (ver-geracao) e não apagava nenhuma: o agente que compunha uma
 * peça de teste e cancelava o post ficava com a arte na galeria, sem saída. `listar-artes` é a leitura;
 * `apagar-arte` (uma arte) e `limpar-galeria` (a faxina das nunca usadas) são destrutivas e ficam FORA do
 * perfil só-rascunho (`TOOLS_DRAFT_ONLY` é allowlist).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; db e serviços por `await import()` no handler.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'
import {
  DIAS_MINIMOS_DA_FAXINA,
  DIAS_PADRAO_DA_FAXINA,
  LIMITE_MAXIMO_DA_FAXINA,
  LIMITE_PADRAO_DA_FAXINA,
  USOS_DA_ARTE,
} from '../../creatives/galeria-regras'

export const toolsDeGaleria = [
  definirTool({
    nome: 'listar-artes',
    descricao:
      'Lista as artes da GALERIA de um cliente, da mais recente para a mais antiga: generationId, nome, formato, situação, data de criação (Brasília), URL da imagem, o pageId e o link do editor quando a arte tem página, e se ela está EM USO por algum post da agenda (`posts`: postId, situação — rascunho/agendado/publicando/publicado/falhou —, horário e se já foi para o Zernio). `podeApagar` adianta se apagar-arte aceitaria a arte. Filtros opcionais: período de criação (`de`/`ate`), texto do `nome` (nome do arquivo ou do modelo) e `uso` — "publicada" (já foi ao ar em algum post), "na-agenda" (está em rascunho ou agendado, ainda não publicada) ou "nunca-usada" (nenhum post a usa). Paginada: `limite` (padrão 20, máximo 50) e `pagina`; `temMais` diz se há mais. Fotos de cena do acervo não aparecem (não são arte). Não grava nada. Para o andamento e os detalhes de UMA arte, use ver-geracao.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      de: z.string().optional().describe('Criadas a partir de ("AAAA-MM-DD", dia de Brasília, ou ISO).'),
      ate: z.string().optional().describe('Criadas até ("AAAA-MM-DD", dia inteiro, ou ISO).'),
      nome: z.string().optional().describe('Texto contido no nome da arte (sem diferenciar maiúsculas).'),
      uso: z.enum(USOS_DA_ARTE).optional().describe('Só as publicadas, só as que estão na agenda sem publicar, ou só as nunca usadas.'),
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
        uso: args.uso,
        limite: typeof args.limite === 'number' ? args.limite : undefined,
        pagina: typeof args.pagina === 'number' ? args.pagina : undefined,
        appUrl: getPublicAppUrl(),
      })
    },
  }),

  definirTool({
    nome: 'apagar-arte',
    descricao:
      'APAGA UMA arte da galeria (o generationId vem de listar-artes ou de quem a criou): a arte na galeria e a imagem no armazenamento saem de vez, e o arquivo do Drive vai para a lixeira do Drive. É ação DESTRUTIVA e SEM DESFAZER: confirme com a pessoa antes, citando a arte (nome e data), e nunca apague por conta própria. Para a faxina em lote das artes que nunca foram usadas existe limpar-galeria; não faça lote chamando esta em série. Com `simular: true` nada é gravado: a resposta diz o que seria apagado e o que impediria — use antes de confirmar.\n\nRecusa, com o código e o motivo: arte em uso por post que ainda está na agenda (rascunho, agendado, publicando, publicado ou falhou) — ARTE_EM_USO_NA_AGENDA; arte de post que já foi para o Zernio — ARTE_EM_POST_NO_ZERNIO; arte ainda sendo gerada; foto de cena do acervo; e arte de outro cliente (não encontrada). Para liberar uma arte presa a rascunho ou agendado, o post sai da agenda antes (cancelar-post) ou recebe outra arte (trocar-arte-do-post); arte de post publicado não se apaga.\n\nA PÁGINA da peça (a que abre no editor) NÃO é apagada por padrão: continua na pasta de templates, e a resposta traz o link dela. Com `apagarPagina: true` ela sai junto, mas só quando ninguém mais depende dela: página que é modelo, que está em post da agenda, em item de plano, que é referência de layout aprovada, que tem outra arte ou que é a última da pasta fica, e a resposta diz o motivo (a arte sai do mesmo jeito). Só peça apagarPagina quando a pessoa disser que a peça inteira é descartável (teste, rascunho abandonado). Quando a imagem da arte é também a miniatura de uma página que fica, o arquivo da imagem é mantido e a resposta avisa. Apaga uma arte por chamada.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente dono da arte.'),
      generationId: z.string().min(1).describe('A arte a apagar (generationId de listar-artes).'),
      simular: z.boolean().optional().describe('true = só mostra o que seria apagado e o que impede; nada é gravado.'),
      apagarPagina: z.boolean().optional().describe('true = apaga também a página da peça no editor, se ninguém mais depender dela. Padrão: a página fica.'),
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
        apagarPagina: args.apagarPagina === true,
        appUrl: getPublicAppUrl(),
      })
    },
  }),

  definirTool({
    nome: 'limpar-galeria',
    descricao:
      'A FAXINA da galeria de um cliente: apaga, em lote, as artes que NUNCA entraram em post da agenda e têm mais de `dias` dias (padrão 30, mínimo 7), levando junto a página da peça quando ninguém mais depende dela. É DESTRUTIVA e SEM DESFAZER pelo Studio: a arte e a imagem saem de vez; o arquivo do Drive vai para a lixeira do Drive.\n\nFunciona em DUAS chamadas, e a do meio é a pessoa:\n1. Chame SEM `confirmar`. Nada é apagado: a resposta é a conta — quantas artes nunca foram usadas, quantas sairiam (e por onde entraram: `porOrigem`), quantas ficam protegidas e por quê, a mais antiga e a mais recente, e uma amostra com nome, data e imagem.\n2. Mostre essa conta à pessoa. Só com um sim explícito dela, chame de novo com `confirmar: true`. Cada chamada apaga até `limite` artes (padrão 20, máximo 40), das mais antigas para as mais novas, e diz quantas restam; repita enquanto a pessoa quiser.\n\nFicam SEMPRE, mesmo sem uso: arte em qualquer post da agenda (rascunho, agendado, publicado ou falhou), arte cuja página está em post, arte que mora só no Drive (histórico recuperado ou arquivado: pode ter ido ao ar e o vínculo se perdeu), referência de estilo, arte com "gostei", arte ligada a item de plano, carrossel com algum slide em uso, a original de uma melhoria que foi ao ar, vídeo e foto de cena do acervo. "Nunca usada" é o que a agenda do Studio sabe: arte publicada por fora (direto no Zernio ou no Instagram) aparece como nunca usada — diga isso à pessoa junto com a conta. Cada arte é conferida de novo na hora de sair; a que entrou num post nesse meio-tempo é pulada, com o motivo. Nunca rode por conta própria nem para "arrumar" antes de uma tarefa: só a pedido da pessoa, um cliente por vez. Para apagar UMA arte específica (inclusive recente), use apagar-arte.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      dias: z
        .number()
        .int()
        .min(DIAS_MINIMOS_DA_FAXINA)
        .optional()
        .describe(`Idade mínima da arte, em dias (padrão ${DIAS_PADRAO_DA_FAXINA}, mínimo ${DIAS_MINIMOS_DA_FAXINA}).`),
      limite: z
        .number()
        .int()
        .min(1)
        .max(LIMITE_MAXIMO_DA_FAXINA)
        .optional()
        .describe(`Quantas apagar nesta chamada (padrão ${LIMITE_PADRAO_DA_FAXINA}, máximo ${LIMITE_MAXIMO_DA_FAXINA}).`),
      confirmar: z
        .boolean()
        .optional()
        .describe('Só `true`, e só depois de a pessoa ver a conta e dizer sim. Sem isto a chamada é simulação.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    // Curador, não membro: a faxina muda a galeria de todo mundo que cria arte deste cliente.
    acesso: { tipo: 'curador' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ limparGaleriaDoCliente }, { getPublicAppUrl }] = await Promise.all([
        import('../../creatives/galeria'),
        import('../../creatives/persist'),
      ])
      return limparGaleriaDoCliente({
        projectId: args.projectId as number,
        dias: typeof args.dias === 'number' ? args.dias : undefined,
        limite: typeof args.limite === 'number' ? args.limite : undefined,
        confirmar: args.confirmar === true,
        appUrl: getPublicAppUrl(),
      })
    },
  }),
]
