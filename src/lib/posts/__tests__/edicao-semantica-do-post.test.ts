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
import { ErroRenderSemantico } from '../erro-render-semantico'

const camadas = [{ id: 't-h', name: 'Título', type: 'text', content: 'modelo', visible: true, metadata: { slot: { id: 'manchete' } } }]
const paginas: Record<string, unknown> = {
  modelo: { isTemplate: true, layers: camadas, Template: { projectId: 8 } },
  outroModelo: { isTemplate: true, layers: [{ ...camadas[0], metadata: { slot: { id: 'outro' } } }], Template: { projectId: 8 } },
  conteudo: { isTemplate: false, layers: camadas, Template: { projectId: 8 } },
}
const linha = (extra: Record<string, unknown> = {}) => ({ id: 'post', projectId: 8, postType: 'STORY', pageId: 'modelo', slotValues: null, laterPostId: null, status: 'SCHEDULED', renderStatus: 'RENDERED', mediaUrls: ['https://render-antigo.png'], ...extra })

function tx(row: unknown, retriesAtivos = 0) {
  const sql: string[] = []
  return {
    sql,
    postRetry: { count: vi.fn(async () => retriesAtivos) },
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

  it('M. RENDER_FAILED por erro COMUM → RENDER_FAILED_SEM_RECUPERACAO (continua terminal)', async () => {
    await expect(prepararEdicaoSemantica(tx(linha({ renderStatus: 'RENDER_FAILED', renderError: 'Blob upload failed: 503' })) as any, 'post', { slotValues: { _slots: { manchete: 'N' } } })).rejects.toMatchObject({ codigo: 'RENDER_FAILED_SEM_RECUPERACAO' })
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

  it('checkpoint f: update-post passa status e data EFETIVOS à preparação, e o ramo só de status não repõe falha semântica', () => {
    const b = bloco('update-post', 'recover-stuck-post')
    expect(b).toMatch(/prepararEdicaoSemantica\(tx as any, postId, \{[\s\S]*status: data\.status,[\s\S]*scheduledDatetime: data\.scheduledDatetime,/)
    // o reset do render no ramo só de status é uma escrita CONDICIONAL à linha corrente, não um campo do update cru
    // TODA promoção a SCHEDULED (com ou sem mídia) é UMA escrita condicional à linha corrente: status e reposição juntos
    expect(b).toMatch(/if \(data\.status === 'SCHEDULED'\) \{[\s\S]*prisma\.socialPost\.updateMany\(\{ where: \{ id: postId, \.\.\.NAO_E_FALHA_SEMANTICA \}, data \}\)/)
    expect(b).toMatch(/if \(agendado\.count === 0\) \{[\s\S]*Nada foi alterado/)
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
    expect(b).toMatch(/"nextRenderAt" = \$\{ficha\}/) // a trava carimba a ficha desta reserva (Codex, rodada 3)
    // e não toma a reserva VIVA de outra execução (rodada 6) — só a presa há mais que o teto do render
    expect(b).toMatch(/AND \("renderStatus" <> 'RENDERING'::"RenderStatus" OR "updatedAt" < \$\{reservaPresaAntesDe\}\)/)
    expect(b).toMatch(/where: \{ id: postId, renderStatus: 'RENDERING', nextRenderAt: ficha, mediaUrls: \{ equals: post\.mediaUrls \} \}/)
    expect(b.match(/where: \{ id: postId, renderStatus: 'RENDERING', nextRenderAt: ficha \}/g)).toHaveLength(3) // pedido mudou, volta e falha
  })

  it('render-story (Codex, rodada 8): a reversão do CAS final com a PRÓPRIA ficha devolve a PENDING agora — nunca restaura o status lido antes da trava (RENDERING velho)', () => {
    const b = bloco('render-story', 'list-drive-images')
    const cas = b.indexOf('if (gravado.count === 0) {')
    expect(cas).toBeGreaterThan(-1)
    const reversao = b.slice(cas, b.indexOf('return', cas))
    expect(reversao).toMatch(/where: \{ id: postId, renderStatus: 'RENDERING', nextRenderAt: ficha \},\s*data: \{ renderStatus: 'PENDING', nextRenderAt: new Date\(\) \}/)
    expect(b).not.toMatch(/renderStatus: post\.renderStatus/) // estado anterior à ficha é histórico, não autoridade
  })

  it('render-story (Codex, rodada 4): pedido editado entre a leitura e a trava → devolve à fila (só a sua reserva) e não desenha o antigo', () => {
    const b = bloco('render-story', 'list-drive-images')
    const releitura = b.indexOf('const reservado = await prisma.socialPost.findUnique(')
    expect(releitura).toBeGreaterThan(b.indexOf('if (travado === 0)'))
    expect(releitura).toBeLessThan(b.indexOf('convertPageToDesignData('))
    expect(b).toMatch(/JSON\.stringify\(reservado\.slotValues\) !== JSON\.stringify\(post\.slotValues\)/)
    // e a PÁGINA também (rodada 5): editada e invalidada entre a leitura e a trava, o MCP desenharia as camadas antigas
    expect(b).toMatch(/const paginaReservada = await prisma\.page\.findUnique\(/)
    expect(b).toMatch(/assinaturaDaPagina\(paginaReservada\) !== assinaturaDaPagina\(page\)/)
    expect(b).toMatch(/where: \{ id: postId, renderStatus: 'RENDERING', nextRenderAt: ficha \},\s*data: \{ renderStatus: 'PENDING', nextRenderAt: new Date\(\) \}/)
  })
})

describe('checkpoint f: corrigir o pedido recupera a falha SEMÂNTICA de render — com todos os gates', () => {
  const envelope = new ErroRenderSemantico('CONTRATO_INVALIDO', 'modelo', []).paraRenderError()
  const falhou = (extra: Record<string, unknown> = {}) =>
    linha({ slotValues: { _slots: { inexistente: 'velho' } }, renderStatus: 'RENDER_FAILED', renderError: envelope, mediaUrls: [], status: 'DRAFT', scheduledDatetime: null, videoDaPagina: false, ...extra })
  const corrigir = { slotValues: { _slots: { manchete: 'Noite' } } }
  const futuro = new Date(Date.now() + 3_600_000)

  it('J. _slots corrigido → PENDING com a transição completa', async () => {
    const r = await prepararEdicaoSemantica(tx(falhou()) as any, 'post', corrigir)
    expect(r).toEqual({ semantico: true, data: expect.objectContaining({ renderStatus: 'PENDING', renderAttempts: 0, renderError: null, mediaUrls: [], renderedImageUrl: null, renderedAt: null, nextRenderAt: expect.any(Date) }) })
  })

  it('K. _papeis corrigido → PENDING', async () => {
    const t = tx(falhou({ slotValues: { _papeis: { headline: 'velho' } } }))
    t.page.findUnique = vi.fn(async () => ({ isTemplate: true, layers: [{ ...camadas[0], metadata: { compositor: { papel: 'headline' } } }], Template: { projectId: 8 } })) as any
    expect(await prepararEdicaoSemantica(t as any, 'post', { slotValues: { _papeis: { headline: 'Novo' } } })).toMatchObject({ semantico: true })
  })

  it('SCHEDULED futuro também recupera; a mídia velha não conta como pronta', async () => {
    const r = await prepararEdicaoSemantica(tx(falhou({ status: 'SCHEDULED', scheduledDatetime: futuro, mediaUrls: ['https://blob.test/velha.png'] })) as any, 'post', corrigir)
    expect(r).toMatchObject({ semantico: true, data: { mediaUrls: [] } })
  })

  it('a página corrigida desde a falha: reenviar o mesmo pedido (só pageId) também reabre', async () => {
    expect(await prepararEdicaoSemantica(tx(falhou({ slotValues: { _slots: { manchete: 'X' } } })) as any, 'post', { pageId: 'modelo' })).toMatchObject({ semantico: true })
  })

  it('L. pedido novo ainda inválido → erro de admissão (a transação de quem chama não grava)', async () => {
    await expect(prepararEdicaoSemantica(tx(falhou()) as any, 'post', { slotValues: { _slots: { inexistente: 'ainda' } } })).rejects.toBeInstanceOf(ErroAdmissaoSemantica)
  })

  it.each([
    ['H. SCHEDULED vencido', { status: 'SCHEDULED', scheduledDatetime: new Date(Date.now() - 60_000) }, {}],
    ['H. SCHEDULED sem horário', { status: 'SCHEDULED', scheduledDatetime: null }, {}],
    ['I. PostStatus FAILED', { status: 'FAILED' }, {}],
    ['I. a própria edição põe FAILED', {}, { status: 'FAILED' }],
    ['H. a própria edição põe uma data passada', { status: 'SCHEDULED', scheduledDatetime: futuro }, { scheduledDatetime: new Date(Date.now() - 60_000) }],
    ['S. vídeo da página', { videoDaPagina: true }, {}],
    ['S. carrossel', { mediaUrls: ['https://a.png', 'https://b.png'] }, {}],
  ])('%s → não recupera', async (_n, extra, mudanca) => {
    await expect(prepararEdicaoSemantica(tx(falhou(extra)) as any, 'post', { ...corrigir, ...mudanca })).rejects.toBeInstanceOf(ErroEdicaoSemantica)
  })

  it('retry de publicação ativo → não recupera (enviaria cedo a arte nova)', async () => {
    await expect(prepararEdicaoSemantica(tx(falhou(), 1) as any, 'post', corrigir)).rejects.toMatchObject({ codigo: 'RECUPERACAO_COM_PUBLICACAO_PENDENTE' })
  })

  it('F/G. entregue (laterPostId, POSTING, POSTED) → POST_JA_ENTREGUE, antes de tudo', async () => {
    for (const extra of [{ laterPostId: 'z1' }, { status: 'POSTING' }, { status: 'POSTED' }]) {
      await expect(prepararEdicaoSemantica(tx(falhou(extra)) as any, 'post', corrigir)).rejects.toMatchObject({ codigo: 'POST_JA_ENTREGUE' })
    }
    await expect(prepararEdicaoSemantica(tx(falhou()) as any, 'post', { ...corrigir, status: 'POSTED' })).rejects.toMatchObject({ codigo: 'POST_JA_ENTREGUE' })
  })

  it('retirar o contrato de um post em falha semântica continua recusado', async () => {
    await expect(prepararEdicaoSemantica(tx(falhou()) as any, 'post', { slotValues: { 't-h': 'X' } })).rejects.toMatchObject({ codigo: 'CONTRATO_NAO_PODE_SER_REMOVIDO' })
  })

  it('o FOR UPDATE lê o que os gates precisam (erro, data, vídeo, mídia)', async () => {
    const t = tx(falhou())
    await prepararEdicaoSemantica(t as any, 'post', corrigir)
    expect(t.sql[0]).toMatch(/"renderError"[\s\S]*"scheduledDatetime"[\s\S]*"videoDaPagina"[\s\S]*"mediaUrls"[\s\S]*FOR UPDATE/)
  })
})
