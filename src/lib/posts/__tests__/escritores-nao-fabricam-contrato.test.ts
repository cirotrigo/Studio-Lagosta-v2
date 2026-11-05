/**
 * B1d — checkpoint c, N: os escritores de CÓPIA VISUAL não fabricam o contrato semântico novo.
 *
 * A cópia da página tem o NOME da camada como chave: uma camada de texto chamada `_slots` (ou de id `_papeis`,
 * sem nome) viraria `{ _slots: "texto" }` no post — e o detector, a admissão e a guarda de envio o tratariam
 * como pedido semântico, bloqueando um post LEGADO. Texto de camada nunca é pedido: essas chaves não entram
 * (os leitores já ignoram toda chave `_…`, então nada visível se perde). O `_slots` que o post já tinha fica.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { comoCopiaDaPagina, copiaDaPagina, slotValuesSeguindo, temContratoSemantico } from '../copy-segue-a-pagina'
import { textosDaPagina } from '../page-layers'

const camadas = [
  { id: 'a', name: '_slots', type: 'text', content: 'texto da camada', visible: true },
  { id: '_papeis', type: 'text', content: 'outra', visible: true },
  { id: 't', name: 'Título', type: 'text', content: 'Título da página', visible: true },
]
const copia = textosDaPagina(camadas as never) as Record<string, string>

describe('N. a cópia da página não vira contrato', () => {
  it('pressuposto medido: a cópia da página traz `_slots`/`_papeis` quando há camada com esse nome/id', () => {
    expect(Object.keys(copia)).toEqual(expect.arrayContaining(['_slots', '_papeis', 'Título']))
    expect(temContratoSemantico(comoCopiaDaPagina(copia))).toBe(true) // o risco, se gravada como está
  })

  it('copiaDaPagina: marca a cópia e descarta as chaves do contrato vindas de camada', () => {
    const gravada = copiaDaPagina(copia)
    expect(gravada).toEqual({ Título: 'Título da página', _copiaDaPagina: true })
    expect(temContratoSemantico(gravada)).toBe(false)
  })

  it('render-post-art (slotValuesSeguindo): texto de camada não cria nem sobrescreve o contrato', () => {
    expect(temContratoSemantico(comoCopiaDaPagina(slotValuesSeguindo({ 't-h': 'velho' }, copia)))).toBe(false)
    // o `_slots` que o post já tinha (pedido real) fica como era — a camada não o sobrescreve
    const comPedido = slotValuesSeguindo({ _slots: { manchete: 'Pedido' } }, copia)
    expect(comPedido._slots).toEqual({ manchete: 'Pedido' })
    expect(comPedido._papeis).toBeUndefined()
  })

  it('agendar, trocar-arte (por página) e substituir-video gravam a cópia da página por copiaDaPagina', () => {
    const fonte = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
    expect(fonte('src/lib/creatives/agendar.ts')).toMatch(/\? copiaDaPagina\(copyDaPagina\)/)
    expect(fonte('src/lib/posts/trocar-arte-do-post.ts')).toMatch(/origem === 'pagina' \? copiaDaPagina\(novosTextos\)/)
    expect(fonte('src/lib/posts/substituir-video-do-post.ts')).toMatch(/slotValues: copiaDaPagina\(params\.copyGravada\)/)
    for (const f of ['src/lib/creatives/agendar.ts', 'src/lib/posts/trocar-arte-do-post.ts', 'src/lib/posts/substituir-video-do-post.ts']) {
      expect(fonte(f)).not.toMatch(/comoCopiaDaPagina\(/)
    }
  })

  it('plan-week (CLI e MCP local): os textos têm chaves literais fixas, sem `_slots`/`_papeis`', () => {
    for (const f of ['scripts/plan-week.ts', 'scripts/mcp-server.ts']) {
      const t = readFileSync(join(process.cwd(), f), 'utf8')
      const blocos = [...t.matchAll(/texts: \{([\s\S]*?)\n\s*\},/g)].map((m) => m[1])
      expect(blocos.length).toBeGreaterThan(0)
      for (const b of blocos) {
        expect(b).not.toMatch(/_slots|_papeis/)
        expect(b).not.toMatch(/^\s*\[/m) // nenhuma chave computada
      }
    }
  })

  it('cópia vinda da Generation (agendar sem página, troca pela galeria) já ignora chaves `_…`', async () => {
    const { textosDaGeneration } = await import('../troca-de-arte')
    expect(temContratoSemantico(textosDaGeneration({ slotValues: { _slots: { s: 'x' }, Título: 'y' } }))).toBe(false)
  })
})
