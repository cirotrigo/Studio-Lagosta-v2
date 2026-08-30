/**
 * Catálogo · fotos, acervo e âncoras (PR 5 da migração para o registro).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro; db e
 * serviços por `await import()` relativo dentro do handler.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

export const toolsDeFotos = [
  definirTool({
    nome: 'buscar-fotos',
    apelidos: ['search-acervo'],
    descricao:
      'Busca fotos no acervo do cliente. A ordem é aprendida: primeiro os DESTAQUES (a prata da casa) e as fotos que a equipe costuma escolher para o tema; foto proposta e rejeitada desce; entre iguais vale o rodízio (menos usada primeiro, para não repetir na semana) — `ultimoUso`/`vezesUsada` dizem quando e quantas vezes, e cada item traz `destaque` e `vagaDeExploracao` (foto nova/nunca avaliada que vale experimentar). O retorno traz `catalogacao`, que mostra quantas fotos do acervo ainda não têm descrição ou tags (elas existem, mas a busca por TEMA não as alcança — peça por pasta). O acervo é organizado em pastas por assunto (cortes, ambiente, bebidas, sobremesas...) — a resposta lista as pastas disponíveis, então se a busca por tema vier vazia, tente de novo pela pasta. Ao montar vários posts de uma vez, use pastas diferentes para variar.',
    schema: z.object({
      projectId: z.number().describe('ID do projeto.'),
      theme: z
        .string()
        .optional()
        .describe('Tema — casa com tags, bestFor e o caminho da pasta (ex: "ambiente", "picanha", "chopp").'),
      folder: z
        .string()
        .optional()
        .describe('Pasta exata ou prefixo (ex: "01_cortes/picanha-bovina", "02_ambiente"). Veja pastasDisponiveis no retorno.'),
      menuCategory: z.string().optional().describe('Categoria do cardápio (ex: PRATOS_PRINCIPAIS, BEBIDAS).'),
      tags: z.array(z.string()).optional().describe('Tags a casar.'),
      quality: z.enum(['alta', 'media', 'baixa']).optional().describe('Qualidade mínima.'),
      fileName: z
        .string()
        .optional()
        .describe('Nome do arquivo, exato ou início dele ("ambiente-f3a" acha "ambiente-f3a8693.jpg"). Use quando já souber qual foto quer.'),
      limit: z.number().optional().describe('Máximo de resultados (default 20). Pode pedir mais — não há teto.'),
      offset: z.number().optional().describe('Quantas pular, para ver o resto da lista. A ordem é estável.'),
    }),
    // NÃO é readOnly: a lista ranqueada é registrada como sugestão de foto
    // (LearningSignal, F1) — idempotente pela chave (projeto, critérios, dia).
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { buscarNoAcervo } = await import('../../creatives/acervo')
      return buscarNoAcervo({
        projectId: args.projectId as number,
        theme: args.theme,
        folder: args.folder,
        menuCategory: args.menuCategory,
        tags: args.tags,
        quality: args.quality,
        fileName: args.fileName,
        limit: args.limit,
        offset: args.offset,
      })
    },
  }),

  definirTool({
    nome: 'marcar-foto-como-usada',
    descricao:
      'Registra que uma foto do acervo foi PUBLICADA, para ela não voltar no topo das sugestões. Use quando a peça saiu por fora do Studio (arte montada em outro lugar, story postado na mão) — o que nasce aqui dentro já é marcado sozinho.\n\nÉ o que faz "não repetir a mesma foto na semana" funcionar: buscar-fotos ordena por menos usada, e sem esse registro uma foto que foi ao ar ontem aparece como "nunca usada".',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      driveFileIds: z
        .array(z.string())
        .describe('As fotos usadas (o driveFileId que buscar-fotos devolve). Aceita várias de uma vez.'),
      tema: z.string().optional().describe('Assunto da peça, para explicar depois por que a foto foi usada.'),
      quando: z.string().optional().describe('Data da publicação "AAAA-MM-DD". Padrão: hoje.'),
      geracaoId: z
        .string()
        .optional()
        .describe(
          'A arte que nasceu com essa foto (o id que gerar-imagem/ver-geracao usam). Preencha sempre que a foto virou uma arte identificável — em especial ao REFAZER uma peça na correção: é o que liga a foto escolhida ao aprendizado.',
        ),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { registrarUsoDeFoto } = await import('../../creatives/uso-de-foto')
      const projectId = args.projectId as number
      const ids = (args.driveFileIds as string[]).filter((i) => i.trim().length > 0)
      if (ids.length === 0) {
        throw new Error('Informe pelo menos uma foto em driveFileIds.')
      }
      // Data opcional: marcar peça já publicada precisa da data REAL, senão o
      // rodízio acha que a foto acabou de sair.
      let quandoInformado: Date | null = null
      if (typeof args.quando === 'string' && args.quando.trim()) {
        const d = new Date(`${args.quando.trim()}T12:00:00-03:00`)
        if (Number.isNaN(d.getTime())) {
          throw new Error(`Data inválida: "${args.quando}". Use o formato AAAA-MM-DD.`)
        }
        quandoInformado = d
      }
      const marcadas = await registrarUsoDeFoto({
        projectId,
        driveFileIds: ids,
        origem: 'externo',
        tema: typeof args.tema === 'string' ? args.tema : null,
        // É o que liga a foto à arte na colheita da correção pós-produção:
        // troca-de-arte guarda o generationId da arte nova, e o join com
        // PhotoUsage só enxerga linhas que o carregam.
        generationId: typeof args.geracaoId === 'string' && args.geracaoId.trim() ? args.geracaoId.trim() : null,
        usedAt: quandoInformado,
      })
      return {
        marcadas,
        mensagem:
          marcadas > 0
            ? `Anotado: ${marcadas} foto(s) marcada(s) como usada(s). Elas vão para o fim da fila nas próximas sugestões.`
            : 'Não consegui anotar agora — o registro de uso falhou, mas nada mais foi afetado.',
      }
    },
  }),

  definirTool({
    nome: 'marcar-foto-destaque',
    descricao:
      'Marca uma foto do acervo como DESTAQUE — a prata da casa: as fotos que o sistema deve PREFERIR ao sugerir (buscar-fotos e a proposta da semana passam a trazê-las primeiro). Use quando a pessoa disser que uma foto é das melhores ("essa foto é linda, usa mais ela") ou quando uma arte feita com ela for elogiada.\n\nCom destaque=false, tira o destaque — a foto continua no acervo e no rodízio normal, nada é apagado. Confirme com a pessoa antes de marcar: o destaque vale para todas as sugestões deste cliente.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      driveFileId: z.string().describe('A foto (o driveFileId que buscar-fotos devolve).'),
      destaque: z
        .boolean()
        .optional()
        .describe('true (default) marca como destaque; false tira o destaque.'),
    }),
    // Marcar duas vezes é no-op (upsert converge); tirar duas vezes idem.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    // Curadoria, não edição: o destaque muda a ordem das sugestões para todos
    // que produzem para este cliente — mesmo gate de marcar-como-modelo
    // (ver ≠ mandar: enxergar o cliente não basta).
    acesso: { tipo: 'curador' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const { db } = await import('../../db')
      const projectId = args.projectId as number
      const driveFileId = typeof args.driveFileId === 'string' ? args.driveFileId.trim() : ''
      if (!driveFileId) {
        throw new Error('Informe a foto em driveFileId (o id que buscar-fotos devolve).')
      }
      const destaque = args.destaque !== false

      // Auditoria, não gate: o User INTERNO do portador, SÓ por leitura —
      // não achou, fica null. Criar User a partir daqui é como nascem os
      // fantasmas (regra da casa); e falhar na resolução não pode derrubar
      // a marcação.
      let decididoPor: string | null = null
      if (principal.kind === 'user' && principal.userId) {
        try {
          const usuario = await db.user.findUnique({
            where: { clerkId: principal.userId },
            select: { id: true },
          })
          decididoPor = usuario?.id ?? null
        } catch (error) {
          console.error('[mcp] não deu para resolver quem decidiu o destaque:', error)
        }
      }

      if (destaque) {
        await db.photoDestaque.upsert({
          where: { projectId_driveFileId: { projectId, driveFileId } },
          create: { projectId, driveFileId, origem: 'humano', decididoPor },
          // Remarcar reafirma a decisão: revogadoEm limpo (a foto volta a
          // valer) e a última decisão humana assina o registro.
          update: { revogadoEm: null, origem: 'humano', decididoPor },
        })
        return {
          ok: true,
          destaque: true,
          mensagem: 'A foto agora é destaque do acervo — o sistema vai preferi-la nas sugestões.',
        }
      }

      // Despromover, nunca excluir — mesmo princípio da curadoria de modelos:
      // revogadoEm marca a saída e o histórico da decisão fica.
      const { count } = await db.photoDestaque.updateMany({
        where: { projectId, driveFileId, revogadoEm: null },
        data: { revogadoEm: new Date() },
      })
      return {
        ok: true,
        destaque: false,
        mensagem: count > 0 ? 'Tirei o destaque da foto.' : 'Essa foto já não era destaque — nada mudou.',
      }
    },
  }),

  definirTool({
    nome: 'pedir-foto',
    descricao:
      'Gera um link de UM TOQUE para a pessoa enviar uma foto do celular direto ao estúdio. Use quando ela anexar uma foto no chat (o anexo NÃO chega até você — os bytes ficam na plataforma) ou disser que quer usar uma foto do aparelho: mande o link, peça para tocar e escolher a foto, e confira com ver-foto-enviada quando ela avisar. O link vale 30 minutos; reenviar dentro do prazo substitui a foto (mandou a errada → manda de novo, mesmo link).',
    schema: z.object({
      projectId: z.number().describe('ID do cliente (a foto fica no acervo de envio dele).'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { pedirFoto } = await import('../../creatives/chat-upload')
      return pedirFoto({ projectId: args.projectId as number })
    },
  }),

  definirTool({
    nome: 'ver-foto-enviada',
    descricao:
      'Confere se a foto do link de pedir-foto já chegou. Quando chegar, devolve a fotoUrl pronta para usar como imageUrl em criar-arte (arte nova) ou ajustar-arte (trocar o fundo de uma arte existente).',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      uploadId: z.string().describe('O uploadId devolvido por pedir-foto.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { verFoto } = await import('../../creatives/chat-upload')
      return verFoto({ projectId: args.projectId as number, uploadId: args.uploadId as string })
    },
  }),

  definirTool({
    nome: 'listar-fotos-da-pasta',
    apelidos: ['list-drive-images'],
    descricao:
      'Lista as fotos da pasta do cliente no Drive. Use quando o acervo ainda não foi catalogado (buscar-fotos avisa quando é o caso). O retorno traz `pastasDisponiveis` e o `total` do filtro — dá para pedir mais com `limit`.',
    schema: z.object({
      projectId: z.number().describe('ID do projeto.'),
      folder: z
        .string()
        .optional()
        .describe('Pasta pelo NOME, exata ou prefixo ("09_ambiente" traz "09_ambiente/noite" junto). Veja pastasDisponiveis no retorno.'),
      limit: z.number().optional().describe('Máximo de imagens (default 30).'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { listarImagensDoDrive } = await import('../../creatives/acervo')
      return listarImagensDoDrive(
        args.projectId as number,
        typeof args.limit === 'number' ? args.limit : undefined,
        typeof args.folder === 'string' && args.folder ? args.folder : undefined,
      )
    },
  }),

  definirTool({
    nome: 'definir-ancora',
    descricao:
      'Marca uma foto REAL do cliente como âncora canônica de um tipo de cena ("ambiente", "mesa", "balcao", "chopp"…), ou remove uma âncora. As âncoras alimentam a geração de imagem (gerar-imagem): a de tipo "ambiente" é injetada AUTOMATICAMENTE em toda cena gerada quando nenhuma âncora foi escolhida — é o que impede o modelo de inventar um lugar genérico. Foto do Drive vira cópia permanente no Studio na hora.\n\nEscolha fotos que mostrem bem o que definem: para "ambiente", o salão como ele é (teto real, mobília, luz); para louça/uniforme, closes nítidos. Confirme com a pessoa antes de definir — âncora vale para todas as gerações do cliente.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      sceneTag: z
        .string()
        .optional()
        .describe('Tipo de cena em kebab-case (ex: "ambiente", "mesa", "chopp"). "ambiente" é a tag da injeção automática.'),
      driveFileId: z.string().optional().describe('Foto do acervo (de buscar-fotos).'),
      url: z.string().optional().describe('Alternativa: URL de imagem já no Studio.'),
      label: z.string().optional().describe('Rótulo curto (ex: "salão com teto real").'),
      removerAncoraId: z
        .string()
        .optional()
        .describe('Para REMOVER: id da âncora (de listar-ancoras). Ignora os outros campos.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { definirAncora, removerAncora, AMBIENT_SCENE_TAG } = await import('../../ai/anchor-images')
      const projectId = args.projectId as number

      if (typeof args.removerAncoraId === 'string' && args.removerAncoraId) {
        await removerAncora(projectId, args.removerAncoraId)
        return { ok: true, mensagem: 'Âncora removida.' }
      }

      if (typeof args.sceneTag !== 'string' || !args.sceneTag.trim()) {
        throw new Error('sceneTag é obrigatório para definir uma âncora (ou use removerAncoraId para remover).')
      }
      const ancora = await definirAncora({
        projectId,
        sceneTag: args.sceneTag,
        driveFileId: typeof args.driveFileId === 'string' ? args.driveFileId : null,
        url: typeof args.url === 'string' ? args.url : null,
        label: typeof args.label === 'string' ? args.label : null,
      })
      return {
        ok: true,
        ancora,
        mensagem:
          ancora.sceneTag === AMBIENT_SCENE_TAG
            ? 'Âncora de ambiente definida — toda cena gerada deste cliente passa a acontecer neste lugar.'
            : `Âncora "${ancora.sceneTag}" definida. Ela entra quando for escolhida como referência na geração.`,
      }
    },
  }),

  definirTool({
    nome: 'listar-ancoras',
    descricao:
      'Lista as fotos-âncora canônicas do cliente por tipo de cena (anchor sheet). Use antes de gerar-imagem para saber o que já existe, e antes de definir-ancora para não duplicar.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { listarAncoras, AMBIENT_SCENE_TAG } = await import('../../ai/anchor-images')
      const ancoras = await listarAncoras(args.projectId as number)
      return {
        total: ancoras.length,
        temAmbiente: ancoras.some((a) => a.sceneTag === AMBIENT_SCENE_TAG),
        ancoras,
        ...(ancoras.every((a) => a.sceneTag !== AMBIENT_SCENE_TAG)
          ? {
              aviso:
                'Sem âncora de tipo "ambiente": cenas geradas não têm foto real do lugar e o modelo pode inventar um ambiente genérico. Sugira definir uma com definir-ancora.',
            }
          : {}),
      }
    },
  }),
]
