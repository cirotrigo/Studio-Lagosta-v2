/**
 * B1d — checkpoint c: a EDIÇÃO crua de `slotValues`/`pageId`/`mediaUrls` (o `update-post` do MCP local) obedece à
 * mesma admissão do contrato novo, com a linha travada (`SELECT … FOR UPDATE`) dentro da transação de quem
 * grava. Legado: nada muda. Contrato novo: validado contra a página EFETIVA; mudar o pedido invalida o render
 * (a mídia e o RENDERED da versão anterior não podem continuar afirmando uma arte que não é mais a pedida).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { prepararEdicaoSemantica, ErroEdicaoSemantica } from '../edicao-semantica-do-post'
import { ErroAdmissaoSemantica } from '../admitir-pedido-semantico'

const camadas = [{ id: 't-h', name: 'Título', type: 'text', content: 'modelo', visible: true, metadata: { slot: { id: 'manchete' } } }]
const paginas: Record<string, unknown> = {
  modelo: { isTemplate: true, layers: camadas, Template: { projectId: 8 } },
  outroModelo: { isTemplate: true, layers: [{ ...camadas[0], metadata: { slot: { id: 'outro' } } }], Template: { projectId: 8 } },
  conteudo: { isTemplate: false, layers: camadas, Template: { projectId: 8 } },
}
const linha = (extra: Record<string, unknown> = {}) => ({ id: 'post', projectId: 8, postType: 'STORY', pageId: 'modelo', slotValues: null, laterPostId: null, status: 'SCHEDULED', renderStatus: 'RENDERED', mediaUrls: ['https://render-antigo.png'], ...extra })

function tx(row: unknown) {
  const sql: string[] = []
  return {
    sql,
    $queryRaw: vi.fn(async (partes: TemplateStringsArray) => {
      sql.push(partes.join('?'))
      return row ? [row] : []
    }),
    page: { findUnique: vi.fn(async ({ where }: any) => paginas[where.id] ?? null) },
  }
}

describe('legado: a edição não muda', () => {
  it.each([
    ['slotValues legado', { slotValues: { 't-h': 'X' } }],
    ['mídia nova', { mediaUrls: ['https://nova.jpg'] }],
    ['página nova', { pageId: 'conteudo' }],
  ])('%s em post legado → semantico: false, sem ler página', async (_n, mudanca) => {
    const t = tx(linha({ slotValues: { 't-h': 'velho' } }))
    expect(await prepararEdicaoSemantica(t as any, 'post', mudanca)).toEqual({ semantico: false })
    expect(t.page.findUnique).not.toHaveBeenCalled()
  })

  it('a linha é lida com FOR UPDATE (a decisão vale para a linha que será gravada)', async () => {
    const t = tx(linha())
    await prepararEdicaoSemantica(t as any, 'post', { slotValues: { 't-h': 'X' } })
    expect(t.sql[0]).toMatch(/FROM "SocialPost"[\s\S]*FOR UPDATE/)
  })
})

describe('H. contrato novo: mesma admissão do createPost, contra a página EFETIVA', () => {
  it('só slotValues muda: valida contra a página existente e invalida o render', async () => {
    const r = await prepararEdicaoSemantica(tx(linha()) as any, 'post', { slotValues: { _slots: { manchete: 'Noite' } } })
    expect(r).toEqual({
      semantico: true,
      data: { slotValues: { _slots: { manchete: 'Noite' } }, mediaUrls: [], renderedImageUrl: null, renderedAt: null, renderStatus: 'PENDING', nextRenderAt: expect.any(Date), renderAttempts: 0, renderError: null },
    })
  })

  it('pedido inválido contra a página existente → ErroAdmissaoSemantica', async () => {
    await expect(prepararEdicaoSemantica(tx(linha()) as any, 'post', { slotValues: { _slots: { inexistente: 'X' } } })).rejects.toMatchObject({ codigo: 'CONTRATO_INVALIDO' })
    await expect(prepararEdicaoSemantica(tx(linha()) as any, 'post', { slotValues: { _slots: null } })).rejects.toBeInstanceOf(ErroAdmissaoSemantica)
  })

  it('só pageId muda num post semântico: revalida contra a página NOVA', async () => {
    const semantico = linha({ slotValues: { _slots: { manchete: 'Noite' } } })
    await expect(prepararEdicaoSemantica(tx(semantico) as any, 'post', { pageId: 'outroModelo' })).rejects.toMatchObject({ codigo: 'CONTRATO_INVALIDO' })
    await expect(prepararEdicaoSemantica(tx(semantico) as any, 'post', { pageId: 'conteudo' })).rejects.toMatchObject({ codigo: 'CONTRATO_EM_PAGINA_DE_CONTEUDO' })
  })

  it('mídia pronta num post semântico → CONTRATO_COM_MIDIA_PRONTA', async () => {
    await expect(prepararEdicaoSemantica(tx(linha({ slotValues: { _slots: { manchete: 'N' } } })) as any, 'post', { mediaUrls: ['https://cliente.jpg'] })).rejects.toMatchObject({ codigo: 'CONTRATO_COM_MIDIA_PRONTA' })
  })

  it('retirar o contrato de um post semântico → CONTRATO_NAO_PODE_SER_REMOVIDO', async () => {
    await expect(prepararEdicaoSemantica(tx(linha({ slotValues: { _slots: { manchete: 'N' } } })) as any, 'post', { slotValues: { 't-h': 'X' } })).rejects.toMatchObject({ codigo: 'CONTRATO_NAO_PODE_SER_REMOVIDO' })
  })

  it.each([
    ['já entregue ao Zernio (laterPostId)', { laterPostId: 'z1' }],
    ['em POSTING', { status: 'POSTING' }],
    ['publicado', { status: 'POSTED' }],
  ])('post %s → POST_JA_ENTREGUE', async (_n, extra) => {
    await expect(prepararEdicaoSemantica(tx(linha(extra)) as any, 'post', { slotValues: { _slots: { manchete: 'N' } } })).rejects.toMatchObject({ codigo: 'POST_JA_ENTREGUE' })
  })

  it('RENDER_FAILED → RENDER_FAILED_SEM_RECUPERACAO (reabrir é do checkpoint f)', async () => {
    await expect(prepararEdicaoSemantica(tx(linha({ renderStatus: 'RENDER_FAILED' })) as any, 'post', { slotValues: { _slots: { manchete: 'N' } } })).rejects.toBeInstanceOf(ErroEdicaoSemantica)
  })

  it('post inexistente → POST_NAO_ENCONTRADO', async () => {
    await expect(prepararEdicaoSemantica(tx(null) as any, 'post', { slotValues: { _slots: {} } })).rejects.toMatchObject({ codigo: 'POST_NAO_ENCONTRADO' })
  })
})

describe('G–H. o MCP local usa as MESMAS funções (sem lógica copiada no script)', () => {
  const mcp = () => readFileSync(join(process.cwd(), 'scripts/mcp-server.ts'), 'utf8')
  const bloco = (nome: string, proximo: string) => {
    const t = mcp()
    return t.slice(t.indexOf(`'${nome}',`), t.indexOf(`'${proximo}',`))
  }

  it('G. create-post: admitirPedidoSemantico ANTES do prisma.socialPost.create, e a recusa não cria nada', () => {
    const b = bloco('create-post', 'update-post')
    const admissao = b.indexOf('await admitirPedidoSemantico(prisma,')
    expect(admissao).toBeGreaterThan(-1)
    expect(admissao).toBeLessThan(b.indexOf('prisma.socialPost.create('))
    expect(b).toMatch(/Nada foi criado\./)
  })

  it('H. update-post: mexeu em slotValues/pageId/mediaUrls → prepararEdicaoSemantica dentro de $transaction, gravando com o tx', () => {
    const b = bloco('update-post', 'recover-stuck-post')
    expect(b).toMatch(/if \(slotValues !== undefined \|\| pageId !== undefined \|\| mediaUrls !== undefined\)/)
    expect(b).toMatch(/prisma\.\$transaction\(async \(tx\) => \{\s*const edicao = await prepararEdicaoSemantica\(tx as any, postId,/)
    expect(b).toMatch(/return tx\.socialPost\.update\(\{ where: \{ id: postId \}, data: edicao\.semantico \? \{ \.\.\.data, \.\.\.edicao\.data \} : data/)
    expect(b).toMatch(/Nada foi alterado\./)
  })

  it('render-story (Codex, rodada 2): trava atômica que recusa o contrato, e só grava (sucesso ou falha) a linha que ainda está RENDERING', () => {
    const b = bloco('render-story', 'list-drive-images')
    const trava = b.indexOf('await prisma.$executeRaw`')
    expect(trava).toBeGreaterThan(-1)
    expect(b.slice(trava, b.indexOf('`', trava + 30))).toMatch(/SET "renderStatus" = 'RENDERING'[\s\S]*jsonb_exists\("slotValues", '_slots'\)[\s\S]*jsonb_exists\("slotValues", '_papeis'\)/)
    expect(b).not.toMatch(/prisma\.socialPost\.update\(/) // nada incondicional: nem a trava, nem a falha
    expect(b).toMatch(/where: \{ id: postId, renderStatus: 'RENDERING', mediaUrls: \{ equals: post\.mediaUrls \} \}/)
  })
})
