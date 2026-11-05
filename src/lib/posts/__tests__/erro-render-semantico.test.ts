/**
 * B1d — checkpoint d: a falha de render SEMÂNTICA é tipada e determinística. Persiste em `renderError` como um
 * envelope com leitor estrito (código, motivo, pageId, erros estruturados — nunca texto ou URL pedidos);
 * qualquer outro `renderError` (o texto dos erros comuns de hoje) segue sendo erro comum.
 */
import { describe, expect, it } from 'vitest'

import { ErroRenderSemantico, lerErroRenderSemantico, mensagensDaFalhaDeArte } from '../erro-render-semantico'

const erros = [{ codigo: 'ALVO_NAO_RESOLVIDO', origem: { tipo: 'slotId', chave: 'manchete' }, erro: { codigo: 'SLOT_NAO_ENCONTRADO' } }] as never

describe('ErroRenderSemantico', () => {
  it('carrega só informação segura e serializa num envelope que o leitor reconhece', () => {
    const e = new ErroRenderSemantico('CONTRATO_INVALIDO', 'p1', erros)
    expect(e).toBeInstanceOf(Error)
    expect(e).toMatchObject({ codigo: 'RENDER_SEMANTICO_INVALIDO', motivo: 'CONTRATO_INVALIDO', pageId: 'p1', erros })
    expect(lerErroRenderSemantico(e.paraRenderError())).toEqual({ codigo: 'RENDER_SEMANTICO_INVALIDO', motivo: 'CONTRATO_INVALIDO', pageId: 'p1', erros })
  })

  it('página de conteúdo: motivo próprio, sem erros do resolvedor', () => {
    const e = new ErroRenderSemantico('PAGINA_DE_CONTEUDO', 'p1')
    expect(lerErroRenderSemantico(e.paraRenderError())).toMatchObject({ motivo: 'PAGINA_DE_CONTEUDO', erros: [] })
  })

  it('o leitor é estrito: erro comum de hoje, JSON qualquer, null → não é semântico', () => {
    for (const r of [null, undefined, '', 'Blob upload failed: 503', 'Page not found: p1', '{"tipo":"outro"}', '{quebrado', '{"codigo":"RENDER_SEMANTICO_INVALIDO","motivo":"INVENTADO","pageId":"p","erros":[]}']) {
      expect(lerErroRenderSemantico(r as never)).toBeNull()
    }
  })
})

describe('mensagens da falha de arte (executor)', () => {
  it('comum: as de hoje, com "3 tentativas"', () => {
    expect(mensagensDaFalhaDeArte('Blob upload failed')).toEqual({
      erroDoPost: 'Story image rendering failed after 3 attempts',
      log: 'Story image rendering failed after 3 attempts',
      aviso: 'Não foi possível gerar a arte do story depois de 3 tentativas',
    })
  })

  it('semântica: não fala em tentativas — a arte precisa de correção', () => {
    const m = mensagensDaFalhaDeArte(new ErroRenderSemantico('CONTRATO_INVALIDO', 'p1', erros).paraRenderError())
    expect(JSON.stringify(m)).not.toMatch(/3 tentativas|3 attempts/)
    expect(m.aviso).toBe('A arte do story precisa de correção: o contrato semântico não corresponde mais à página.')
  })
})

describe('N. os dois caminhos de render e o executor (estrutura)', () => {
  const fonte = async (f: string) => (await import('node:fs')).readFileSync((await import('node:path')).join(process.cwd(), f), 'utf8')

  it('N. MCP local render-story: recusa o contrato novo ANTES de qualquer escrita, sem aplicador semântico próprio', async () => {
    const t = await fonte('scripts/mcp-server.ts')
    const bloco = t.slice(t.indexOf("'render-story',"), t.indexOf("'plan-week',"))
    const recusa = bloco.indexOf('if (temContratoSemantico(post.slotValues))')
    expect(recusa).toBeGreaterThan(-1)
    expect(recusa).toBeLessThan(bloco.indexOf('prisma.$executeRaw')) // a primeira escrita é a trava atômica
    expect(bloco).not.toMatch(/aplicarValoresDoPost|resolverValoresSemanticos/)
  })

  it('executor: a mensagem da arte falha vem de mensagensDaFalhaDeArte; "falha-semantica" vai ao ramo RENDER_FAILED', async () => {
    const t = await fonte('src/lib/posts/executor.ts')
    expect(t).toMatch(/render\.motivo === 'falha-semantica'/)
    expect(t).toMatch(/const falha = mensagensDaFalhaDeArte\(post\.renderError\)/)
    expect(t).not.toMatch(/depois de 3 tentativas/)
  })
})
