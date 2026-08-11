import { describe, it, expect } from 'vitest'
import { limparTexto, MINIMO_DE_TEXTO, textoDoPost } from '@/lib/aprendizado/textos-do-post'

describe('limpeza', () => {
  it('tira a TAG de verificação de story — ela é a caption de 80% dos posts', () => {
    expect(limparTexto('\n\nSL-cmsm0e-3708')).toBe('')
    expect(limparTexto('Happy Hour hoje\n\nSL-cmsm0e-3708')).toBe('Happy Hour hoje')
  })

  it('tira hashtag, arroba e link', () => {
    expect(limparTexto('Venha hoje #winevix #vinho @winevix https://exemplo.com/x')).toBe('Venha hoje')
  })
})

describe('texto do post', () => {
  it('marca semTexto quando sobra só a tag', () => {
    const r = textoDoPost({ caption: '\n\nSL-cmsm0e-3708' })
    expect(r.semTexto).toBe(true)
    expect(r.texto).toBe('')
    expect(r.fontes).toEqual([])
  })

  it('junta caption e slotValues, sem repetir o que é igual', () => {
    const r = textoDoPost({
      caption: 'Happy Hour de segunda a sábado',
      slotValues: { titulo: 'Happy Hour de segunda a sábado', subtitulo: 'Chope e petiscos' },
    })
    expect(r.fontes).toEqual(['caption', 'slotValues'])
    expect(r.texto).toContain('Chope e petiscos')
    // A frase repetida entra uma vez só.
    expect(r.texto.match(/Happy Hour de segunda a sábado/g)?.length).toBe(1)
  })

  it('ignora as chaves internas do slotValues', () => {
    const r = textoDoPost({ slotValues: { _driveImageId: 'abc123', _imageUrl: 'https://x', titulo: 'Almoço executivo' } })
    expect(r.texto).toBe('Almoço executivo')
  })

  it('lê os campos de copy da Generation, mas NÃO o pedido de arte', () => {
    const r = textoDoPost({
      fieldValues: {
        textos: ['Rodízio aos domingos'],
        // `userRequest` é instrução de ARTE ("aumente o título"), não assunto.
        userRequest: 'deixe o título maior e mais escuro',
      },
    })
    expect(r.texto).toContain('Rodízio aos domingos')
    expect(r.texto).not.toContain('título maior')
  })

  it('aceita o assunto pedido na criação da arte', () => {
    const r = textoDoPost({ fieldValues: { pedido: 'Divulgar o festival italiano de agosto' } })
    expect(r.texto).toContain('festival italiano')
    expect(r.semTexto).toBe(false)
  })

  it('texto curto demais conta como sem texto', () => {
    expect(textoDoPost({ caption: 'a'.repeat(MINIMO_DE_TEXTO - 1) }).semTexto).toBe(true)
    expect(textoDoPost({ caption: 'a'.repeat(MINIMO_DE_TEXTO) }).semTexto).toBe(false)
  })
})
