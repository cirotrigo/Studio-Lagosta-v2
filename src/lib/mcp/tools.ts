/**
 * Tool definitions exposed by the remote MCP endpoint (/api/mcp).
 *
 * These mirror the most useful tools of the local stdio server
 * (scripts/mcp-server.ts) but run inside the deployed app, so any MCP client
 * — a second machine, the CLI, a phone — can ask for a creative without this
 * repo checked out. Both surfaces call the same libs under src/lib, so the
 * behaviour cannot drift.
 */

import { db } from '@/lib/db'
import { prepareCreative, createArteRapida } from '@/lib/creatives/arte-rapida'
import { createArteLivre, listFontCombinations } from '@/lib/creatives/arte-livre'
import { CreativeError } from '@/lib/creatives/errors'
import { buscarNoAcervo, listarImagensDoDrive } from '@/lib/creatives/acervo'
import { agendarPost } from '@/lib/creatives/agendar'
import { KnowledgeCategory } from '@prisma/client'
import type { McpPrincipal } from '@/lib/mcp/oauth'

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
      'Mostra o que já está na agenda do cliente num período. Consulte antes de propor uma data, para não repetir tema nem empilhar posts no mesmo horário.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'ID do projeto.' },
        from: { type: 'string', description: 'Data inicial ISO (opcional).' },
        to: { type: 'string', description: 'Data final ISO (opcional).' },
        limit: { type: 'number', description: 'Máximo de posts (default 50).' },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    handler: async (args, principal) => {
      await assertProjetoPermitido(requireNumber(args, 'projectId'), principal)
      const from = typeof args.from === 'string' ? new Date(args.from) : null
      const to = typeof args.to === 'string' ? new Date(args.to) : null
      const posts = await db.socialPost.findMany({
        where: {
          projectId: requireNumber(args, 'projectId'),
          ...(from || to
            ? { scheduledDatetime: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
        },
        select: {
          id: true,
          postType: true,
          status: true,
          caption: true,
          scheduledDatetime: true,
          publishedUrl: true,
        },
        orderBy: { scheduledDatetime: 'asc' },
        take: typeof args.limit === 'number' ? Math.min(args.limit, 200) : 50,
      })
      return { count: posts.length, posts }
    },
  },
  {
    name: 'consultar-base',
    description:
      'Base de conhecimento do cliente: tom de voz, horário de funcionamento, cardápio, diferenciais e campanhas. CONSULTE SEMPRE antes de escrever qualquer texto — é o que evita prometer horário errado ou inventar preço. Se achar informação conflitante, aponte para a pessoa em vez de escolher sozinho.',
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
          ...(category ? { category } : {}),
        },
        select: { title: true, content: true, category: true, tags: true },
        orderBy: { category: 'asc' },
      })
      return { count: entries.length, entries }
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
        situacao: {
          type: 'string',
          enum: ['rascunho', 'agendado'],
          description: 'rascunho (padrão) só aparece na agenda; agendado publica de verdade no Instagram do cliente. Use "agendado" apenas após confirmação explícita da pessoa.',
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

      return agendarPost({
        projectId,
        postType: args.postType,
        caption: args.caption,
        scheduledDatetime: requireString(args, 'scheduledDatetime'),
        pageId: args.pageId,
        mediaUrls: args.mediaUrls,
        situacao,
      })
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
