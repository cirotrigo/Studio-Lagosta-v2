/**
 * Catálogo · clientes.
 *
 * ⚠️ Regra do catálogo inteiro: import estático aqui só de módulo PURO (zod,
 * registro/). db, serviços e helpers de acesso entram por `await import()`
 * DENTRO do handler — `@/lib/db` lança no import sem DATABASE_URL, e o
 * `validar-registro-mcp.ts` do CI carrega este módulo sem env nenhum. Os
 * caminhos são RELATIVOS porque o servidor local (tsx) não resolve o alias
 * `@/` — mesma razão de `scripts/mcp-server.ts` importar tudo relativo.
 */

import { z } from 'zod'
import { definirTool } from '../registro/definir'

export const toolsDeClientes = [
  definirTool({
    nome: 'listar-clientes',
    apelidos: ['list-projects'],
    descricao:
      'Lista os clientes (projetos) do Studio Lagosta. Comece por aqui quando a pessoa citar um cliente pelo nome — é onde você descobre o id que as outras ferramentas pedem.',
    schema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    acesso: { tipo: 'autenticado' },
    superficies: ['remoto', 'local'],
    handler: async (_args, principal) => {
      const [{ db }, { projetosVisiveis, quemEstaConectado }] = await Promise.all([
        import('../../db'),
        import('../tools'),
      ])
      const permitidos = await projetosVisiveis(principal)
      if (permitidos && permitidos.length === 0) {
        // Lista vazia sem explicação manda procurar no lugar errado — ver a
        // nota em assertProjetoPermitido.
        const quem = await quemEstaConectado(principal)
        return {
          count: 0,
          projects: [],
          aviso: `Nenhum cliente visível: a conexão está autenticada como ${quem}, e essa conta não é dona de nenhum projeto nem participa de uma organização que tenha algum. Reconecte com a conta dona, ou peça para incluírem esta na organização.`,
        }
      }
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
  }),
]
