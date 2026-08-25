/**
 * Catálogo · base de conhecimento e DNA da marca (PR 5 da migração).
 *
 * Mesma regra de clientes.ts: import estático só de módulo puro.
 *
 * ⚠️ Dois vocabulários vêm CRAVADOS aqui, porque os donos deles não podem
 * entrar estáticos num módulo que carrega sem env: as categorias da base
 * (`KnowledgeCategory` mora no client gerado do Prisma) e as seções do DNA
 * (`BRAND_DNA_FIELDS` mora em brand-context, que importa o db). A deriva é
 * vigiada por asserts no load de catalogo/integracao.ts — mudou o enum ou a
 * lista, o boot quebra lá em vez de o schema mentir.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

/** Espelho de Object.values(KnowledgeCategory) — vigiado em integracao.ts. */
export const CATEGORIAS_DA_BASE = [
  'ESTABELECIMENTO_INFO',
  'HORARIOS',
  'CARDAPIO',
  'DELIVERY',
  'POLITICAS',
  'TOM_DE_VOZ',
  'CAMPANHAS',
  'DIFERENCIAIS',
  'FAQ',
] as const

/** Espelho de BRAND_DNA_FIELDS (brand-context) — vigiado em integracao.ts. */
export const SECOES_DO_DNA = [
  'toneOfVoice',
  'contentRules',
  'composition',
  'visualStyle',
  'photoDirection',
  'approvalChecklist',
] as const

export const toolsDeBaseEDna = [
  definirTool({
    nome: 'consultar-base',
    apelidos: ['get-knowledge'],
    descricao:
      'Base de conhecimento do cliente: tom de voz, horário de funcionamento, cardápio, diferenciais e campanhas. CONSULTE SEMPRE antes de escrever qualquer texto — é o que evita prometer horário errado ou inventar preço. Se achar informação conflitante, aponte para a pessoa em vez de escolher sozinho.\n\nEntrada com validade vencida não aparece aqui. Cada entrada traz `validade` quando tem prazo — se você está escrevendo para uma data FUTURA, confira se a campanha ainda estará no ar naquele dia.',
    schema: z.object({
      projectId: z.number().describe('ID do projeto.'),
      category: z.enum(CATEGORIAS_DA_BASE).optional().describe('Filtra por categoria. Omita para trazer tudo.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ db }, { vigenteEm, formatarValidade }] = await Promise.all([
        import('../../db'),
        import('../../knowledge/vigencia'),
      ])
      const projectId = args.projectId as number
      const category = typeof args.category === 'string' ? args.category : undefined
      const entries = await db.knowledgeBaseEntry.findMany({
        where: {
          projectId,
          status: 'ACTIVE',
          // Campanha vencida não pode alimentar texto nenhum. O cron diário
          // arquiva, mas ele roda uma vez por dia — o filtro é o que garante
          // que ninguém leia a entrada nas horas entre o vencimento e a faxina.
          ...vigenteEm(),
          ...(category ? { category: category as never } : {}),
        },
        select: {
          id: true,
          title: true,
          content: true,
          category: true,
          tags: true,
          updatedAt: true,
          expiresAt: true,
        },
        orderBy: { category: 'asc' },
      })
      return {
        count: entries.length,
        entries: entries.map(({ expiresAt, ...resto }) => ({
          ...resto,
          validade: expiresAt ? formatarValidade(expiresAt) : null,
        })),
      }
    },
  }),

  definirTool({
    nome: 'consultar-dna',
    descricao:
      'DNA da marca do cliente: tom de voz, regras, composição/layout, estilo visual e direção fotográfica — mais o que o sistema injeta sozinho (fontes, cores, logo) e a biblioteca de elementos gráficos do projeto (ícones, selos, formas, ornamentos), cada um com `url` própria. O DNA entra em TODA geração de copy e arte, sempre; a base de conhecimento é o conteúdo pesquisável (horários, cardápio, campanhas).\n\nUse a `url` do elemento como está ao montar arte (ajustar-arte, camada de imagem) — é o arquivo oficial da biblioteca, então a arte acompanha sozinha qualquer troca feita no painel; cópia hospedada por fora congela a versão de hoje.\n\nConsulte antes de escrever textos para o cliente, e SEMPRE antes de atualizar-dna — você precisa mostrar à pessoa o que já existe.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const [{ db }, { CreativeError }, { loadBrandContext, BRAND_DNA_FIELDS }] = await Promise.all([
        import('../../db'),
        import('../../creatives/errors'),
        import('../../brand/brand-context'),
      ])
      const projectId = args.projectId as number
      const brand = await loadBrandContext(projectId)
      if (!brand) {
        throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
      }
      const secoesVazias = BRAND_DNA_FIELDS.filter((f) => !brand.dna[f])
      // Lido aqui, e não no loadBrandContext: a biblioteca de elementos é para
      // MONTAR arte, não entra em prompt nenhum — carregá-la no loader faria
      // toda geração de copy pagar por linhas que ninguém lê.
      const elementos = await db.element.findMany({
        where: { projectId },
        select: { id: true, name: true, category: true, fileUrl: true },
        orderBy: [{ category: 'asc' }, { id: 'asc' }],
      })
      return {
        ...brand,
        elementos: elementos.map((e) => ({
          id: e.id,
          nome: e.name,
          categoria: e.category,
          url: e.fileUrl,
        })),
        // O modelo tende a não notar ausência — apontar o que falta transforma
        // a consulta num convite para completar o DNA com a pessoa.
        secoesVazias,
        dica:
          secoesVazias.length > 0
            ? `Seções ainda vazias: ${secoesVazias.join(', ')}. Se fizer sentido na conversa, ofereça preencher com atualizar-dna.`
            : 'DNA completo. Use-o como lei ao escrever para este cliente.',
      }
    },
  }),

  definirTool({
    nome: 'atualizar-dna',
    descricao:
      'Atualiza o DNA da marca — a identidade que passa a valer em TODA geração de copy e arte deste cliente, do chat e do site. Seções: toneOfVoice (como a marca fala), contentRules (o que nunca fazer/dizer), composition (layout e hierarquia), visualStyle (estética geral), photoDirection (luz e tratamento de foto).\n\nCada seção enviada SUBSTITUI o texto inteiro dela — não é acréscimo. Fluxo obrigatório: consultar-dna → mostrar à pessoa o texto ATUAL e o NOVO → só gravar com o OK explícito. Enviar null limpa a seção.\n\nNão confunda com a base de conhecimento: horário, cardápio, preço e campanha vão em criar-entrada-base; identidade vai aqui.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      toneOfVoice: z.string().nullable().optional().describe('Como a marca fala (usado em copies e chat). null limpa.'),
      contentRules: z
        .string()
        .nullable()
        .optional()
        .describe('O que nunca fazer ou dizer (usado em copies, chat e artes). null limpa.'),
      composition: z.string().nullable().optional().describe('Como os elementos se organizam nas artes. null limpa.'),
      visualStyle: z.string().nullable().optional().describe('A estética geral da marca (usado nas artes). null limpa.'),
      photoDirection: z.string().nullable().optional().describe('Luz e tratamento fotográfico (usado nas artes). null limpa.'),
      approvalChecklist: z
        .string()
        .nullable()
        .optional()
        .describe('Crivo de aprovação: perguntas binárias, UMA POR LINHA, conferidas por gente antes de agendar. NÃO entra em prompt de geração. null limpa.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, _principal) => {
      const { updateBrandDNA, BRAND_DNA_FIELDS, BRAND_DNA_MAX_CHARS } = await import('../../brand/brand-context')
      const projectId = args.projectId as number

      const patch: Partial<Record<(typeof BRAND_DNA_FIELDS)[number], string | null>> = {}
      for (const field of BRAND_DNA_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(args, field)) continue
        const value = (args as Record<string, unknown>)[field]
        if (value !== null && typeof value !== 'string') {
          throw new Error(`${field} deve ser texto ou null.`)
        }
        if (typeof value === 'string' && value.length > BRAND_DNA_MAX_CHARS) {
          throw new Error(
            `${field} passou de ${BRAND_DNA_MAX_CHARS} caracteres. O DNA é síntese, não arquivo — resuma; detalhe factual vai para a base de conhecimento.`,
          )
        }
        patch[field] = value as string | null
      }
      if (Object.keys(patch).length === 0) {
        throw new Error(`Envie pelo menos uma seção (${BRAND_DNA_FIELDS.join(', ')}).`)
      }

      const dna = await updateBrandDNA(projectId, patch)
      const alteradas = Object.keys(patch).join(', ')
      return {
        atualizado: true,
        dna,
        mensagem: `DNA atualizado (${alteradas}). Já vale para as próximas gerações — do chat e do site.`,
      }
    },
  }),

  definirTool({
    nome: 'virar-regra',
    descricao:
      'Transforma uma correção que a pessoa aprovou na conversa numa regra que vale daqui para a frente. Use quando alguém corrigir a arte ou o texto e a correção não for só para aquela peça.\n\n⚖️ TRIAGEM, antes de chamar: **regra temporária ou de campanha → base de conhecimento com validade** (mande `validade`; ex: "durante o Festival Italiano o rótulo aparece na foto"). **Identidade permanente da marca → DNA** (mande `secao`; ex: "a logo sempre no canto direito", "nunca escrever preço em vermelho"). O DNA é eterno e entra em TODO prompt — regra com prazo ali continuaria mandando meses depois do fim da campanha, e ninguém lembraria de tirar. Na dúvida, pergunte à pessoa até quando a regra vale.\n\nNo DNA a regra é ACRESCENTADA ao fim da seção, o texto que já existia fica intacto (diferente de atualizar-dna, que substitui).\n\nFluxo: chame primeiro sem `confirmado` para ver a proposta, mostre à pessoa o que será gravado e só então chame com `confirmado: true`. Nunca registre dedução sua como regra — só o que a pessoa confirmou.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      secao: z
        .enum(SECOES_DO_DNA)
        .optional()
        .describe(
          'Onde a regra mora no DNA: contentRules (proibições), composition (layout), visualStyle (estética), photoDirection (foto), toneOfVoice (texto), approvalChecklist (crivo). Obrigatória para regra PERMANENTE; dispensável quando você manda validade.',
        ),
      regra: z.string().describe('A regra na forma imperativa, como deve valer daqui para a frente.'),
      motivo: z.string().describe('O caso concreto que gerou a regra. Sem motivo a regra não se explica daqui a três meses.'),
      validade: z
        .string()
        .optional()
        .describe(
          'Último dia em que a regra vale (AAAA-MM-DD). Manda a regra para a base de conhecimento, categoria CAMPANHAS, em vez do DNA — ela deixa de valer sozinha depois dessa data.',
        ),
      titulo: z
        .string()
        .optional()
        .describe('Título da entrada na base, quando a regra tem validade (ex: "Festival Italiano — agosto"). Opcional.'),
      confirmado: z
        .boolean()
        .optional()
        .describe('Só grava com true. Sem isto devolve a proposta para você mostrar à pessoa.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ virarRegra }, { parseValidade, formatarValidade }, { resolverAutor }] = await Promise.all([
        import('../../brand/brand-context'),
        import('../../knowledge/vigencia'),
        import('../tools'),
      ])
      const projectId = args.projectId as number

      const validade = parseValidade(args.validade) ?? null
      const secao = typeof args.secao === 'string' ? args.secao : undefined

      const resultado = await virarRegra({
        projectId,
        secao,
        regra: String(args.regra ?? ''),
        motivo: String(args.motivo ?? ''),
        validade,
        titulo: typeof args.titulo === 'string' ? args.titulo : undefined,
        // Só o ramo com prazo escreve na base, e só ele precisa de autor.
        autor: validade ? await resolverAutor(projectId, principal) : undefined,
        confirmado: args.confirmado === true,
      })

      if (resultado.destino === 'base') {
        return {
          ...resultado,
          validade: formatarValidade(resultado.validade),
          mensagem: resultado.gravado
            ? `Regra guardada na base como campanha, valendo até ${formatarValidade(resultado.validade)}. Depois disso ela para de valer sozinha — não vai para o DNA justamente por ter prazo.`
            : `Proposta montada, NADA foi gravado ainda. Como a regra tem prazo, ela vai para a base de conhecimento (campanha), não para o DNA. Mostre à pessoa e confirme para valer.`,
        }
      }

      return {
        ...resultado,
        mensagem: resultado.gravado
          ? `Regra registrada em ${resultado.secao}. Vale a partir da próxima geração, do chat e do site.`
          : `Proposta montada, NADA foi gravado ainda. Mostre a linha à pessoa e confirme para valer.`,
      }
    },
  }),

  definirTool({
    nome: 'criar-entrada-base',
    descricao:
      'Cria uma entrada nova na base de conhecimento do cliente. TUDO que estiver na base vira insumo dos textos futuros — deste chat e do Claudinho — então só grave informação CONFIRMADA pela pessoa (preço, horário, política, campanha), nunca suposição sua.\n\n⏳ CAMPANHA COM DATA DE FIM → GRAVE A VALIDADE. Festival, promoção de mês, cardápio sazonal, feriado: pergunte até quando vale e mande em `validade`. É o que faz a campanha parar de aparecer nos textos e nas sugestões no dia seguinte ao fim, sem ninguém precisar lembrar de arquivar.\n\n⚠️ Tom de voz, regras da marca, estilo visual e direção fotográfica NÃO vão aqui — vão no DNA (atualizar-dna). A base é buscada por relevância e identidade cadastrada nela não chega aos geradores; a categoria TOM_DE_VOZ existe só por legado.\n\nAntes de criar, consulte a base: se já existe entrada sobre o assunto, o certo é atualizar-entrada-base, não duplicar. Mostre o texto final à pessoa e só grave com o OK dela.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      category: z
        .enum(CATEGORIAS_DA_BASE)
        .describe('Categoria da entrada (TOM_DE_VOZ, HORARIOS, CARDAPIO, CAMPANHAS...).'),
      title: z.string().describe('Título curto e específico (ex: "Promoção Costela no Bafo — agosto").'),
      content: z.string().describe('O conteúdo, em texto corrido, do jeito que deve alimentar as copies.'),
      tags: z.array(z.string()).optional().describe('Etiquetas opcionais para busca.'),
      validade: z
        .string()
        .optional()
        .describe(
          'Último dia em que a informação vale (AAAA-MM-DD, no fuso de Brasília — o dia inteiro conta). Depois disso a entrada sai sozinha dos textos e das sugestões. Obrigatório na prática para CAMPANHAS com data de fim; omita só para informação permanente (horário, cardápio fixo, política).',
        ),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ criarEntradaBase }, { parseValidade, formatarValidade, avisoValidadeAusente }, { resolverAutor }] =
        await Promise.all([
          import('../../knowledge/entries'),
          import('../../knowledge/vigencia'),
          import('../tools'),
        ])
      const projectId = args.projectId as number
      const autor = await resolverAutor(projectId, principal)
      const categoria = args.category as (typeof CATEGORIAS_DA_BASE)[number]

      const expiresAt = parseValidade(args.validade) ?? null

      const entry = await criarEntradaBase({
        projectId,
        category: categoria as never,
        title: args.title as string,
        content: args.content as string,
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
        expiresAt,
        autor,
      })

      // Aviso, NUNCA veto: há campanha permanente ("Quinta do Vinho, toda
      // quinta") e recusar a gravação deixaria a pessoa sem saída.
      const aviso = avisoValidadeAusente(categoria as never, expiresAt)

      return {
        criada: true,
        entradaId: entry.id,
        validade: expiresAt ? formatarValidade(expiresAt) : null,
        mensagem: expiresAt
          ? `Entrada "${entry.title}" criada em ${categoria}, valendo até ${formatarValidade(expiresAt)}. Depois disso ela sai sozinha dos textos.`
          : `Entrada "${entry.title}" criada em ${categoria}. Já vale para os próximos textos.`,
        ...(aviso ? { aviso } : {}),
      }
    },
  }),

  definirTool({
    nome: 'atualizar-entrada-base',
    descricao:
      'Atualiza uma entrada existente da base de conhecimento (o entradaId vem de consultar-base). É assim que preço, horário ou regra desatualizada se corrige — a mudança vale para TODOS os textos futuros, deste chat e do Claudinho.\n\n⏳ Campanha que ganhou ou mudou data de fim: mande `validade`. Prorrogou, é a data nova; virou permanente, mande null.\n\nFluxo obrigatório: consultar-base → mostrar à pessoa o texto ATUAL e o texto NOVO lado a lado → só gravar com o OK explícito. Campos não enviados ficam como estão.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      entradaId: z.string().describe('Id da entrada (de consultar-base).'),
      title: z.string().optional().describe('Novo título (opcional).'),
      content: z
        .string()
        .optional()
        .describe('Novo conteúdo completo (opcional — substitui o texto inteiro, não é acréscimo).'),
      tags: z.array(z.string()).optional().describe('Novas etiquetas (opcional, substitui as atuais).'),
      category: z.enum(CATEGORIAS_DA_BASE).optional().describe('Nova categoria (opcional).'),
      validade: z
        .string()
        .nullable()
        .optional()
        .describe(
          'Último dia em que a informação vale (AAAA-MM-DD, fuso de Brasília — o dia inteiro conta). null tira o prazo e a entrada volta a valer para sempre.',
        ),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [
        { db },
        { CreativeError },
        { parseValidade, formatarValidade, avisoValidadeAusente },
        { reindexEntry },
        { invalidateProjectCache },
        { resolverAutor },
      ] = await Promise.all([
        import('../../db'),
        import('../../creatives/errors'),
        import('../../knowledge/vigencia'),
        import('../../knowledge/indexer'),
        import('../../knowledge/cache'),
        import('../tools'),
      ])
      const projectId = args.projectId as number
      const entradaId = args.entradaId as string
      const autor = await resolverAutor(projectId, principal)

      const existente = await db.knowledgeBaseEntry.findUnique({ where: { id: entradaId } })
      if (!existente || existente.projectId !== projectId) {
        throw new CreativeError('ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada neste cliente.', 404)
      }
      // Entrada fora de circulação não alimenta texto nenhum: editar aqui
      // responderia "já vale para os próximos textos" mentindo, e ainda
      // recriaria vetores de um conteúdo arquivado.
      if (existente.status !== 'ACTIVE') {
        throw new CreativeError(
          'ENTRADA_INATIVA',
          `Esta entrada está ${existente.status === 'ARCHIVED' ? 'arquivada' : 'como rascunho'} e não alimenta os textos. Reative pela interface do Studio antes de editar.`,
          400,
        )
      }

      // Vazio não é "limpar": apagaria o texto E os vetores reportando sucesso,
      // sem histórico para recuperar. Para tirar de circulação, use arquivar.
      const title = typeof args.title === 'string' ? args.title.trim() || undefined : undefined
      const content = typeof args.content === 'string' ? args.content.trim() || undefined : undefined
      if (typeof args.title === 'string' && title === undefined) {
        throw new Error('O título não pode ficar vazio.')
      }
      if (typeof args.content === 'string' && content === undefined) {
        throw new Error('O conteúdo não pode ficar vazio. Para tirar a entrada de circulação, use arquivar-entrada-base.')
      }
      const tags = Array.isArray(args.tags) ? (args.tags as string[]) : undefined
      const category = typeof args.category === 'string' ? args.category : undefined
      // undefined = não veio no pedido; null = veio vazio de propósito e LIMPA
      // o prazo. Os dois casos precisam sobreviver até o `data` do update.
      const expiresAt = parseValidade(
        Object.prototype.hasOwnProperty.call(args, 'validade') ? args.validade : undefined,
      )
      if (
        title === undefined &&
        content === undefined &&
        tags === undefined &&
        category === undefined &&
        expiresAt === undefined
      ) {
        throw new Error('Nada para atualizar: envie title, content, tags, category ou validade.')
      }

      await db.knowledgeBaseEntry.update({
        where: { id: entradaId },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(content !== undefined ? { content } : {}),
          ...(tags !== undefined ? { tags } : {}),
          ...(category !== undefined ? { category: category as never } : {}),
          ...(expiresAt !== undefined ? { expiresAt } : {}),
          updatedBy: autor,
        },
      })

      // Texto ou categoria novos exigem reindexar: os vetores carregam o texto
      // E a categoria nos metadados, e a busca filtra por eles.
      const mudouIndice =
        (content !== undefined && content !== existente.content) ||
        (title !== undefined && title !== existente.title) ||
        (category !== undefined && category !== existente.category)

      let avisoBusca: string | undefined
      if (mudouIndice) {
        try {
          await reindexEntry(entradaId, { projectId, userId: autor })
        } catch (erro) {
          // reindexEntry apaga os vetores antigos ANTES de gerar os novos: se
          // falhar aqui, a entrada some da busca até ser reindexada. O texto
          // salvo está correto, então não desfazemos — mas quem chamou precisa
          // saber, senão a falha morre no log.
          console.error('[mcp] reindexEntry falhou após atualizar a entrada:', erro)
          avisoBusca =
            'O texto foi salvo, mas a indexação da busca falhou — a entrada pode não aparecer em buscas até ser reindexada pela interface do Studio (avise a pessoa).'
        }
      }

      await invalidateProjectCache(projectId).catch((e) =>
        console.error('[mcp] invalidateProjectCache falhou:', e))

      // O aviso olha o estado FINAL da entrada, não o que veio no pedido:
      // mudar a categoria para CAMPANHAS numa entrada sem prazo também merece
      // a cutucada.
      const validadeFinal = expiresAt !== undefined ? expiresAt : existente.expiresAt
      const aviso = avisoValidadeAusente((category ?? existente.category) as never, validadeFinal)

      return {
        atualizada: true,
        entradaId,
        // Devolve o texto anterior: é a única trilha de recuperação, já que o
        // banco não guarda versão antiga.
        textoAnterior: { title: existente.title, content: existente.content },
        validade: validadeFinal ? formatarValidade(validadeFinal) : null,
        mensagem: `Entrada "${title ?? existente.title}" atualizada. Já vale para os próximos textos.`,
        ...(avisoBusca ? { avisoBusca } : {}),
        ...(aviso ? { aviso } : {}),
      }
    },
  }),

  definirTool({
    nome: 'arquivar-entrada-base',
    descricao:
      'Arquiva uma entrada da base de conhecimento: ela sai da consulta e deixa de alimentar os textos. O registro não é apagado, mas reativar exige a interface do Studio (e uma reindexação por lá para ela voltar às buscas) — então trate como decisão de mão única. Use para campanha encerrada ou informação que não vale mais, e confirme com a pessoa antes, citando o título.',
    schema: z.object({
      projectId: z.number().describe('ID do cliente.'),
      entradaId: z.string().describe('Id da entrada (de consultar-base).'),
    }),
    // "Decisão de mão única": os vetores são apagados e reativar exige a
    // interface — destructive é o rótulo honesto.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'projeto' },
    superficies: ['remoto', 'local'],
    handler: async (args, principal) => {
      const [{ db }, { CreativeError }, { deleteVectorsByEntry }, { invalidateProjectCache }, { resolverAutor }] =
        await Promise.all([
          import('../../db'),
          import('../../creatives/errors'),
          import('../../knowledge/vector-client'),
          import('../../knowledge/cache'),
          import('../tools'),
        ])
      const projectId = args.projectId as number
      const entradaId = args.entradaId as string
      const autor = await resolverAutor(projectId, principal)

      const existente = await db.knowledgeBaseEntry.findUnique({ where: { id: entradaId } })
      if (!existente || existente.projectId !== projectId) {
        throw new CreativeError('ENTRADA_NAO_ENCONTRADA', 'Entrada não encontrada neste cliente.', 404)
      }
      if (existente.status === 'ARCHIVED') {
        return { arquivada: true, entradaId, mensagem: `"${existente.title}" já estava arquivada.` }
      }

      // Mesmo padrão do cron de expiração: vetores fora ANTES do status, senão
      // a busca RAG continua servindo o conteúdo arquivado.
      await deleteVectorsByEntry(entradaId, { projectId, userId: autor })
      await db.knowledgeBaseEntry.update({
        where: { id: entradaId },
        data: { status: 'ARCHIVED', updatedBy: autor },
      })
      await invalidateProjectCache(projectId).catch((e) =>
        console.error('[mcp] invalidateProjectCache falhou:', e))

      return {
        arquivada: true,
        entradaId,
        mensagem: `Entrada "${existente.title}" arquivada. Não alimenta mais os textos.`,
      }
    },
  }),
]
