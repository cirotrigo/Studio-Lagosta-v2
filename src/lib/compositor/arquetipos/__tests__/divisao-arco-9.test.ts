/**
 * #9 `minimal-divisao-cor-topo-arco@1` por FIXTURE (I9, 25/10/2026) — o contrato da máscara no validador (CT-02–CT-04,
 * CT-06, CT-07) e, no COMPOSITOR real (cenário do #9, medidor real com a Montserrat do repo), a camada mascarada só no
 * arquétipo que a declara (MK-07), os dois parsers antes de gravar (MK-09), o assunto medido no ARCO (MK-08) e os papéis
 * fora do `@1` (CT-05). A fixture não está em `PUBLICADOS` (I-01). Dublados: banco, Blob, fontes do projeto, autofix,
 * acervo (o catálogo do cenário); a foto pelo dublê do fetch.
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>>, semMascara: false, quebrarEditor: false, quebrarServidor: false }))

vi.mock('@/lib/db', async () => {
  const { cenario: c, mockDoBanco } = await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')
  const base = mockDoBanco().db as Record<string, any>
  return {
    db: {
      ...base,
      project: { findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), titleFontFamily: 'Montserrat', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }) },
      page: {
        ...base.page,
        findMany: async (args?: { where?: { id?: { in?: string[]; not?: string } } }) =>
          c.atual!.paginasDeAssinatura.filter((p) => (!args?.where?.id?.in || args.where.id.in.includes(p.id)) && (!args?.where?.id?.not || p.id !== args.where.id.not)),
      },
      fontCombination: { findMany: async () => [] },
    },
  }
})
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDaPersistencia(),
  persistAndRenderCreative: async (e: Record<string, any>) => {
    cap.entradas.push(e)
    return { generationId: `g-${cap.entradas.length}`, pageId: `p-${cap.entradas.length}`, url: 'https://blob.test/arte.png' }
  },
}))
vi.mock('@/lib/compositor/pastas', () => ({ garantirPasta: async () => ({ id: 77, name: 'Semana' }), ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }) }))
vi.mock('@/lib/brand/voz-service', () => ({ carimboDaVozAgora: async () => null }))
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('@/lib/direcao-de-arte/__tests__/suporte/compositor')).gradientesDoCenario,
}))
// A fixture (ou, com `semMascara`, a MESMA definição sem a máscara — o controle de que é o arco que mede o assunto).
vi.mock('@/lib/compositor/arquetipos/catalogo', async (original) => {
  const f = await import('./suporte/arquetipo-arco-9')
  const semMascara = () => {
    const a = JSON.parse(JSON.stringify(f.ARQUETIPO_ARCO_9))
    delete a.formatos.story.mascaraDaFoto
    delete a.formatos.feed.mascaraDaFoto
    return a
  }
  return f.catalogoComOArco(original as never, () => [], () => (cap.semMascara ? semMascara() : f.ARQUETIPO_ARCO_9))
})
// MK-09: cada parser pode ser forçado a falhar (o do editor devolve nada; o do servidor lança).
vi.mock('@/lib/vetor/tracar', async (original) => {
  const real = await original<typeof import('@/lib/vetor/tracar')>()
  return { ...real, segmentosDoPath: (d: string) => (cap.quebrarEditor ? [] : real.segmentosDoPath(d)) }
})
vi.mock('@napi-rs/canvas', async (original) => {
  const real = await original<typeof import('@napi-rs/canvas')>()
  class Path2DQuebravel extends real.Path2D {
    constructor(...a: ConstructorParameters<typeof real.Path2D>) {
      if (cap.quebrarServidor) throw new Error('parser do servidor forçado a falhar')
      super(...a)
    }
  }
  return { ...real, Path2D: Path2DQuebravel }
})

import sharp from 'sharp'
import type { ArquetipoDeLayout } from '../tipos'
import { validarArquetipo } from '../validar'
import { fracaoVisivelNoArco } from '../mascara'
import { fracaoVisivelDoAssunto, assuntoEmPixels } from '../../assunto-da-foto'
import { comporPeca } from '../../compor'
import { medirCopyDoProjeto } from '../../medir-copy-service'
import { ARQUETIPO_ARCO_9, ID_ARCO } from './suporte/arquetipo-arco-9'
import { ARQUETIPO_SEM_FOTO } from './suporte/arquetipo-sem-foto'
import { cenario } from '@/lib/direcao-de-arte/__tests__/suporte/compositor'
import { PROJETO_9, cenario9, copy9, medidorComAsFontesDoRepo, spec9 } from '@/lib/direcao-de-arte/__tests__/suporte/cenario-9'

const problemas = (a: ArquetipoDeLayout) => validarArquetipo(a).map((p) => `${p.codigo} ${p.campo}`)
const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const mutado = (f: (a: any) => void, base: ArquetipoDeLayout = ARQUETIPO_ARCO_9) => {
  const a = copia(base) as any
  f(a)
  return a as ArquetipoDeLayout
}

describe('#9 · a máscara no contrato do arquétipo (validador)', () => {
  it('I-01/CT-07: a fixture é válida, o #9 está publicado (H9) e só ele declara a máscara, e o Feed é definição própria (outra caixa, outras referências)', async () => {
    expect(validarArquetipo(ARQUETIPO_ARCO_9)).toEqual([])
    const real = await vi.importActual<typeof import('../catalogo')>('../catalogo')
    // H9: publicado (a definição final da I9; a equivalência com ela é do `habilitacao-9.test.ts`, que lê o catálogo real).
    expect(real.listarArquetipos().some((a) => a.id === ID_ARCO)).toBe(true)
    expect(real.listarArquetipos().filter((a) => a.formatos.story.mascaraDaFoto || a.formatos.feed.mascaraDaFoto).map((a) => a.id)).toEqual([ID_ARCO])
    expect(ARQUETIPO_ARCO_9.formatos.feed.foto).not.toEqual(ARQUETIPO_ARCO_9.formatos.story.foto)
    expect(ARQUETIPO_ARCO_9.formatos.feed.papeis.headline).not.toEqual(ARQUETIPO_ARCO_9.formatos.story.papeis.headline)
  })

  it('CT-02: mascaraDaFoto fora do foto-em-caixa → CAMPO_DESCONHECIDO (liso-claro e foto de fundo)', async () => {
    const mascara = { tipo: 'arco-janela', raio: 0.62 }
    expect(problemas(mutado((a) => (a.formatos.story.mascaraDaFoto = mascara), ARQUETIPO_SEM_FOTO))).toEqual(['CAMPO_DESCONHECIDO formatos.story.mascaraDaFoto'])
    const real = await vi.importActual<typeof import('../catalogo')>('../catalogo')
    const comFoto = real.listarArquetipos().find((a) => a.fundo === undefined)!
    expect(problemas(mutado((a) => (a.formatos.feed.mascaraDaFoto = mascara), comFoto))).toEqual(['CAMPO_DESCONHECIDO formatos.feed.mascaraDaFoto'])
    // No #8 publicado (foto-em-caixa), a mesma máscara é aceita pelo contrato (a habilitação do #9 é outra etapa).
    const oito = real.verArquetipo('minimal-divisao-foto-topo', 1)!
    expect(problemas(mutado((a) => (a.formatos.story.mascaraDaFoto = mascara), oito))).toEqual([])
  })

  it('CT-03: tipo desconhecido, raio < 0,5, não finito ou não número, e flecha ≥ altura da caixa (px) → CAMPO_INVALIDO', () => {
    expect(problemas(mutado((a) => (a.formatos.story.mascaraDaFoto.tipo = 'circulo')))).toEqual(['CAMPO_INVALIDO formatos.story.mascaraDaFoto.tipo'])
    for (const raio of [0.49, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '0.62', null]) {
      expect(problemas(mutado((a) => (a.formatos.feed.mascaraDaFoto.raio = raio))), String(raio)).toEqual(['CAMPO_INVALIDO formatos.feed.mascaraDaFoto.raio'])
    }
    // Caixa baixa (Story y .8, h .2 = 384 px): o raio 0,62 cabe (flecha 273,7 px); o semicírculo (540 px) não.
    const baixa = (raio: number) => mutado((a) => (a.formatos.story.foto = { x: 0, y: 0.8, w: 1, h: 0.2 }) && (a.formatos.story.mascaraDaFoto.raio = raio))
    expect(problemas(baixa(0.62))).toEqual([])
    expect(problemas(baixa(0.5))).toEqual(['CAMPO_INVALIDO formatos.story.mascaraDaFoto.raio'])
    expect(problemas(mutado((a) => (a.formatos.story.mascaraDaFoto.raio = 0.5)))).toEqual([])
  })

  it('R1 CT-03: raio finito cuja conta não é (1e308, 1e200, 1e150) → CAMPO_INVALIDO no raio, nos dois formatos', () => {
    for (const raio of [1e308, 1e200, 1e150]) {
      expect(problemas(mutado((a) => (a.formatos.story.mascaraDaFoto.raio = raio))), String(raio)).toEqual(['CAMPO_INVALIDO formatos.story.mascaraDaFoto.raio'])
      expect(problemas(mutado((a) => (a.formatos.feed.mascaraDaFoto.raio = raio))), String(raio)).toEqual(['CAMPO_INVALIDO formatos.feed.mascaraDaFoto.raio'])
    }
  })

  it('CT-04: contrato FECHADO na máscara (chave a mais, path, não objeto); ZONA_SOBRE_A_FOTO continua sobre o RETÂNGULO', () => {
    expect(problemas(mutado((a) => (a.formatos.story.mascaraDaFoto.curva = 1)))).toEqual(['CAMPO_DESCONHECIDO formatos.story.mascaraDaFoto.curva'])
    expect(problemas(mutado((a) => (a.formatos.story.mascaraDaFoto.path = 'M0 0 Z')))).toEqual(['CAMPO_PROIBIDO formatos.story.mascaraDaFoto.path'])
    expect(problemas(mutado((a) => (a.formatos.feed.mascaraDaFoto = 'arco-janela')))).toEqual(['CAMPO_INVALIDO formatos.feed.mascaraDaFoto'])
    expect(problemas(mutado((a) => (a.formatos.feed.mascaraDaFoto = { tipo: 'arco-janela' })))).toEqual(['CAMPO_INVALIDO formatos.feed.mascaraDaFoto.raio'])
    // O canto de cima à direita da caixa: escondido pelo arco (a lateral toca em y ≈ .5625), mas dentro do retângulo.
    expect(problemas(mutado((a) => (a.formatos.story.papeis.logo.zona.yMax = 0.45)))).toEqual(['ZONA_SOBRE_A_FOTO formatos.story.papeis.logo.zona'])
  })

  it('CT-06: âncora topo, alinhamento à esquerda e canto superior-direito coerentes com a geometria; outro canto é incoerente', () => {
    expect(ARQUETIPO_ARCO_9.preferencias).toEqual({ ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'superior-direito' })
    expect(problemas(mutado((a) => (a.preferencias.cantoDaMarca = 'inferior-direito')))).toContain('PREFERENCIA_INCOERENTE formatos.story.papeis.logo.zona')
  })
})

let medidor: Awaited<ReturnType<typeof medidorComAsFontesDoRepo>> | null = null
const medir = async () => (medidor ??= await medidorComAsFontesDoRepo(() => vi.importActual('@/lib/creatives/server-text-measurer')))
async function recusa(promessa: Promise<unknown>): Promise<{ code: string; status?: number; message: string; details?: Record<string, any> }> {
  try {
    await promessa
  } catch (e) {
    return e as { code: string; status?: number; message: string; details?: Record<string, any> }
  }
  throw new Error('esperava recusa')
}
/** A recusa ANTES de gravar: a persistência (dublê) não foi chamada. */
async function recusaSemGravar(promessa: Promise<unknown>) {
  const antes = cap.entradas.length
  const e = await recusa(promessa)
  expect(cap.entradas.length, 'nada pode ser gravado numa recusa').toBe(antes)
  return e
}
const ASSUNTO_NO_CANTO = { x0: 0, y0: 0, x1: 0.12, y1: 0.12 }

describe('#9 · a máscara no compositor real (MK-07–MK-09, CT-05)', () => {
  it('MK-07: só o arquétipo com máscara ganha style.mask — a mesma definição sem ela sai com a bg-foto de sempre (o caminho do #8)', async () => {
    cenario.atual = await cenario9('claro', await medir())
    const com = await comporPeca(spec9('story', 'claro'), { autor: 'u' })
    const bg = com.layers.find((l) => l.id === 'bg-foto')!
    expect(Object.keys(bg.style ?? {}).sort()).toEqual(['cropPosition', 'mask', 'objectFit'])
    cap.semMascara = true
    try {
      const sem = await comporPeca(spec9('story', 'claro'), { autor: 'u' })
      const bgSem = sem.layers.find((l) => l.id === 'bg-foto')!
      expect(bgSem.style).toEqual({ objectFit: 'cover', cropPosition: 'center-middle' })
      expect([bgSem.id, bgSem.position, bgSem.size]).toEqual([bg.id, bg.position, bg.size])
      expect(cap.entradas.at(-1)!.fieldValues.composicao.arquetipo.foto).toBeUndefined()
    } finally {
      cap.semMascara = false
    }
  }, 120_000)

  for (const [nome, flag] of [['editor (segmentosDoPath)', 'quebrarEditor'], ['servidor (Path2D do @napi-rs/canvas)', 'quebrarServidor']] as const) {
    it(`MK-09: o parser do ${nome} forçado a falhar → recusa ARQUETIPO_INDISPONIVEL antes de gravar; destravado, compõe (vermelho → verde)`, async () => {
      cenario.atual = await cenario9('claro', await medir())
      cap[flag] = true
      try {
        const e = await recusaSemGravar(comporPeca(spec9('story', 'claro'), { autor: 'u' }))
        expect([e.code, e.status, e.details!.arquetipo]).toEqual(['ARQUETIPO_INDISPONIVEL', 422, `${ID_ARCO}@1`])
        expect(e.message).toMatch(/máscara da foto não é lida pelos dois traçados/)
      } finally {
        cap[flag] = false
      }
      const r = await comporPeca(spec9('story', 'claro'), { autor: 'u' })
      expect((r.layers.find((l) => l.id === 'bg-foto')!.style as any).mask.shapeId).toBe('arco-janela')
    }, 120_000)
  }

  it('MK-08: assunto catalogado no canto que o arco esconde (foto sem sobra: só o corte central) → SEM_COMBINACAO; no retângulo ele seria 100% e a peça sairia', async () => {
    const foto = await sharp({ create: { width: 1080, height: 1114, channels: 3, background: '#7a6a5a' } }).jpeg().toBuffer()
    const catalogo = { driveFileId: 'drive-9', assunto: ASSUNTO_NO_CANTO }
    const caixa = assuntoEmPixels(ASSUNTO_NO_CANTO, { width: 1080, height: 1114 }, { width: 1080, height: 1114 }, 'center-middle')
    expect(fracaoVisivelDoAssunto(caixa, { width: 1080, height: 1114 })).toBe(1)
    expect(fracaoVisivelNoArco(caixa, { w: 1080, h: 1114 }, 0.62)).toBeLessThan(0.75)
    cenario.atual = await cenario9('claro', await medir(), { foto, catalogo })
    const s = spec9('story', 'claro', { foto: { driveFileId: 'drive-9' } })
    const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
    expect([e.code, e.status, e.details!.motivo, e.details!.cortesAvaliados]).toEqual(['SEM_COMBINACAO', 422, 'CORTE_PERDE_O_ASSUNTO', ['center-middle']])
    // O controle: a MESMA definição sem a máscara mede no retângulo e compõe.
    cap.semMascara = true
    try {
      const r = await comporPeca(s, { autor: 'u' })
      expect(r.diagnostico.foto).toMatchObject({ corte: 'center-middle', assuntoVisivel: 1 })
    } finally {
      cap.semMascara = false
    }
  }, 120_000)

  it('MK-08: enquadramento fixo com o assunto escondido no canto pelo corte central, e o corte de cima o mostra → PREFERENCIA_INVIAVEL; livre → o corte de cima', async () => {
    const assunto = { x0: 0, y0: 0.2, x1: 0.1, y1: 0.26 }
    const foto682 = { width: 682, height: 1024 }
    const caixa = { width: 1080, height: 1114 }
    const no = (crop: 'center-middle' | 'center-top') => fracaoVisivelNoArco(assuntoEmPixels(assunto, foto682, caixa, crop), { w: 1080, h: 1114 }, 0.62)
    expect(no('center-middle')).toBeLessThan(0.75)
    expect(no('center-top')).toBeGreaterThanOrEqual(0.75)
    cenario.atual = await cenario9('claro', await medir(), { catalogo: { driveFileId: 'drive-9', assunto } })
    const fixo = spec9('story', 'claro', { foto: { driveFileId: 'drive-9' }, preferencias: { variante: 'arco9-claro', enquadramento: 'fixo' } })
    const e = await recusaSemGravar(comporPeca(fixo, { autor: 'u' }))
    expect([e.code, e.details!.preferencia, e.details!.alternativa.corte]).toEqual(['PREFERENCIA_INVIAVEL', 'enquadramento', 'center-top'])
    const r = await comporPeca(spec9('story', 'claro', { foto: { driveFileId: 'drive-9' } }), { autor: 'u' })
    expect(r.diagnostico.foto!.corte).toBe('center-top')
    expect(r.diagnostico.foto!.assuntoVisivel).toBeCloseTo(no('center-top'), 6)
  }, 120_000)

  for (const funcao of ['servico', 'cta'] as const) {
    it(`CT-05: bloco ${funcao} → ARQUETIPO_PAPEIS_INCOMPATIVEIS no compor e no medir-copy, nada gravado`, async () => {
      cenario.atual = await cenario9('claro', await medir())
      const s = spec9('story', 'claro', { copyAutoral: copy9('story', { mais: [{ id: 'extra', funcao, linhas: ['Sexta, 20h'] }] }) })
      const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
      expect([e.code, e.details!.naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', [funcao]])
      const em = await recusa(medirCopyDoProjeto({ projectId: PROJETO_9, formato: 'story', copyAutoral: s.copyAutoral, fotoUrl: s.foto.url, variante: 'arco9-claro', arquetipo: s.arquetipo } as never))
      expect(em.code).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
    }, 120_000)
  }

  it('CT-05: pré e apoio são opcionais (só a manchete compõe); a logo é fixa no superior direito', async () => {
    cenario.atual = await cenario9('escuro', await medir())
    const r = await comporPeca(spec9('story', 'escuro', { copyAutoral: copy9('story', { pre: null, apoio: null }) }), { autor: 'u' })
    expect(r.layers.filter((l) => l.type === 'text').map((l) => l.id)).toEqual(['headline'])
    expect(r.diagnostico.arquetipo!.logo).toMatchObject({ modo: 'referencia', canto: 'superior-direito' })
  }, 120_000)
})
