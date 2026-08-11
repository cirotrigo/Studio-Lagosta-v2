import { describe, it, expect } from 'vitest'
import {
  decidirRender,
  descreverTroca,
  escolherIndice,
  montarNovasMidias,
  recusaDaTroca,
  textosDaGeneration,
} from '../troca-de-arte'

describe('recusaDaTroca', () => {
  it('rascunho limpo pode trocar a arte', () => {
    expect(recusaDaTroca({ status: 'DRAFT', laterPostId: null })).toBeNull()
  })

  /**
   * Mesma regra que `editarPost` já aplica à legenda: trocar a arte de um post
   * armado mudaria uma publicação real sem re-aprovação. A mensagem tem de
   * ensinar o caminho, senão quem está no chat fica sem saída.
   */
  it('post aprovado é recusado, e a mensagem manda voltar para rascunho', () => {
    const recusa = recusaDaTroca({ status: 'SCHEDULED', laterPostId: null })
    expect(recusa?.codigo).toBe('POST_APROVADO')
    expect(recusa?.mensagem).toContain('voltar-para-rascunho')
  })

  it('publicado, publicando e falhado também são recusados', () => {
    expect(recusaDaTroca({ status: 'POSTED', laterPostId: null })?.codigo).toBe('POST_JA_PUBLICADO')
    expect(recusaDaTroca({ status: 'POSTING', laterPostId: null })?.codigo).toBe('POST_SAINDO')
    expect(recusaDaTroca({ status: 'FAILED', laterPostId: null })?.codigo).toBe('POST_FALHOU')
  })

  /**
   * `laterPostId` não nulo é fato físico, não regra nossa: o que vai ao ar é a
   * cópia que está no publicador. Vem ANTES do guard de situação porque a
   * mensagem certa é a da janela de congelamento — mandar "volte para
   * rascunho" seria mandar a pessoa para uma porta que também está fechada.
   */
  it('post já entregue ao publicador é intocável, mesmo em rascunho', () => {
    const recusa = recusaDaTroca({ status: 'DRAFT', laterPostId: 'later_123' })
    expect(recusa?.codigo).toBe('POST_CONGELADO')
    expect(recusa?.mensagem).toContain('enviada para publicação')
  })
})

describe('escolherIndice', () => {
  it('sem índice, troca a primeira imagem', () => {
    expect(escolherIndice(['a', 'b', 'c'])).toEqual({ ok: true, indice: 0 })
  })

  it('aceita qualquer posição existente do carrossel', () => {
    expect(escolherIndice(['a', 'b', 'c'], 2)).toEqual({ ok: true, indice: 2 })
  })

  /**
   * O runner da melhoria faz CLAMP do índice (ele o recebe de uma tela). Aqui
   * não: quem pede "slide 5" de um carrossel de 3 está enganado sobre o post,
   * e trocar o slide 3 em silêncio esconderia o engano.
   */
  it('índice além do post é recusado, nunca ajustado para o último', () => {
    const r = escolherIndice(['a', 'b', 'c'], 5)
    expect(r.ok).toBe(false)
    expect(r.recusa?.codigo).toBe('INDICE_FORA_DO_POST')
    expect(r.recusa?.mensagem).toContain('0 a 2')
  })

  it('índice negativo ou quebrado é recusado', () => {
    expect(escolherIndice(['a'], -1).ok).toBe(false)
    expect(escolherIndice(['a'], 1.5).ok).toBe(false)
  })

  // Post sem arte nenhuma tem uma única posição possível: a primeira.
  it('post sem mídia aceita 0 e recusa 1', () => {
    expect(escolherIndice([], 0)).toEqual({ ok: true, indice: 0 })
    expect(escolherIndice([], 1).ok).toBe(false)
  })
})

describe('montarNovasMidias', () => {
  /**
   * O DEFEITO MAIS CARO DO REPOSITÓRIO, travado aqui: o runner da melhoria
   * gravava `mediaUrls: [nova]` e apagava os outros slides do carrossel, em
   * silêncio e sem volta.
   */
  it('carrossel de 3 continua com 3 — só a posição pedida muda', () => {
    const novas = montarNovasMidias(['a', 'b', 'c'], 1, 'nova')
    expect(novas).toEqual(['a', 'nova', 'c'])
    expect(novas).toHaveLength(3)
  })

  it('não muta a lista que recebeu', () => {
    const atuais = ['a', 'b']
    montarNovasMidias(atuais, 0, 'nova')
    expect(atuais).toEqual(['a', 'b'])
  })

  it('post sem mídia passa a ter a arte nova', () => {
    expect(montarNovasMidias([], 0, 'nova')).toEqual(['nova'])
  })
})

describe('decidirRender', () => {
  /**
   * Arte pronta que ficasse RENDERED seria sobrescrita em minutos pelo cron
   * `render-stories` e pela invalidação por edição de página.
   */
  it('arte da galeria é NOT_NEEDED e não prende o post a página nenhuma', () => {
    const d = decidirRender('galeria', 1)
    expect(d.renderStatus).toBe('NOT_NEEDED')
    expect(d.vinculaPagina).toBe(false)
  })

  it('arte de página em post de imagem única segue o re-render', () => {
    const d = decidirRender('pagina', 1)
    expect(d.renderStatus).toBe('RENDERED')
    expect(d.vinculaPagina).toBe(true)
  })

  /**
   * `renderPostArt` grava `mediaUrls: [url]` — uma lista de UM. Um carrossel
   * que ficasse no alcance do cron perderia os outros slides no primeiro
   * re-render, que é exatamente o desastre que este arquivo inteiro evita.
   */
  it('arte de página em CARROSSEL não pode ficar no alcance do re-render', () => {
    const d = decidirRender('pagina', 3)
    expect(d.renderStatus).toBe('NOT_NEEDED')
    expect(d.vinculaPagina).toBe(false)
    expect(d.motivo).toContain('carrossel')
  })
})

describe('textosDaGeneration', () => {
  it('lê os textos de slotValues, ignorando os campos reservados', () => {
    expect(
      textosDaGeneration({
        slotValues: { Titulo: ' Almoço executivo ', _driveImageId: 'abc', _imageUrl: 'http://x' },
      }),
    ).toEqual({ Titulo: 'Almoço executivo' })
  })

  it('aceita a forma de objeto com content', () => {
    expect(textosDaGeneration({ slotValues: { Titulo: { content: 'Chopp gelado' } } })).toEqual({
      Titulo: 'Chopp gelado',
    })
  })

  /**
   * `null` significa "não sei ler os textos desta arte", nunca "não tem" — o
   * serviço só apaga o `slotValues` do post quando a PÁGINA muda, porque slot
   * velho aplicado a página nova é pior que slot nenhum.
   */
  it('sem texto conhecido devolve null, não objeto vazio', () => {
    expect(textosDaGeneration(null)).toBeNull()
    expect(textosDaGeneration({})).toBeNull()
    expect(textosDaGeneration({ slotValues: { _imageUrl: 'http://x', vazio: '   ' } })).toBeNull()
    expect(textosDaGeneration({ slotValues: ['a', 'b'] })).toBeNull()
  })
})

describe('descreverTroca', () => {
  it('em carrossel, diz o que NÃO foi mexido', () => {
    expect(descreverTroca(1, 3)).toContain('imagem 2 de 3')
    expect(descreverTroca(1, 3)).toContain('outras 2')
  })

  it('em imagem única, não inventa carrossel', () => {
    expect(descreverTroca(0, 1)).toBe('Arte trocada.')
  })
})
