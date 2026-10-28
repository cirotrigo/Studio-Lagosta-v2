/**
 * G2 · barra do lote no painel Imagens, renderizada estática (react-dom/server), e a regra da seleção ordenada.
 * Prova só o que a barra MOSTRA e quando os botões ficam desabilitados; clique, upload e o preenchimento estão no
 * teste do provider (`preencher-grade-no-editor.test.ts`). Nenhum clique real.
 */
import { describe, expect, it } from 'vitest'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarraDoLote, alternarNoLote, type EscolhaDoLote } from '@/components/templates/panels/lote-da-grade'

const d = (id: string): EscolhaDoLote => ({ chave: `drive:${id}`, tipo: 'drive', id, nome: `${id}.jpg` })
const idsDe = (l: EscolhaDoLote[]) => l.map((e) => e.chave.replace('drive:', ''))
const nada = () => undefined
const barra = (p: Partial<ComponentProps<typeof BarraDoLote>>) =>
  renderToStaticMarkup(
    createElement(BarraDoLote, {
      selecao: null,
      video: false,
      lote: null,
      emVoo: false,
      onAbrir: nada,
      onRemover: nada,
      onArquivos: nada,
      onPreencher: nada,
      onCancelar: nada,
      ...p,
    }),
  )
const botao = (html: string, rotulo: string) => html.match(new RegExp(`<button[^>]*aria-label="${rotulo}"[^>]*>`))?.[0]
const desabilitado = (tag: string | undefined) => /\sdisabled=""/.test(tag ?? '')

describe('G2 · seleção ordenada do lote', () => {
  it('toque acrescenta no fim, toque de novo tira e a ordem das outras fica; limite e repetição respeitados', () => {
    let l = alternarNoLote([], d('A'), 3)
    l = alternarNoLote(l, d('B'), 3)
    l = alternarNoLote(l, d('C'), 3)
    expect(idsDe(l)).toEqual(['A', 'B', 'C'])
    expect(alternarNoLote(l, d('D'), 3)).toBe(l) // cheio: nada muda
    l = alternarNoLote(l, d('B'), 3)
    expect(idsDe(l)).toEqual(['A', 'C'])
    expect(idsDe(alternarNoLote(l, d('A'), 3))).toEqual(['C'])
  })
})

describe('G2 · barra do lote (SSR)', () => {
  it('sem grade selecionada e sem lote: não aparece', () => {
    expect(barra({})).toBe('')
  })

  it('grade com células vazias: diz onde a próxima foto entra e oferece "Preencher com várias fotos"', () => {
    const html = barra({ selecao: { tipo: 'grade', vagas: 3 } })
    expect(html).toMatch(/primeira célula vazia/)
    expect(desabilitado(botao(html, 'Preencher com várias fotos'))).toBe(false)
  })

  it('grade cheia ou página de vídeo: botão desabilitado com o motivo escrito', () => {
    const cheia = barra({ selecao: { tipo: 'grade', vagas: 0 } })
    expect(cheia).toMatch(/cheia/i)
    expect(desabilitado(botao(cheia, 'Preencher com várias fotos'))).toBe(true)
    const video = barra({ selecao: { tipo: 'grade', vagas: 2 }, video: true })
    expect(video).toMatch(/vídeo/i)
    expect(desabilitado(botao(video, 'Preencher com várias fotos'))).toBe(true)
  })

  it('célula selecionada: avisa que a foto substitui a dela, sem botão de lote', () => {
    const html = barra({ selecao: { tipo: 'celula' } })
    expect(html).toMatch(/substitui/)
    expect(botao(html, 'Preencher com várias fotos')).toBeUndefined()
  })

  it('lote aberto: escolhas numeradas NA ORDEM, "Preencher N células" só com escolha e dentro do limite', () => {
    const html = barra({ selecao: { tipo: 'grade', vagas: 3 }, lote: [d('B'), d('A')] })
    const itens = [...html.matchAll(/data-escolha="(\d+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], m[2].includes('B.jpg') ? 'B' : 'A'])
    expect(itens).toEqual([
      ['1', 'B'],
      ['2', 'A'],
    ])
    expect(html).toContain('Preencher 2 células')
    expect(desabilitado(botao(html, 'Preencher as células'))).toBe(false)
    expect(desabilitado(botao(barra({ selecao: { tipo: 'grade', vagas: 3 }, lote: [] }), 'Preencher as células'))).toBe(true)
    expect(desabilitado(botao(barra({ selecao: { tipo: 'grade', vagas: 1 }, lote: [d('A'), d('B')] }), 'Preencher as células'))).toBe(true)
    expect(desabilitado(botao(barra({ selecao: null, lote: [d('A')] }), 'Preencher as células'))).toBe(true)
    expect(html).toMatch(/multiple=""/)
  })

  it('em voo: preencher desabilitado, cancelar disponível e o estado escrito', () => {
    const html = barra({ selecao: { tipo: 'grade', vagas: 3 }, lote: [d('A')], emVoo: true })
    expect(desabilitado(botao(html, 'Preencher as células'))).toBe(true)
    expect(desabilitado(botao(html, 'Cancelar'))).toBe(false)
    expect(html).toMatch(/Aplicando/)
  })
})
