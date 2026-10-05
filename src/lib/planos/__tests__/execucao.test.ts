/**
 * O contrato puro da execução de um plano (F3, fatia A2).
 *
 * O que está aqui é o que dá para conferir sem banco: a conta que o gate de
 * crédito mostra, o casamento da copy com os campos do modelo, a trilha que
 * cada item de IA pede, o orçamento de tempo e a leitura da reconciliação.
 */

import { describe, it, expect } from 'vitest'
import {
  ORCAMENTO_DE_RENDER_MS,
  cabeMaisUmRender,
  calcularConta,
  caminhoAte,
  decidirGeracao,
  ehRecusa,
  itemExecutavel,
  mapearContratoParaCampos,
  mapearCopyParaSlots,
  papelDoCampo,
  motivoDeNaoExecutar,
  situacaoPelaArte,
} from '../execucao'

describe('calcularConta', () => {
  const itens = [
    { id: 'a', via: 'ia' as const },
    { id: 'b', via: 'ia' as const },
    { id: 'c', via: 'template' as const },
    { id: 'd', via: 'template' as const },
    { id: 'e', via: 'template' as const },
  ]

  it('cobra só o que nasce de IA — modelo do cliente não gasta imagem', () => {
    const conta = calcularConta({ itens, custoUnitario: 4, saldo: 100 })
    expect(conta.total).toBe(5)
    expect(conta.porIA).toBe(2)
    expect(conta.porModelo).toBe(3)
    expect(conta.creditos).toBe(8)
    expect(conta.saldoSuficiente).toBe(true)
    expect(conta.faltam).toBe(0)
    expect(conta.resumo).toContain('2 artes pela IA')
    expect(conta.resumo).toContain('sem custo')
    expect(conta.resumo).toContain('Saldo hoje: 100 créditos')
  })

  it('leva inteira por modelo diz, com todas as letras, que não gasta nada', () => {
    const conta = calcularConta({
      itens: itens.filter((i) => i.via === 'template'),
      custoUnitario: 4,
      saldo: 0,
    })
    expect(conta.creditos).toBe(0)
    expect(conta.resumo).toContain('não gasta crédito nenhum')
    // Saldo zero com custo zero é suficiente — não pode virar aviso de falta.
    expect(conta.saldoSuficiente).toBe(true)
    expect(conta.faltam).toBe(0)
  })

  it('saldo insuficiente INFORMA quanto falta, sem explodir', () => {
    const conta = calcularConta({ itens, custoUnitario: 6, saldo: 5 })
    expect(conta.creditos).toBe(12)
    expect(conta.saldoSuficiente).toBe(false)
    expect(conta.faltam).toBe(7)
    expect(conta.resumo).toContain('faltam 7')
  })

  it('saldo que não deu para ler não vira zero — vira "não sei"', () => {
    const conta = calcularConta({ itens, custoUnitario: 4, saldo: null })
    // Zerar seria pior que não saber: a conta diria "faltam 8" sem base.
    expect(conta.saldoSuficiente).toBeNull()
    expect(conta.faltam).toBe(0)
    expect(conta.resumo).toContain('Não consegui ler o saldo')
  })

  it('leva vazia não inventa frase', () => {
    const conta = calcularConta({ itens: [], custoUnitario: 4, saldo: 10 })
    expect(conta.total).toBe(0)
    expect(conta.creditos).toBe(0)
    expect(conta.resumo).toBe('Nenhum item para produzir.')
  })

  it('custo unitário estranho vira zero em vez de NaN na conta', () => {
    const conta = calcularConta({ itens, custoUnitario: Number.NaN, saldo: 10 })
    expect(conta.creditos).toBe(0)
    expect(Number.isNaN(conta.creditos)).toBe(false)
  })
})

describe('mapearCopyParaSlots', () => {
  const campos = [
    { layerId: 'l1', name: 'Título' },
    { layerId: 'l2', name: 'Apoio' },
    { layerId: 'l3', name: 'Rodapé' },
  ]

  it('casa posicionalmente, chaveando pelo id da camada', () => {
    const { slotValues, avisos } = mapearCopyParaSlots(campos, ['ALMOÇO', 'de terça a sexta', 'peça já'])
    expect(slotValues).toEqual({ l1: 'ALMOÇO', l2: 'de terça a sexta', l3: 'peça já' })
    expect(avisos).toEqual([])
  })

  it('copy sobrando preenche o que cabe e AVISA — nunca derruba o item', () => {
    const { slotValues, avisos } = mapearCopyParaSlots(campos, ['a', 'b', 'c', 'd', 'e'])
    expect(Object.keys(slotValues)).toHaveLength(3)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('sobraram')
    expect(avisos[0]).toContain('"d"')
  })

  it('campo sobrando é OCULTADO — placeholder do modelo não vira conteúdo', () => {
    const { slotValues, ocultar, avisos } = mapearCopyParaSlots(campos, ['só a headline'])
    expect(slotValues).toEqual({ l1: 'só a headline' })
    expect(ocultar).toEqual(['l2', 'l3'])
    expect(avisos[0]).toContain('"Apoio"')
    expect(avisos[0]).toContain('"Rodapé"')
    expect(avisos[0]).toContain('ocultos')
  })

  it('item sem texto nenhum NÃO oculta nada — o texto do modelo é o único conteúdo', () => {
    const { ocultar } = mapearCopyParaSlots(campos, [])
    expect(ocultar).toEqual([])
  })

  it('bloco vazio ou em branco não ocupa campo', () => {
    const { slotValues } = mapearCopyParaSlots(campos, ['  ', 'vale', ''])
    expect(slotValues).toEqual({ l1: 'vale' })
  })

  it('item sem texto sai com o do modelo, com aviso', () => {
    const { slotValues, avisos } = mapearCopyParaSlots(campos, [])
    expect(slotValues).toEqual({})
    expect(avisos[0]).toContain('não tem texto próprio')
  })

  it('modelo sem campo de texto avisa que a copy não entrou', () => {
    const { slotValues, avisos } = mapearCopyParaSlots([], ['ALMOÇO', 'hoje'])
    expect(slotValues).toEqual({})
    expect(avisos[0]).toContain('não tem campo de texto')
  })

  it('camada sem id é descartada — a chave precisa ser inequívoca', () => {
    const { slotValues } = mapearCopyParaSlots(
      [{ layerId: '', name: 'fantasma' }, { layerId: 'l9', name: 'Título' }],
      ['ALMOÇO'],
    )
    expect(slotValues).toEqual({ l9: 'ALMOÇO' })
  })
})

describe('mapearContratoParaCampos (F1 — o contrato casa por PAPEL, nunca por posição)', () => {
  const contrato = {
    versao: 'copy-autoral-v1' as const,
    origem: { autor: 'claude' as const, superficie: 'chat' },
    blocos: [
      { id: 'headline', funcao: 'headline' as const, ordem: 0, linhas: ['Milk-shake', 'vem [em dobro]'] },
      { id: 'cta', funcao: 'cta' as const, ordem: 1, linhas: ['Vem pra cá'] },
      { id: 'servico', funcao: 'servico' as const, ordem: 2, linhas: ['Seg a sáb · 11h às 22h'] },
    ],
    revisoes: [],
  }
  it('lê o papel do campo pelo declarado ou pelo NOME; nome que não diz nada é null', () => {
    expect(papelDoCampo({ layerId: 'a', papel: 'servico' })).toBe('servico')
    expect(papelDoCampo({ layerId: 'a', name: 'Pré-título' })).toBe('pre')
    expect(papelDoCampo({ layerId: 'a', name: 'Título' })).toBe('headline')
    expect(papelDoCampo({ layerId: 'a', name: 'Subtítulo' })).toBe('apoio')
    expect(papelDoCampo({ layerId: 'a', name: 'Chamada' })).toBe('cta')
    expect(papelDoCampo({ layerId: 'a', name: 'Horário' })).toBe('servico')
    expect(papelDoCampo({ layerId: 'a', name: 'Texto 3' })).toBeNull()
  })
  it('casa por papel mesmo com os campos em OUTRA ordem, tira os [colchetes], preserva a quebra e carimba papel e bloco no slot', () => {
    const campos = [{ layerId: 'l-cta', name: 'Chamada' }, { layerId: 'l-h', name: 'Título' }, { layerId: 'l-s', papel: 'servico' }]
    const m = mapearContratoParaCampos(campos, contrato)
    expect(m.slotValues).toEqual({
      'l-h': { content: 'Milk-shake\nvem em dobro', bloco: 'headline', papel: 'headline' },
      'l-cta': { content: 'Vem pra cá', bloco: 'cta', papel: 'cta' },
      'l-s': { content: 'Seg a sáb · 11h às 22h', bloco: 'servico', papel: 'servico' },
    })
    expect(m.vinculos.map((v) => [v.blocoId, v.layerId, v.por])).toEqual([['headline', 'l-h', 'papel'], ['cta', 'l-cta', 'papel'], ['servico', 'l-s', 'papel']])
    expect(m.ocultar).toEqual([])
    expect(m.avisos).toEqual([])
    expect(m.semCampo).toEqual([])
  })
  it('bloco sem campo do seu papel vai para um campo SEM papel reconhecido (declarado como posição); campo de outro papel nunca o recebe', () => {
    const campos = [{ layerId: 'l-h', name: 'Título' }, { layerId: 'l-x', name: 'Texto 2' }, { layerId: 'l-pre', name: 'Pré-título' }]
    const m = mapearContratoParaCampos(campos, contrato)
    expect(Object.keys(m.slotValues).sort()).toEqual(['l-h', 'l-x'])
    expect(m.vinculos.find((v) => v.blocoId === 'cta')).toEqual({ blocoId: 'cta', layerId: 'l-x', por: 'posicao' })
    // o serviço não tem campo nem vaga sem papel: fica DECLARADO, não some
    expect(m.semCampo).toEqual(['servico'])
    expect(m.avisos.some((a) => a.includes('por posição'))).toBe(true)
    expect(m.avisos.some((a) => a.includes('não tem campo para 1 bloco') && a.includes('Seg a sáb'))).toBe(true)
    // o Pré-título ficou sem copy: OCULTO, como sempre
    expect(m.ocultar).toEqual(['l-pre'])
  })
  it('bloco VAZIO de propósito não ocupa campo; contrato sem texto deixa o modelo como está, com aviso', () => {
    const vazio = { ...contrato, blocos: [{ id: 'headline', funcao: 'headline' as const, ordem: 0, linhas: [] }] }
    const m = mapearContratoParaCampos([{ layerId: 'l-h', name: 'Título' }], vazio)
    expect(m.slotValues).toEqual({})
    expect(m.ocultar).toEqual([])
    expect(m.avisos[0]).toMatch(/não tem texto próprio/)
  })
  it('modelo sem campo de texto: tudo em semCampo, com aviso', () => {
    const m = mapearContratoParaCampos([], contrato)
    expect(m.semCampo).toEqual(['headline', 'cta', 'servico'])
    expect(m.avisos[0]).toMatch(/não tem campo de texto/)
  })
})

describe('decidirGeracao', () => {
  it('com copy e foto vai para a trilha da PEÇA, com a foto como cena', () => {
    const r = decidirGeracao({ tema: 'happy hour', copyProposta: ['HAPPY HOUR'], fotoDriveId: 'abc' })
    expect(ehRecusa(r)).toBe(false)
    if (ehRecusa(r)) return
    expect(r.trilha).toBe('arte')
    expect(r.copy).toEqual(['HAPPY HOUR'])
    expect(r.papelDaFoto).toBe('subject')
  })

  it('com copy e SEM foto é recusado aqui, não lá na frente', () => {
    const r = decidirGeracao({ tema: 'happy hour', copyProposta: ['HAPPY HOUR'] })
    expect(ehRecusa(r)).toBe(true)
    if (!ehRecusa(r)) return
    expect(r.motivo).toContain('foto real')
  })

  it('sem copy vira cena SEM texto, descrita pelo tema', () => {
    const r = decidirGeracao({ tema: 'salão no fim da tarde', copyProposta: [] })
    expect(ehRecusa(r)).toBe(false)
    if (ehRecusa(r)) return
    expect(r.trilha).toBe('imagem')
    expect(r.pedido).toBe('salão no fim da tarde')
    expect(r.papelDaFoto).toBe('anchor-ambient')
  })

  it('sem copy e sem tema não tem o que pedir à IA', () => {
    const r = decidirGeracao({ tema: '   ', copyProposta: [] })
    expect(ehRecusa(r)).toBe(true)
  })

  it('bloco em branco não conta como copy', () => {
    const r = decidirGeracao({ tema: 'ambiente', copyProposta: ['', '   '] })
    expect(ehRecusa(r)).toBe(false)
    if (ehRecusa(r)) return
    expect(r.trilha).toBe('imagem')
  })

  // 23/08/2026: a direção gravada no item é o pedido; o tema é só o assunto.
  // Até então o NOME DO TEMA ia ao modelo ("Atendimento com IA e CRM") e a
  // direção escrita na bancada morria no navegador.
  it('a direção adicional vence o tema como pedido, e leva o ajuste da foto e o cliente citado', () => {
    const r = decidirGeracao({
      tema: 'Atendimento com IA e CRM',
      copyProposta: ['Empório responde em menos de um minuto'],
      fotoDriveId: 'print',
      direcao: 'o print entra como mockup de celular sobre fundo preto, fiel e legível',
      ajusteDaFoto: '  escurecer o fundo atrás do texto ',
      clienteProjectId: 12,
    })
    expect(ehRecusa(r)).toBe(false)
    if (ehRecusa(r)) return
    expect(r.pedido).toBe('o print entra como mockup de celular sobre fundo preto, fiel e legível')
    expect(r.instrucaoImagem).toBe('escurecer o fundo atrás do texto')
    expect(r.marcaDoClienteProjectId).toBe(12)
  })

  it('sem direção o pedido continua sendo o tema, e cliente inválido vira nulo', () => {
    const r = decidirGeracao({
      tema: 'happy hour',
      copyProposta: ['HAPPY HOUR'],
      fotoDriveId: 'abc',
      direcao: '   ',
      clienteProjectId: 0,
    })
    expect(ehRecusa(r)).toBe(false)
    if (ehRecusa(r)) return
    expect(r.pedido).toBe('happy hour')
    expect(r.instrucaoImagem).toBeNull()
    expect(r.marcaDoClienteProjectId).toBeNull()
  })

  it('a trilha imagem nunca leva ajuste de foto nem marca do cliente — ela É a fotografia', () => {
    const r = decidirGeracao({ tema: 'salão', copyProposta: [], ajusteDaFoto: 'x', clienteProjectId: 3 })
    expect(ehRecusa(r)).toBe(false)
    if (ehRecusa(r)) return
    expect(r.trilha).toBe('imagem')
    expect(r.instrucaoImagem).toBeNull()
    expect(r.marcaDoClienteProjectId).toBeNull()
  })
})

describe('situacaoPelaArte', () => {
  const ARQUIVO = 'https://blob/peca.png'

  it('arte pronta — COMPLETED COM arquivo — leva o item em voo para "pronto"', () => {
    expect(situacaoPelaArte('na-fila', 'COMPLETED', ARQUIVO)).toBe('pronto')
    expect(situacaoPelaArte('gerando', 'COMPLETED', ARQUIVO)).toBe('pronto')
  })

  // Varredura do PR11-F02: antes, o status bastava — COMPLETED sem `resultUrl` virava
  // "pronto" e prendia o item (o lote recusa item pronto com `avancou`). Depois: "erro".
  it('arte COMPLETED SEM arquivo não é pronta: leva o item em voo para "erro"', () => {
    expect(situacaoPelaArte('na-fila', 'COMPLETED', null)).toBe('erro')
    expect(situacaoPelaArte('gerando', 'COMPLETED', null)).toBe('erro')
    expect(situacaoPelaArte('gerando', 'COMPLETED', '')).toBe('erro')
  })

  it('arte em produção move da fila para "gerando", e não mexe em quem já está lá', () => {
    expect(situacaoPelaArte('na-fila', 'PROCESSING', null)).toBe('gerando')
    expect(situacaoPelaArte('gerando', 'PROCESSING', null)).toBeNull()
  })

  it('arte falha leva para "erro"', () => {
    expect(situacaoPelaArte('na-fila', 'FAILED', null)).toBe('erro')
  })

  it('arte que sumiu não move nada — apagar da galeria não é falhar', () => {
    expect(situacaoPelaArte('na-fila', null, null)).toBeNull()
  })

  it('item que não está em voo é intocado, qualquer que seja a arte — inclusive sem arquivo ("agendado" é terminal)', () => {
    expect(situacaoPelaArte('pronto', 'FAILED', null)).toBeNull()
    expect(situacaoPelaArte('agendado', 'COMPLETED', ARQUIVO)).toBeNull()
    expect(situacaoPelaArte('proposto', 'COMPLETED', ARQUIVO)).toBeNull()
    expect(situacaoPelaArte('agendado', 'COMPLETED', null)).toBeNull()
    expect(situacaoPelaArte('pronto', 'COMPLETED', null)).toBeNull()
  })
})

describe('caminhoAte', () => {
  it('🔴 na-fila → pronto passa por "gerando": a tabela não tem atalho', () => {
    expect(caminhoAte('na-fila', 'pronto')).toEqual(['gerando', 'pronto'])
  })

  it('transição direta é um passo só', () => {
    expect(caminhoAte('na-fila', 'erro')).toEqual(['erro'])
    expect(caminhoAte('proposto', 'na-fila')).toEqual(['na-fila'])
  })

  it('já estar no destino é caminho vazio, não erro', () => {
    expect(caminhoAte('pronto', 'pronto')).toEqual([])
  })

  it('do começo até a arte pronta o caminho existe e é inteiro', () => {
    const passos = caminhoAte('proposto', 'pronto')
    expect(passos).not.toBeNull()
    expect(passos?.[passos.length - 1]).toBe('pronto')
    // Cada passo do caminho tem de ser uma transição legítima do anterior.
    const percurso = ['proposto', ...(passos ?? [])]
    for (let i = 1; i < percurso.length; i++) {
      expect(caminhoAte(percurso[i - 1] as never, percurso[i] as never)).toEqual([percurso[i]])
    }
  })

  it('agendado é terminal: não há caminho de volta', () => {
    expect(caminhoAte('agendado', 'editado')).toBeNull()
    expect(caminhoAte('agendado', 'pronto')).toBeNull()
  })
})

describe('orçamento de tempo', () => {
  it('para de pegar trabalho ao encostar no teto', () => {
    expect(cabeMaisUmRender(0)).toBe(true)
    expect(cabeMaisUmRender(ORCAMENTO_DE_RENDER_MS - 1)).toBe(true)
    expect(cabeMaisUmRender(ORCAMENTO_DE_RENDER_MS)).toBe(false)
    expect(cabeMaisUmRender(ORCAMENTO_DE_RENDER_MS + 60_000)).toBe(false)
  })

  it('o teto cabe no maxDuration da rota do MCP, com folga para o render em voo', () => {
    expect(ORCAMENTO_DE_RENDER_MS).toBeLessThan(300_000)
    expect(300_000 - ORCAMENTO_DE_RENDER_MS).toBeGreaterThanOrEqual(60_000)
  })

  it('orçamento encurtado (teste) é respeitado', () => {
    expect(cabeMaisUmRender(500, 400)).toBe(false)
  })
})

describe('elegibilidade', () => {
  it('produz o que ainda não virou arte', () => {
    expect(itemExecutavel('proposto')).toBe(true)
    expect(itemExecutavel('editado')).toBe(true)
    expect(itemExecutavel('aprovado')).toBe(true)
    // Falhou é retentável — é o ponto de a falha ser estado e não beco.
    expect(itemExecutavel('erro')).toBe(true)
  })

  it('🔴 reprovado NÃO é produzido de novo às cegas', () => {
    expect(itemExecutavel('reprovado')).toBe(false)
    expect(motivoDeNaoExecutar('reprovado')).toContain('regenerar-item')
  })

  it('o que já está em voo ou pronto é pulado, com o motivo em português', () => {
    expect(itemExecutavel('na-fila')).toBe(false)
    expect(itemExecutavel('gerando')).toBe(false)
    expect(itemExecutavel('pronto')).toBe(false)
    expect(itemExecutavel('agendado')).toBe(false)
    expect(motivoDeNaoExecutar('agendado')).toContain('agenda')
    expect(motivoDeNaoExecutar('pronto')).toContain('pronta')
  })
})
