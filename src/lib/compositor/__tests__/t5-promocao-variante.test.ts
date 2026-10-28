/**
 * T5 (24/10/2026) — a cópia de estilo, a validação e a equivalência da variante promovida (`variante-promovida.ts`),
 * PUROS e sem banco: este arquivo não dubla `@/lib/db` — se o módulo o importasse, o `db.ts` lançaria sem
 * `DATABASE_URL` (vitest.setup) e o arquivo inteiro cairia (Q6, a prova de comportamento).
 *
 * Fixtures sintéticas, com os construtores REAIS onde existem: os blocos de texto do compositor (`montarBloco`) e os
 * acentos de cada preset publicado (`receitasDoArquetipo` + `camadaDoAcento`), as tags do Layouts
 * (`tagsDaPaginaDoLayout`) e o vetor multicor da CP-V5. Não é página de marca real.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import type { EstiloDePapel } from '../assinatura'
import { montarBloco } from '../blocos'
import { listarArquetipos } from '../arquetipos/catalogo'
import { camadaDoAcento, receitasDoArquetipo } from '../arquetipos/acentos'
import { tagsDaPaginaDoLayout, nomeDaPaginaDoLayout } from '../arquetipos/da-pagina'
import { lerCamadas } from '@/lib/posts/page-layers'
import { camadaMulticor } from '@/lib/vetor/__tests__/suporte/multicor'
import { fontesNoDisco, medidorComFontesReais } from '@/lib/direcao-de-arte/__tests__/suporte/cenario-15'
import { copiaDeEstiloDaPagina, medidorDeterministico, mesmaVariante, validarVariantePromovida, type PaginaDeOrigem } from '../variante-promovida'

const texto = (id: string, name: string, y: number, extra: Partial<Layer> = {}): Layer =>
  ({ id, name, type: 'text', visible: true, position: { x: 100, y }, size: { width: 880, height: 120 }, content: name === 'cta' ? '→ Reserve já' : `Texto de ${name}`, style: { fontFamily: 'Georgia', fontSize: 72, color: '#1F1A17', textAlign: 'left' }, ...extra }) as Layer
const pagina = (layers: unknown[], extra: Partial<PaginaDeOrigem> = {}): PaginaDeOrigem => ({ name: 'Convite da casa', width: 1080, height: 1920, background: '#F4EFE6', layers: JSON.stringify(layers), tags: ['story'], ...extra })
const estilo: EstiloDePapel = { fontFamily: 'Georgia', fontSize: 80, lineHeight: 1.1, letterSpacing: 0, color: '#1F1A17' }
const bloco = (papel: 'pre' | 'headline' | 'apoio' | 'cta' | 'servico', y: number, extra: { id?: string; groupId?: string } = {}) => {
  const r = montarBloco({ papel, ...(extra.id ? { id: extra.id } : {}), linhas: [`Linha de ${papel}`], estilo, escalaDoFormato: 1, colunaUtil: 880, textAlign: 'left', groupId: extra.groupId ?? `grupo-${papel}`, corDaMancha: '#000000', medir: medidorDeterministico, origem: { bloco: `b-${papel}`, linhas: [0] } as never })
  return { ...r.bloco!.layer, position: { x: 100, y } } as Layer
}

/** Página feita À MÃO: papel só no id, nome livre, array fora da ordem de `order`, campos de render ausentes, logo. */
const feitaAMao = () =>
  pagina([
    { id: 'logo', name: 'Logo', type: 'logo', visible: true, order: 3, position: { x: 80, y: 80 }, size: { width: 240, height: 100 }, fileUrl: 'https://cdn.exemplo/logo.png' },
    texto('headline', 'Título livre', 1300, { order: 1 }),
    texto('t2', 'apoio', 1500, { order: 2, parentId: 'grupo-x' } as Partial<Layer>),
    texto('t3', 'cta', 1650, { order: 0, visible: false }),
    { id: 'foto', name: 'Foto', type: 'image', visible: true, order: 4, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://cdn.exemplo/foto.jpg' },
  ])

describe('T5 · cópia de estilo (K)', () => {
  it('K1/K3/K4/K15: camadas CRUAS — mesmos ids, parentId, order e ordem do array; texto, fundo e tamanho iguais; nada completado', () => {
    const origem = feitaAMao()
    const copia = copiaDeEstiloDaPagina(origem)
    expect(copia.layers).toEqual(lerCamadas(origem.layers).camadas)
    expect(JSON.stringify(copia.layers)).toBe(JSON.stringify(lerCamadas(origem.layers).camadas))
    expect(copia.layers.map((c) => c.id)).toEqual(['logo', 'headline', 't2', 't3', 'foto'])
    expect(copia.layers.map((c) => c.order)).toEqual([3, 1, 2, 0, 4])
    for (const c of copia.layers) {
      expect(c).not.toHaveProperty('locked')
      expect((c.style as Record<string, unknown> | undefined)?.lineHeight).toBeUndefined()
      expect(c).not.toHaveProperty('textboxConfig')
    }
    expect(copia).toMatchObject({ name: origem.name, width: 1080, height: 1920, background: '#F4EFE6', tags: ['fora-do-rodizio', 'story'] })
    expect(validarVariantePromovida(copia, origem)).toMatchObject({ ok: true, formato: 'story' })
  })

  it('K2: metadata.compositor vira a allowlist { papel } (papel válido); some quando vazio; o resto do metadata fica', () => {
    const origem = pagina([
      texto('headline', 'headline', 1300, { metadata: { groupId: 'g1', elementLabel: 'Manchete', compositor: { papel: 'headline', bloco: 'b1', linhas: [0], extra: { id: 'x' }, prefixo: '→ ', encaixe: 4, canto: 'superior-esquerdo', elementoDe: 'logo', acento: { elemento: 'fio' }, chaveFutura: 1 } } } as Partial<Layer>),
      { id: 'acento-fio', name: 'Acento', type: 'shape', visible: true, position: { x: 100, y: 1250 }, size: { width: 300, height: 4 }, style: { shapeType: 'line', fill: '#1F1A17' }, metadata: { compositor: { acento: { elemento: 'fio', arquetipo: 'x' } } } },
      texto('apoio', 'apoio', 1500, { metadata: { compositor: { papel: 'nao-e-papel', bloco: 'b2' } } } as Partial<Layer>),
    ])
    const [h, acento, apoio] = copiaDeEstiloDaPagina(origem).layers as Array<{ metadata: Record<string, unknown> }>
    expect(h.metadata).toEqual({ groupId: 'g1', elementLabel: 'Manchete', compositor: { papel: 'headline' } })
    expect(acento.metadata).toEqual({})
    expect(apoio.metadata).toEqual({})
  })

  it('K11: papel que vinha só do ID continua reconhecido; controle: com ids regerados a manchete some', () => {
    const origem = feitaAMao()
    const copia = copiaDeEstiloDaPagina(origem)
    expect(validarVariantePromovida(copia, origem)).toMatchObject({ ok: true, papeis: expect.arrayContaining(['headline', 'apoio']) })
    const regerada = { ...copia, layers: copia.layers.map((c, i) => ({ ...c, id: `camada-${i}` })) }
    expect(validarVariantePromovida(regerada, { ...origem, layers: JSON.stringify(regerada.layers) })).toMatchObject({ ok: false, codigo: 'VARIANTE_SEM_MANCHETE' })
  })

  it('K13: texto com compositor.papel + nome = id do bloco + grupo com filete — arranjo igual; controle: apagar a marca inteira é recusado', () => {
    const origem = pagina([
      bloco('headline', 1200),
      bloco('apoio', 1450, { id: 'b-apoio', groupId: 'g1' }),
      { id: 'filete', name: 'Filete', type: 'shape', visible: true, position: { x: 100, y: 1430 }, size: { width: 200, height: 3 }, style: { shapeType: 'line', fill: '#B08D57' }, metadata: { groupId: 'g1' } },
    ])
    const copia = copiaDeEstiloDaPagina(origem)
    expect((copia.layers[1].metadata as Record<string, unknown>).compositor).toEqual({ papel: 'apoio' })
    expect(validarVariantePromovida(copia, origem)).toMatchObject({ ok: true })
    const semMarca = { ...copia, layers: copia.layers.map(({ metadata, ...c }) => ({ ...c, metadata: { ...(metadata as Record<string, unknown>), compositor: undefined } })) }
    const r = validarVariantePromovida(semMarca, origem)
    expect(r).toMatchObject({ ok: false, codigo: 'COPIA_NAO_EQUIVALENTE' })
    expect((r as unknown as { detalhes: { diferencas: string[] } }).detalhes.diferencas).toEqual(expect.arrayContaining(['papeisDoArranjo', 'arranjos']))
  })

  it('K14: id, nome e compositor.papel divergentes — as duas derivações dão o mesmo na origem e na cópia', () => {
    const origem = pagina([texto('headline', 'headline', 1200), texto('cta', 'apoio', 1450, { metadata: { compositor: { papel: 'servico', bloco: 'b' } } } as Partial<Layer>)])
    expect(validarVariantePromovida(copiaDeEstiloDaPagina(origem), origem)).toMatchObject({ ok: true })
  })

  it('K16: duas manchetes → aviso, e a primeira da lista é a mesma nos dois lados', () => {
    const origem = pagina([texto('headline', 'headline', 1200), texto('h2', 'manchete', 1400)])
    const r = validarVariantePromovida(copiaDeEstiloDaPagina(origem), origem)
    expect(r).toMatchObject({ ok: true, avisos: expect.arrayContaining([expect.stringMatching(/2 camadas fazem o papel "headline"/)]) })
  })

  it('K9: página sintética de CADA preset publicado (com os acentos reais): estilo copiado, acento sem receita, nenhuma tag de Layouts', () => {
    const presets = listarArquetipos()
    // H9: o #9@1 publicado → 11 presets (o laço cobre o #9: sem elementos, papéis pre/headline/apoio); IH #10: os 2 da coluna → 13.
    expect(presets.map((a) => `${a.id}@${a.versao}`)).toHaveLength(13)
    for (const def of presets) {
      const { receitas } = receitasDoArquetipo(def, { formato: 'story', canvas: { width: 1080, height: 1920 } })
      const acentos = receitas.map((receita, i) => camadaDoAcento({ receita, rect: { x: 100, y: 1100 + i * 40, width: 300, height: 24 } }, { hex: '#B08D57', fonte: 'assinatura' }, def.id))
      const papeis = [...new Set(def.papeis.map((p) => p.papel))].filter((p): p is 'pre' | 'headline' | 'apoio' | 'cta' | 'servico' => ['pre', 'headline', 'apoio', 'cta', 'servico'].includes(p))
      const origem = pagina([...papeis.map((p, i) => bloco(p, 1200 + i * 150)), ...acentos], { name: nomeDaPaginaDoLayout(def.nome, false), tags: tagsDaPaginaDoLayout(def.id) })
      const copia = copiaDeEstiloDaPagina(origem)
      expect(copia.tags).toEqual(['fora-do-rodizio', 'story'])
      const acentosDaCopia = copia.layers.filter((c) => String(c.id).startsWith('acento-'))
      expect(acentosDaCopia).toHaveLength(acentos.length)
      for (const a of acentosDaCopia) expect((a.metadata as Record<string, unknown> | undefined)?.compositor).toBeUndefined()
      const r = validarVariantePromovida(copia, origem)
      expect({ preset: `${def.id}@${def.versao}`, ok: r.ok }).toEqual({ preset: `${def.id}@${def.versao}`, ok: true })
    }
  })

  it('K10: vetor multicor (papéis, slots e cores) sai igual', () => {
    const origem = pagina([texto('headline', 'headline', 1200), camadaMulticor()])
    const copia = copiaDeEstiloDaPagina(origem)
    expect(copia.layers[1]).toEqual(JSON.parse(JSON.stringify(camadaMulticor())))
    expect(validarVariantePromovida(copia, origem)).toMatchObject({ ok: true })
  })
})

describe('T5 · validação (P)', () => {
  const recusaDe = (origem: PaginaDeOrigem) => validarVariantePromovida(copiaDeEstiloDaPagina(origem), origem)

  it('P10: quadrado → FORMATO_NAO_SUPORTADO', () => {
    expect(recusaDe(pagina([texto('headline', 'headline', 300)], { width: 1080, height: 1080, tags: [] }))).toMatchObject({ ok: false, codigo: 'FORMATO_NAO_SUPORTADO', detalhes: { formatoGravado: 'quadrado' } })
  })

  it('P11: story chamada "… feed" → FORMATO_NAO_SUPORTADO com os dois valores', () => {
    expect(recusaDe(pagina([texto('headline', 'headline', 1300)], { name: 'Story do feed', tags: [] }))).toMatchObject({ ok: false, codigo: 'FORMATO_NAO_SUPORTADO', detalhes: { formatoGravado: 'story', formatoPeloNome: 'feed' } })
  })

  it('P12: sem manchete → VARIANTE_SEM_MANCHETE com os papéis achados e os nomes aceitos', () => {
    expect(recusaDe(pagina([texto('a', 'apoio', 1300), texto('b', 'cta', 1500)]))).toMatchObject({ ok: false, codigo: 'VARIANTE_SEM_MANCHETE', detalhes: { papeisAchados: ['apoio', 'cta'], nomesAceitos: ['headline', 'titulo', 'manchete', 'title'] } })
  })

  it('P13: vetor inválido → VETOR_INVALIDO', () => {
    expect(recusaDe(pagina([texto('headline', 'headline', 1300), camadaMulticor({ pathData: 'banana' }, 'ruim')]))).toMatchObject({ ok: false, codigo: 'VETOR_INVALIDO', detalhes: { camadas: [expect.objectContaining({ id: 'ruim' })] } })
  })

  it('P14: camada fora do contrato → CAMADAS_INVALIDAS; a saída com defaults do schema não é a cópia', () => {
    const origem = pagina([texto('headline', 'headline', 1300), { id: 'x', type: 'text' }])
    const copia = copiaDeEstiloDaPagina(origem)
    expect(validarVariantePromovida(copia, origem)).toMatchObject({ ok: false, codigo: 'CAMADAS_INVALIDAS', detalhes: { problemas: [expect.stringMatching(/camada x/)] } })
    expect(copia.layers[1]).toEqual({ id: 'x', type: 'text' })
    expect(validarVariantePromovida({ ...copia, layers: [], legivel: false }, { ...origem, layers: '{nao json' })).toMatchObject({ codigo: 'CAMADAS_INVALIDAS' })
  })

  it('P19: ids repetidos → IDS_DE_CAMADA_REPETIDOS com a lista; nenhum id regerado', () => {
    const origem = pagina([texto('headline', 'headline', 1300), texto('t', 'apoio', 1400), texto('t', 'cta', 1500)])
    const copia = copiaDeEstiloDaPagina(origem)
    expect(validarVariantePromovida(copia, origem)).toMatchObject({ ok: false, codigo: 'IDS_DE_CAMADA_REPETIDOS', detalhes: { ids: ['t'] } })
    expect(copia.layers.map((c) => c.id)).toEqual(['headline', 't', 't'])
  })

  it('P20: estilo da cópia diferente do da origem → COPIA_NAO_EQUIVALENTE com o que mudou', () => {
    const origem = feitaAMao()
    const copia = copiaDeEstiloDaPagina(origem)
    const mexida = { ...copia, layers: copia.layers.map((c) => (c.id === 'headline' ? { ...c, style: { ...(c.style as object), fontSize: 30 } } : c)) }
    expect(validarVariantePromovida(mexida, origem)).toMatchObject({ ok: false, codigo: 'COPIA_NAO_EQUIVALENTE', detalhes: { diferencas: expect.arrayContaining(['estilo']) } })
  })

  it('idempotência: mesmaVariante compara nome, tamanho, fundo e camadas normalizadas', () => {
    const copia = copiaDeEstiloDaPagina(feitaAMao())
    const gravada = { ...copia, layers: JSON.stringify(copia.layers) }
    expect(mesmaVariante(gravada, { ...copia, layers: copia.layers })).toBe(true)
    expect(mesmaVariante(gravada, { ...copia, background: '#000000', layers: copia.layers })).toBe(false)
    expect(mesmaVariante(gravada, { ...copia, layers: copia.layers.slice(1) })).toBe(false)
  })
})

describe.skipIf(!fontesNoDisco())('T5 · K8 com o medidor REAL do servidor (fontes reais no disco)', () => {
  it('a equivalência também vale com a régua de verdade (Georgia/Montserrat registradas)', async () => {
    const { medir, registradas } = await medidorComFontesReais(() => import('@/lib/creatives/server-text-measurer'))
    expect(registradas).toContain('Georgia')
    const k13 = pagina([bloco('headline', 1200), bloco('apoio', 1450, { id: 'b-apoio', groupId: 'g1' }), { id: 'filete', name: 'Filete', type: 'shape', visible: true, position: { x: 100, y: 1430 }, size: { width: 200, height: 3 }, style: { shapeType: 'line', fill: '#B08D57' }, metadata: { groupId: 'g1' } }])
    for (const origem of [feitaAMao(), k13]) {
      const copia = copiaDeEstiloDaPagina(origem)
      expect(validarVariantePromovida(copia, origem, medir)).toMatchObject({ ok: true })
      const semMarca = { ...copia, layers: copia.layers.map(({ metadata, ...c }) => ({ ...c, metadata: { ...(metadata as Record<string, unknown>), compositor: undefined } })) }
      if (origem === k13) expect(validarVariantePromovida(semMarca, origem, medir)).toMatchObject({ ok: false, codigo: 'COPIA_NAO_EQUIVALENTE' })
    }
  })
})
