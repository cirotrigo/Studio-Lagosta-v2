/**
 * Catálogo · agenda (PR 2 da migração para o registro).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro (zod,
 * registro/, tipos); db, serviços e helpers entram por `await import()`
 * relativo DENTRO do handler — o validar-registro-mcp.ts carrega este módulo
 * sem env nenhum no CI.
 *
 * É o lote onde as annotations mais importam: postar-agora e cancelar-post
 * são destrutivas (publicação real / remoção sem desfazer); ver-agenda é a
 * única leitura pura — sugerir-posts NÃO é readOnly porque registra cada slot
 * emitido como LearningSignal (F1).
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'
import type { EscopoAprendizado } from '../../posts/learning-scope'

const TIPOS_DE_POST = ['STORY', 'POST', 'REEL', 'CAROUSEL'] as const

export const toolsDeAgenda = [
  definirTool({
    nome: 'ver-agenda',
    apelidos: ['list-posts'],
    descricao:
      'Mostra a agenda do cliente já em linguagem de gente: agrupada por dia, com situação (rascunho/agendado/publicado/falhou), horário de Brasília e a capa de cada arte. Consulte antes de propor data, para não repetir tema nem empilhar posts. Sem período, mostra de ontem em diante. O postId de cada item serve para conferir-arte, editar-post, reagendar-post, aprovar-rascunhos e cancelar-post.\n\nQuando um item traz "aviso", repasse: é post de campanha marcado para depois do fim dela. O campo "escopo" só aparece quando o post não é rotina (campanha ou pontual).',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      from: z.string().optional().describe('Data inicial ("AAAA-MM-DD" ou ISO). Default: ontem.'),
      to: z.string().optional().describe('Data final (opcional).'),
      situacao: z
        .enum(['rascunho', 'agendado', 'publicado', 'falhou'])
        .optional()
        .describe('Filtra por situação (opcional).'),
      limit: z.number().optional().describe('Máximo de posts (default 50).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ db }, { avisosDeCampanhaVencida }, { formatarBRT }, { descreverJanela }, { escopoEmPortugues }] =
        await Promise.all([
          import('../../db'),
          import('../../posts/campanha-vigencia'),
          import('../../posts/agenda-acoes'),
          import('../../posts/freeze-window'),
          import('../../posts/learning-scope'),
        ])
      const projectId = args.projectId as number

      const PARA_STATUS: Record<string, string> = {
        rascunho: 'DRAFT',
        agendado: 'SCHEDULED',
        publicado: 'POSTED',
        falhou: 'FAILED',
      }
      const PARA_SITUACAO: Record<string, string> = {
        DRAFT: 'rascunho',
        SCHEDULED: 'agendado',
        POSTING: 'publicando',
        POSTED: 'publicado',
        FAILED: 'falhou',
      }
      const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

      const from = typeof args.from === 'string'
        ? new Date(args.from.length === 10 ? `${args.from}T00:00:00-03:00` : args.from)
        : new Date(Date.now() - 24 * 3600_000)
      const to = typeof args.to === 'string'
        ? new Date(args.to.length === 10 ? `${args.to}T23:59:59-03:00` : args.to)
        : null
      const statusFiltro =
        typeof args.situacao === 'string' ? PARA_STATUS[args.situacao] : undefined

      const posts = await db.socialPost.findMany({
        where: {
          projectId,
          scheduledDatetime: { gte: from, ...(to ? { lte: to } : {}) },
          ...(statusFiltro ? { status: statusFiltro as never } : {}),
        },
        select: {
          id: true,
          postType: true,
          status: true,
          caption: true,
          scheduledDatetime: true,
          publishedUrl: true,
          publishType: true,
          mediaUrls: true,
          generationId: true,
          laterPostId: true,
          learningScope: true,
          campaignId: true,
        },
        orderBy: { scheduledDatetime: 'asc' },
        take: typeof args.limit === 'number' ? Math.min(args.limit, 200) : 50,
      })

      // Post de campanha marcado para depois do fim dela: aviso por post, com
      // o texto pronto para o modelo repassar. Nunca esconde nem bloqueia.
      const avisosCampanha = await avisosDeCampanhaVencida(projectId, posts)

      const dias: Array<{ data: string; diaSemana: string; posts: unknown[] }> = []
      for (const post of posts) {
        const quando = post.scheduledDatetime!
        const brt = new Date(quando.getTime() - 3 * 3600_000)
        const dataISO = brt.toISOString().slice(0, 10)
        let grupo = dias.find((d) => d.data === dataISO)
        if (!grupo) {
          grupo = { data: dataISO, diaSemana: DIAS[brt.getUTCDay()], posts: [] }
          dias.push(grupo)
        }
        grupo.posts.push({
          postId: post.id,
          tipo: post.postType === 'STORY' ? 'story' : post.postType.toLowerCase(),
          situacao: PARA_SITUACAO[post.status] ?? post.status.toLowerCase(),
          hora: `${String(brt.getUTCHours()).padStart(2, '0')}:${String(brt.getUTCMinutes()).padStart(2, '0')}`,
          quando: formatarBRT(quando),
          legenda: post.caption ? post.caption.slice(0, 140) : null,
          capa: post.mediaUrls?.[0] ?? null,
          publicacao: post.publishType === 'REMINDER' ? 'manual (lembrete no WhatsApp)' : 'automática',
          ...(post.generationId ? { generationId: post.generationId } : {}),
          ...(post.publishedUrl ? { publishedUrl: post.publishedUrl } : {}),
          // Só onde a pergunta se coloca: em rascunho ainda falta aprovar, e
          // em publicado/falhou já não há o que editar.
          ...(post.status === 'SCHEDULED'
            ? { arte: descreverJanela(post).rotulo.toLowerCase() }
            : {}),
          // Só fora do padrão: "rotina" em todo item viraria ruído que o
          // modelo acaba narrando na conversa.
          ...(post.learningScope !== 'ROTINA'
            ? { escopo: escopoEmPortugues(post.learningScope as EscopoAprendizado) }
            : {}),
          ...(avisosCampanha.has(post.id) ? { aviso: avisosCampanha.get(post.id) } : {}),
        })
      }

      return {
        total: posts.length,
        dias,
        ...(posts.length === 0
          ? { dica: 'Nada na agenda neste período. sugerir-posts monta uma proposta a partir da cadência do cliente.' }
          : {}),
      }
    },
  }),

  definirTool({
    nome: 'sugerir-posts',
    descricao:
      'Sugere os próximos posts a partir da CADÊNCIA real do cliente: analisa as últimas 8 semanas (dia da semana × horário), acha os buracos dos próximos dias e devolve slots prontos — cada um com o motivo, o modelo do cliente para aquele dia (quando existe) e as campanhas da base que citam o dia (ex.: Quinta do Vinho). Use quando a pessoa pedir "o que postar essa semana", ou proativamente ao notar a agenda vazia. Você escreve a copy; a sugestão é o esqueleto de quando/o quê.\n\nCada slot vem com um `sugestaoId`: guarde-o e devolva em colocar-na-agenda quando o post nascer daquele horário, mesmo que você o tenha mudado. É só um dado técnico — nunca fale dele na conversa.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      dias: z.number().optional().describe('Quantos dias à frente (default 7, máx 14).'),
    }),
    // NÃO é readOnly: cada slot emitido vira LearningSignal (a sugestão se
    // registra na EMISSÃO — F1). Idempotente pela chave de proposta.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { sugerirPosts } = await import('../../posts/sugerir-posts')
      return sugerirPosts({
        projectId: args.projectId as number,
        dias: typeof args.dias === 'number' ? args.dias : undefined,
      })
    },
  }),

  definirTool({
    nome: 'colocar-na-agenda',
    apelidos: ['agendar-post'],
    descricao:
      'Coloca a arte na agenda do cliente, na data e hora escolhidas.\n\nPor padrão entra como RASCUNHO: aparece na agenda e NÃO publica. Só vira publicação de verdade com situacao="agendado", e isso sai para o Instagram real do cliente na hora marcada.\n\nNunca use "agendado" por conta própria. Mostre antes a arte, a data e o horário, e pergunte de forma direta — "isso vai publicar no Instagram na segunda às 16h, confirma?". Rascunho primeiro é sempre o caminho seguro.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      postType: z.enum(TIPOS_DE_POST).optional().describe('Tipo de publicação (padrão STORY).'),
      caption: z.string().optional().describe('Legenda. Story costuma ir sem.'),
      scheduledDatetime: z.string().describe('Quando: "AAAA-MM-DD HH:mm" no horário de Brasília.'),
      pageId: z.string().optional().describe('A arte criada aqui (veio de criar-arte ou criar-arte-de-modelo).'),
      mediaUrls: z.array(z.string()).optional().describe('Imagens prontas, se não vier de uma arte criada aqui.'),
      generationId: z
        .string()
        .optional()
        .describe(
          'O generationId da arte. Para arte MELHORADA, basta ele — a imagem é resolvida sozinha (sem copiar URL). Vincula o criativo ao post e habilita melhorar depois. Passe sempre que tiver.',
        ),
      situacao: z
        .enum(['rascunho', 'agendado'])
        .optional()
        .describe(
          'rascunho (padrão) só aparece na agenda; agendado publica de verdade no Instagram do cliente. Use "agendado" apenas após confirmação explícita da pessoa.',
        ),
      escopo: z
        .enum(['rotina', 'campanha', 'pontual'])
        .optional()
        .describe(
          'O que o sistema pode aprender com este post. "rotina" (padrão) é o post normal, que forma a cadência e o repertório do cliente. "campanha" é post de ação com começo e fim (festival, semana temática, promoção datada) — aprende para a próxima edição dela, não para a rotina. "pontual" é caso isolado (aviso de feriado, mudança de horário, recado de emergência) e não deve virar padrão nenhum.\n\nMarque quando souber: uma leva costuma misturar os três, e post pontual contado como rotina faz o sistema sugerir aviso de feriado toda semana. Não pergunte à pessoa com esse vocabulário — deduza do que ela pediu.',
        ),
      campanhaId: z
        .string()
        .optional()
        .describe(
          'Id da entrada de CAMPANHAS da base (de consultar-base) a que este post pertence. Informar isso já marca o post como campanha, e é o que permite avisar quando um post está marcado para depois do fim dela.',
        ),
      sugestaoId: z
        .string()
        .optional()
        .describe(
          'Se este post veio de um horário proposto por sugerir-posts, devolva aqui o sugestaoId daquele slot — inclusive quando você mudou o horário. É assim que o sistema aprende quais sugestões são boas: sem isso ele só enxerga o que foi aceito. Não invente nem reaproveite id de outra proposta; sem sugestão, omita.',
        ),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ agendarPost }, { avaliarSlotSugerido, fecharDesfechoDoSlot }, { normalizarEscopo }, { quemDecidiu }] =
        await Promise.all([
          import('../../creatives/agendar'),
          import('../../aprendizado/desfecho-de-slot'),
          import('../../posts/learning-scope'),
          import('../tools'),
        ])
      const projectId = args.projectId as number
      // O compat de status DRAFT/SCHEDULED que o handler antigo lia morreu na
      // porta desde 12/08: o schema nunca declarou `status`, então a guarda de
      // parâmetro desconhecido já recusava a chamada antes do handler.
      const situacao = args.situacao as 'rascunho' | 'agendado' | undefined

      const scheduledDatetime = args.scheduledDatetime as string
      const decididoPor = await quemDecidiu(projectId, principal)
      /**
       * Quem decide se a sugestão foi aceita ou editada é a COMPARAÇÃO de
       * horários, aqui — não o relato do modelo, que tem todo incentivo a
       * dizer que acertou. Vale para a origem gravada no post também.
       */
      const veredito = await avaliarSlotSugerido(
        typeof args.sugestaoId === 'string' ? args.sugestaoId : undefined,
        scheduledDatetime,
      )

      const resultado = await agendarPost({
        projectId,
        postType: args.postType,
        caption: args.caption,
        scheduledDatetime,
        pageId: args.pageId,
        mediaUrls: args.mediaUrls,
        generationId: typeof args.generationId === 'string' ? args.generationId : undefined,
        situacao,
        // Escopo desconhecido cai no padrão do serviço (ROTINA) em vez de
        // derrubar o agendamento: marca errada se conserta, post perdido não.
        learningScope: normalizarEscopo(args.escopo),
        campaignId: typeof args.campanhaId === 'string' ? args.campanhaId : undefined,
        origem: veredito?.origem,
        sugestaoId: veredito?.sugestaoId,
        // User.id INTERNO — nunca o clerkId. Falha aqui não derruba o agendamento.
        decididoPor,
      })

      await fecharDesfechoDoSlot(veredito, {
        postId: resultado.postId,
        generationId: typeof args.generationId === 'string' ? args.generationId : undefined,
        pageId: typeof args.pageId === 'string' ? args.pageId : undefined,
        decididoPor,
        superficie: 'chat',
      })

      return resultado
    },
  }),

  definirTool({
    nome: 'postar-agora',
    descricao:
      'Publica IMEDIATAMENTE no Instagram do cliente: o post entra na fila na hora e sai em ~3 minutos. Não tem rascunho, não tem revisão depois — é publicação real.\n\nNunca chame por conta própria. Mostre a arte e a legenda e faça a pergunta direta: "isso vai pro Instagram de X AGORA, confirma?". Só chame depois do sim explícito. Se a pessoa tiver qualquer hesitação, prefira colocar-na-agenda como rascunho.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      postType: z.enum(TIPOS_DE_POST).optional().describe('Tipo (padrão STORY).'),
      caption: z.string().optional().describe('Legenda. Story costuma ir sem.'),
      pageId: z.string().optional().describe('A arte criada aqui (de criar-arte ou criar-arte-de-modelo).'),
      mediaUrls: z.array(z.string()).optional().describe('Imagens prontas, se não vier de uma arte criada aqui.'),
      generationId: z.string().optional().describe('O generationId da arte, se houver (habilita melhorar depois).'),
      escopo: z
        .enum(['rotina', 'campanha', 'pontual'])
        .optional()
        .describe(
          'O que o sistema pode aprender com este post — mesma escolha de colocar-na-agenda. Publicação imediata costuma ser "pontual" (recado, aviso, algo que aconteceu agora): marcar assim evita que vire cadência.',
        ),
      campanhaId: z
        .string()
        .optional()
        .describe('Id da entrada de CAMPANHAS da base a que este post pertence (de consultar-base).'),
    }),
    // Publicação real e irreversível no Instagram — o par destructive+openWorld
    // é o que faz o cliente MCP pedir confirmação em vez de deixar fluir.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ postarAgora }, { normalizarEscopo }, { quemDecidiu }] = await Promise.all([
        import('../../creatives/agendar'),
        import('../../posts/learning-scope'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      return postarAgora({
        projectId,
        postType: args.postType,
        caption: args.caption,
        pageId: args.pageId,
        mediaUrls: args.mediaUrls,
        generationId: typeof args.generationId === 'string' ? args.generationId : undefined,
        learningScope: normalizarEscopo(args.escopo),
        campaignId: typeof args.campanhaId === 'string' ? args.campanhaId : undefined,
        decididoPor: await quemDecidiu(projectId, principal),
      })
    },
  }),

  definirTool({
    nome: 'aprovar-rascunhos',
    descricao:
      'Aprova rascunhos: eles entram na fila e PUBLICAM DE VERDADE no Instagram do cliente, cada um no seu horário marcado.\n\nNunca chame por conta própria. Antes, mostre à pessoa o que vai ser aprovado (artes, datas e horários) e faça a pergunta direta — "isso vai publicar no Instagram de X, confirma?". Só chame depois do sim explícito.\n\nA resposta traz processados e ignorados (com o motivo de cada um, ex.: horário vencido, sem arte) — sempre repasse os ignorados à pessoa em vez de relatar sucesso genérico. Pode trazer também avisos: nesses o post FOI aprovado, mas há algo a conferir (ex.: post de campanha marcado para depois do fim dela). Repasse o aviso — ele não bloqueia nada.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      postIds: z
        .array(z.string())
        .describe('Ids dos posts a aprovar (de ver-agenda ou do retorno de colocar-na-agenda).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ processarAprovacao }, { quemDecidiu }] = await Promise.all([
        import('../../posts/agenda-acoes'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      const postIds = args.postIds as string[]
      // A lista vazia continua sendo erro com a mensagem de sempre; item
      // não-string o parse já recusou antes de chegar aqui.
      if (postIds.length === 0) {
        throw new Error('Informe ao menos um post em postIds (os ids vêm de ver-agenda).')
      }
      return processarAprovacao({
        projectId,
        postIds,
        action: 'APPROVE',
        decididoPor: await quemDecidiu(projectId, principal),
        superficie: 'chat',
      })
    },
  }),

  definirTool({
    nome: 'voltar-para-rascunho',
    descricao:
      'Tira posts agendados da fila de publicação e os devolve à condição de rascunho — continuam na agenda, mas não publicam até nova aprovação. Use quando a pessoa quiser segurar algo que já foi aprovado. Se o post já tiver ido para a fila remota, ele é removido de lá antes; se a remoção falhar, o post aparece em ignorados com o motivo e SEGUE agendado.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      postIds: z.array(z.string()).describe('Ids dos posts a devolver para rascunho.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { processarAprovacao } = await import('../../posts/agenda-acoes')
      const projectId = args.projectId as number
      const postIds = args.postIds as string[]
      if (postIds.length === 0) {
        throw new Error('Informe ao menos um post em postIds (os ids vêm de ver-agenda).')
      }
      return processarAprovacao({ projectId, postIds, action: 'REVERT' })
    },
  }),

  definirTool({
    nome: 'editar-post',
    descricao:
      'Edita a legenda e/ou o tipo de um RASCUNHO da agenda (o postId vem de ver-agenda). Post já aprovado não se edita direto: traga para rascunho antes (voltar-para-rascunho), edite e aprove de novo — editar algo armado mudaria uma publicação real sem re-aprovação. Para mudar horário use reagendar-post. Para PÔR OUTRA ARTE no post use trocar-arte-do-post; ajustar-arte serve para mexer nos textos e na foto DENTRO da arte que já está lá.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      postId: z.string().describe('Id do rascunho (de ver-agenda).'),
      caption: z.string().optional().describe('Nova legenda (substitui a inteira).'),
      postType: z.enum(TIPOS_DE_POST).optional().describe('Novo tipo (opcional).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { editarPost } = await import('../../posts/agenda-acoes')
      return editarPost({
        projectId: args.projectId as number,
        postId: args.postId as string,
        caption: typeof args.caption === 'string' ? args.caption : undefined,
        postType: args.postType,
      })
    },
  }),

  definirTool({
    nome: 'trocar-arte-do-post',
    descricao:
      'Põe OUTRA arte num RASCUNHO da agenda (o postId vem de ver-agenda). É o caminho para "essa arte não ficou boa, usa aquela outra": a arte antiga sai, a nova entra, e o horário, a legenda e o resto do post continuam como estavam.\n\nA arte nova vem de um dos dois: `generationId` (uma arte que já existe na galeria — de criar-arte, gerar-imagem, melhorar-arte ou de um upload) OU `pageId` (uma arte criada aqui, que é renderizada na hora, com a página como ela está agora). Informe apenas UM dos dois.\n\nEm CARROSSEL ela troca UM slide só: `indice` diz qual (0 = a primeira imagem, 1 = a segunda…), e os demais slides ficam intactos. Sem `indice`, troca a primeira.\n\nSó vale para rascunho. Post já aprovado precisa voltar para rascunho antes (voltar-para-rascunho), trocar, e ser aprovado de novo — trocar a arte de algo armado mudaria uma publicação real sem re-aprovação. Para mexer nos textos ou na foto DENTRO da arte que já está no post, o caminho continua sendo ajustar-arte.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      postId: z.string().describe('Id do rascunho (de ver-agenda).'),
      generationId: z
        .string()
        .optional()
        .describe('A arte pronta que vai entrar (id de criar-arte/gerar-imagem/melhorar-arte).'),
      pageId: z
        .string()
        .optional()
        .describe('A arte criada aqui que vai entrar — é renderizada na hora, como a página está agora.'),
      indice: z
        .number()
        .optional()
        .describe('Qual imagem trocar num carrossel: 0 é a primeira, 1 a segunda. Padrão 0.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ trocarArteDoPost }, { quemDecidiu }] = await Promise.all([
        import('../../posts/trocar-arte-do-post'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      return trocarArteDoPost({
        projectId,
        postId: args.postId as string,
        generationId: typeof args.generationId === 'string' ? args.generationId : undefined,
        pageId: typeof args.pageId === 'string' ? args.pageId : undefined,
        indice: typeof args.indice === 'number' ? args.indice : undefined,
        decididoPor: await quemDecidiu(projectId, principal),
      })
    },
  }),

  definirTool({
    nome: 'reagendar-post',
    descricao:
      'Muda a data e a hora de um post da agenda. A situação é preservada: rascunho continua rascunho (mudar horário não aprova), agendado continua agendado e passa a publicar no horário novo — confirme o horário novo com a pessoa quando o post já estiver agendado. Só aceita horário futuro.\n\nNão reagenda post publicado, em publicação, nem FALHADO — post que falhou é caso para a interface ("Tentar novamente") ou para um post novo, nunca para rearme silencioso. Post de publicação manual (lembrete) tem o lembrete reenviado no WhatsApp perto do novo horário.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      postId: z.string().describe('Id do post (de ver-agenda).'),
      novaDataHora: z.string().describe('Novo horário: "AAAA-MM-DD HH:mm" no horário de Brasília.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { reagendarPost } = await import('../../posts/agenda-acoes')
      return reagendarPost({
        projectId: args.projectId as number,
        postId: args.postId as string,
        novaDataHora: args.novaDataHora as string,
      })
    },
  }),

  definirTool({
    nome: 'cancelar-post',
    descricao:
      'Cancela um post e o REMOVE da agenda — vale para rascunho e para agendado (que também é tirado da fila de publicação). É ação destrutiva e sem desfazer: confirme com a pessoa antes, citando o post e o horário. Post já publicado não se cancela por aqui. Se a pessoa só quer adiar ou segurar, prefira reagendar-post ou voltar-para-rascunho.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      postId: z.string().describe('Id do post a cancelar.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { cancelarPost } = await import('../../posts/agenda-acoes')
      return cancelarPost({ projectId: args.projectId as number, postId: args.postId as string })
    },
  }),
]
