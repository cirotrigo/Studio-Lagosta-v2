/**
 * PR3-F05 (revisão FINAL do Codex sobre abac9b34, 18/09/2026): a segunda voz
 * da manchete (`estilo.linhasNaVoz2`) é RECONSTRUÍDA das camadas presentes a
 * cada leitura — nunca herdada do contrato. Sem `headline2` na peça, o índice
 * antigo apontava para uma linha que podia não existir (revisão válida
 * recusada, contrato velho) ou sobrevivia às linhas reunidas na primeira voz
 * (a mudança não era registrada).
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, lerCopyAutoral, tentarCopyEfetivaDasCamadas, type CopyAutoral } from '..'
import { revisaoDaPaginaComCamadas } from '../revisar-pagina'

function texto(id: string, y: number, content: string, extra: Partial<Layer> = {}): Layer {
  return { id, name: id, type: 'text', visible: true, locked: false, order: 1, content, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id } }, ...extra } as Layer
}

const original: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake', 'em dobro'], estilo: { linhasNaVoz2: [1] } },
    { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Sexta é dia'] },
  ],
  revisoes: [],
}

describe('a segunda voz é reconstruída das camadas presentes (PR3-F05)', () => {
  it('headline2 ESCONDIDA, manchete com uma linha: contrato válido, sem índice antigo, revisão registrada', () => {
    const camadas = [texto('headline', 200, 'Milk-shake'), texto('headline2', 300, 'em dobro', { visible: false } as Partial<Layer>), texto('apoio', 400, 'Sexta é dia')]
    const r = tentarCopyEfetivaDasCamadas(original, camadas, { superficie: 'editor' })
    expect(r.ok).toBe(true)
    const manchete = (r as { ok: true; leitura: { efetiva: CopyAutoral } }).leitura.efetiva.blocos.find((b) => b.id === 'headline')!
    expect(manchete.linhas).toEqual(['Milk-shake'])
    expect(manchete.estilo?.linhasNaVoz2).toBeUndefined()
    const rev = revisaoDaPaginaComCamadas(original, camadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
    expect(rev.estado).toBe('registrada')
    expect(lerCopyAutoral(rev.copy).copy).not.toBeNull()
  })

  it('headline2 REMOVIDA e as duas linhas reunidas na primeira voz: a mudança de estilo é registrada', () => {
    const camadas = [texto('headline', 200, 'Milk-shake\nem dobro'), texto('apoio', 400, 'Sexta é dia')]
    const r = copyEfetivaDasCamadas(original, camadas, { superficie: 'editor' })
    const manchete = r.efetiva.blocos.find((b) => b.id === 'headline')!
    expect(manchete.linhas).toEqual(['Milk-shake', 'em dobro'])
    expect(manchete.estilo).toBeUndefined()
    expect(r.mudancas).toEqual([expect.objectContaining({ id: 'headline', campos: ['estilo'] })])
  })

  it('manchete não desenhada: bloco vazio SEM a segunda voz (senão o índice aponta para linha inexistente)', () => {
    const r = tentarCopyEfetivaDasCamadas(original, [texto('apoio', 400, 'Sexta é dia')], { superficie: 'editor' })
    expect(r.ok).toBe(true)
    const manchete = (r as { ok: true; leitura: { efetiva: CopyAutoral } }).leitura.efetiva.blocos.find((b) => b.id === 'headline')!
    expect(manchete).toMatchObject({ linhas: [] })
    expect(manchete.estilo?.linhasNaVoz2).toBeUndefined()
  })

  it('controle: a peça fiel (headline2 presente) mantém a segunda voz, sem revisão', () => {
    const r = copyEfetivaDasCamadas(original, [texto('headline', 200, 'Milk-shake'), texto('headline2', 300, 'em dobro'), texto('apoio', 400, 'Sexta é dia')], { superficie: 'editor' })
    expect(r.mudancas).toEqual([])
    expect(r.efetiva.blocos[0].estilo).toEqual({ linhasNaVoz2: [1] })
  })

  it('outros campos de estilo ficam (só a segunda voz é reconstruída)', () => {
    const comHerda: CopyAutoral = { ...original, blocos: original.blocos.map((b) => (b.id === 'headline' ? { ...b, estilo: { herdaDe: 'headline', linhasNaVoz2: [1] } } : b)) }
    const r = copyEfetivaDasCamadas(comHerda, [texto('headline', 200, 'Milk-shake'), texto('apoio', 400, 'Sexta é dia')], { superficie: 'editor' })
    expect(r.efetiva.blocos[0].estilo).toEqual({ herdaDe: 'headline' })
  })
})
