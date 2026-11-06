import { describe, expect, it } from 'vitest'
import { decidirDespromocao, postTemCopyPropria, type PostDaPagina } from '../despromover'

const post = (id: string, status: string, temCopyPropria = true): PostDaPagina => ({
  id,
  status,
  scheduledFor: '2026-11-10T17:00:00.000Z',
  temCopyPropria,
})

describe('postTemCopyPropria', () => {
  it('conta copy legada e contrato semântico; não conta vazio nem cópia da página', () => {
    expect(postTemCopyPropria({ titulo: 'Sexta tem chopp' })).toBe(true)
    expect(postTemCopyPropria({ _slots: null })).toBe(true)
    expect(postTemCopyPropria(null)).toBe(false)
    expect(postTemCopyPropria({})).toBe(false)
    expect(postTemCopyPropria({ _copiaDaPagina: true, titulo: 'o texto da página' })).toBe(false)
  })
})

describe('decidirDespromocao', () => {
  it('permite sem posts, com posts já publicados/falhos e com posts vivos sem copy própria', () => {
    expect(decidirDespromocao([])).toMatchObject({ permitido: true, posts: [] })
    expect(decidirDespromocao([post('a', 'POSTED'), post('b', 'FAILED')])).toMatchObject({ permitido: true, posts: [] })
    expect(decidirDespromocao([post('c', 'SCHEDULED', false), post('d', 'DRAFT', false)])).toMatchObject({ permitido: true, posts: [] })
  })

  it.each(['DRAFT', 'SCHEDULED', 'POSTING'])('recusa com post %s com copy própria', (status) => {
    const d = decidirDespromocao([post('x1', status), post('x2', 'POSTED')])
    expect(d.permitido).toBe(false)
    expect(d.posts).toEqual([{ id: 'x1', status, scheduledFor: '2026-11-10T17:00:00.000Z' }])
    expect(d.mensagem).toContain('1 post usa')
    expect(d.mensagem).toContain('x1')
  })

  it('conta todos e lista no máximo cinco na mensagem', () => {
    const posts = Array.from({ length: 7 }, (_, i) => post(`p${i}`, i % 2 ? 'DRAFT' : 'SCHEDULED'))
    const d = decidirDespromocao(posts)
    expect(d.permitido).toBe(false)
    expect(d.posts).toHaveLength(7)
    expect(d.mensagem).toContain('7 posts usam')
    expect(d.mensagem).toContain('p4 (agendado)')
    expect(d.mensagem).not.toContain('p5')
    expect(d.mensagem).toContain('e mais 2')
  })
})
