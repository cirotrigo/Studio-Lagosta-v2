import { describe, it, expect } from 'vitest'
import { copyDeCamadas, desfechoPeloDiff, diffDeCopy, semelhanca } from '../diff-copy'

const SUGERIDA = {
  titulo: 'HAPPY HOUR',
  subtitulo: 'Todas as quintas',
  rodape: 'A partir das 18h',
}

describe('diffDeCopy — comparação por campo', () => {
  it('igual em tudo: não mudou', () => {
    const d = diffDeCopy(SUGERIDA, { ...SUGERIDA })
    expect(d.mudou).toBe(false)
    expect(d.ilegivel).toBe(false)
    expect(d.iguais.sort()).toEqual(['rodape', 'subtitulo', 'titulo'])
    expect(d.proporcaoAlterada).toBe(0)
    expect(desfechoPeloDiff(d)).toBe('aceita-como-veio')
  })

  it('um campo reescrito aparece com antes e depois', () => {
    const d = diffDeCopy(SUGERIDA, { ...SUGERIDA, titulo: 'HAPPY HOUR DOBRADO' })
    expect(d.mudou).toBe(true)
    expect(d.alterados).toHaveLength(1)
    expect(d.alterados[0]).toMatchObject({
      campo: 'titulo',
      antes: 'HAPPY HOUR',
      depois: 'HAPPY HOUR DOBRADO',
      apenasFormatacao: false,
    })
    expect(d.proporcaoAlterada).toBeCloseTo(1 / 3, 5)
    expect(desfechoPeloDiff(d)).toBe('editada')
  })

  it('campo tirado e campo posto são coisas diferentes', () => {
    const d = diffDeCopy(SUGERIDA, { titulo: 'HAPPY HOUR', subtitulo: 'Todas as quintas', selo: 'NOVO' })
    expect(d.removidos).toEqual([{ campo: 'rodape', texto: 'A partir das 18h' }])
    expect(d.adicionados).toEqual([{ campo: 'selo', texto: 'NOVO' }])
    expect(d.alterados).toHaveLength(0)
  })

  // Caixa, acento e separador de lista somem na normalização da casa. É edição
  // de diagramação, e a F2 vai querer pesá-la diferente de uma reescrita.
  it('marca a edição que é só formatação', () => {
    const d = diffDeCopy({ titulo: 'Happy Hour · Quinta' }, { titulo: 'HAPPY HOUR   QUINTA' })
    expect(d.mudou).toBe(true)
    expect(d.alterados[0].apenasFormatacao).toBe(true)
  })

  it('ignora as chaves reservadas do slotValues', () => {
    const d = diffDeCopy(
      { titulo: 'A', _driveImageId: 'abc' },
      { titulo: 'A', _imageUrl: 'https://x/y.jpg' },
    )
    expect(d.mudou).toBe(false)
    expect(d.totalSugerido).toBe(1)
  })

  it('copy inteiramente substituída não é "editada", é "trocada"', () => {
    const d = diffDeCopy({ a: 'Peixe fresco todo dia' }, { b: 'Rodízio de carnes' })
    expect(d.iguais).toHaveLength(0)
    expect(d.alterados).toHaveLength(0)
    expect(desfechoPeloDiff(d)).toBe('trocada')
  })
})

describe('diffDeCopy — pareamento por conteúdo (extractExpectedTexts não tem chave)', () => {
  it('casa o que é idêntico e pareia o parecido', () => {
    const d = diffDeCopy(
      ['HAPPY HOUR', 'Todas as quintas', 'A partir das 18h'],
      { t1: 'HAPPY HOUR', t2: 'Todas as quintas e sextas', t3: 'A partir das 18h' },
    )
    expect(d.iguais.sort()).toEqual(['A partir das 18h', 'HAPPY HOUR'])
    expect(d.alterados).toHaveLength(1)
    expect(d.alterados[0]).toMatchObject({
      campo: null,
      antes: 'Todas as quintas',
      depois: 'Todas as quintas e sextas',
    })
    expect(d.adicionados).toHaveLength(0)
    expect(d.removidos).toHaveLength(0)
  })

  it('texto sem nenhuma semelhança vira removido + adicionado, não "alterado"', () => {
    const d = diffDeCopy(['Chopp em dobro'], ['Sobremesa por nossa conta'])
    expect(d.alterados).toHaveLength(0)
    expect(d.removidos).toEqual([{ campo: null, texto: 'Chopp em dobro' }])
    expect(d.adicionados).toEqual([{ campo: null, texto: 'Sobremesa por nossa conta' }])
  })

  it('texto repetido não é consumido duas vezes pelo mesmo par', () => {
    const d = diffDeCopy(['Igual', 'Igual'], ['Igual'])
    expect(d.iguais).toEqual(['Igual'])
    expect(d.removidos).toEqual([{ campo: null, texto: 'Igual' }])
  })
})

describe('diffDeCopy — o lado ilegível', () => {
  // O defeito que este módulo existe para evitar: página que ninguém consegue
  // ler NÃO pode virar "o usuário não editou nada".
  it('lado final ilegível: mudou=false MAS ilegivel=true e sem veredito', () => {
    const d = diffDeCopy(SUGERIDA, copyDeCamadas('isto não é json'))
    expect(d.ilegivel).toBe(true)
    expect(d.mudou).toBe(false)
    expect(desfechoPeloDiff(d)).toBeNull()
  })

  it('sem copy sugerida também é ilegível — não há o que comparar', () => {
    expect(diffDeCopy(null, { titulo: 'A' }).ilegivel).toBe(true)
    expect(desfechoPeloDiff(diffDeCopy(undefined, { titulo: 'A' }))).toBeNull()
  })
})

describe('copyDeCamadas', () => {
  const camadas = [
    { id: 'l1', name: 'titulo', type: 'text', content: 'HAPPY HOUR' },
    { id: 'l2', name: 'foto', type: 'image', fileUrl: 'https://x/y.jpg' },
  ]

  it('lê a página dupla-codificada — o caso que produziria o diff falso', () => {
    const duplo = JSON.stringify(JSON.stringify(camadas))
    expect(copyDeCamadas(duplo)).toEqual({ titulo: 'HAPPY HOUR' })

    // E o diff completo, ponta a ponta: a edição APARECE em vez de sumir.
    const d = diffDeCopy({ titulo: 'HAPPY HOUR DOBRADO' }, copyDeCamadas(duplo))
    expect(d.ilegivel).toBe(false)
    expect(d.mudou).toBe(true)
    expect(d.alterados[0].depois).toBe('HAPPY HOUR')
  })

  it('null no ilegível, {} na página sem texto', () => {
    expect(copyDeCamadas('quebrado')).toBeNull()
    expect(copyDeCamadas([{ id: 'l2', type: 'image' }])).toEqual({})
  })
})

describe('semelhanca', () => {
  it('1 para textos que só diferem em caixa/acento', () => {
    expect(semelhanca('Happy Hour', 'HAPPY HOUR')).toBe(1)
    expect(semelhanca('Almoço', 'ALMOCO')).toBe(1)
  })

  it('alta para edição pequena, baixa para texto trocado', () => {
    expect(semelhanca('Todas as quintas', 'Todas as quintas e sextas')).toBeGreaterThan(0.6)
    expect(semelhanca('Chopp em dobro', 'Sobremesa por nossa conta')).toBeLessThan(0.3)
  })
})
