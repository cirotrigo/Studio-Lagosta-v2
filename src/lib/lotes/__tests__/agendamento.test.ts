/**
 * O contrato puro do agendamento por item de lote (PR 12): validação da leva,
 * pedido efetivo e hash, a decisão do item, os posts da página e a "imagem
 * atual". Sem banco.
 */
import { describe, expect, it } from 'vitest'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { CONFRONTOS, CONFRONTOS_DO_PROJETO, decidirNoItemDoPlano, ESTADOS_DA_PECA_DO_ITEM, FICHAS_DO_ITEM, REVISOES_DA_CHAMADA } from '@/lib/planos/decisao-do-item'
import { STATUS_DO_ITEM } from '@/lib/planos/vocabulario'
import {
  decidirAgendamento,
  decidirItemDoPlano,
  decidirMidiaEmOutroPost,
  decidirPostsDaPagina,
  descreverRascunhoApagado,
  hashDoAgendamento,
  mancheteDaSpec,
  pedidoDoAgendamento,
  MOTIVO_ARTE_MAIS_NOVA,
  resumirAgendamento,
  superadaNoPlanoSemPeca,
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
    expect(v.itens?.map((i) => [i.item.itemId, i.falha])).toEqual([['seg', null], ['ter', null]])
  })

  it('a IDENTIDADE da leva recusa a chamada: itemId repetido depois de aparar, chave desconhecida, leva vazia, loteId vazio', () => {
    expect(validarAgendamentoDoLote('l', [{ itemId: 'a' }, { itemId: 'a ' }]).problemas.join()).toContain('repete o item 0')
    expect(validarAgendamentoDoLote('l', [{ itemId: 'a', status: 'agendado' }]).problemas.join()).toContain('status')
    expect(validarAgendamentoDoLote('l', []).problemas.join()).toContain('pelo menos um')
    expect(validarAgendamentoDoLote('', [{ itemId: 'a' }]).loteId).toBeNull()
  })
})

it('campo do PEDIDO inválido é falha DO ITEM, e os outros itens seguem (C12-1c)', () => {
  const v = validarAgendamentoDoLote('l', [
    { itemId: 'vazio', quando: '' },
    { itemId: 'espacos', quando: '   ' },
    { itemId: 'ilegivel', quando: 'amanhã' },
    { itemId: 'campanha', campanhaId: '' },
    { itemId: 'legenda', caption: 'x'.repeat(2201) },
    { itemId: 'ok', quando: '2026-09-14 19:00' },
  ])
  expect(v.problemas).toEqual([])
  expect(v.itens?.map((i) => [i.item.itemId, i.falha?.codigo ?? null])).toEqual([
    ['vazio', 'DATA_INVALIDA'],
    ['espacos', 'DATA_INVALIDA'],
    ['ilegivel', 'DATA_INVALIDA'],
    ['campanha', 'PEDIDO_INVALIDO'],
    ['legenda', 'PEDIDO_INVALIDO'],
    ['ok', null],
  ])
})

describe('decidirItemDoPlano (C12-1)', () => {
  const base = { itemDePlanoId: 'item-1', pecaId: 'g1', postQueSeraLigado: null as string | null }
  const d = (item: Parameters<typeof decidirItemDoPlano>[0]['item'], extra: Partial<typeof base> = {}) => decidirItemDoPlano({ ...base, ...extra, item })

  it('só passa item PRONTO que aponta ESTA peça, ou agendado com o mesmo post; peça sem item não confere nada', () => {
    expect(decidirItemDoPlano({ ...base, itemDePlanoId: null, item: null })).toBeNull()
    expect(d({ status: 'pronto', generationId: 'g1', postId: null })).toBeNull()
    expect(d({ status: 'agendado', generationId: 'g1', postId: 'p1' }, { postQueSeraLigado: 'p1' })).toBeNull()
    expect(d({ status: 'agendado', generationId: 'g1', postId: 'p1' })).toMatchObject({ codigo: 'ITEM_DO_PLANO_JA_AGENDADO' })
  })

  it('reprovado, reaberto, refeito ou em voo com a refação é PECA_SUPERADA_NO_PLANO; item sumido é ITEM_DO_PLANO_AUSENTE', () => {
    expect(d(null)).toMatchObject({ codigo: 'ITEM_DO_PLANO_AUSENTE' })
    for (const status of ['reprovado', 'editado', 'aprovado', 'proposto', 'erro']) {
      expect(d({ status, generationId: 'g1', postId: null })).toMatchObject({ codigo: 'PECA_SUPERADA_NO_PLANO' })
    }
    expect(d({ status: 'pronto', generationId: 'g2', postId: null })).toMatchObject({ codigo: 'PECA_SUPERADA_NO_PLANO' })
    expect(d({ status: 'na-fila', generationId: 'g2', postId: null })).toMatchObject({ codigo: 'PECA_SUPERADA_NO_PLANO' })
    expect(d({ status: 'reprovado', generationId: 'g1', postId: null })?.motivo).toContain('reprovada')
  })

  it('C12-1x1: em voo com ESTA peça é pendente (a fila ainda não reapontou o item), em voo com outra continua superada', () => {
    for (const status of ['na-fila', 'gerando']) {
      expect(d({ status, generationId: 'g1', postId: null })).toMatchObject({ codigo: 'ITEM_DO_PLANO_EM_VOO', pendente: true })
      expect(d({ status, generationId: 'g2', postId: null })).toMatchObject({ codigo: 'PECA_SUPERADA_NO_PLANO' })
      expect(d({ status, generationId: 'g2', postId: null })?.pendente).toBeUndefined()
    }
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
  const pagina = { width: 1080, height: 1920, background: null, layers: camadas }
  const base = {
    thumbnail: 'https://x.public.blob.vercel-storage.com/p.png',
    resultUrl: 'https://x.public.blob.vercel-storage.com/p.png',
    pagina,
    versaoRenderizada: versaoDaPagina(pagina),
  }

  it('é atual quando o thumbnail é a peça e a página está na versão que o PNG desenhou (camadas inclusive dupla-codificadas)', () => {
    expect(thumbnailEhAtual(base)).toBe(true)
    expect(thumbnailEhAtual({ ...base, pagina: { ...pagina, layers: JSON.stringify(JSON.stringify(camadas)) } })).toBe(true)
  })

  it('não é atual com PNG de outra arte, camada editada depois, sem a versão gravada, thumbnail base64 ou página ilegível', () => {
    expect(thumbnailEhAtual({ ...base, resultUrl: 'https://x.public.blob.vercel-storage.com/outra.png' })).toBe(false)
    expect(thumbnailEhAtual({ ...base, pagina: { ...pagina, layers: [{ ...camadas[0], content: 'Editada' }] } })).toBe(false)
    expect(thumbnailEhAtual({ ...base, versaoRenderizada: undefined })).toBe(false)
    expect(thumbnailEhAtual({ ...base, thumbnail: 'data:image/jpeg;base64,xx' })).toBe(false)
    expect(thumbnailEhAtual({ ...base, pagina: { ...pagina, layers: '{ilegível' } })).toBe(false)
  })

  it('R12-01 — dimensões e fundo são a versão também: só a largura, só a altura ou só o fundo mudados não servem', () => {
    expect(thumbnailEhAtual({ ...base, pagina: { ...pagina, width: 1000 } })).toBe(false)
    expect(thumbnailEhAtual({ ...base, pagina: { ...pagina, height: 1350 } })).toBe(false)
    expect(thumbnailEhAtual({ ...base, pagina: { ...pagina, background: '#ffffff' } })).toBe(false)
  })
})

it('resumirAgendamento conta por situação', () => {
  expect(resumirAgendamento([{ situacao: 'concluido' }, { situacao: 'falhou' }, { situacao: 'pendente' }, { situacao: 'concluido' }])).toEqual({ concluidos: 2, pendentes: 1, falhas: 1 })
})

describe('decisões do Ciro (13/09/2026): rascunho apagado pela equipe e peça superada no plano', () => {
  const ligado = { postId: 'post-1', hashDoAgendamento: 'h1', efeitosDoAgendamentoEm: new Date() }
  const pronta = { status: 'COMPLETED', pageId: 'p1', slide: false }
  const apagado = (extra: Partial<Parameters<typeof decidirAgendamento>[0]> = {}) =>
    decidirAgendamento({ registro: ligado, postLigadoExiste: false, pedido: { hash: 'h1' }, peca: pronta, pagina: { ehModelo: false }, ...extra })

  it('post apagado: sem a confirmação AVISA e não recria; só o booleano true recria, e só com o pedido original', () => {
    const aviso = apagado()
    expect(aviso).toMatchObject({ acao: 'falhar', codigo: 'POST_REMOVIDO' })
    expect((aviso as { motivo: string }).motivo).toContain('pergunte')
    expect((aviso as { motivo: string }).motivo).toContain('recriarRascunhoApagado: true')
    for (const quase of [false, 'true', 1, 'sim', null, undefined]) expect(apagado({ recriarApagado: quase })).toMatchObject({ codigo: 'POST_REMOVIDO' })
    expect(apagado({ recriarApagado: true })).toEqual({ acao: 'recriar', postApagado: 'post-1' })
    expect(apagado({ recriarApagado: true, pedido: { hash: 'h2' } })).toMatchObject({ acao: 'falhar', codigo: 'LOTE_AGENDAMENTO_CONFLITO' })
    expect(apagado({ recriarApagado: true, pedido: { falha: { codigo: 'SEM_HORARIO', motivo: 'x' } } })).toMatchObject({ acao: 'falhar', codigo: 'SEM_HORARIO' })
    // Post vivo: a confirmação não muda nada.
    expect(apagado({ postLigadoExiste: true, recriarApagado: true })).toEqual({ acao: 'reaproveitar', efeitosPendentes: false })
  })

  it('a confirmação é do ITEM e fica fora do hash; valor que não é booleano falha só aquele item', () => {
    const v = validarAgendamentoDoLote('l', [{ itemId: 'a', recriarRascunhoApagado: true }, { itemId: 'b', recriarRascunhoApagado: 'true' }])
    expect(v.problemas).toEqual([])
    expect(v.itens?.map((i) => [i.item.itemId, i.falha?.codigo ?? null])).toEqual([['a', null], ['b', 'PEDIDO_INVALIDO']])
    const base = { quandoDaSpec: '2026-09-14 19:00', formato: 'story' as const }
    expect(hashDoAgendamento(pedidoDe(pedidoDoAgendamento({ itemId: 'a', recriarRascunhoApagado: true }, base)))).toBe(hashDoAgendamento(pedidoDe(pedidoDoAgendamento({ itemId: 'a' }, base))))
  })

  it('recriando: o item agendado que ainda aponta o post APAGADO passa; sem recriar, ou agendado com outro post, continua recusado', () => {
    const base = { itemDePlanoId: 'item-1', pecaId: 'g1', postQueSeraLigado: null }
    expect(decidirItemDoPlano({ ...base, item: { status: 'agendado', generationId: 'g1', postId: 'post-apagado' }, postApagado: 'post-apagado' })).toBeNull()
    expect(decidirItemDoPlano({ ...base, item: { status: 'agendado', generationId: 'g1', postId: 'post-apagado' } })).toMatchObject({ codigo: 'ITEM_DO_PLANO_JA_AGENDADO' })
    expect(decidirItemDoPlano({ ...base, item: { status: 'agendado', generationId: 'g1', postId: 'outro' }, postApagado: 'post-apagado' })).toMatchObject({ codigo: 'ITEM_DO_PLANO_JA_AGENDADO' })
  })

  it('peça superada: com arte mais recente no item a falha diz QUAL (superadaPor) e manda perguntar; sem arte nenhuma no item não inventa uma', () => {
    const base = { itemDePlanoId: 'item-1', pecaId: 'g1', postQueSeraLigado: null }
    for (const status of ['pronto', 'na-fila', 'gerando', 'agendado']) {
      const mais = decidirItemDoPlano({ ...base, item: { status, generationId: 'g2', postId: null } })
      expect(mais).toMatchObject({ codigo: 'PECA_SUPERADA_NO_PLANO', superadaPor: 'g2' })
      expect(mais?.motivo).toContain('pergunte')
      expect(mais?.motivo).toContain('ver-plano')
    }
    const sem = decidirItemDoPlano({ ...base, item: { status: 'editado', generationId: null, postId: null } })
    expect(sem).toMatchObject({ codigo: 'PECA_SUPERADA_NO_PLANO' })
    expect(sem?.superadaPor).toBeUndefined()
  })

  it('mancheteDaSpec (blocos ou contrato, sem os colchetes de destaque) e descreverRascunhoApagado (horário em Brasília, só do pedido ORIGINAL)', () => {
    expect(mancheteDaSpec({ blocos: [{ papel: 'pre', linhas: ['Hoje'] }, { papel: 'headline', linhas: ['Rodízio', 'em [dobro]'] }] })).toBe('Rodízio em dobro')
    expect(mancheteDaSpec({ copyAutoral: { blocos: [{ funcao: 'headline', linhas: ['Costela no bafo'] }] } })).toBe('Costela no bafo')
    expect(mancheteDaSpec({})).toBeNull()
    expect(mancheteDaSpec(null)).toBeNull()
    const pedido = pedidoDe(pedidoDoAgendamento({ itemId: 'a' }, { quandoDaSpec: '2026-09-14 19:00', formato: 'story' }))
    const original = hashDoAgendamento(pedido)
    expect(descreverRascunhoApagado({ pedido, hashDoOriginal: original, tema: ' Rodízio ', manchete: 'Rodízio em dobro' })).toEqual({ quando: '14/09/2026, 19:00', tema: 'Rodízio', manchete: 'Rodízio em dobro' })
    // R12-05: o pedido desta chamada que NÃO é o original não prova o horário do rascunho apagado — nem cai no da spec.
    const outro = pedidoDe(pedidoDoAgendamento({ itemId: 'a', quando: '2026-09-14 21:00' }, { quandoDaSpec: '2026-09-14 19:00', formato: 'story' }))
    expect(descreverRascunhoApagado({ pedido: outro, hashDoOriginal: original, tema: 'Rodízio', manchete: null })).toEqual({ quando: null, tema: 'Rodízio', manchete: null })
    expect(descreverRascunhoApagado({ pedido: null, hashDoOriginal: original, tema: null, manchete: null })).toEqual({ quando: null, tema: null, manchete: null })
    expect(descreverRascunhoApagado({ pedido, hashDoOriginal: null, tema: '', manchete: null })).toEqual({ quando: null, tema: null, manchete: null })
  })
})

describe('peça que não serve, pedido de item de plano já superado (a linha 4a da tabela do plano)', () => {
  it('é superada EXATAMENTE quando a compor-leva repetida recusaria o pedido como superado — o espaço inteiro da tabela do plano, fora a linha 3', () => {
    const pares = new Set<string>()
    let comparadas = 0
    for (const status of STATUS_DO_ITEM) for (const peca of ESTADOS_DA_PECA_DO_ITEM) for (const ficha of FICHAS_DO_ITEM)
      for (const pedido of CONFRONTOS) for (const projeto of CONFRONTOS_DO_PROJETO) for (const revisao of CONFRONTOS) for (const chamada of REVISOES_DA_CHAMADA) {
        const tabela = decidirNoItemDoPlano({ status, ficha, peca, pedido, projeto, revisao, chamada })
        // A linha 3 é a compor-leva REAPROVEITANDO a arte do item porque ela é este
        // mesmo pedido: o agendamento não compara pedidos (simplificação declarada
        // em superadaNoPlanoSemPeca), então esse ramo fica fora da paridade.
        if (tabela.acao === 'reaproveitar') continue
        comparadas++
        const aqui = superadaNoPlanoSemPeca({ item: { status, generationId: 'g-atual', postId: null }, pecaDoItem: peca })
        const naTabela = tabela.acao === 'recusar' && tabela.motivo === 'superada'
        expect([status, peca, ficha, pedido, projeto, revisao, chamada, !!aqui]).toEqual([status, peca, ficha, pedido, projeto, revisao, chamada, naTabela])
        if (aqui) {
          pares.add(`${status}|${peca}`)
          expect(aqui).toEqual({ codigo: 'PECA_SUPERADA_NO_PLANO', superadaPor: 'g-atual', motivo: MOTIVO_ARTE_MAIS_NOVA })
        }
      }
    expect(comparadas).toBeGreaterThan(20000)
    // pronto, agendado, na-fila e gerando × viva e pronta.
    expect([...pares].sort()).toEqual(['agendado|pronta', 'agendado|viva', 'gerando|pronta', 'gerando|viva', 'na-fila|pronta', 'na-fila|viva', 'pronto|pronta', 'pronto|viva'])
  })

  it('sem item, sem arte no item, ou com status desconhecido: não é superada (vale a resposta da própria peça)', () => {
    expect(superadaNoPlanoSemPeca({ item: null, pecaDoItem: 'pronta' })).toBeNull()
    expect(superadaNoPlanoSemPeca({ item: { status: 'pronto', generationId: null, postId: null }, pecaDoItem: 'pronta' })).toBeNull()
    expect(superadaNoPlanoSemPeca({ item: { status: 'arquivado', generationId: 'g', postId: null }, pecaDoItem: 'pronta' })).toBeNull()
  })
})
