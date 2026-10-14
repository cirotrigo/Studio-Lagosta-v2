/**
 * CP0 — o EXECUTOR de ajustes (`aplicarAjustes`, o que o ajustar-arte roda)
 * sobre a peça piloto: o replay da v2 (P10) e "nada em silêncio" (P12).
 *
 * O oráculo de P12 não conhece a tabela de campos do executor: para cada
 * campo de um ajuste, roda o ajuste COM e SEM o campo. Resultado idêntico e
 * nenhuma recusa = o campo foi ignorado em silêncio.
 */
import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'
import { aplicarAjustes, type ResultadoDosAjustes } from '@/lib/creatives/revisao/aplicar-ajustes'
import { ajusteSchema, type Ajuste } from '@/lib/creatives/revisao/contrato'
import { fixture } from './suporte/fixture'
import { hojeViola } from './suporte/hoje-viola'

const canvas = { width: 1080, height: 1920 }
/** Altura pela entrelinha (o executor só mede em `fonte` e `caixa`). */
const medir = (l: Layer) =>
  l.type !== 'text' ? null : Math.round(String(l.content ?? '').split('\n').length * Number(l.style?.fontSize ?? 16) * Number(l.textboxConfig?.autoWrap?.lineHeight ?? l.style?.lineHeight ?? 1.2) + 12)

const v1 = () => structuredClone(fixture.peca().v1.layers)
const ajustesDaV2 = () => structuredClone(fixture.peca().v2.revisao.ajustes) as unknown as Ajuste[]
const aplicar = (layers: Layer[], ajustes: Ajuste[]) => aplicarAjustes(layers, ajustes, { canvas, medir })
const camada = (r: ResultadoDosAjustes, id: string) => r.camadas.find((l) => l.id === id)!
const coresDe = (l: Layer) => new Set(((l.style as { gradientStops?: Array<{ color: string }> }).gradientStops ?? []).map((s) => s.color))

/** Os campos que ESTE ajuste mandou e que o executor ignorou sem recusar. */
function camposIgnoradosEmSilencio(layers: Layer[], ajuste: Ajuste): string[] {
  const com = aplicar(structuredClone(layers), [ajuste])
  if (com.recusados.length > 0) return []
  const ignorados: string[] = []
  // `tipo` e `camadas` endereçam; `achado` é rótulo, não instrução.
  for (const campo of Object.keys(ajuste).filter((k) => !['tipo', 'camadas', 'achado'].includes(k))) {
    const semOCampo = { ...ajuste } as Record<string, unknown>
    delete semOCampo[campo]
    const sem = aplicar(structuredClone(layers), [semOCampo as unknown as Ajuste])
    if (sem.recusados.length === 0 && JSON.stringify(sem.camadas) === JSON.stringify(com.camadas)) ignorados.push(campo)
  }
  return ignorados
}

describe('caracterização: o replay da v2 reproduz o registro de produção', () => {
  it('3 aplicados, 0 recusados, com os mesmos detalhes que a Generation da v2 gravou', () => {
    const r = aplicar(v1(), ajustesDaV2())
    expect(r.recusados).toEqual([])
    expect(r.aplicados).toEqual(fixture.peca().v2.revisao.aplicados)
  })

  it('a cor pedida some enquanto a força muda: o rodapé fica #F3EADC a 0.85, 730 px', () => {
    const r = aplicar(v1(), ajustesDaV2())
    expect(ajustesDaV2()[1]).toMatchObject({ tipo: 'gradiente', borda: 'rodape', cor: '#283D36', forca: 0.85, altura: 730 })
    const rodape = camada(r, 'gradiente-leitura-rodape')
    expect(coresDe(rodape)).toEqual(new Set(['#F3EADC']))
    expect(rodape.metadata).toMatchObject({ forca: 0.85 })
    expect(rodape.size.height).toBe(730)
  })

  it('as camadas resultantes são as da página v2 (posições e gradientes)', () => {
    const r = aplicar(v1(), ajustesDaV2())
    for (const gravada of fixture.peca().v2.layers.filter((l) => l.type !== 'image')) {
      const nova = camada(r, gravada.id)
      expect({ id: gravada.id, position: nova.position, height: gravada.type === 'gradient' ? nova.size.height : undefined }).toEqual({
        id: gravada.id,
        position: gravada.position,
        height: gravada.type === 'gradient' ? gravada.size.height : undefined,
      })
    }
  })
})

describe('P10 — replay da v2', () => {
  hojeViola('a cor pedida (#283D36) é aplicada no gradiente do rodapé, ou o ajuste é recusado com motivo — nunca descartada', () => {
    const r = aplicar(v1(), ajustesDaV2())
    const aplicada = [...coresDe(camada(r, 'gradiente-leitura-rodape'))].every((c) => c === '#283D36')
    const recusado = r.recusados.some((x) => x.indice === 1)
    expect(aplicada || recusado, JSON.stringify(r.aplicados[1])).toBe(true)
  })
})

describe('P12 — nada em silêncio', () => {
  it('controle: um ajuste sem campo sobrando não acusa nada (o oráculo não denuncia tudo)', () => {
    expect(camposIgnoradosEmSilencio(v1(), { tipo: 'mover', camadas: ['servico'], dy: 10 } as Ajuste)).toEqual([])
    expect(camposIgnoradosEmSilencio(v1(), { tipo: 'gradiente', borda: 'rodape', forca: 0.6, altura: 700 } as Ajuste)).toEqual([])
  })

  it('campo DESCONHECIDO é barrado na fronteira (o schema do ajuste é strict)', () => {
    expect(ajusteSchema.safeParse({ tipo: 'mover', camadas: ['servico'], dy: 10, foo: 1 }).success).toBe(false)
  })

  hojeViola('todo campo enviado é aplicado ou recusado (gradiente com cor sobre borda que já tem véu; força num mover; dx numa fonte)', () => {
    const casos: Array<{ caso: string; ajuste: Ajuste }> = [
      { caso: 'replay v2: gradiente do rodapé', ajuste: ajustesDaV2()[1] },
      { caso: 'mover com força', ajuste: { tipo: 'mover', camadas: ['servico'], dy: 10, forca: 0.5 } as Ajuste },
      { caso: 'fonte com dx', ajuste: { tipo: 'fonte', camadas: ['headline'], fontSize: 80, dx: 5 } as Ajuste },
    ]
    // Os três passam pelo schema da tool: chegam de verdade ao executor.
    for (const c of casos) expect(ajusteSchema.safeParse(c.ajuste).success, c.caso).toBe(true)
    const achados = casos.map((c) => ({ caso: c.caso, ignorados: camposIgnoradosEmSilencio(v1(), c.ajuste) }))
    expect(achados, JSON.stringify(achados)).toEqual(casos.map((c) => ({ caso: c.caso, ignorados: [] })))
  })
})
