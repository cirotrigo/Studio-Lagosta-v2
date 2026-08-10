/**
 * Tool definitions exposed by the remote MCP endpoint (/api/mcp).
 *
 * These mirror the most useful tools of the local stdio server
 * (scripts/mcp-server.ts) but run inside the deployed app, so any MCP client
 * — a second machine, the CLI, a phone — can ask for a creative without this
 * repo checked out. Both surfaces call the same libs under src/lib, so the
 * behaviour cannot drift.
 */

import sharp from 'sharp'
import { db } from '@/lib/db'
import {
  prepareCreative,
  createArteRapida,
  ajustarArte,
  getPublicAppUrl,
  parseLayers,
} from '@/lib/creatives/arte-rapida'
import { checkTextGeometry } from '@/lib/creatives/text-geometry'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { createArteLivre, listFontCombinations } from '@/lib/creatives/arte-livre'
import { CreativeError } from '@/lib/creatives/errors'
import { buscarNoAcervo, listarImagensDoDrive } from '@/lib/creatives/acervo'
import { agendarPost, postarAgora } from '@/lib/creatives/agendar'
import { KnowledgeCategory } from '@prisma/client'
import type { McpPrincipal } from '@/lib/mcp/oauth'
import {
  processarAprovacao,
  reagendarPost,
  cancelarPost,
  editarPost,
  formatarBRT,
} from '@/lib/posts/agenda-acoes'
import { sugerirPosts } from '@/lib/posts/sugerir-posts'
import { avaliarSlotSugerido, fecharDesfechoDoSlot } from '@/lib/aprendizado/desfecho-de-slot'
import { avisosDeCampanhaVencida } from '@/lib/posts/campanha-vigencia'
import {
  escopoEmPortugues,
  normalizarEscopo,
  type EscopoAprendizado,
} from '@/lib/posts/learning-scope'
import { descreverJanela } from '@/lib/posts/freeze-window'
import { pedirFoto, verFoto } from '@/lib/creatives/chat-upload'
import { reindexEntry } from '@/lib/knowledge/indexer'
import { deleteVectorsByEntry } from '@/lib/knowledge/vector-client'
import { invalidateProjectCache } from '@/lib/knowledge/cache'
import { criarEntradaBase } from '@/lib/knowledge/entries'
import {
  vigenteEm,
  parseValidade,
  avisoValidadeAusente,
  formatarValidade,
} from '@/lib/knowledge/vigencia'
import { getUserFromClerkId } from '@/lib/auth-utils'
import {
  startImprovement,
  VERCEL_BLOB_HOST_REGEX,
} from '@/lib/ai/creative-improvement-service'
import { startArtGeneration } from '@/lib/ai/creative-generation-service'
import type { ArtGenerationReference } from '@/lib/ai/creative-generation-runner'
import { enfileirarArte, enfileirarMelhoria } from '@/lib/ai/generation-queue'
import {
  listarAncoras,
  definirAncora,
  removerAncora,
  AMBIENT_SCENE_TAG,
} from '@/lib/ai/anchor-images'
import {
  definirReferenciaDeEstilo,
  listarReferenciasDeEstilo,
} from '@/lib/ai/style-references'
import {
  iniciarCarrossel,
  confirmarEstiloCarrossel,
  verCarrossel,
  type SlideSpec,
} from '@/lib/ai/carousel-service'
import {
  loadExpectedTextsForGeneration,
  verifyImageTexts,
} from '@/lib/ai/creative-text-verification'
import { fetchImageSource } from '@/lib/ai/fetch-image-source'
import {
  loadBrandContext,
  updateBrandDNA,
  virarRegra,
  BRAND_DNA_FIELDS,
  BRAND_DNA_MAX_CHARS,
  type BrandDNAField,
} from '@/lib/brand/brand-context'

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, any>, principal: McpPrincipal) => Promise<unknown>
}

/**
 * Projetos que o portador pode ver. O segredo de serviço enxerga tudo (é o
 * Claudinho, que já opera em nome do dono); um token OAuth fica restrito aos
 * projetos do usuário que aprovou o conector.
 */
async function projetosVisiveis(principal: McpPrincipal): Promise<number[] | null> {
  if (principal.kind === 'service') return null

  const projects = await db.project.findMany({
    where: {
      OR: [
        { userId: principal.userId },
        { organizationProjects: { some: { organization: { ownerClerkId: principal.userId } } } },
      ],
    },
    select: { id: true },
  })
  return projects.map((p) => p.id)
}

/**
 * Resolve quem assina a ação: o User do banco E o id do Clerk, porque cada
 * consumidor pede um espaço de id diferente — escritas na base usam User.id
 * (convenção de createdBy/updatedBy das rotas), créditos exigem o clerkId.
 *
 * Atenção ao espaço de id (verificado nos DADOS em 31/07/2026):
 * - `principal.userId` (token OAuth) é id do CLERK (`user_…`), vindo do
 *   `auth()` da tela de consentimento.
 * - `Project.userId` guarda o id INTERNO do User (cuid) — a versão anterior
 *   deste helper o tratava como clerkId e o getUserFromClerkId CRIAVA um User
 *   fantasma com clerkId=cuid a cada projeto tocado pelo Claudinho. Dois
 *   fantasmas já existem no banco por isso (cmgw866yc…, cms5fv2c5…).
 */
async function resolverDono(
  projectId: number,
  principal: McpPrincipal,
): Promise<{ id: string; clerkId: string }> {
  if (principal.kind === 'user' && principal.userId) {
    const dbUser = await getUserFromClerkId(principal.userId)
    return { id: dbUser.id, clerkId: principal.userId }
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
  }

  let user = await db.user.findUnique({
    where: { id: project.userId },
    select: { id: true, clerkId: true },
  })
  // Projeto antigo pode ter gravado o clerkId na coluna — aceita os dois
  // espaços em vez de inventar um usuário novo.
  if (!user) {
    user = await db.user.findUnique({
      where: { clerkId: project.userId },
      select: { id: true, clerkId: true },
    })
  }
  if (!user) {
    throw new CreativeError(
      'DONO_NAO_ENCONTRADO',
      `O dono do projeto ${projectId} não existe na tabela User (Project.userId=${project.userId}).`,
      500,
    )
  }
  return user
}

/** Autor das escritas na base, como User.id do banco. */
async function resolverAutor(projectId: number, principal: McpPrincipal): Promise<string> {
  return (await resolverDono(projectId, principal)).id
}

/**
 * Quem decidiu, para a coluna `decididoPor` — `User.id` INTERNO, nunca o
 * clerkId. Nunca propaga erro: isto é auditoria, e um projeto com dono
 * pendurado (`resolverDono` levanta 500) não pode deixar de ser agendado por
 * causa de um campo de registro.
 */
async function quemDecidiu(
  projectId: number,
  principal: McpPrincipal,
): Promise<string | undefined> {
  try {
    return await resolverAutor(projectId, principal)
  } catch (error) {
    console.error('[mcp] não deu para resolver quem decidiu:', error)
    return undefined
  }
}

/** Barra o acesso a um projeto fora do alcance do portador. */
async function assertProjetoPermitido(projectId: number, principal: McpPrincipal) {
  const permitidos = await projetosVisiveis(principal)
  if (permitidos && !permitidos.includes(projectId)) {
    throw new CreativeError('PROJETO_SEM_ACESSO', `Sem acesso ao projeto ${projectId}`, 403)
  }
}

function requireString(args: Record<string, any>, key: string): string {
  const value = args?.[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`"${key}" é obrigatório`)
  }
  return value
}

function requireNumber(args: Record<string, any>, key: string): number {
  const value = args?.[key]
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new Error(`"${key}" é obrigatório e deve ser numérico`)
  }
  return parsed
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'listar-clientes',
    description:
      'Lista os clientes (projetos) do Studio Lagosta. Comece por aqui quando a pessoa citar um cliente pelo nome — é onde você descobre o id que as outras ferramentas pedem.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (_args, principal) => {
      const permitidos = await projetosVisiveis(principal)
      const projects = await db.project.findMany({
        where: { status: 'ACTIVE', ...(permitidos ? { id: { in: permitidos } } : {}) },
        select: {
          id: true,
          name: true,
          instagramUsername: true,
          googleDriveFolderId: true,
          googleDriveImagesFolderId: true,
        },
        orderBy: { name: 'asc' },
      })
      return { count: projects.length, projects }
    },
  },

  {
    name: 'escolher-modelo',
    description:
      'Acha o modelo pronto do cliente que combina com um tema (e dia), devolvendo os campos de texto a preencher e a identidade da marca. Use quando o cliente tem modelo cadastrado para aquele tema; depois use criar-arte-de-modelo. Se não houver modelo, prefira criar-arte, que monta do zero.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto (preferido). Veja list-projects.' },
        projectHint: { type: 'string', description: 'Nome ou parte do nome do projeto, se não souber o id.' },
        theme: { type: 'string', description: 'Tema do criativo (ex: "happy hour", "almoço executivo", "delivery").' },
        day: { type: 'string', description: 'Dia da semana em PT para desempatar (ex: "sexta", "sabado").' },
      },
      required: ['theme'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      if (typeof args.projectId === 'number') await assertProjetoPermitido(args.projectId, principal)
      return prepareCreative({
        projectId: typeof args.projectId === 'number' ? args.projectId : undefined,
        projectHint: typeof args.projectHint === 'string' ? args.projectHint : undefined,
        theme: requireString(args, 'theme'),
        day: typeof args.day === 'string' ? args.day : undefined,
      })
    },
  },

  {
    name: 'criar-arte-de-modelo',
    description:
      'Monta a arte em cima de um modelo pronto do cliente (o que veio de escolher-modelo). Devolve a imagem e um link para abrir e ajustar no editor.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        sourcePageId: { type: 'string', description: 'ID da página de template (prepare-creative.page.id).' },
        slotValues: {
          type: 'object',
          description:
            'Valores por slot, com as chaves do template (layerId ou nome da camada). String define texto; objeto aceita {content, fileUrl}. Chaves reservadas: _driveImageId, _imageUrl.',
          additionalProperties: true,
        },
        name: { type: 'string', description: 'Nome da página gerada (opcional).' },
        imageUrl: { type: 'string', description: 'URL pública da imagem de fundo. Tem prioridade sobre _driveImageId.' },
      },
      required: ['projectId', 'sourcePageId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      await assertProjetoPermitido(requireNumber(args, 'projectId'), principal)
      return createArteRapida({
        projectId: requireNumber(args, 'projectId'),
        sourcePageId: requireString(args, 'sourcePageId'),
        slotValues: (args.slotValues && typeof args.slotValues === 'object' ? args.slotValues : {}) as Record<string, unknown>,
        name: typeof args.name === 'string' ? args.name : undefined,
        imageUrl: typeof args.imageUrl === 'string' ? args.imageUrl : undefined,
      })
    },
  },

  {
    name: 'ver-agenda',
    description:
      'Mostra a agenda do cliente já em linguagem de gente: agrupada por dia, com situação (rascunho/agendado/publicado/falhou), horário de Brasília e a capa de cada arte. Consulte antes de propor data, para não repetir tema nem empilhar posts. Sem período, mostra de ontem em diante. O postId de cada item serve para conferir-arte, editar-post, reagendar-post, aprovar-rascunhos e cancelar-post.\n\nQuando um item traz "aviso", repasse: é post de campanha marcado para depois do fim dela. O campo "escopo" só aparece quando o post não é rotina (campanha ou pontual).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        from: { type: 'string', description: 'Data inicial ("AAAA-MM-DD" ou ISO). Default: ontem.' },
        to: { type: 'string', description: 'Data final (opcional).' },
        situacao: {
          type: 'string',
          enum: ['rascunho', 'agendado', 'publicado', 'falhou'],
          description: 'Filtra por situação (opcional).',
        },
        limit: { type: 'number', description: 'Máximo de posts (default 50).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

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
  },

  {
    name: 'sugerir-posts',
    description:
      'Sugere os próximos posts a partir da CADÊNCIA real do cliente: analisa as últimas 8 semanas (dia da semana × horário), acha os buracos dos próximos dias e devolve slots prontos — cada um com o motivo, o modelo do cliente para aquele dia (quando existe) e as campanhas da base que citam o dia (ex.: Quinta do Vinho). Use quando a pessoa pedir "o que postar essa semana", ou proativamente ao notar a agenda vazia. Você escreve a copy; a sugestão é o esqueleto de quando/o quê.\n\nCada slot vem com um `sugestaoId`: guarde-o e devolva em colocar-na-agenda quando o post nascer daquele horário, mesmo que você o tenha mudado. É só um dado técnico — nunca fale dele na conversa.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        dias: { type: 'number', description: 'Quantos dias à frente (default 7, máx 14).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return sugerirPosts({
        projectId,
        dias: typeof args.dias === 'number' ? args.dias : undefined,
      })
    },
  },

  {
    name: 'postar-agora',
    description:
      'Publica IMEDIATAMENTE no Instagram do cliente: o post entra na fila na hora e sai em ~3 minutos. Não tem rascunho, não tem revisão depois — é publicação real.\n\nNunca chame por conta própria. Mostre a arte e a legenda e faça a pergunta direta: "isso vai pro Instagram de X AGORA, confirma?". Só chame depois do sim explícito. Se a pessoa tiver qualquer hesitação, prefira colocar-na-agenda como rascunho.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        postType: { type: 'string', enum: ['STORY', 'POST', 'REEL', 'CAROUSEL'], description: 'Tipo (padrão STORY).' },
        caption: { type: 'string', description: 'Legenda. Story costuma ir sem.' },
        pageId: { type: 'string', description: 'A arte criada aqui (de criar-arte ou criar-arte-de-modelo).' },
        mediaUrls: { type: 'array', items: { type: 'string' }, description: 'Imagens prontas, se não vier de uma arte criada aqui.' },
        generationId: { type: 'string', description: 'O generationId da arte, se houver (habilita melhorar depois).' },
        escopo: {
          type: 'string',
          enum: ['rotina', 'campanha', 'pontual'],
          description:
            'O que o sistema pode aprender com este post — mesma escolha de colocar-na-agenda. Publicação imediata costuma ser "pontual" (recado, aviso, algo que aconteceu agora): marcar assim evita que vire cadência.',
        },
        campanhaId: {
          type: 'string',
          description: 'Id da entrada de CAMPANHAS da base a que este post pertence (de consultar-base).',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
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
  },

  {
    name: 'editar-post',
    description:
      'Edita a legenda e/ou o tipo de um RASCUNHO da agenda (o postId vem de ver-agenda). Post já aprovado não se edita direto: traga para rascunho antes (voltar-para-rascunho), edite e aprove de novo — editar algo armado mudaria uma publicação real sem re-aprovação. Para mudar horário use reagendar-post; para trocar a arte use ajustar-arte na página.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        postId: { type: 'string', description: 'Id do rascunho (de ver-agenda).' },
        caption: { type: 'string', description: 'Nova legenda (substitui a inteira).' },
        postType: { type: 'string', enum: ['STORY', 'POST', 'REEL', 'CAROUSEL'], description: 'Novo tipo (opcional).' },
      },
      required: ['projectId', 'postId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return editarPost({
        projectId,
        postId: requireString(args, 'postId'),
        caption: typeof args.caption === 'string' ? args.caption : undefined,
        postType: args.postType,
      })
    },
  },
  {
    name: 'consultar-base',
    description:
      'Base de conhecimento do cliente: tom de voz, horário de funcionamento, cardápio, diferenciais e campanhas. CONSULTE SEMPRE antes de escrever qualquer texto — é o que evita prometer horário errado ou inventar preço. Se achar informação conflitante, aponte para a pessoa em vez de escolher sozinho.\n\nEntrada com validade vencida não aparece aqui. Cada entrada traz `validade` quando tem prazo — se você está escrevendo para uma data FUTURA, confira se a campanha ainda estará no ar naquele dia.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        category: {
          type: 'string',
          enum: Object.values(KnowledgeCategory),
          description: 'Filtra por categoria. Omita para trazer tudo.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      await assertProjetoPermitido(requireNumber(args, 'projectId'), principal)
      const category = typeof args.category === 'string' ? (args.category as KnowledgeCategory) : undefined
      const entries = await db.knowledgeBaseEntry.findMany({
        where: {
          projectId: requireNumber(args, 'projectId'),
          status: 'ACTIVE',
          // Campanha vencida não pode alimentar texto nenhum. O cron diário
          // arquiva, mas ele roda uma vez por dia — o filtro é o que garante
          // que ninguém leia a entrada nas horas entre o vencimento e a faxina.
          ...vigenteEm(),
          ...(category ? { category } : {}),
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
  },

  {
    name: 'consultar-dna',
    description:
      'DNA da marca do cliente: tom de voz, regras, composição/layout, estilo visual e direção fotográfica — mais o que o sistema injeta sozinho (fontes, cores, logo) e a biblioteca de elementos gráficos do projeto (ícones, selos, formas, ornamentos), cada um com `url` própria. O DNA entra em TODA geração de copy e arte, sempre; a base de conhecimento é o conteúdo pesquisável (horários, cardápio, campanhas).\n\nUse a `url` do elemento como está ao montar arte (ajustar-arte, camada de imagem) — é o arquivo oficial da biblioteca, então a arte acompanha sozinha qualquer troca feita no painel; cópia hospedada por fora congela a versão de hoje.\n\nConsulte antes de escrever textos para o cliente, e SEMPRE antes de atualizar-dna — você precisa mostrar à pessoa o que já existe.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
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
  },

  {
    name: 'atualizar-dna',
    description:
      'Atualiza o DNA da marca — a identidade que passa a valer em TODA geração de copy e arte deste cliente, do chat e do site. Seções: toneOfVoice (como a marca fala), contentRules (o que nunca fazer/dizer), composition (layout e hierarquia), visualStyle (estética geral), photoDirection (luz e tratamento de foto).\n\nCada seção enviada SUBSTITUI o texto inteiro dela — não é acréscimo. Fluxo obrigatório: consultar-dna → mostrar à pessoa o texto ATUAL e o NOVO → só gravar com o OK explícito. Enviar null limpa a seção.\n\nNão confunda com a base de conhecimento: horário, cardápio, preço e campanha vão em criar-entrada-base; identidade vai aqui.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        toneOfVoice: { type: ['string', 'null'], description: 'Como a marca fala (usado em copies e chat). null limpa.' },
        contentRules: { type: ['string', 'null'], description: 'O que nunca fazer ou dizer (usado em copies, chat e artes). null limpa.' },
        composition: { type: ['string', 'null'], description: 'Como os elementos se organizam nas artes. null limpa.' },
        visualStyle: { type: ['string', 'null'], description: 'A estética geral da marca (usado nas artes). null limpa.' },
        photoDirection: { type: ['string', 'null'], description: 'Luz e tratamento fotográfico (usado nas artes). null limpa.' },
        approvalChecklist: {
          type: ['string', 'null'],
          description:
            'Crivo de aprovação: perguntas binárias, UMA POR LINHA, conferidas por gente antes de agendar. NÃO entra em prompt de geração. null limpa.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      const patch: Partial<Record<BrandDNAField, string | null>> = {}
      for (const field of BRAND_DNA_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(args, field)) continue
        const value = args[field]
        if (value !== null && typeof value !== 'string') {
          throw new Error(`${field} deve ser texto ou null.`)
        }
        if (typeof value === 'string' && value.length > BRAND_DNA_MAX_CHARS) {
          throw new Error(
            `${field} passou de ${BRAND_DNA_MAX_CHARS} caracteres. O DNA é síntese, não arquivo — resuma; detalhe factual vai para a base de conhecimento.`,
          )
        }
        patch[field] = value
      }
      if (Object.keys(patch).length === 0) {
        throw new Error(
          `Envie pelo menos uma seção (${BRAND_DNA_FIELDS.join(', ')}).`,
        )
      }

      const dna = await updateBrandDNA(projectId, patch)
      const alteradas = Object.keys(patch).join(', ')
      return {
        atualizado: true,
        dna,
        mensagem: `DNA atualizado (${alteradas}). Já vale para as próximas gerações — do chat e do site.`,
      }
    },
  },

  {
    name: 'marcar-referencia-de-estilo',
    description:
      'Marca (ou desmarca) uma arte pronta como REFERÊNCIA DE ESTILO do cliente — "gostei desta, faça as próximas parecidas". As marcadas entram num rodízio: cada nova arte recebe UMA delas como referência visual, sempre a menos usada, para as peças terem parentesco sem sair todas iguais.\n\nUse quando a pessoa elogiar uma arte ("essa ficou ótima", "quero mais assim"). Sem argumento `marcada`, marca. Chame sem `generationId` para LISTAR as referências atuais na ordem do rodízio.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        generationId: {
          type: 'string',
          description: 'A arte. Omita para apenas listar as referências atuais.',
        },
        marcada: {
          type: 'boolean',
          description: 'true marca (default), false tira das referências.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      if (!args.generationId) {
        const refs = await listarReferenciasDeEstilo(projectId)
        return {
          referencias: refs,
          total: refs.length,
          dica:
            refs.length === 0
              ? 'Nenhuma arte marcada ainda. Marque as que a pessoa aprovar — é o que dá cara própria às próximas.'
              : 'A primeira da lista é a que entra na próxima geração (rodízio: menos usada primeiro).',
        }
      }

      const marcada = args.marcada !== false
      const r = await definirReferenciaDeEstilo(String(args.generationId), marcada)
      return {
        ...r,
        mensagem: marcada
          ? 'Marcada. As próximas artes deste cliente vão se inspirar nela, em rodízio com as outras.'
          : 'Tirada das referências.',
      }
    },
  },

  {
    name: 'virar-regra',
    description:
      'Transforma uma correção que a pessoa aprovou na conversa numa regra que vale daqui para a frente. Use quando alguém corrigir a arte ou o texto e a correção não for só para aquela peça.\n\n⚖️ TRIAGEM, antes de chamar: **regra temporária ou de campanha → base de conhecimento com validade** (mande `validade`; ex: "durante o Festival Italiano o rótulo aparece na foto"). **Identidade permanente da marca → DNA** (mande `secao`; ex: "a logo sempre no canto direito", "nunca escrever preço em vermelho"). O DNA é eterno e entra em TODO prompt — regra com prazo ali continuaria mandando meses depois do fim da campanha, e ninguém lembraria de tirar. Na dúvida, pergunte à pessoa até quando a regra vale.\n\nNo DNA a regra é ACRESCENTADA ao fim da seção, o texto que já existia fica intacto (diferente de atualizar-dna, que substitui).\n\nFluxo: chame primeiro sem `confirmado` para ver a proposta, mostre à pessoa o que será gravado e só então chame com `confirmado: true`. Nunca registre dedução sua como regra — só o que a pessoa confirmou.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        secao: {
          type: 'string',
          enum: [...BRAND_DNA_FIELDS],
          description:
            'Onde a regra mora no DNA: contentRules (proibições), composition (layout), visualStyle (estética), photoDirection (foto), toneOfVoice (texto), approvalChecklist (crivo). Obrigatória para regra PERMANENTE; dispensável quando você manda validade.',
        },
        regra: {
          type: 'string',
          description: 'A regra na forma imperativa, como deve valer daqui para a frente.',
        },
        motivo: {
          type: 'string',
          description: 'O caso concreto que gerou a regra. Sem motivo a regra não se explica daqui a três meses.',
        },
        validade: {
          type: 'string',
          description:
            'Último dia em que a regra vale (AAAA-MM-DD). Manda a regra para a base de conhecimento, categoria CAMPANHAS, em vez do DNA — ela deixa de valer sozinha depois dessa data.',
        },
        titulo: {
          type: 'string',
          description: 'Título da entrada na base, quando a regra tem validade (ex: "Festival Italiano — agosto"). Opcional.',
        },
        confirmado: {
          type: 'boolean',
          description: 'Só grava com true. Sem isto devolve a proposta para você mostrar à pessoa.',
        },
      },
      required: ['projectId', 'regra', 'motivo'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      const validade = parseValidade(args.validade) ?? null
      const secao = typeof args.secao === 'string' ? (args.secao as BrandDNAField) : undefined
      if (secao && !BRAND_DNA_FIELDS.includes(secao)) {
        throw new Error(`Seção inválida: ${String(args.secao)}. Use uma de ${BRAND_DNA_FIELDS.join(', ')}.`)
      }

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
  },

  {
    name: 'listar-combinacoes-de-texto',
    description:
      'Composições de texto prontas do cliente, com posição, tamanho e cor já ajustados à marca. Escolher uma e só trocar as palavras costuma dar resultado melhor do que posicionar tudo na mão. Repare em quantos campos cada uma tem: texto longo demais para os campos disponíveis fica sobreposto na arte.',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'number', description: 'ID do projeto.' } },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return listFontCombinations(projectId)
    },
  },

  {
    name: 'criar-arte',
    description:
      'Cria a arte do zero, sem depender de modelo cadastrado — é o caminho padrão. Escolha a foto, o formato e componha o texto: o mais seguro é usar uma das composições prontas (listar-combinacoes-de-texto) e só trocar as palavras. O logo entra sozinho e a foto recebe um sombreado para o texto não sumir. Mantenha os textos curtos: story se lê em dois segundos, e frase comprida estoura a caixa. Devolve a imagem e um link para ajustar no editor.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'story 1080x1920 (default), feed 1080x1350, quadrado 1080x1080.' },
        imageUrl: { type: 'string', description: 'URL pública da foto de fundo.' },
        driveImageId: { type: 'string', description: 'ID do arquivo no Google Drive, alternativa ao imageUrl.' },
        backgroundColor: { type: 'string', description: 'Cor de fundo quando não houver foto (ex: "#111111").' },
        overlay: { type: 'string', enum: ['nenhum', 'inferior', 'superior', 'completo'], description: 'Escurecimento sobre a foto. Default "inferior".' },
        combinationId: { type: 'string', description: 'ID da combinação tipográfica (ver list-font-combinations).' },
        textos: { type: 'object', description: 'Textos da combinação, por id ou label do elemento. Ex: {"titulo":"HAPPY HOUR","detalhes":"Todo dia até as 20h"}.', additionalProperties: { type: 'string' } },
        textosLivres: {
          type: 'array',
          description: 'Blocos posicionados por você. Alternativa à combinação.',
          items: {
            type: 'object',
            properties: {
              texto: { type: 'string', description: 'Conteúdo. \n quebra linha.' },
              x: { type: 'number', description: 'Canto esquerdo, fração da largura (0..1).' },
              y: { type: 'number', description: 'Topo, fração da altura (0..1).' },
              width: { type: 'number', description: 'Largura da caixa, fração da largura (0..1).' },
              fontSize: { type: 'number', description: 'Corpo em px na base de 1080 de largura.' },
              role: { type: 'string', enum: ['title', 'subtitle', 'body'], description: 'De qual fonte da marca herda. subtitle cai na fonte de corpo quando a marca não define uma própria.' },
              fontFamily: { type: 'string' },
              fontWeight: { type: 'string' },
              textTransform: { type: 'string', enum: ['none', 'uppercase'] },
              textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
              lineHeight: { type: 'number' },
              letterSpacing: { type: 'number' },
              color: { type: 'string' },
            },
            required: ['texto', 'x', 'y', 'width', 'fontSize'],
          },
        },
        logo: { type: 'boolean', description: 'Inclui o logo da marca (default true).' },
        name: { type: 'string', description: 'Nome da página gerada.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      await assertProjetoPermitido(requireNumber(args, 'projectId'), principal)
      return createArteLivre({
        projectId: requireNumber(args, 'projectId'),
        formato: args.formato,
        imageUrl: args.imageUrl,
        driveImageId: args.driveImageId,
        backgroundColor: args.backgroundColor,
        overlay: args.overlay,
        combinationId: args.combinationId,
        textos: args.textos,
        textosLivres: args.textosLivres,
        logo: args.logo,
        name: args.name,
      })
    },
  },
  {
    name: 'buscar-fotos',
    description:
      'Busca fotos no acervo do cliente. Traz primeiro as menos usadas, para não repetir a mesma foto toda semana. O acervo é organizado em pastas por assunto (cortes, ambiente, bebidas, sobremesas...) — a resposta lista as pastas disponíveis, então se a busca por tema vier vazia, tente de novo pela pasta. Ao montar vários posts de uma vez, use pastas diferentes para variar.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        theme: { type: 'string', description: 'Tema — casa com tags, bestFor e o caminho da pasta (ex: "ambiente", "picanha", "chopp").' },
        folder: { type: 'string', description: 'Pasta exata ou prefixo (ex: "01_cortes/picanha-bovina", "02_ambiente"). Veja pastasDisponiveis no retorno.' },
        menuCategory: { type: 'string', description: 'Categoria do cardápio (ex: PRATOS_PRINCIPAIS, BEBIDAS).' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags a casar.' },
        quality: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Qualidade mínima.' },
        limit: { type: 'number', description: 'Máximo de resultados (default 20).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return buscarNoAcervo({
        projectId,
        theme: args.theme,
        folder: args.folder,
        menuCategory: args.menuCategory,
        tags: args.tags,
        quality: args.quality,
        limit: args.limit,
      })
    },
  },

  {
    name: 'pedir-foto',
    description:
      'Gera um link de UM TOQUE para a pessoa enviar uma foto do celular direto ao estúdio. Use quando ela anexar uma foto no chat (o anexo NÃO chega até você — os bytes ficam na plataforma) ou disser que quer usar uma foto do aparelho: mande o link, peça para tocar e escolher a foto, e confira com ver-foto-enviada quando ela avisar. O link vale 30 minutos; reenviar dentro do prazo substitui a foto (mandou a errada → manda de novo, mesmo link).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente (a foto fica no acervo de envio dele).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return pedirFoto({ projectId })
    },
  },

  {
    name: 'ver-foto-enviada',
    description:
      'Confere se a foto do link de pedir-foto já chegou. Quando chegar, devolve a fotoUrl pronta para usar como imageUrl em criar-arte (arte nova) ou ajustar-arte (trocar o fundo de uma arte existente).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        uploadId: { type: 'string', description: 'O uploadId devolvido por pedir-foto.' },
      },
      required: ['projectId', 'uploadId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return verFoto({ projectId, uploadId: requireString(args, 'uploadId') })
    },
  },

  {
    name: 'listar-fotos-da-pasta',
    description:
      'Lista as fotos da pasta do cliente no Drive. Use quando o acervo ainda não foi catalogado (buscar-fotos avisa quando é o caso).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        limit: { type: 'number', description: 'Máximo de imagens (default 30).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return listarImagensDoDrive(projectId, typeof args.limit === 'number' ? args.limit : undefined)
    },
  },

  {
    name: 'colocar-na-agenda',
    description:
      'Coloca a arte na agenda do cliente, na data e hora escolhidas.\n\nPor padrão entra como RASCUNHO: aparece na agenda e NÃO publica. Só vira publicação de verdade com situacao="agendado", e isso sai para o Instagram real do cliente na hora marcada.\n\nNunca use "agendado" por conta própria. Mostre antes a arte, a data e o horário, e pergunte de forma direta — "isso vai publicar no Instagram na segunda às 16h, confirma?". Rascunho primeiro é sempre o caminho seguro.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        postType: { type: 'string', enum: ['STORY', 'POST', 'REEL', 'CAROUSEL'], description: 'Tipo de publicação (padrão STORY).' },
        caption: { type: 'string', description: 'Legenda. Story costuma ir sem.' },
        scheduledDatetime: { type: 'string', description: 'Quando: "AAAA-MM-DD HH:mm" no horário de Brasília.' },
        pageId: { type: 'string', description: 'A arte criada aqui (veio de criar-arte ou criar-arte-de-modelo).' },
        mediaUrls: { type: 'array', items: { type: 'string' }, description: 'Imagens prontas, se não vier de uma arte criada aqui.' },
        generationId: { type: 'string', description: 'O generationId da arte. Para arte MELHORADA, basta ele — a imagem é resolvida sozinha (sem copiar URL). Vincula o criativo ao post e habilita melhorar depois. Passe sempre que tiver.' },
        situacao: {
          type: 'string',
          enum: ['rascunho', 'agendado'],
          description: 'rascunho (padrão) só aparece na agenda; agendado publica de verdade no Instagram do cliente. Use "agendado" apenas após confirmação explícita da pessoa.',
        },
        escopo: {
          type: 'string',
          enum: ['rotina', 'campanha', 'pontual'],
          description:
            'O que o sistema pode aprender com este post. "rotina" (padrão) é o post normal, que forma a cadência e o repertório do cliente. "campanha" é post de ação com começo e fim (festival, semana temática, promoção datada) — aprende para a próxima edição dela, não para a rotina. "pontual" é caso isolado (aviso de feriado, mudança de horário, recado de emergência) e não deve virar padrão nenhum.\n\nMarque quando souber: uma leva costuma misturar os três, e post pontual contado como rotina faz o sistema sugerir aviso de feriado toda semana. Não pergunte à pessoa com esse vocabulário — deduza do que ela pediu.',
        },
        campanhaId: {
          type: 'string',
          description:
            'Id da entrada de CAMPANHAS da base (de consultar-base) a que este post pertence. Informar isso já marca o post como campanha, e é o que permite avisar quando um post está marcado para depois do fim dela.',
        },
        sugestaoId: {
          type: 'string',
          description:
            'Se este post veio de um horário proposto por sugerir-posts, devolva aqui o sugestaoId daquele slot — inclusive quando você mudou o horário. É assim que o sistema aprende quais sugestões são boas: sem isso ele só enxerga o que foi aceito. Não invente nem reaproveite id de outra proposta; sem sugestão, omita.',
        },
      },
      required: ['projectId', 'scheduledDatetime'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      // status: DRAFT/SCHEDULED é o nome antigo, ainda vindo de conectores
      // que guardaram o esquema anterior
      const situacao =
        args.situacao ?? (args.status === 'SCHEDULED' ? 'agendado' : args.status ? 'rascunho' : undefined)

      const scheduledDatetime = requireString(args, 'scheduledDatetime')
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
  },
  {
    name: 'aprovar-rascunhos',
    description:
      'Aprova rascunhos: eles entram na fila e PUBLICAM DE VERDADE no Instagram do cliente, cada um no seu horário marcado.\n\nNunca chame por conta própria. Antes, mostre à pessoa o que vai ser aprovado (artes, datas e horários) e faça a pergunta direta — "isso vai publicar no Instagram de X, confirma?". Só chame depois do sim explícito.\n\nA resposta traz processados e ignorados (com o motivo de cada um, ex.: horário vencido, sem arte) — sempre repasse os ignorados à pessoa em vez de relatar sucesso genérico. Pode trazer também avisos: nesses o post FOI aprovado, mas há algo a conferir (ex.: post de campanha marcado para depois do fim dela). Repasse o aviso — ele não bloqueia nada.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        postIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ids dos posts a aprovar (de ver-agenda ou do retorno de colocar-na-agenda).',
        },
      },
      required: ['projectId', 'postIds'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const brutos: unknown[] = Array.isArray(args.postIds) ? args.postIds : []
      if (brutos.length === 0) {
        throw new Error('Informe ao menos um post em postIds (os ids vêm de ver-agenda).')
      }
      // Id inválido é erro, não descarte silencioso: um post que some da lista
      // sem aparecer em ignorados viraria "sucesso" falso no relato do modelo.
      if (!brutos.every((id): id is string => typeof id === 'string')) {
        throw new Error('Lista de posts inválida: todos os ids precisam ser textos (vindos de ver-agenda).')
      }
      const postIds = brutos
      return processarAprovacao({ projectId, postIds, action: 'APPROVE' })
    },
  },

  {
    name: 'voltar-para-rascunho',
    description:
      'Tira posts agendados da fila de publicação e os devolve à condição de rascunho — continuam na agenda, mas não publicam até nova aprovação. Use quando a pessoa quiser segurar algo que já foi aprovado. Se o post já tiver ido para a fila remota, ele é removido de lá antes; se a remoção falhar, o post aparece em ignorados com o motivo e SEGUE agendado.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        postIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ids dos posts a devolver para rascunho.',
        },
      },
      required: ['projectId', 'postIds'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const brutos: unknown[] = Array.isArray(args.postIds) ? args.postIds : []
      if (brutos.length === 0) {
        throw new Error('Informe ao menos um post em postIds (os ids vêm de ver-agenda).')
      }
      // Id inválido é erro, não descarte silencioso: um post que some da lista
      // sem aparecer em ignorados viraria "sucesso" falso no relato do modelo.
      if (!brutos.every((id): id is string => typeof id === 'string')) {
        throw new Error('Lista de posts inválida: todos os ids precisam ser textos (vindos de ver-agenda).')
      }
      const postIds = brutos
      return processarAprovacao({ projectId, postIds, action: 'REVERT' })
    },
  },

  {
    name: 'reagendar-post',
    description:
      'Muda a data e a hora de um post da agenda. A situação é preservada: rascunho continua rascunho (mudar horário não aprova), agendado continua agendado e passa a publicar no horário novo — confirme o horário novo com a pessoa quando o post já estiver agendado. Só aceita horário futuro.\n\nNão reagenda post publicado, em publicação, nem FALHADO — post que falhou é caso para a interface ("Tentar novamente") ou para um post novo, nunca para rearme silencioso. Post de publicação manual (lembrete) tem o lembrete reenviado no WhatsApp perto do novo horário.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        postId: { type: 'string', description: 'Id do post (de ver-agenda).' },
        novaDataHora: {
          type: 'string',
          description: 'Novo horário: "AAAA-MM-DD HH:mm" no horário de Brasília.',
        },
      },
      required: ['projectId', 'postId', 'novaDataHora'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return reagendarPost({
        projectId,
        postId: requireString(args, 'postId'),
        novaDataHora: requireString(args, 'novaDataHora'),
      })
    },
  },

  {
    name: 'cancelar-post',
    description:
      'Cancela um post e o REMOVE da agenda — vale para rascunho e para agendado (que também é tirado da fila de publicação). É ação destrutiva e sem desfazer: confirme com a pessoa antes, citando o post e o horário. Post já publicado não se cancela por aqui. Se a pessoa só quer adiar ou segurar, prefira reagendar-post ou voltar-para-rascunho.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        postId: { type: 'string', description: 'Id do post a cancelar.' },
      },
      required: ['projectId', 'postId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      return cancelarPost({ projectId, postId: requireString(args, 'postId') })
    },
  },
  {
    name: 'ajustar-arte',
    description:
      'Ajusta uma arte já criada aqui: troca textos e/ou a foto na MESMA página e re-renderiza. Use depois de conferir-arte, quando algo saiu errado — texto estourando a caixa, foto ruim, erro de digitação. As chaves de slotValues são as mesmas da criação (id ou nome da camada; conferir-arte e o retorno da criação mostram os nomes).\n\nNão serve para páginas-modelo do cliente (essas se editam no editor). Se a arte já estiver em algum post da agenda, a arte do post é atualizada junto (re-render automático em alguns minutos).\n\nATENÇÃO: post agendado é enviado para publicação 5 minutos antes do horário, e a partir daí a arte dele NÃO muda mais. Se a resposta trouxer `aviso`, repita-o para a pessoa — o ajuste valeu para a página, mas aquele post vai ao ar com a arte anterior. Para trocar mesmo: voltar-para-rascunho, ajustar, e agendar de novo.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        pageId: { type: 'string', description: 'A arte a ajustar (pageId devolvido por criar-arte ou criar-arte-de-modelo).' },
        slotValues: {
          type: 'object',
          description: 'Só o que muda: chave = id ou nome da camada, valor = novo texto (string) ou {content, fileUrl}.',
          additionalProperties: true,
        },
        imageUrl: { type: 'string', description: 'Nova foto de fundo (URL pública).' },
        driveImageId: { type: 'string', description: 'Nova foto de fundo pelo id do Drive (de buscar-fotos).' },
        name: { type: 'string', description: 'Novo nome da página (opcional).' },
      },
      required: ['projectId', 'pageId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const r = await ajustarArte({
        projectId,
        pageId: requireString(args, 'pageId'),
        slotValues: (args.slotValues && typeof args.slotValues === 'object'
          ? args.slotValues
          : {}) as Record<string, unknown>,
        imageUrl: typeof args.imageUrl === 'string' ? args.imageUrl : undefined,
        driveImageId: typeof args.driveImageId === 'string' ? args.driveImageId : undefined,
        name: typeof args.name === 'string' ? args.name : undefined,
      })

      /**
       * O ajuste vale para a página, mas post já entregue ao publicador vai ao
       * ar com a arte anterior. Sem esta frase o chat responde "pronto,
       * ajustei" e a pessoa só descobre a divergência quando o post sai — que
       * é exatamente o defeito que a janela de congelamento veio corrigir.
       */
      if (r.postsCongelados && r.postsCongelados > 0) {
        const n = r.postsCongelados
        return {
          ...r,
          aviso:
            `Atenção: ${n === 1 ? '1 post desta arte já foi enviado' : `${n} posts desta arte já foram enviados`} ` +
            `para publicação e ${n === 1 ? 'vai sair' : 'vão sair'} com a arte ANTERIOR — o ajuste não ${n === 1 ? 'o' : 'os'} alcança. ` +
            `Para trocar de verdade: voltar-para-rascunho, ajustar e agendar de novo.`,
        }
      }

      return r
    },
  },

  {
    name: 'conferir-arte',
    description:
      'Mostra a arte para VOCÊ ver (miniatura na resposta) e confere por visão se os textos saíram exatamente como deveriam. Use depois de criar ou ajustar uma arte, antes de mostrá-la à pessoa — é o que pega texto cortado, sobreposto ou com erro. Informe generationId (arte da galeria) ou postId (arte atual de um post da agenda).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        generationId: { type: 'string', description: 'A arte (vem de criar-arte, criar-arte-de-modelo ou ajustar-arte).' },
        postId: { type: 'string', description: 'Alternativa: confere a arte ATUAL de um post da agenda.' },
        verificarTextos: { type: 'boolean', description: 'Roda a conferência de texto por visão (default true; só quando há textos de referência).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      let url: string | null = null
      let textRefGenerationId: string | null = null
      let pageIdRef: string | null = null

      if (typeof args.generationId === 'string' && args.generationId) {
        const gen = await db.generation.findFirst({
          where: { id: args.generationId, projectId },
          select: { id: true, resultUrl: true, fieldValues: true },
        })
        if (!gen) {
          throw new CreativeError('ARTE_NAO_ENCONTRADA', 'Arte não encontrada neste cliente.', 404)
        }
        url = gen.resultUrl
        textRefGenerationId = gen.id
        const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
        pageIdRef =
          typeof fv.pageId === 'string'
            ? fv.pageId
            : fv.source === 'ajuste-arte' && typeof fv.sourcePageId === 'string'
              ? fv.sourcePageId
              : null
      } else if (typeof args.postId === 'string' && args.postId) {
        const post = await db.socialPost.findFirst({
          where: { id: args.postId, projectId },
          select: { mediaUrls: true, generationId: true, pageId: true },
        })
        if (!post) {
          throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste cliente.', 404)
        }
        url = post.mediaUrls?.[0] ?? null
        textRefGenerationId = post.generationId
        pageIdRef = post.pageId
      } else {
        throw new Error('Informe generationId ou postId.')
      }

      if (!url) {
        throw new CreativeError('SEM_IMAGEM', 'Esta arte ainda não tem imagem para conferir.', 400)
      }

      const { buffer } = await fetchImageSource(url)
      const meta = await sharp(buffer).metadata()
      const thumb = await sharp(buffer)
        .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer()

      const expected = textRefGenerationId
        ? await loadExpectedTextsForGeneration(textRefGenerationId)
        : []

      let verificacaoTexto: Record<string, unknown> | string = 'sem-referencia'
      if (args.verificarTextos !== false && expected.length > 0) {
        try {
          const check = await verifyImageTexts(buffer, expected)
          verificacaoTexto = check.passed
            ? { resultado: 'ok', textosConferidos: expected.length }
            : { resultado: 'divergente', faltando: check.missing, transcricao: check.extracted.slice(0, 20) }
        } catch (erro) {
          verificacaoTexto = `indisponivel: ${erro instanceof Error ? erro.message : String(erro)}`
        }
      }

      // Leitura que falhou + camadas sobrepostas na página = o diagnóstico
      // certo é SOBREPOSIÇÃO, não "texto faltando" — a visão não lê o que
      // está impresso um sobre o outro, e culpar o slot leva o modelo a
      // "corrigir" o lugar errado.
      if (
        typeof verificacaoTexto === 'object' &&
        verificacaoTexto.resultado === 'divergente' &&
        pageIdRef
      ) {
        try {
          const page = await db.page.findFirst({
            where: { id: pageIdRef, Template: { projectId } },
            select: { layers: true, width: true, height: true },
          })
          if (page) {
            await registerProjectFonts(projectId)
            const measureBox = await createServerTextBoxMeasurer()
            const { issues } = checkTextGeometry(
              parseLayers(page.layers),
              { width: page.width, height: page.height },
              measureBox,
            )
            const colisoes = issues.filter((i) => i.tipo === 'colisao')
            if (colisoes.length > 0) {
              verificacaoTexto = {
                resultado: 'sobreposicao',
                camadasEnvolvidas: Array.from(new Set(colisoes.flatMap((i) => i.camadas))),
                detalhe: colisoes.map((i) => i.detalhe).join('; '),
                faltando: verificacaoTexto.faltando,
              }
            }
          }
        } catch (erro) {
          console.warn('[mcp] diagnóstico geométrico do conferir-arte falhou:', erro)
        }
      }

      const resultado =
        typeof verificacaoTexto === 'object' ? (verificacaoTexto.resultado as string) : null
      const resumo = {
        url,
        largura: meta.width ?? null,
        altura: meta.height ?? null,
        verificacaoTexto,
        dica:
          resultado === 'sobreposicao'
            ? 'As camadas apontadas estão impressas uma sobre a outra — a leitura falhou por isso, não porque o texto não existe. Encurte o texto com ajustar-arte ou use outro modelo.'
            : resultado === 'divergente'
              ? 'Texto divergente: corrija com ajustar-arte antes de mostrar à pessoa.'
              : 'Olhe a miniatura: texto legível? Nada cortado ou sobreposto? Foto combina com o tema? Se algo estiver errado, use ajustar-arte.',
      }

      return {
        _mcpContent: [
          { type: 'text', text: JSON.stringify(resumo, null, 2) },
          { type: 'image', data: thumb.toString('base64'), mimeType: 'image/jpeg' },
        ],
      }
    },
  },

  {
    name: 'melhorar-arte',
    description:
      'Melhora uma arte com IA: o modelo de imagem refina a composição inteira (luz, sombra, textura, integração do texto com a foto) seguindo a direção de arte e a identidade da marca. Os textos são mantidos EXATAMENTE como estão e conferidos por visão ao final — se divergirem, a melhoria é descartada e a arte original continua valendo.\n\nNo fluxo normal a melhoria é o ACABAMENTO da criação: a arte criada é o esboço fiel (layout + textos certos) e esta etapa a leva ao nível de publicação. Antes de chamar, olhe a arte com conferir-arte e escreva o pedido a partir da SUA análise: aponte o que corrigir em concreto (hierarquia, contraste, luz da foto, integração do texto com o fundo, poluição) e o que preservar — sem falar dos textos, que são preservados automaticamente. Pedido vago ("deixe mais bonita") desperdiça a geração.\n\nDemora cerca de 2 minutos e custa créditos: a resposta volta na hora com melhoriaId, acompanhe com ver-melhoria. Com postId, aplica ao post da agenda ao final — vale para rascunho e agendado. Não chame de novo enquanto houver melhoria em andamento da mesma arte.\n\nPost agendado é enviado para publicação 5 minutos antes do horário e a partir daí a arte não muda mais: melhorar um post nesse estado é recusado (a melhoria leva ~2 min e não chegaria a tempo). Em ver-agenda o campo `arte` diz até quando dá — se estiver "enviada para publicação", não tente: traga o post para rascunho antes (voltar-para-rascunho) ou proponha melhorar a arte para um próximo post.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        generationId: { type: 'string', description: 'A arte a melhorar (de criar-arte, criar-arte-de-modelo, ajustar-arte ou do post).' },
        pedido: { type: 'string', description: 'Instruções de melhoria vindas da sua análise da arte (máx 1200 caracteres). Vazio = só as diretrizes do Diretor de Arte da marca.' },
        postId: { type: 'string', description: 'Post da agenda (rascunho ou agendado) que recebe a arte melhorada ao final (opcional — sem ele a melhoria fica na galeria).' },
      },
      required: ['projectId', 'generationId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const generationId = requireString(args, 'generationId')

      const gen = await db.generation.findFirst({
        where: { id: generationId, projectId },
        select: { id: true, resultUrl: true },
      })
      if (!gen) {
        throw new CreativeError('ARTE_NAO_ENCONTRADA', 'Arte não encontrada neste cliente.', 404)
      }

      // O que se melhora é a arte que está NO POST — o cron pode ter
      // re-renderizado a página depois da Generation. Só URLs do nosso Blob
      // entram no pipeline; mídia de fora (CDN do Zernio, Drive) cai no
      // resultUrl da Generation.
      const postId = typeof args.postId === 'string' && args.postId ? args.postId : undefined
      let sourceImageUrl: string | undefined
      if (postId) {
        const post = await db.socialPost.findFirst({
          where: { id: postId, projectId },
          select: { mediaUrls: true },
        })
        const atual = post?.mediaUrls?.[0]
        if (atual && VERCEL_BLOB_HOST_REGEX.test(atual) && atual !== gen.resultUrl) {
          sourceImageUrl = atual
        }
      }

      const dono = await resolverDono(projectId, principal)
      const started = await startImprovement({
        generationId,
        userRequest: typeof args.pedido === 'string' ? args.pedido : '',
        applyToPostId: postId ?? null,
        sourceImageUrl: sourceImageUrl ?? null,
        actorClerkId: dono.clerkId,
        dedupeWindowMinutes: 10,
      })

      // Só ENFILEIRA (F0.3). O MCP não dispara na hora, de propósito: uma
      // invocação daqui pode carregar várias tools (batch JSON-RPC resolvido
      // com Promise.all) sob o mesmo `maxDuration = 300`.
      if (!started.reused && started.runnerArgs) {
        await enfileirarMelhoria(started.runnerArgs)
      }

      return {
        emAndamento: true,
        melhoriaId: started.jobGenerationId,
        ...(started.reused
          ? { jaEstavaEmAndamento: true }
          : {}),
        // A execução saiu da invocação e passou pela fila (F0.3): pode
        // esperar até um minuto pela varredura antes de começar.
        tempoEstimado: 'de 2 a 3 minutos',
        mensagem: started.reused
          ? 'Já havia uma melhoria desta arte em andamento — acompanhe ela com ver-melhoria em vez de disparar outra.'
          : `Melhoria iniciada. Consulte ver-melhoria com melhoriaId=${started.jobGenerationId} em ~3 minutos${postId ? '; se o texto conferir, a arte do post é trocada sozinha' : ''}.`,
      }
    },
  },

  {
    name: 'ver-melhoria',
    description:
      'Acompanha uma melhoria de arte disparada por melhorar-arte: em andamento, pronta ou falhou. Quando pronta, traz a imagem nova e o resultado da conferência de texto; quando falha, a arte original continua valendo. Consulte ~2 minutos após disparar (e re-consulte em ~30s se ainda estiver em andamento).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        melhoriaId: { type: 'string', description: 'O melhoriaId devolvido por melhorar-arte.' },
      },
      required: ['projectId', 'melhoriaId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const melhoriaId = requireString(args, 'melhoriaId')

      const gen = await db.generation.findFirst({
        where: { id: melhoriaId, projectId },
        select: {
          id: true,
          status: true,
          resultUrl: true,
          fieldValues: true,
          createdAt: true,
          completedAt: true,
          sourceGenerationId: true,
        },
      })
      if (!gen) {
        throw new CreativeError('MELHORIA_NAO_ENCONTRADA', 'Melhoria não encontrada neste cliente.', 404)
      }

      const fv = (gen.fieldValues ?? {}) as Record<string, unknown>
      const galleryUrl = `${getPublicAppUrl()}/projects/${projectId}?tab=criativos`

      if (gen.status === 'PROCESSING') {
        const decorrido = Math.round((Date.now() - gen.createdAt.getTime()) / 1000)
        return {
          situacao: 'em-andamento',
          decorridoSegundos: decorrido,
          mensagem:
            decorrido > 300
              ? 'Está demorando mais que o normal — se passar de 6 minutos, considere que falhou e dispare de novo.'
              : 'Ainda gerando. Consulte de novo em ~30 segundos.',
        }
      }

      if (gen.status === 'COMPLETED') {
        const applyToPostId = typeof fv.applyToPostId === 'string' ? fv.applyToPostId : null
        let aplicadaAoPost: boolean | undefined
        let avisoPost: string | undefined
        if (applyToPostId) {
          const post = await db.socialPost.findFirst({
            where: { id: applyToPostId },
            select: { generationId: true, status: true },
          })
          aplicadaAoPost = post?.generationId === gen.id
          if (!aplicadaAoPost) {
            avisoPost =
              'A melhoria ficou pronta, mas o post não estava mais aprovado quando ela terminou — a arte nova está só na galeria.'
          }
        }
        return {
          situacao: 'pronta',
          url: gen.resultUrl,
          verificacaoTexto: fv.textCheck ?? 'skipped',
          ...(aplicadaAoPost !== undefined ? { aplicadaAoPost } : {}),
          ...(avisoPost ? { avisoPost } : {}),
          galleryUrl,
          dica: 'Use conferir-arte com este generationId para VER a arte antes de mostrá-la à pessoa.',
          generationId: gen.id,
        }
      }

      return {
        situacao: 'falhou',
        motivo: typeof fv.error === 'string' ? fv.error : 'Erro desconhecido',
        verificacaoTexto: fv.textCheck ?? undefined,
        mensagem:
          'A melhoria foi descartada e a arte original continua valendo — nada mudou no post nem na galeria. Dá para tentar de novo com um pedido mais específico.',
      }
    },
  },

  {
    name: 'gerar-imagem',
    description:
      'Gera uma imagem ou arte DO ZERO com IA, ancorada em fotos reais do cliente. Duas trilhas que nunca se misturam:\n\n- trilha "imagem": fotografia/cena SEM NENHUM texto (nem logo) — para fundo de peça, cena de ambiente, variação de foto. Requer `pedido` descrevendo a cena.\n- trilha "arte": peça PRONTA com os textos desenhados na imagem — requer `copy` (os blocos exatos, na ordem) e uma foto real como cena (referência com role "subject"). A identidade da marca (logo, paleta, fontes) entra sozinha; os textos são conferidos por visão ao final.\n\nREFERÊNCIAS (a alma da qualidade): passe 1 a 3 fotos REAIS do cliente com papel declarado — "subject" (a foto do prato/produto, obrigatória na trilha arte), "anchor-ambient" (foto do salão/ambiente: a cena acontece NESTE lugar; use SEMPRE que a cena mostrar o ambiente), "anchor-dish" (segundo ângulo do prato) e "style" (arte aprovada como referência de estilo). Poucas referências boas vencem muitas: refs demais fazem o visual derivar. Fotos vêm do acervo (buscar-fotos → driveFileId) ou de URL do Studio.\n\nMODO DIRETOR (opcional, trilha imagem): se você mesmo escrever o prompt de fotografia em inglês (anatomia CAMERA:/LENS:/LIGHT:/…, física em Kelvin/graus/IRE, sem buzzwords, ≤1500 chars, zero texto na imagem), passe em `promptPronto` — ele é validado e usado no lugar do redator automático.\n\nDemora 1–3 minutos e custa créditos. A resposta volta na hora com geracaoId; acompanhe com ver-melhoria (mesmo acompanhamento das melhorias). Disparos de temas DIFERENTES podem ser feitos em paralelo; o mesmo pedido repetido em 10 minutos é reaproveitado, não cobrado de novo.\n\nANCHOR SHEET: se o cliente tem âncora de tipo "ambiente" definida (listar-ancoras), toda cena gerada na trilha imagem a recebe automaticamente quando você não passar uma âncora de ambiente — não precisa repeti-la nas referências.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        trilha: {
          type: 'string',
          enum: ['imagem', 'arte'],
          description: '"imagem" = cena sem texto; "arte" = peça com os textos desenhados.',
        },
        pedido: {
          type: 'string',
          description:
            'O que gerar, em português (máx 1200). Obrigatório na trilha imagem; na trilha arte é instrução adicional opcional.',
        },
        copy: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Trilha arte: os blocos de texto EXATOS da peça, na ordem de leitura (máx 12 blocos de 200 chars). São reproduzidos verbatim e conferidos por visão.',
        },
        formato: { type: 'string', enum: ['story', 'feed', 'quadrado'], description: 'story 9:16, feed 4:5, quadrado 1:1.' },
        referencias: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                enum: ['subject', 'anchor-ambient', 'anchor-dish', 'style'],
                description: 'Papel da foto na geração.',
              },
              driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos / listar-fotos-da-pasta).' },
              url: { type: 'string', description: 'Alternativa: URL de imagem já no Studio (Blob).' },
              label: { type: 'string', description: 'Rótulo curto (ex: "salão principal", "picanha na tábua").' },
            },
            required: ['role'],
            additionalProperties: false,
          },
          description: '1 a 3 fotos reais com papel declarado. Máx: 1 subject + 3 âncoras + 2 style.',
        },
        instrucaoImagem: {
          type: 'string',
          description:
            'Trilha arte, opcional: ajuste autorizado na FOTO (ex: "escurecer o fundo atrás do texto"). Sem isso a foto é preservada intocada — a regra da casa é "a foto se melhora, nunca se modifica".',
        },
        promptPronto: {
          type: 'string',
          description: 'Modo diretor (trilha imagem): prompt final em inglês, anatomia CAMERA:/LIGHT:/…; validado antes de usar.',
        },
        modelo: {
          type: 'string',
          description: 'Override do modelo (trilha imagem: "nano-banana-2" padrão ou "nano-banana-pro" para 4K).',
        },
        resolution: { type: 'string', enum: ['1K', '2K', '4K'], description: 'Trilha imagem. Padrão 2K.' },
      },
      required: ['projectId', 'trilha', 'formato'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      const trilha = args.trilha === 'arte' ? ('arte' as const) : ('imagem' as const)
      const formato =
        args.formato === 'feed' ? ('feed' as const) : args.formato === 'quadrado' ? ('quadrado' as const) : ('story' as const)

      const referencias: ArtGenerationReference[] = Array.isArray(args.referencias)
        ? args.referencias
            .filter((r: unknown): r is Record<string, string> => !!r && typeof r === 'object')
            .map((r) => ({
              role: r.role as ArtGenerationReference['role'],
              driveFileId: typeof r.driveFileId === 'string' && r.driveFileId ? r.driveFileId : undefined,
              url: typeof r.url === 'string' && r.url ? r.url : undefined,
              label: typeof r.label === 'string' && r.label ? r.label.slice(0, 80) : undefined,
            }))
        : []

      const dono = await resolverDono(projectId, principal)
      const started = await startArtGeneration({
        projectId,
        track: trilha,
        pedido: typeof args.pedido === 'string' ? args.pedido : undefined,
        copy: Array.isArray(args.copy)
          ? args.copy.filter((b: unknown): b is string => typeof b === 'string')
          : undefined,
        formato,
        referencias,
        instrucaoImagem: typeof args.instrucaoImagem === 'string' ? args.instrucaoImagem : null,
        modelo: typeof args.modelo === 'string' && args.modelo ? args.modelo : undefined,
        resolution:
          args.resolution === '1K' || args.resolution === '2K' || args.resolution === '4K'
            ? args.resolution
            : undefined,
        finalPrompt: typeof args.promptPronto === 'string' && args.promptPronto ? args.promptPronto : null,
        actorClerkId: dono.clerkId,
        dedupeWindowMinutes: 10,
      })

      // Enfileira e responde — ver a nota em melhorar-arte.
      if (!started.reused && started.runnerArgs) {
        await enfileirarArte(started.runnerArgs)
      }

      return {
        emAndamento: true,
        geracaoId: started.jobGenerationId,
        ...(started.reused ? { jaEstavaEmAndamento: true } : {}),
        tempoEstimado: trilha === 'arte' ? 'de 2 a 3 minutos' : 'de 1 a 2 minutos',
        mensagem: started.reused
          ? 'Já havia uma geração idêntica em andamento — acompanhe ela com ver-melhoria em vez de disparar outra.'
          : `Geração iniciada. Acompanhe com ver-melhoria (melhoriaId=${started.jobGenerationId}); quando pronta, use conferir-arte para VER o resultado antes de mostrar à pessoa.`,
      }
    },
  },

  {
    name: 'criar-carrossel',
    description:
      'Cria um CARROSSEL de Instagram (3 a 8 slides) com visual coerente entre os slides. Funciona em DUAS etapas, e a etapa do meio é a pessoa:\n\n1. Esta tool gera a CAPA (foto pura, SEM texto — é o que faz a série abrir pela imagem) e o SLIDE 2, que é o GUIA: ele define a diagramação, as cores e o tratamento de toda a série.\n2. Você mostra o guia à pessoa (conferir-arte). Aprovado, chame confirmar-estilo-carrossel; os demais slides são gerados copiando o look dele, em paralelo.\n\nNunca pule a confirmação: gerar seis slides no estilo errado custa seis vezes mais que perguntar.\n\nA capa NÃO leva copy (é recusada). Cada slide a partir do 2 precisa de copy e de uma foto real do acervo. Cada slide custa créditos; esta chamada gera 2.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ordem: { type: 'number', description: 'Posição no carrossel, de 1 a N. 1 = capa.' },
              copy: {
                type: 'array',
                items: { type: 'string' },
                description: 'Blocos de texto do slide, na ordem de leitura. VAZIO na capa.',
              },
              driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos).' },
              url: { type: 'string', description: 'Alternativa: imagem já no Studio.' },
              label: { type: 'string', description: 'Rótulo curto da foto.' },
            },
            required: ['ordem', 'copy'],
            additionalProperties: false,
          },
          description: 'Os slides, de 1 a N. Varie as fotos: repetir a mesma foto entre slides deixa o carrossel monótono.',
        },
        legenda: { type: 'string', description: 'Legenda do post no feed (guardada para o agendamento).' },
        pedido: { type: 'string', description: 'Direção de arte adicional para toda a série (opcional).' },
      },
      required: ['projectId', 'slides'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const slidesIn = Array.isArray(args.slides) ? args.slides : []
      const slides: SlideSpec[] = slidesIn.map((s: Record<string, unknown>) => ({
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
  },

  {
    name: 'confirmar-estilo-carrossel',
    description:
      'Depois que a pessoa aprovou o slide-guia, gera os slides restantes copiando o visual dele — posição do texto, cores, elementos gráficos e tratamento da foto. Os slides saem em paralelo (1 a 3 minutos no total, não por slide).\n\nSó chame com aprovação explícita de quem responde pelo cliente. Se o guia não agradou, NÃO confirme: crie o carrossel de novo com outra direção, ou ajuste o guia com ajustar-arte antes.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        carrosselId: { type: 'string', description: 'O carrosselId devolvido por criar-carrossel.' },
      },
      required: ['projectId', 'carrosselId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const carrosselId = requireString(args, 'carrosselId')
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
  },

  {
    name: 'ver-carrossel',
    description:
      'Situação de um carrossel: quais slides já ficaram prontos, qual está gerando e se a série espera a confirmação do estilo. Quando completo, devolve as imagens NA ORDEM, prontas para colocar-na-agenda.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        carrosselId: { type: 'string', description: 'O carrosselId devolvido por criar-carrossel.' },
      },
      required: ['projectId', 'carrosselId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const estado = await verCarrossel(projectId, requireString(args, 'carrosselId'))
      return {
        ...estado,
        dica: estado.esperandoConfirmacao
          ? 'O guia está pronto: mostre-o à pessoa e, com o OK, chame confirmar-estilo-carrossel.'
          : estado.midiasEmOrdem
            ? 'Série completa. Agende com colocar-na-agenda passando estas imagens na ordem e o tipo CARROSSEL.'
            : 'Ainda gerando — consulte de novo em ~1 minuto.',
      }
    },
  },

  {
    name: 'definir-ancora',
    description:
      'Marca uma foto REAL do cliente como âncora canônica de um tipo de cena ("ambiente", "mesa", "balcao", "chopp"…), ou remove uma âncora. As âncoras alimentam a geração de imagem (gerar-imagem): a de tipo "ambiente" é injetada AUTOMATICAMENTE em toda cena gerada quando nenhuma âncora foi escolhida — é o que impede o modelo de inventar um lugar genérico. Foto do Drive vira cópia permanente no Studio na hora.\n\nEscolha fotos que mostrem bem o que definem: para "ambiente", o salão como ele é (teto real, mobília, luz); para louça/uniforme, closes nítidos. Confirme com a pessoa antes de definir — âncora vale para todas as gerações do cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        sceneTag: {
          type: 'string',
          description: 'Tipo de cena em kebab-case (ex: "ambiente", "mesa", "chopp"). "ambiente" é a tag da injeção automática.',
        },
        driveFileId: { type: 'string', description: 'Foto do acervo (de buscar-fotos).' },
        url: { type: 'string', description: 'Alternativa: URL de imagem já no Studio.' },
        label: { type: 'string', description: 'Rótulo curto (ex: "salão com teto real").' },
        removerAncoraId: {
          type: 'string',
          description: 'Para REMOVER: id da âncora (de listar-ancoras). Ignora os outros campos.',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)

      if (typeof args.removerAncoraId === 'string' && args.removerAncoraId) {
        await removerAncora(projectId, args.removerAncoraId)
        return { ok: true, mensagem: 'Âncora removida.' }
      }

      const sceneTag = requireString(args, 'sceneTag')
      const ancora = await definirAncora({
        projectId,
        sceneTag,
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
  },

  {
    name: 'listar-ancoras',
    description:
      'Lista as fotos-âncora canônicas do cliente por tipo de cena (anchor sheet). Use antes de gerar-imagem para saber o que já existe, e antes de definir-ancora para não duplicar.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const ancoras = await listarAncoras(projectId)
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
  },

  {
    name: 'marcar-como-modelo',
    description:
      'Promove uma página a MODELO do cliente (ou despromove): modelos são o que escolher-modelo encontra por tema, então uma arte que ficou boa pode virar base das próximas. As tags são o que casa o modelo com o tema pedido (ex: "happy-hour", "almoco-executivo") — sem tag, o modelo não é encontrado por tema.\n\nConfirme com a pessoa antes de marcar: modelo aparece para todos que criam arte deste cliente. Tags enviadas SUBSTITUEM as atuais.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        pageId: { type: 'string', description: 'A página a marcar (de criar-arte, ajustar-arte ou listar-modelos).' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Temas do modelo, normalizados com hífen (ex: ["happy-hour", "sexta"]). Substituem as tags atuais.',
        },
        marcar: { type: 'boolean', description: 'true (default) marca como modelo; false despromove.' },
      },
      required: ['projectId', 'pageId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const pageId = requireString(args, 'pageId')
      const marcar = args.marcar !== false

      const page = await db.page.findUnique({
        where: { id: pageId },
        include: { Template: { select: { projectId: true, name: true } } },
      })
      if (!page || page.Template.projectId !== projectId) {
        throw new CreativeError('PAGE_NOT_FOUND', 'Página não encontrada neste cliente.', 404)
      }

      const tags = Array.isArray(args.tags)
        ? args.tags.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
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
  },

  {
    name: 'listar-modelos',
    description:
      'Lista os modelos do cliente (as páginas que escolher-modelo consegue encontrar) com as tags de tema de cada um. Com incluirNaoMarcadas=true, lista também as páginas comuns — útil para achar uma arte boa e promovê-la com marcar-como-modelo. Clientes sem modelo nenhum dependem de criar-arte (do zero) para tudo.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        incluirNaoMarcadas: { type: 'boolean', description: 'Inclui páginas que ainda não são modelo (candidatas a promoção).' },
        limit: { type: 'number', description: 'Máximo de páginas (default 50, teto 200).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
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
  },

  {
    name: 'criar-entrada-base',
    description:
      'Cria uma entrada nova na base de conhecimento do cliente. TUDO que estiver na base vira insumo dos textos futuros — deste chat e do Claudinho — então só grave informação CONFIRMADA pela pessoa (preço, horário, política, campanha), nunca suposição sua.\n\n⏳ CAMPANHA COM DATA DE FIM → GRAVE A VALIDADE. Festival, promoção de mês, cardápio sazonal, feriado: pergunte até quando vale e mande em `validade`. É o que faz a campanha parar de aparecer nos textos e nas sugestões no dia seguinte ao fim, sem ninguém precisar lembrar de arquivar.\n\n⚠️ Tom de voz, regras da marca, estilo visual e direção fotográfica NÃO vão aqui — vão no DNA (atualizar-dna). A base é buscada por relevância e identidade cadastrada nela não chega aos geradores; a categoria TOM_DE_VOZ existe só por legado.\n\nAntes de criar, consulte a base: se já existe entrada sobre o assunto, o certo é atualizar-entrada-base, não duplicar. Mostre o texto final à pessoa e só grave com o OK dela.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        category: {
          type: 'string',
          enum: Object.values(KnowledgeCategory),
          description: 'Categoria da entrada (TOM_DE_VOZ, HORARIOS, CARDAPIO, CAMPANHAS...).',
        },
        title: { type: 'string', description: 'Título curto e específico (ex: "Promoção Costela no Bafo — agosto").' },
        content: { type: 'string', description: 'O conteúdo, em texto corrido, do jeito que deve alimentar as copies.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas opcionais para busca.' },
        validade: {
          type: 'string',
          description:
            'Último dia em que a informação vale (AAAA-MM-DD, no fuso de Brasília — o dia inteiro conta). Depois disso a entrada sai sozinha dos textos e das sugestões. Obrigatório na prática para CAMPANHAS com data de fim; omita só para informação permanente (horário, cardápio fixo, política).',
        },
      },
      required: ['projectId', 'category', 'title', 'content'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const autor = await resolverAutor(projectId, principal)
      const categoria = requireString(args, 'category') as KnowledgeCategory
      if (!Object.values(KnowledgeCategory).includes(categoria)) {
        throw new Error(`Categoria inválida. Use uma de: ${Object.values(KnowledgeCategory).join(', ')}`)
      }

      const title = requireString(args, 'title')
      const content = requireString(args, 'content')
      const expiresAt = parseValidade(args.validade) ?? null

      const entry = await criarEntradaBase({
        projectId,
        category: categoria,
        title,
        content,
        tags: Array.isArray(args.tags)
          ? args.tags.filter((t: unknown): t is string => typeof t === 'string')
          : [],
        expiresAt,
        autor,
      })

      // Aviso, NUNCA veto: há campanha permanente ("Quinta do Vinho, toda
      // quinta") e recusar a gravação deixaria a pessoa sem saída.
      const aviso = avisoValidadeAusente(categoria, expiresAt)

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
  },

  {
    name: 'atualizar-entrada-base',
    description:
      'Atualiza uma entrada existente da base de conhecimento (o entradaId vem de consultar-base). É assim que preço, horário ou regra desatualizada se corrige — a mudança vale para TODOS os textos futuros, deste chat e do Claudinho.\n\n⏳ Campanha que ganhou ou mudou data de fim: mande `validade`. Prorrogou, é a data nova; virou permanente, mande null.\n\nFluxo obrigatório: consultar-base → mostrar à pessoa o texto ATUAL e o texto NOVO lado a lado → só gravar com o OK explícito. Campos não enviados ficam como estão.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        entradaId: { type: 'string', description: 'Id da entrada (de consultar-base).' },
        title: { type: 'string', description: 'Novo título (opcional).' },
        content: { type: 'string', description: 'Novo conteúdo completo (opcional — substitui o texto inteiro, não é acréscimo).' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Novas etiquetas (opcional, substitui as atuais).' },
        category: {
          type: 'string',
          enum: Object.values(KnowledgeCategory),
          description: 'Nova categoria (opcional).',
        },
        validade: {
          type: ['string', 'null'],
          description:
            'Último dia em que a informação vale (AAAA-MM-DD, fuso de Brasília — o dia inteiro conta). null tira o prazo e a entrada volta a valer para sempre.',
        },
      },
      required: ['projectId', 'entradaId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const entradaId = requireString(args, 'entradaId')
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
      const tags = Array.isArray(args.tags)
        ? args.tags.filter((t: unknown): t is string => typeof t === 'string')
        : undefined
      const category = typeof args.category === 'string' ? (args.category as KnowledgeCategory) : undefined
      if (category && !Object.values(KnowledgeCategory).includes(category)) {
        throw new Error(`Categoria inválida. Use uma de: ${Object.values(KnowledgeCategory).join(', ')}`)
      }
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
          ...(category !== undefined ? { category } : {}),
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
      const aviso = avisoValidadeAusente(category ?? existente.category, validadeFinal)

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
  },

  {
    name: 'arquivar-entrada-base',
    description:
      'Arquiva uma entrada da base de conhecimento: ela sai da consulta e deixa de alimentar os textos. O registro não é apagado, mas reativar exige a interface do Studio (e uma reindexação por lá para ela voltar às buscas) — então trate como decisão de mão única. Use para campanha encerrada ou informação que não vale mais, e confirme com a pessoa antes, citando o título.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do cliente.' },
        entradaId: { type: 'string', description: 'Id da entrada (de consultar-base).' },
      },
      required: ['projectId', 'entradaId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      const projectId = requireNumber(args, 'projectId')
      await assertProjetoPermitido(projectId, principal)
      const entradaId = requireString(args, 'entradaId')
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
  },
]

export const MCP_TOOL_MAP = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]))

/**
 * Nomes antigos, de antes da tradução para português.
 *
 * O cliente MCP guarda a lista de ferramentas de quando o conector foi
 * instalado: sem estes apelidos, renomear derruba todas as conversas já
 * existentes com "Tool desconhecida" até alguém reconectar.
 */
const APELIDOS: Record<string, string> = {
  'list-projects': 'listar-clientes',
  'prepare-creative': 'escolher-modelo',
  'create-arte-rapida': 'criar-arte-de-modelo',
  'list-posts': 'ver-agenda',
  'get-knowledge': 'consultar-base',
  'list-font-combinations': 'listar-combinacoes-de-texto',
  'create-arte-livre': 'criar-arte',
  'search-acervo': 'buscar-fotos',
  'list-drive-images': 'listar-fotos-da-pasta',
  'agendar-post': 'colocar-na-agenda',
}

/** Runs a tool and shapes the MCP `tools/call` result, errors included. */
export async function runMcpTool(
  name: string,
  args: Record<string, any>,
  principal: McpPrincipal = { kind: 'service' },
) {
  const tool = MCP_TOOL_MAP.get(name) ?? MCP_TOOL_MAP.get(APELIDOS[name] ?? '')
  if (!tool) {
    return {
      content: [{ type: 'text' as const, text: `Ferramenta desconhecida: ${name}` }],
      isError: true,
    }
  }

  try {
    const result = await tool.handler(args ?? {}, principal)
    // Tools visuais (conferir-arte) devolvem blocos de conteúdo prontos —
    // texto + imagem — em vez de um JSON para serializar.
    if (
      result &&
      typeof result === 'object' &&
      Array.isArray((result as Record<string, unknown>)._mcpContent)
    ) {
      return { content: (result as { _mcpContent: Array<Record<string, unknown>> })._mcpContent }
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  } catch (error) {
    const text =
      error instanceof CreativeError
        ? JSON.stringify(error.toJSON(), null, 2)
        : `Erro: ${error instanceof Error ? error.message : String(error)}`
    console.error(`[mcp] tool ${name} falhou:`, error)
    return { content: [{ type: 'text' as const, text }], isError: true }
  }
}
