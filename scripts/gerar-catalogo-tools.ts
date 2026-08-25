/**
 * Emite o catálogo de tools MCP em markdown, derivado do registro — para
 * colar nas skills (agendar-artes, content-planner…) quando forem atualizadas,
 * em vez de descrever tools à mão e envelhecer separado do código.
 *
 *   npx tsx scripts/gerar-catalogo-tools.ts            # tudo
 *   npx tsx scripts/gerar-catalogo-tools.ts ver-agenda # uma tool
 *
 * Somente leitura do catálogo; roda sem env, não toca em nada.
 */

import { CATALOGO } from '../src/lib/mcp/catalogo/index'
import type { ToolPronta } from '../src/lib/mcp/registro/tipos'

function marcas(tool: ToolPronta): string {
  const m: string[] = []
  if (tool.annotations.readOnlyHint) m.push('só leitura')
  if (tool.annotations.destructiveHint) m.push('⚠️ destrutiva')
  if (tool.annotations.openWorldHint) m.push('modelo externo/crédito')
  if (tool.acesso.tipo === 'curador') m.push('exige curador')
  return m.length ? ` _(${m.join(' · ')})_` : ''
}

function parametros(tool: ToolPronta): string {
  const props = (tool.schemaJson.properties ?? {}) as Record<
    string,
    { type?: unknown; enum?: unknown[]; description?: string }
  >
  const required = new Set((tool.schemaJson.required as string[] | undefined) ?? [])
  const linhas = Object.entries(props).map(([nome, p]) => {
    const tipo = Array.isArray(p.enum) ? p.enum.map((e) => `"${e}"`).join(' \\| ') : String(p.type ?? '')
    const obrig = required.has(nome) ? '**sim**' : 'não'
    const desc = (p.description ?? '').replace(/\n/g, ' ').replace(/\|/g, '\\|')
    return `| \`${nome}\` | ${tipo} | ${obrig} | ${desc} |`
  })
  if (linhas.length === 0) return '_Sem parâmetros além da autenticação._\n'
  return ['| parâmetro | tipo | obrigatório | descrição |', '|---|---|---|---|', ...linhas].join('\n') + '\n'
}

function bloco(tool: ToolPronta): string {
  const apelidos = tool.apelidos.length ? ` — apelidos: ${tool.apelidos.map((a) => `\`${a}\``).join(', ')}` : ''
  return [
    `### \`${tool.nome}\`${marcas(tool)}`,
    apelidos ? apelidos.slice(3) : '',
    '',
    tool.descricao,
    '',
    parametros(tool),
  ]
    .filter((l) => l !== '')
    .join('\n')
}

const filtro = process.argv[2]
const tools = [...CATALOGO.values()].filter((t) => !filtro || t.nome === filtro)
if (tools.length === 0) {
  console.error(`Nenhuma tool chamada "${filtro}" no catálogo.`)
  process.exit(2)
}

console.log(`# Catálogo de tools MCP do Studio Lagosta`)
console.log(`\n_${tools.length} tool(s), gerado do registro (src/lib/mcp/catalogo) — não edite à mão._\n`)
for (const tool of tools) {
  console.log(bloco(tool))
  console.log('')
}
