/**
 * B1d — checkpoint f (subagentes A/F + arbitragem do Codex): trocar `isTemplate` muda o que o render desenha (modelo →
 * os slots do post por cima; conteúdo → a página como está; contrato semântico → só em modelo). As duas portas que
 * trocam `isTemplate` passam a invalidar os renders da página NA MESMA transação — é também o que deixa uma falha
 * `PAGINA_DE_CONTEUDO` se recuperar quando a pessoa promove a página a modelo.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ler = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

describe('as portas que trocam isTemplate invalidam os renders da página, na mesma transação', () => {
  it('PATCH toggle-template (editor)', () => {
    const t = ler('src/app/api/templates/[id]/pages/[pageId]/toggle-template/route.ts')
    expect(t).toMatch(/existingPage\.isTemplate !== validatedData\.isTemplate/)
    expect(t).toMatch(/db\.\$transaction\(async \(tx\) => \{[\s\S]*tx\.page\.update\([\s\S]*invalidateScheduledRenders\(tx, \{ pageIds: \[pageId\] \}\)/)
  })

  it('marcar-como-modelo (MCP)', () => {
    const t = ler('src/lib/mcp/catalogo/modelos.ts')
    const ini = t.indexOf("nome: 'marcar-como-modelo'")
    expect(ini).toBeGreaterThan(-1)
    const bloco = t.slice(ini, ini + 5000)
    expect(bloco).toMatch(/page\.isTemplate !== marcar/)
    expect(bloco).toMatch(/db\.\$transaction\(async \(tx\) => \{\s*const r = await atualizar\(tx\)\s*await invalidateScheduledRenders\(tx, \{ pageIds: \[pageId\] \}\)/)
  })
})
