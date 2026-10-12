/**
 * B1d — checkpoint c: ADMISSÃO do contrato semântico novo num SocialPost. Só entra pedido que o render do
 * servidor vai poder desenhar: STORY, sem mídia pronta, sobre uma página MODELO do mesmo projeto, e com o
 * contrato válido contra as camadas dela (o helper do checkpoint b). Sem `_slots`/`_papeis`, nada muda.
 */
import { describe, expect, it, vi } from 'vitest'

import { admitirPedidoSemantico, ErroAdmissaoSemantica } from '../admitir-pedido-semantico'

const camadas = [
  { id: 't-h', name: 'Título', type: 'text', content: 'modelo', visible: true, metadata: { compositor: { papel: 'headline' }, slot: { id: 'manchete' } } },
]
const pagina = (extra: Record<string, unknown> = {}) => ({ id: 'p1', isTemplate: true, layers: camadas, Template: { projectId: 8 }, ...extra })
const cliente = (p: unknown) => ({ page: { findUnique: vi.fn(async () => p as any) } })
const pedido = (extra: Record<string, unknown> = {}) => ({ projectId: 8, postType: 'STORY', pageId: 'p1', mediaUrls: [] as string[], slotValues: { _slots: { manchete: 'Noite do vinho' } } as unknown, ...extra })

async function recusa(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(ErroAdmissaoSemantica)
    return e as ErroAdmissaoSemantica
  }
  throw new Error('não recusou')
}

describe('sem contrato novo: a admissão não interfere', () => {
  it.each([undefined, null, {}, { 't-h': 'X' }, { Título: 'X', _driveImageId: 'd' }])('slotValues %j: passa sem ler a página', async (sv) => {
    const c = cliente(null)
    await admitirPedidoSemantico(c, pedido({ slotValues: sv, pageId: undefined, mediaUrls: ['https://x.jpg'], postType: 'POST' }))
    expect(c.page.findUnique).not.toHaveBeenCalled()
  })
})

describe('A. contrato válido em página modelo, STORY, sem mídia: admitido', () => {
  it('_slots e _papeis', async () => {
    await admitirPedidoSemantico(cliente(pagina()), pedido())
    await admitirPedidoSemantico(cliente(pagina()), pedido({ slotValues: { _papeis: { headline: 'X' } } }))
  })
})

describe('recusas antes de qualquer gravação', () => {
  it('B. `_slots: null` / `_papeis: null` → CONTRATO_INVALIDO com ENTRADA_INVALIDA', async () => {
    for (const sv of [{ _slots: null }, { _papeis: null }]) {
      const e = await recusa(admitirPedidoSemantico(cliente(pagina()), pedido({ slotValues: sv })))
      expect(e.codigo).toBe('CONTRATO_INVALIDO')
      expect(e.erros[0]).toMatchObject({ codigo: 'ENTRADA_INVALIDA' })
    }
  })

  it('C. slot inexistente → CONTRATO_INVALIDO com ALVO_NAO_RESOLVIDO', async () => {
    const e = await recusa(admitirPedidoSemantico(cliente(pagina()), pedido({ slotValues: { _slots: { inexistente: 'X' } } })))
    expect(e.codigo).toBe('CONTRATO_INVALIDO')
    expect(e.erros[0]).toMatchObject({ codigo: 'ALVO_NAO_RESOLVIDO' })
  })

  it('demais erros do resolvedor (papel não declarado, camada oculta, incompatível, conflito) → CONTRATO_INVALIDO', async () => {
    const casos: Array<[unknown, Record<string, unknown>, string]> = [
      [pagina({ layers: [{ id: 'h', name: 'headline', type: 'text', content: 'm', visible: true }] }), { _papeis: { headline: 'X' } }, 'PAPEL_NAO_DECLARADO'],
      [pagina({ layers: [{ ...camadas[0], visible: false }] }), { _slots: { manchete: 'X' } }, 'CAMADA_OCULTA'],
      [pagina(), { _slots: { manchete: { fileUrl: 'https://x' } } }, 'VALOR_INCOMPATIVEL_COM_CAMADA'],
      [pagina(), { 't-h': 'A', _slots: { manchete: 'B' } }, 'VALOR_CONFLITANTE'],
      [pagina({ layers: [camadas[0], { ...camadas[0], id: 't-2' }] }), { _slots: { manchete: 'X' } }, 'ALVO_NAO_RESOLVIDO'],
    ]
    for (const [p, sv, codigo] of casos) {
      const e = await recusa(admitirPedidoSemantico(cliente(p), pedido({ slotValues: sv })))
      expect(e.erros[0]).toMatchObject({ codigo })
    }
  })

  it('D. página de CONTEÚDO → CONTRATO_EM_PAGINA_DE_CONTEUDO', async () => {
    const e = await recusa(admitirPedidoSemantico(cliente(pagina({ isTemplate: false })), pedido()))
    expect(e.codigo).toBe('CONTRATO_EM_PAGINA_DE_CONTEUDO')
  })

  it('E. sem pageId → CONTRATO_SEM_PAGINA (sem ler o banco)', async () => {
    const c = cliente(pagina())
    const e = await recusa(admitirPedidoSemantico(c, pedido({ pageId: undefined })))
    expect(e.codigo).toBe('CONTRATO_SEM_PAGINA')
    expect(c.page.findUnique).not.toHaveBeenCalled()
  })

  it('F. mídia pronta junto com o contrato → CONTRATO_COM_MIDIA_PRONTA', async () => {
    const e = await recusa(admitirPedidoSemantico(cliente(pagina()), pedido({ mediaUrls: ['https://cliente.jpg'] })))
    expect(e.codigo).toBe('CONTRATO_COM_MIDIA_PRONTA')
  })

  it('post que não é STORY (o servidor só renderiza story de página) → CONTRATO_SEM_RENDER_DO_SERVIDOR', async () => {
    const e = await recusa(admitirPedidoSemantico(cliente(pagina()), pedido({ postType: 'POST' })))
    expect(e.codigo).toBe('CONTRATO_SEM_RENDER_DO_SERVIDOR')
  })

  it('página inexistente ou de outro projeto → PAGINA_NAO_ENCONTRADA', async () => {
    expect((await recusa(admitirPedidoSemantico(cliente(null), pedido()))).codigo).toBe('PAGINA_NAO_ENCONTRADA')
    expect((await recusa(admitirPedidoSemantico(cliente(pagina({ Template: { projectId: 99 } })), pedido()))).codigo).toBe('PAGINA_NAO_ENCONTRADA')
  })

  it('camadas ilegíveis → PAGINA_ILEGIVEL', async () => {
    expect((await recusa(admitirPedidoSemantico(cliente(pagina({ layers: '{quebrado' })), pedido()))).codigo).toBe('PAGINA_ILEGIVEL')
  })

  it('os erros não carregam o texto nem a URL pedidos', async () => {
    const e = await recusa(admitirPedidoSemantico(cliente(pagina()), pedido({ slotValues: { 't-h': 'segredo-A', _slots: { manchete: 'segredo-B' } } })))
    expect(JSON.stringify({ m: e.message, c: e.codigo, e: e.erros })).not.toMatch(/segredo/)
  })
})
