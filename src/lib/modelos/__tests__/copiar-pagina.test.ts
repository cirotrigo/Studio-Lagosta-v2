import { describe, expect, it } from 'vitest'
import { CreativeError } from '@/lib/creatives/errors'
import { copiarPaginaDeModelo, ehPastaDaAssinatura, ehTagReservada } from '../copiar-pagina'

const camadas = [
  { id: 'grupo', name: 'Grupo', type: 'group', visible: true },
  { id: 'titulo', name: 'titulo', type: 'text', parentId: 'grupo', content: 'Almoço' },
  { id: 'foto', name: 'Foto', type: 'image' },
]

const modelo = (extra: Record<string, unknown> = {}) => ({
  name: 'Almoço executivo',
  width: 1080,
  height: 1920,
  background: '#000',
  // dupla codificação, como parte das linhas do banco
  layers: JSON.stringify(JSON.stringify(camadas)),
  tags: ['almoco', 'story', 'fora-do-rodizio', 'compositor', 'semana:2026-11-02', 'arquetipo:x', 'lote-tema-2026-08', 'layout'],
  ...extra,
})

const sequencia = () => {
  let n = 0
  return () => `novo-${++n}`
}
// 06/11 02:00 UTC = 05/11 23:00 em Brasília: o dia do nome é o de Brasília.
const agora = new Date('2026-11-06T02:00:00Z')

describe('copiarPaginaDeModelo', () => {
  it('usar: conteúdo, ids novos com o grupo remapeado, tags de formato + de-modelo, nome com a data', () => {
    const c = copiarPaginaDeModelo(modelo(), { modo: 'usar', novoId: sequencia(), agora })
    expect(c).toMatchObject({ name: 'Almoço executivo · 05/11', isTemplate: false, thumbnail: null, tags: ['story', 'de-modelo'], width: 1080, height: 1920, background: '#000' })
    const novas = JSON.parse(c.layers)
    expect(novas.map((l: { id: string }) => l.id)).toEqual(['novo-1', 'novo-2', 'novo-3'])
    expect(novas[1].parentId).toBe('novo-1')
    expect(novas[1].content).toBe('Almoço')
  })

  it('usar: o formato sai do tamanho, não da tag da origem', () => {
    const c = copiarPaginaDeModelo(modelo({ width: 1080, height: 1350, tags: ['story'] }), { modo: 'usar', novoId: sequencia(), agora })
    expect(c.tags).toEqual(['feed', 'de-modelo'])
    expect(copiarPaginaDeModelo(modelo({ width: 1080, height: 1080 }), { modo: 'usar', novoId: sequencia(), agora }).tags[0]).toBe('quadrado')
  })

  it('duplicar: continua modelo, sem as tags do sistema', () => {
    const c = copiarPaginaDeModelo(modelo(), { modo: 'duplicar', novoId: sequencia(), agora })
    expect(c).toMatchObject({ name: 'Almoço executivo (cópia)', isTemplate: true, tags: ['almoco', 'story'] })
  })

  it('não altera a origem', () => {
    const origem = modelo()
    const antes = JSON.stringify(origem)
    copiarPaginaDeModelo(origem, { modo: 'usar', novoId: sequencia(), agora })
    expect(JSON.stringify(origem)).toBe(antes)
  })

  it('recusa vetor inválido e camadas ilegíveis', () => {
    const vetor = { id: 'v', name: 'Vetor', type: 'shape', visible: true, position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, style: { shapeType: 'svg-path', pathData: 'banana', pathViewBox: [0, 0, 10, 10], fill: '#000' } }
    const erro = (layers: unknown) => {
      try {
        copiarPaginaDeModelo(modelo({ layers }), { modo: 'usar', novoId: sequencia(), agora })
      } catch (e) {
        return e
      }
    }
    const v = erro(JSON.stringify([...camadas, vetor])) as CreativeError
    expect(v).toBeInstanceOf(CreativeError)
    expect([v.code, v.status]).toEqual(['VETOR_INVALIDO', 422])
    expect((erro('{não é json') as CreativeError).code).toBe('CAMADAS_ILEGIVEIS')
  })
})

describe('guardas', () => {
  it('tags reservadas', () => {
    expect(['fora-do-rodizio', 'assinatura', 'semana:2026-11-02:story', 'arquetipo:a', 'lote-tema-2026-08', 'layout', 'compositor', 'de-modelo'].every(ehTagReservada)).toBe(true)
    expect(['almoco', 'story', 'happy-hour'].some(ehTagReservada)).toBe(false)
  })

  it('pasta da Assinatura pelo nome, pela categoria ou pela tag', () => {
    expect(ehPastaDaAssinatura({ name: 'Assinatura' })).toBe(true)
    expect(ehPastaDaAssinatura({ name: 'Kit', category: 'assinatura' })).toBe(true)
    expect(ehPastaDaAssinatura({ name: 'Kit', tags: ['assinatura'] })).toBe(true)
    expect(ehPastaDaAssinatura({ name: 'Stories · Avulsas · Novembro', category: 'avulsas' })).toBe(false)
  })
})
