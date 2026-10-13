/**
 * B1d — checkpoint e: `textosDaPeca` com o contrato semântico (`_slots`/`_papeis`).
 *
 * - Peça VIVA: o que o render desenharia agora — `aplicarValoresDoPost` nas camadas atuais da página MODELO,
 *   ANTES de qualquer ordenação. Contrato que não casa = indisponível (o render recusaria).
 * - Peça ENTREGUE: só a PROVA do render ligada à URL entregue (`PostRenderProof.layersSnapshot`). O modelo de
 *   hoje não diz nada sobre aquela mídia; sem prova = indisponível. Nunca o pedido como texto.
 * - Legado: exatamente como antes (a prova, quando vem, não muda a leitura legada).
 */
import { describe, expect, it } from 'vitest'

import { textosDaPeca, type PecaParaTextos } from '../textos-da-peca'
import { aplicarValoresDoPost } from '../aplicar-valores-do-post'

const URL = 'https://blob.test/posts/rendered/a.png'
const texto = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, type: 'text', content: `modelo ${id}`, visible: true, order: 1, ...extra })
const modelo = [texto('t-h', { order: 1, metadata: { slot: { id: 'manchete' } } }), texto('t-s', { order: 2 })]
const contrato = { _slots: { manchete: 'Noite do vinho' } }
const peca = (extra: Partial<PecaParaTextos> = {}): PecaParaTextos => ({
  pageId: 'p1', slotValues: contrato, status: 'SCHEDULED', laterPostId: null, mediaUrls: [URL], generationId: null, renderStatus: 'RENDERED', ...extra,
})
const entregue = (extra: Partial<PecaParaTextos> = {}) => peca({ status: 'POSTED', laterPostId: 'z1', ...extra })
const prova = (layersSnapshot: unknown, mediaUrl = URL) => ({ mediaUrl, layersSnapshot })

describe('P–Q. peça VIVA: o mesmo texto que o helper/render desenharia agora', () => {
  it('P. aplica o contrato nas camadas do modelo (o mesmo helper do render)', () => {
    const r = textosDaPeca(peca(), { camadas: modelo, paginaEhModelo: true })
    const doRender = aplicarValoresDoPost(modelo, contrato).camadas.map((c) => c.content)
    expect(r).toEqual({ textos: doRender, origem: 'pagina-com-copy-do-post' })
    expect(r.textos).toEqual(['Noite do vinho', 'modelo t-s'])
  })

  it('Q. array fora de ordem: o slot cai na camada certa (aplicado ANTES de ordenar); a leitura sai na ordem do render', () => {
    const camadas = [texto('a', { order: 20, metadata: { slot: { id: 'sa' } } }), texto('b', { order: 1, metadata: { slot: { id: 'sb' } } })]
    const r = textosDaPeca(peca({ slotValues: { _slots: { sa: 'Para A' } } }), { camadas, paginaEhModelo: true })
    expect(r.textos).toEqual(['modelo b', 'Para A'])
  })

  it('contrato que não casa mais com a página: indisponível — o pedido nunca vira texto', () => {
    const r = textosDaPeca(peca({ slotValues: { _slots: { inexistente: 'Pedido X' } } }), { camadas: modelo, paginaEhModelo: true })
    expect(r.textos).toEqual([])
    expect(r.indisponiveis).toMatch(/não casa/)
    expect(JSON.stringify(r)).not.toMatch(/Pedido X/)
  })

  it('página de conteúdo, ou página não carregada: indisponível, sem cair no pedido', () => {
    expect(textosDaPeca(peca(), { camadas: modelo, paginaEhModelo: false })).toMatchObject({ textos: [], indisponiveis: expect.any(String) })
    const semPagina = textosDaPeca(peca(), {})
    expect(semPagina).toMatchObject({ textos: [], indisponiveis: expect.any(String) })
    expect(JSON.stringify(semPagina)).not.toMatch(/Noite do vinho/)
  })
})

describe('R–T. peça ENTREGUE: só a prova da URL entregue', () => {
  const desenhado = [texto('t-h', { content: 'Desenhado no PNG', size: { height: 999 } }), texto('t-s', { order: 2, content: 'linha 2' })]

  it('R. lê o layersSnapshot da prova casada com a URL entregue', () => {
    const r = textosDaPeca(entregue(), { camadas: modelo, paginaEhModelo: true, provaDaMidia: prova(desenhado) })
    expect(r).toEqual({ textos: ['Desenhado no PNG', 'linha 2'], origem: 'arte' })
  })

  it('S. o modelo mudou depois: a leitura da mídia entregue NÃO muda', () => {
    const antes = textosDaPeca(entregue(), { camadas: modelo, paginaEhModelo: true, provaDaMidia: prova(desenhado) })
    const modeloEditado = [texto('t-h', { content: 'MODELO EDITADO', metadata: { slot: { id: 'manchete' } } })]
    const depois = textosDaPeca(entregue(), { camadas: modeloEditado, paginaEhModelo: true, provaDaMidia: prova(desenhado) })
    expect(depois).toEqual(antes)
  })

  it('T. sem prova: indisponível — sem `_slots` como fallback textual', () => {
    const r = textosDaPeca(entregue(), { camadas: modelo, paginaEhModelo: true })
    expect(r.textos).toEqual([])
    expect(r.indisponiveis).toMatch(/prova/)
    expect(JSON.stringify(r)).not.toMatch(/Noite do vinho/)
  })

  it('T. prova de OUTRA URL (render anterior): indisponível', () => {
    const r = textosDaPeca(entregue(), { provaDaMidia: prova(desenhado, 'https://blob.test/posts/rendered/antiga.png') })
    expect(r).toMatchObject({ textos: [], indisponiveis: expect.stringMatching(/prova/) })
  })

  it('G. generationId antigo e Generation casada com snapshot de outra versão: não entram — só a prova da URL', () => {
    const slides = [{ url: URL, arte: { layersSnapshot: [texto('t-h', { content: 'SNAPSHOT DA GENERATION' })], pageId: 'p1', source: 'post-schedule', slotValues: contrato } }]
    const semProva = textosDaPeca(entregue({ generationId: 'g-antiga' }), { slides })
    expect(semProva.textos).toEqual([])
    expect(JSON.stringify(semProva)).not.toMatch(/SNAPSHOT DA GENERATION|Noite do vinho/)
    const comProva = textosDaPeca(entregue({ generationId: 'g-antiga' }), { slides, provaDaMidia: prova(desenhado) })
    expect(comProva.textos).toEqual(['Desenhado no PNG', 'linha 2'])
  })
})

describe('U. legado: comportamento preservado (a prova não muda a leitura legada)', () => {
  const legado = { 't-h': 'Copy do post' }

  it('peça viva de modelo: página com a copy do post por cima, como hoje', () => {
    const r = textosDaPeca(peca({ slotValues: legado }), { camadas: modelo, paginaEhModelo: true })
    expect(r).toEqual({ textos: ['Copy do post', 'modelo t-s'], origem: 'pagina-com-copy-do-post' })
  })

  it('com ou sem prova, a leitura legada é a mesma (viva e entregue)', () => {
    const fontes = { camadas: modelo, paginaEhModelo: true }
    const comProva = { ...fontes, provaDaMidia: prova([texto('t-h', { content: 'outro' })]) }
    expect(textosDaPeca(peca({ slotValues: legado }), comProva)).toEqual(textosDaPeca(peca({ slotValues: legado }), fontes))
    expect(textosDaPeca(entregue({ slotValues: legado }), comProva)).toEqual(textosDaPeca(entregue({ slotValues: legado }), fontes))
  })
})
