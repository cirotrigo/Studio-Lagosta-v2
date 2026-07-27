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
import { prepareCreative, createArteRapida, CreativeError } from '@/lib/creatives/arte-rapida'

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, any>) => Promise<unknown>
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
    handler: async () => {
      const projects = await db.project.findMany({
        where: { status: 'ACTIVE' },
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
    handler: async (args) =>
      prepareCreative({
        projectId: typeof args.projectId === 'number' ? args.projectId : undefined,
        projectHint: typeof args.projectHint === 'string' ? args.projectHint : undefined,
        theme: requireString(args, 'theme'),
        day: typeof args.day === 'string' ? args.day : undefined,
      }),
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
    handler: async (args) =>
      createArteRapida({
        projectId: requireNumber(args, 'projectId'),
        sourcePageId: requireString(args, 'sourcePageId'),
        slotValues: (args.slotValues && typeof args.slotValues === 'object' ? args.slotValues : {}) as Record<string, unknown>,
        name: typeof args.name === 'string' ? args.name : undefined,
        imageUrl: typeof args.imageUrl === 'string' ? args.imageUrl : undefined,
      }),
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
    handler: async (args) => {
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
]

export const MCP_TOOL_MAP = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]))

/** Runs a tool and shapes the MCP `tools/call` result, errors included. */
export async function runMcpTool(name: string, args: Record<string, any>) {
  const tool = MCP_TOOL_MAP.get(name)
  if (!tool) {
    return {
      content: [{ type: 'text' as const, text: `Tool desconhecida: ${name}` }],
      isError: true,
    }
  }

  try {
    const result = await tool.handler(args ?? {})
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
