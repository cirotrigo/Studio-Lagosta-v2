/**
 * O contrato puro do agendamento por item de lote (PR 12): validação da leva,
 * pedido efetivo e hash, a decisão do item, os posts da página e a "imagem
 * atual". Sem banco.
 */
import { describe, expect, it } from 'vitest'
import {
  decidirAgendamento,
  decidirMidiaEmOutroPost,
  decidirPostsDaPagina,
  hashDoAgendamento,
  pedidoDoAgendamento,
  resumirAgendamento,
  thumbnailEhAtual,
  validarAgendamentoDoLote,
  type PedidoDeAgendamento,
} from '../agendamento'

const pedidoDe = (r: ReturnType<typeof pedidoDoAgendamento>): PedidoDeAgendamento => {
  if (!('pedido' in r)) throw new Error(`esperava pedido, veio ${r.falha.codigo}`)
  return r.pedido
}

describe('validarAgendamentoDoLote', () => {
  it('aceita a leva e apara os ids', () => {
    const v = validarAgendamentoDoLote(' semana-1 ', [{ itemId: ' seg ' }, { itemId: 'ter', quando: '2026-09-15 19:00' }])
    expect(v.problemas).toEqual([])
    expect(v.loteId).toBe('semana-1')
    expect(v.itens?.map((i) => i.itemId)).toEqual(['seg', 'ter'])
  })

  it('recusa itemId repetido depois de aparar, data ilegível, chave desconhecida e leva vazia', () => {
    expect(validarAgendamentoDoLote('l', [{ itemId: 'a' }, { itemId: 'a ' }]).problemas.join()).toContain('repete o item 0')
    expect(validarAgendamentoDoLote('l', [{ itemId: 'a', quando: 'amanhã' }]).problemas.join()).toContain('não é data')
    expect(validarAgendamentoDoLote('l', [{ itemId: 'a', status: 'agendado' }]).problemas.join()).toContain('status')
    expect(validarAgendamentoDoLote('l', []).problemas.join()).toContain('pelo menos um')
    expect(validarAgendamentoDoLote('', [{ itemId: 'a' }]).loteId).toBeNull()
  })
})

describe('pedidoDoAgendamento e hash', () => {
  it('usa o horário da spec quando o item não manda, e o tipo sai do formato', () => {
    const p = pedidoDe(pedidoDoAgendamento({ itemId: 'a' }, { quandoDaSpec: '2026-09-14 19:00', formato: 'feed' }))
    expect(p).toEqual({ quando: '2026-09-14T22:00:00.000Z', postType: 'POST', caption: '', lembrete: false, escopo: 'ROTINA', campanhaId: null })
  })

  it('Brasília e ISO do mesmo instante são o MESMO pedido; tipo explícito igual ao do formato também', () => {
    const a = pedidoDe(pedidoDoAgendamento({ itemId: 'a', quando: '2026-09-14 19:00' }, { quandoDaSpec: null, formato: 'story' }))
    const b = pedidoDe(pedidoDoAgendamento({ itemId: 'a', quando: '2026-09-14T22:00:00Z', postType: 'STORY' }, { quandoDaSpec: '2026-09-20 10:00', formato: 'story' }))
    expect(hashDoAgendamento(a)).toBe(hashDoAgendamento(b))
    expect(hashDoAgendamento(a)).toMatch(/^agendamento-v1:[0-9a-f]{64}$/)
  })

  it('legenda, lembrete, escopo e campanha mudam o hash; campanhaId sozinho implica CAMPANHA', () => {
    const base = { quandoDaSpec: '2026-09-14 19:00', formato: 'story' as const }
    const h = (item: Record<string, unknown>) => hashDoAgendamento(pedidoDe(pedidoDoAgendamento({ itemId: 'a', ...item }, base)))
    const original = h({})
    for (const mudanca of [{ caption: 'oi' }, { lembrete: true }, { escopo: 'pontual' }, { campanhaId: 'c1' }, { quando: '2026-09-14 20:00' }, { postType: 'POST' }]) {
      expect(h(mudanca)).not.toBe(original)
    }
    expect(pedidoDe(pedidoDoAgendamento({ itemId: 'a', campanhaId: 'c1' }, base)).escopo).toBe('CAMPANHA')
  })

  it('sem horário nem na spec nem no item é SEM_HORARIO; tipo contra o formato vira aviso', () => {
    expect(pedidoDoAgendamento({ itemId: 'a' }, { quandoDaSpec: null, formato: 'story' })).toMatchObject({ falha: { codigo: 'SEM_HORARIO' } })
    const r = pedidoDoAgendamento({ itemId: 'a', postType: 'STORY' }, { quandoDaSpec: '2026-09-14 19:00', formato: 'feed' })
    expect('pedido' in r && r.avisos.join()).toContain('a peça é feed')
  })
})

describe('decidirAgendamento', () => {
  const registroLivre = { postId: null, hashDoAgendamento: null, efeitosDoAgendamentoEm: null }
  const pronta = { status: 'COMPLETED', pageId: 'p1', slide: false }
  const pedido = { hash: 'h1' }

  it('item já ligado: post apagado nunca é recriado, mesmo pedido reaproveita, outro pedido conflita', () => {
    const ligado = { postId: 'post-1', hashDoAgendamento: 'h1', efeitosDoAgendamentoEm: null }
    expect(decidirAgendamento({ registro: ligado, postLigadoExiste: false, pedido, peca: pronta, pagina: { ehModelo: false } })).toMatchObject({ acao: 'falhar', codigo: 'POST_REMOVIDO' })
    expect(decidirAgendamento({ registro: ligado, postLigadoExiste: true, pedido, peca: pronta, pagina: { ehModelo: false } })).toEqual({ acao: 'reaproveitar', efeitosPendentes: true })
    expect(decidirAgendamento({ registro: { ...ligado, efeitosDoAgendamentoEm: new Date() }, postLigadoExiste: true, pedido, peca: null, pagina: null })).toEqual({ acao: 'reaproveitar', efeitosPendentes: false })
    expect(decidirAgendamento({ registro: ligado, postLigadoExiste: true, pedido: { hash: 'h2' }, peca: pronta, pagina: { ehModelo: false } })).toMatchObject({ acao: 'falhar', codigo: 'LOTE_AGENDAMENTO_CONFLITO' })
  })

  it('sem post: peça ausente, falhou, em andamento, sem página, modelo, slide e pedido inválido', () => {
    const d = (peca: Parameters<typeof decidirAgendamento>[0]['peca'], pagina: { ehModelo: boolean } | null = { ehModelo: false }, p: Parameters<typeof decidirAgendamento>[0]['pedido'] = pedido) =>
      decidirAgendamento({ registro: registroLivre, postLigadoExiste: false, pedido: p, peca, pagina })
    expect(d(null)).toMatchObject({ codigo: 'PECA_AUSENTE' })
    expect(d({ ...pronta, status: 'FAILED' })).toMatchObject({ codigo: 'PECA_FALHOU' })
    expect(d({ ...pronta, status: 'PROCESSING' })).toMatchObject({ acao: 'pendente', codigo: 'PECA_EM_ANDAMENTO' })
    expect(d({ ...pronta, status: 'PROCESSING' }, null, { falha: { codigo: 'SEM_HORARIO', motivo: 'x' } })).toMatchObject({ acao: 'falhar', codigo: 'SEM_HORARIO' })
    expect(d({ ...pronta, pageId: null })).toMatchObject({ codigo: 'SEM_PAGINA' })
    expect(d(pronta, null)).toMatchObject({ codigo: 'PAGINA_NAO_ENCONTRADA' })
    expect(d(pronta, { ehModelo: true })).toMatchObject({ codigo: 'PAGINA_MODELO' })
    expect(d({ ...pronta, slide: true })).toMatchObject({ codigo: 'SLIDE_DE_CARROSSEL' })
    expect(d(pronta)).toEqual({ acao: 'agendar' })
  })
})

describe('posts da página e mídia em outro post', () => {
  it('adota rascunho ou agendado livre; recusa página já publicada e rascunho de outro item', () => {
    expect(decidirPostsDaPagina([], new Set())).toEqual({ acao: 'criar' })
    expect(decidirPostsDaPagina([{ id: 'a', status: 'POSTED' }, { id: 'b', status: 'DRAFT' }], new Set())).toEqual({ acao: 'adotar', postId: 'b' })
    expect(decidirPostsDaPagina([{ id: 'a', status: 'POSTED' }], new Set())).toMatchObject({ acao: 'falhar', codigo: 'PAGINA_JA_EM_POST', postId: 'a' })
    expect(decidirPostsDaPagina([{ id: 'b', status: 'SCHEDULED' }], new Set(['b']))).toMatchObject({ acao: 'falhar', codigo: 'POST_DE_OUTRO_ITEM' })
  })

  it('arte já num carrossel é slide; já num post único é PECA_JA_NA_AGENDA', () => {
    expect(decidirMidiaEmOutroPost([])).toBeNull()
    expect(decidirMidiaEmOutroPost([{ id: 'c', mediaUrls: ['u1', 'u2'] }])).toMatchObject({ codigo: 'SLIDE_DE_CARROSSEL', postId: 'c' })
    expect(decidirMidiaEmOutroPost([{ id: 'u', mediaUrls: ['u1'] }])).toMatchObject({ codigo: 'PECA_JA_NA_AGENDA', postId: 'u' })
  })
})

describe('thumbnailEhAtual', () => {
  const camadas = [{ id: 'headline', type: 'text', content: 'Manchete', position: { x: 10, y: 20 } }]
  const base = { thumbnail: 'https://x.public.blob.vercel-storage.com/p.png', resultUrl: 'https://x.public.blob.vercel-storage.com/p.png', camadasDaPagina: camadas, snapshot: camadas }

  it('é atual quando o thumbnail é a peça e as camadas são as da composição (inclusive dupla-codificadas)', () => {
    expect(thumbnailEhAtual(base)).toBe(true)
    expect(thumbnailEhAtual({ ...base, camadasDaPagina: JSON.stringify(JSON.stringify(camadas)) })).toBe(true)
  })

  it('não é atual com PNG de outra arte, camada editada depois, sem snapshot ou thumbnail base64', () => {
    expect(thumbnailEhAtual({ ...base, resultUrl: 'https://x.public.blob.vercel-storage.com/outra.png' })).toBe(false)
    expect(thumbnailEhAtual({ ...base, camadasDaPagina: [{ ...camadas[0], content: 'Editada' }] })).toBe(false)
    expect(thumbnailEhAtual({ ...base, snapshot: undefined })).toBe(false)
    expect(thumbnailEhAtual({ ...base, thumbnail: 'data:image/jpeg;base64,xx' })).toBe(false)
    expect(thumbnailEhAtual({ ...base, camadasDaPagina: '{ilegível' })).toBe(false)
  })
})

it('resumirAgendamento conta por situação', () => {
  expect(resumirAgendamento([{ situacao: 'concluido' }, { situacao: 'falhou' }, { situacao: 'pendente' }, { situacao: 'concluido' }])).toEqual({ concluidos: 2, pendentes: 1, falhas: 1 })
})
