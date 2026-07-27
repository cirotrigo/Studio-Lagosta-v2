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
    name: 'list-projects',
    description:
      'Lista os projetos ativos do Studio Lagosta com id, nome, @ do Instagram e pastas do Drive. Use para descobrir o projectId antes das outras tools.',
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
    name: 'prepare-creative',
    description:
      'PASSO 1 da arte: resolve o projeto e a página de template que melhor casa com um tema (e dia opcional), devolvendo os slots a preencher, os assets da marca e o tom de voz. Escreva a copy a partir daqui e depois chame create-arte-rapida.',
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
    name: 'create-arte-rapida',
    description:
      'PASSO 2 da arte: aplica a copy e a imagem na página de template, cria uma página EDITÁVEL no template "Arte Rápida" do projeto, renderiza o PNG e registra na galeria de Criativos. Devolve a url da imagem e a editUrl (abre no editor de templates). A imagem vem por imageUrl (URL pública) ou por _driveImageId dentro de slotValues.',
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
    name: 'list-posts',
    description:
      'Lista os posts agendados de um projeto numa janela de datas, para saber o que já está na agenda antes de criar algo novo.',
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
    name: 'get-knowledge',
    description:
      'Base de conhecimento do projeto — tom de voz, informações do estabelecimento, horários, cardápio, diferenciais, campanhas. Consulte ANTES de escrever qualquer copy, para o texto sair na voz da marca e com dados corretos (nada de inventar preço ou horário).',
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
    name: 'list-font-combinations',
    description:
      'Combinações tipográficas do projeto — composições de texto prontas, com posição, tamanho, cor e efeitos já ajustados à marca. Use antes de create-arte-livre: escolher uma combinação e só trocar os textos costuma dar um resultado melhor que posicionar tudo na mão. No primeiro uso, o catálogo base é semeado no projeto.',
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
    name: 'create-arte-livre',
    description:
      'Cria uma arte SEM modelo: você monta a composição. Escolha o formato, o fundo (foto por URL/Drive ou cor), e componha o texto de um destes jeitos — (a) combinationId + textos, herdando posições e estilo da combinação (recomendado), ou (b) textosLivres, posicionando cada bloco em coordenadas relativas ao canvas (0..1). O logo da marca entra por padrão e um sombreado é aplicado sobre a foto para o texto continuar legível. Sai uma página editável no editor de templates.',
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
              role: { type: 'string', enum: ['title', 'body'], description: 'De qual fonte da marca herda.' },
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
]

export const MCP_TOOL_MAP = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]))

/** Runs a tool and shapes the MCP `tools/call` result, errors included. */
export async function runMcpTool(
  name: string,
  args: Record<string, any>,
  principal: McpPrincipal = { kind: 'service' },
) {
  const tool = MCP_TOOL_MAP.get(name)
  if (!tool) {
    return {
      content: [{ type: 'text' as const, text: `Tool desconhecida: ${name}` }],
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
