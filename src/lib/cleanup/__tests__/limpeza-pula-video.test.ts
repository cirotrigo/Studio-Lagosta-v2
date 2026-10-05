import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Teste de FONTE: `blob-cleanup.ts` importa o Prisma e não roda sem banco, mas
 * a proteção do vídeo é uma ligação — toda passagem que lê Generation precisa
 * passar por `semVideos`. Uma quarta passagem sem o helper traria de volta o
 * MP4 reenviado ao Drive como PNG e o link 404 nos posts.
 */
describe('a limpeza de Generation pula vídeo em TODA passagem', () => {
  const fonte = readFileSync(join(__dirname, '..', 'blob-cleanup.ts'), 'utf8')
  const consultas = fonte.split('db.generation.findMany(').slice(1)

  it('cada db.generation.findMany tem o seu semVideos', () => {
    expect(consultas.length).toBeGreaterThan(0)
    expect(fonte.match(/= semVideos\(/g)?.length ?? 0).toBe(consultas.length)
  })

  it('toda consulta de Generation seleciona fieldValues (é por ele que se sabe que é vídeo)', () => {
    for (const consulta of consultas) {
      const ateOFiltro = consulta.indexOf('semVideos(')
      expect(ateOFiltro).toBeGreaterThan(0)
      expect(consulta.slice(0, ateOFiltro)).toContain('fieldValues: true')
    }
  })
})
