import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import { montarBloco } from '../blocos'
import type { EstiloDePapel } from '../assinatura'
import {
  corComOpacidade,
  destaqueDaCamada,
  estilosDoRichText,
  familiaMaisPesada,
  lerDestaques,
  linhasComColchetes,
  pesoPeloNome,
  semColchetes,
} from '../destaques'

describe('lerDestaques', () => {
  it('tira os colchetes e devolve os trechos em offsets da linha limpa', () => {
    const r = lerDestaques('Seu milk-shake vem [em dobro] esse sábado!')
    expect(r.texto).toBe('Seu milk-shake vem em dobro esse sábado!')
    expect(r.trechos).toEqual([{ inicio: 19, fim: 27 }])
    expect(r.texto.slice(19, 27)).toBe('em dobro')
    expect(r.problema).toBeNull()
  })

  it('aceita mais de um trecho e apara espaço na ponta do colchete', () => {
    const r = lerDestaques('[ Praia do Canto ] | [13h às 22h]')
    expect(r.texto).toBe(' Praia do Canto  | 13h às 22h')
    expect(r.trechos.map((t) => r.texto.slice(t.inicio, t.fim))).toEqual(['Praia do Canto', '13h às 22h'])
  })

  it('colchete sem par não lança: sai sem ele e com o problema descrito', () => {
    expect(lerDestaques('Vem [pro Real').problema).toMatch(/sem fechar/)
    expect(lerDestaques('Vem pro] Real').problema).toMatch(/sem ter sido aberto/)
    expect(lerDestaques('[a [b] c]').texto).toBe('a b c')
  })

  it('semColchetes é o que a IA e o template recebem', () => {
    expect(semColchetes('Terça é dia de [rodízio]')).toBe('Terça é dia de rodízio')
  })
})

describe('a família mais pesada', () => {
  const real = ['Branley GC', 'StageGrotesk Black', 'StageGrotesk Bold', 'StageGrotesk Light', 'StageGrotesk ExtraBold', 'StageGrotesk Medium', 'StageGrotesk Regular', 'StageGrotesk Thin']

  it('lê peso e itálico pelo nome', () => {
    expect(pesoPeloNome('StageGrotesk Thin')).toEqual({ raiz: 'stagegrotesk', peso: 100, italico: false })
    expect(pesoPeloNome('Metrisch BoldItalic')).toEqual({ raiz: 'metrisch', peso: 700, italico: true })
    expect(pesoPeloNome('Montserrat')).toEqual({ raiz: 'montserrat', peso: 400, italico: false })
    expect(pesoPeloNome('Barlow Condensed SemiBold')).toEqual({ raiz: 'barlow condensed', peso: 600, italico: false })
  })

  it('escolhe o que a equipe escolhia à mão', () => {
    // Real: laranja em StageGrotesk Medium sobre a Thin
    expect(familiaMaisPesada('StageGrotesk Thin', real)).toBe('StageGrotesk Medium')
    // Empório: TrajanPro Bold sobre a Regular
    expect(familiaMaisPesada('TrajanPro Regular', ['TrajanPro Bold', 'TrajanPro Regular'])).toBe('TrajanPro Bold')
    // TERO: Montserrat SemiBold sobre a Montserrat
    expect(familiaMaisPesada('Montserrat', ['Didot HTF B06 Bold', 'Montserrat', 'Montserrat SemiBold'])).toBe('Montserrat SemiBold')
  })

  it('sem versão mais pesada da mesma família, null — o destaque fica só na cor', () => {
    expect(familiaMaisPesada('Branley GC', real)).toBeNull()
    expect(familiaMaisPesada('PlayfairDisplay Italic', ['PlayfairDisplay Bold'])).toBeNull()
  })
})

describe('estilos do rich text', () => {
  it('cobre o conteúdo inteiro com a sombra e põe o destaque só no trecho', () => {
    const estilos = estilosDoRichText({
      conteudo: 'Seu milk-shake vem em dobro',
      trechos: [{ inicio: 19, fim: 27 }],
      destaque: { fill: '#EA5328', fontFamily: 'StageGrotesk Medium' },
      sombra: { color: '#283D36', blur: 10, offsetY: 1, opacity: 0.6 },
    })
    expect(estilos).toEqual([
      { start: 0, end: 19, shadow: { color: 'rgba(40,61,54,0.6)', blur: 10, offset: { x: 0, y: 1 } } },
      { start: 19, end: 27, fill: '#EA5328', fontFamily: 'StageGrotesk Medium', shadow: { color: 'rgba(40,61,54,0.6)', blur: 10, offset: { x: 0, y: 1 } } },
    ])
  })

  it('sem sombra, só o trecho destacado ganha estilo', () => {
    expect(estilosDoRichText({ conteudo: 'abc def', trechos: [{ inicio: 4, fim: 7 }], destaque: { fill: '#f00' }, sombra: null })).toEqual([{ start: 4, end: 7, fill: '#f00' }])
  })

  it('converte cor e opacidade para rgba', () => {
    expect(corComOpacidade('#fff', 0.5)).toBe('rgba(255,255,255,0.5)')
    expect(corComOpacidade('rgba(1,2,3,0.4)', 0.5)).toBe('rgba(1,2,3,0.4)')
  })
})

describe('destaque na página de assinatura', () => {
  it('o destaque é o primeiro trecho que difere do estilo base', () => {
    const camada = {
      id: 'apoio',
      type: 'rich-text',
      style: { fontFamily: 'StageGrotesk Thin', color: '#F6F0E4' },
      richTextStyles: [
        { start: 0, end: 5, shadow: { color: '#000', blur: 2, offset: { x: 0, y: 1 } } },
        { start: 17, end: 20, fill: '#EA5328', fontFamily: 'StageGrotesk Medium' },
      ],
    } as unknown as Layer
    expect(destaqueDaCamada(camada)).toEqual({ fill: '#EA5328', fontFamily: 'StageGrotesk Medium' })
    expect(destaqueDaCamada({ ...camada, type: 'text' } as Layer)).toBeNull()
  })
})

describe('bloco com destaque', () => {
  const estilo: EstiloDePapel = {
    fontFamily: 'StageGrotesk Thin',
    fontSize: 40,
    lineHeight: 1.1,
    letterSpacing: 0,
    color: '#F6F0E4',
    sombra: { color: '#000000', blur: 10, offsetY: 1, opacity: 0.6 },
  }
  // Régua falsa: 10px por caractere; a família Medium é 20% mais larga.
  const medir: MeasureTextBox = (l) => {
    const linhas = String(l.content ?? '').split('\n')
    const fator = String(l.style?.fontFamily).includes('Medium') ? 12 : 10
    return { width: l.size.width, height: Number(l.style?.fontSize) * linhas.length, maxLineWidth: Math.max(...linhas.map((x) => x.length * fator)), lineCount: linhas.length } as ReturnType<MeasureTextBox>
  }
  const base = { papel: 'apoio' as const, estilo, escalaDoFormato: 1, colunaUtil: 900, textAlign: 'left' as const, groupId: 'g', corDaMancha: '#000', medir }

  it('vira rich text, mede a linha com a família mais pesada e volta com colchetes', () => {
    const r = montarBloco({ ...base, linhas: ['Seu milk-shake vem [em dobro]'], destaque: { fill: '#EA5328', fontFamily: 'StageGrotesk Medium' } })
    expect(r.recusa).toBeNull()
    const layer = r.bloco!.layer
    expect(layer.type).toBe('rich-text')
    expect(layer.content).toBe('Seu milk-shake vem em dobro')
    expect(layer.richTextStyles?.find((s) => s.fill === '#EA5328')).toMatchObject({ start: 19, end: 27, fontFamily: 'StageGrotesk Medium' })
    // 27 caracteres × 10 + "em dobro" ganha 2px por caractere na Medium
    expect(r.bloco!.width).toBe(270 + 16 + 12 + 2)
    expect(r.bloco!.destacado).toBe(true)
    expect(linhasComColchetes(layer)).toEqual(['Seu milk-shake vem [em dobro]'])
  })

  it('o prefixo do CTA empurra o destaque e sobrevive à volta', () => {
    const r = montarBloco({ ...base, papel: 'cta', estilo: { ...estilo, prefixo: '→ ' }, linhas: ['[Reserve] já'], destaque: { fill: '#EA5328' } })
    const layer = r.bloco!.layer
    expect(layer.content).toBe('→ Reserve já')
    expect(layer.richTextStyles?.find((s) => s.fill)).toMatchObject({ start: 2, end: 9 })
    expect(linhasComColchetes(layer)).toEqual(['→ [Reserve] já'])
  })

  it('destaque em várias linhas conta a quebra de linha', () => {
    const r = montarBloco({ ...base, linhas: ['Sua pausa', 'com [sabores Real]'], destaque: { fill: '#EA5328' } })
    const layer = r.bloco!.layer
    expect(layer.content).toBe('Sua pausa\ncom sabores Real')
    expect(linhasComColchetes(layer)).toEqual(['Sua pausa', 'com [sabores Real]'])
  })

  it('sem estilo de destaque na marca, sai texto comum sem colchetes e avisa', () => {
    const r = montarBloco({ ...base, linhas: ['Vem [pro Real]'], destaque: null })
    expect(r.bloco!.layer.type).toBe('text')
    expect(r.bloco!.layer.content).toBe('Vem pro Real')
    expect(r.avisos.join(' ')).toMatch(/não tem estilo de destaque/)
  })

  it('copy sem colchetes continua saindo como texto comum', () => {
    const r = montarBloco({ ...base, linhas: ['Vem pro Real'], destaque: { fill: '#EA5328' } })
    expect(r.bloco!.layer.type).toBe('text')
    expect(r.avisos).toEqual([])
  })
})
