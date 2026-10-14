/**
 * CP0 — o EXECUTOR de ajustes (`aplicarAjustes`, o que o ajustar-arte roda)
 * sobre a peça piloto: o replay da v2 (P10) e "nada em silêncio" (P12).
 *
 * P12 tem dois oráculos, nenhum com a tabela de campos do executor:
 * - SILÊNCIO: para cada par tipo × campo do schema, o ajuste roda COM e SEM o
 *   campo; resultado idêntico e nenhuma recusa = o campo foi ignorado calado;
 * - REGISTRO: todo campo que o ajuste mandou aparece no registro do índice
 *   (o valor no `detalhe` do aplicado, ou uma recusa).
 */
import { describe, expect, it, vi } from 'vitest'

// O schema da tool é importado de verdade; o handler (que fala com o banco) nunca roda aqui.
vi.mock('@/lib/db', () => ({ db: {} }))

import type { Layer } from '@/types/template'
import { aplicarAjustes, type ResultadoDosAjustes } from '@/lib/creatives/revisao/aplicar-ajustes'
import { ajusteSchema, TIPOS_DE_AJUSTE, type Ajuste } from '@/lib/creatives/revisao/contrato'
import { toolsDeArteIA } from '@/lib/mcp/catalogo/arte-ia'
import { fixture } from './suporte/fixture'
import { exigir, hojeViola } from './suporte/hoje-viola'

const canvas = { width: 1080, height: 1920 }
/** Altura pela entrelinha (o executor só mede em `fonte` e `caixa`). */
const medir = (l: Layer) =>
  l.type !== 'text' ? null : Math.round(String(l.content ?? '').split('\n').length * Number(l.style?.fontSize ?? 16) * Number(l.textboxConfig?.autoWrap?.lineHeight ?? l.style?.lineHeight ?? 1.2) + 12)

const v1 = () => structuredClone(fixture.peca().v1.layers)
const ajustesDaV2 = () => structuredClone(fixture.peca().v2.revisao.ajustes) as unknown as Ajuste[]
const aplicar = (layers: Layer[], ajustes: Ajuste[]) => aplicarAjustes(layers, ajustes, { canvas, medir })
const camada = (r: ResultadoDosAjustes, id: string) => r.camadas.find((l) => l.id === id)!
const coresDe = (l: Layer) => ((l.style as { gradientStops?: Array<{ color: string }> }).gradientStops ?? []).map((s) => s.color)
/** O carimbo de hora do "oculta pelo revisor" muda a cada chamada: não é efeito do campo. */
const semCarimbo = (camadas: Layer[]) => JSON.stringify(camadas, (k, v) => (k === 'em' && typeof v === 'string' ? undefined : v))

/** Campos que ENDEREÇAM (qual camada, qual borda) ou só ROTULAM — não são instrução de mudança. */
const ENDERECO = new Set(['tipo', 'camadas', 'borda', 'achado'])

/** Um ajuste mínimo e válido de cada tipo, sobre a peça piloto. */
const BASE: Record<(typeof TIPOS_DE_AJUSTE)[number], Ajuste> = {
  fonte: { tipo: 'fonte', camadas: ['headline'], fontSize: 80 },
  mover: { tipo: 'mover', camadas: ['servico'], dy: 10 },
  gradiente: { tipo: 'gradiente', borda: 'rodape', forca: 0.6 },
  visibilidade: { tipo: 'visibilidade', camadas: ['apoio'], visivel: false },
  caixa: { tipo: 'caixa', camadas: ['headline'], largura: 600 },
}
/** Um valor que MUDA o estado da peça para cada campo instrucional do schema. */
const VALOR: Record<string, unknown> = { fontSize: 70, escala: 1.3, entrelinha: 1.4, dx: 12, dy: 14, forca: 0.55, altura: 640, cor: '#123456', visivel: false, largura: 610, alturaAutomatica: true }

/** Os campos que ESTE ajuste mandou e que o executor ignorou sem recusar (comparando com o ajuste sem o campo). */
function camposIgnoradosEmSilencio(layers: Layer[], ajuste: Ajuste): string[] {
  const com = aplicar(structuredClone(layers), [ajuste])
  if (com.recusados.length > 0) return []
  return Object.keys(ajuste)
    .filter((k) => !ENDERECO.has(k))
    .filter((campo) => {
      const semOCampo = { ...ajuste } as Record<string, unknown>
      delete semOCampo[campo]
      const sem = aplicar(structuredClone(layers), [semOCampo as unknown as Ajuste])
      return sem.recusados.length === 0 && semCarimbo(sem.camadas) === semCarimbo(com.camadas)
    })
}

/** Os campos de cada ajuste que não aparecem no registro do seu índice (nem no detalhe do aplicado, nem numa recusa). */
function camposForaDoRegistro(ajustes: Ajuste[], r: ResultadoDosAjustes): string[] {
  return ajustes.flatMap((a, indice) => {
    if (r.recusados.some((x) => x.indice === indice)) return []
    const detalhe = r.aplicados.find((x) => x.indice === indice)?.detalhe ?? ''
    return Object.entries(a)
      .filter(([k]) => !ENDERECO.has(k))
      .filter(([, v]) => !detalhe.includes(String(v)) && !(typeof v === 'number' && detalhe.includes(String(Math.round(v)))))
      .map(([k, v]) => `${indice}.${k}=${String(v)}`)
  })
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
    expect(new Set(coresDe(rodape))).toEqual(new Set(['#F3EADC']))
    expect(rodape.metadata).toMatchObject({ forca: 0.85 })
    expect(rodape.size.height).toBe(730)
  })

  it('as camadas resultantes são as da página v2 (posições e altura dos gradientes)', () => {
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
    const cores = coresDe(camada(r, 'gradiente-leitura-rodape'))
    exigir(cores.length > 0, 'o gradiente do rodapé tem paradas de cor')
    const aplicada = cores.every((c) => c === '#283D36')
    const recusado = r.recusados.some((x) => x.indice === 1)
    expect(aplicada || recusado, JSON.stringify(r.aplicados[1])).toBe(true)
  })
})

describe('P12 — nada em silêncio', () => {
  it('controle: ajustes só com os campos do próprio tipo não acusam nada (o oráculo não denuncia tudo)', () => {
    for (const a of Object.values(BASE)) expect(camposIgnoradosEmSilencio(v1(), a), a.tipo).toEqual([])
    expect(camposIgnoradosEmSilencio(v1(), { tipo: 'gradiente', borda: 'rodape', forca: 0.6, altura: 700 } as Ajuste)).toEqual([])
  })

  it('campo DESCONHECIDO é barrado na fronteira: o ajusteSchema e o schema da tool ajustar-arte são strict', () => {
    const intruso = { tipo: 'mover', camadas: ['servico'], dy: 10, foo: 1 }
    expect(ajusteSchema.safeParse(intruso).success).toBe(false)
    const tool = toolsDeArteIA.find((t) => t.nome === 'ajustar-arte')
    exigir(tool, 'a tool ajustar-arte existe no catálogo')
    expect(tool.schema.safeParse({ projectId: 1, pageId: 'p', versaoEsperada: 'v', ajustes: [intruso] }).success).toBe(false)
    expect(tool.schema.safeParse({ projectId: 1, pageId: 'p', versaoEsperada: 'v', ajustes: [{ tipo: 'mover', camadas: ['servico'], dy: 10 }] }).success).toBe(true)
  })

  it('a lista de campos do oráculo cobre todos os campos instrucionais do ajusteSchema (e só eles)', () => {
    const doSchema = Object.keys(ajusteSchema.shape).filter((k) => !ENDERECO.has(k)).sort()
    expect(Object.keys(VALOR).sort()).toEqual(doSchema)
  })

  hojeViola('nenhum campo aceito pelo schema é ignorado em silêncio — todos os pares tipo × campo', () => {
    const pares = Object.values(BASE).flatMap((base) =>
      Object.keys(VALOR)
        .filter((campo) => !(campo in base))
        .map((campo) => ({ par: `${base.tipo}+${campo}`, ajuste: { ...base, [campo]: VALOR[campo] } as Ajuste })),
    )
    // Todos chegam de verdade ao executor: passam pelo schema da tool.
    for (const p of pares) exigir(ajusteSchema.safeParse(p.ajuste).success, `${p.par} passa no ajusteSchema`)
    const ignorados = pares.filter((p) => camposIgnoradosEmSilencio(v1(), p.ajuste).length > 0).map((p) => p.par)
    expect(ignorados, JSON.stringify(ignorados)).toEqual([])
  })

  hojeViola('todo campo do replay da v2 aparece no registro do seu índice (valor no detalhe do aplicado, ou recusa)', () => {
    const ajustes = ajustesDaV2()
    const fora = camposForaDoRegistro(ajustes, aplicar(v1(), ajustes))
    expect(fora, JSON.stringify(fora)).toEqual([])
  })
})
