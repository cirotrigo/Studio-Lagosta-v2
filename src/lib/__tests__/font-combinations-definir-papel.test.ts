import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { comPapelNoCompositor } from '../font-combinations-capture'

/**
 * Nota da pré-revisão do commit 099818b0 (12/09/2026): `definirPapel` substituía `metadata.compositor` inteiro por
 * `{ papel }`. Dar papel a um texto de página composta apagava a identidade que a leitura da copy usa e o encaixe.
 */
const camada = (compositor?: Record<string, unknown>): Layer =>
  ({ id: 'x', name: 'x', type: 'text', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 100, height: 40 }, content: 'a', metadata: { groupId: 'g1', ...(compositor ? { compositor } : {}) } }) as Layer

describe('comPapelNoCompositor — definir o papel do texto MESCLA a metadata do compositor', () => {
  it('dar papel mantém extra, bloco, parte, linhasDoBloco, prefixo e encaixe; trocar o papel troca só o papel', () => {
    const composta = camada({ papel: 'servico', extra: { id: 'hora' }, bloco: 'svc', parte: 2, linhasDoBloco: [1], prefixo: '→ ', encaixe: 12 })
    expect(comPapelNoCompositor(composta, 'apoio').metadata).toEqual({ groupId: 'g1', compositor: { papel: 'apoio', extra: { id: 'hora' }, bloco: 'svc', parte: 2, linhasDoBloco: [1], prefixo: '→ ', encaixe: 12 } })
    expect(comPapelNoCompositor(camada(), 'cta').metadata).toEqual({ groupId: 'g1', compositor: { papel: 'cta' } })
  })
  it('tirar o papel remove só o papel; sem mais nada, o compositor sai', () => {
    expect(comPapelNoCompositor(camada({ papel: 'servico', linhasDoBloco: [0] }), null).metadata).toEqual({ groupId: 'g1', compositor: { linhasDoBloco: [0] } })
    expect(comPapelNoCompositor(camada({ papel: 'servico' }), null).metadata).toEqual({ groupId: 'g1' })
  })
  it('o painel de combinações usa a função (não substitui o compositor à mão)', () => {
    const fonte = readFileSync(new URL('../../components/templates/panels/font-combinations-panel.tsx', import.meta.url), 'utf8')
    const inicio = fonte.indexOf('const definirPapel = React.useCallback(')
    expect(inicio).toBeGreaterThan(-1)
    const corpo = fonte.slice(inicio, fonte.indexOf('[updateLayer]', inicio))
    expect(corpo).toMatch(/comPapelNoCompositor\(layer, papel\)/)
    expect(corpo).not.toMatch(/compositor = \{ papel \}/)
  })
})
