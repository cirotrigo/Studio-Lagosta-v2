/**
 * B1d — checkpoint g: o CONTRATO dos campos, provado nos consumidores reais (funções puras) e nos escritores (leitura do
 * fonte). O que se impede: um mesmo nome — `slotValues` — significar pedido, copy visual, proposta e texto renderizado.
 *
 * - `SocialPost.slotValues`: com `_slots`/`_papeis` = PEDIDO semântico; sem = legado/copy do post.
 * - `Generation.fieldValues.slotValues` = COPY VISUAL da arte (nunca `_slots`/`_papeis`).
 * - `Generation.fieldValues.slotValuesRecebidos` = PEDIDO original, só AUDITORIA (nunca copy, texto esperado, corpus,
 *   proposta, fonte de agendamento nem fallback de leitura).
 * - `fieldValues.copyDeAprendizado` = proposta (contrato histórico). `Page.layers` = peça viva.
 *   `PostRenderProof.layersSnapshot` = mídia renderizada.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { textoDoPost } from '@/lib/aprendizado/textos-do-post'
import { lerProcedencia } from '@/lib/creatives/procedencia-da-copy'
import { textosDaGeneration } from '@/lib/posts/troca-de-arte'
import { extractExpectedTexts } from '@/lib/ai/creative-text-verification'
import { arteDosFieldValues, textosDaPeca } from '@/lib/posts/textos-da-peca'
import { montarRetornoDaPagina } from '@/lib/mcp/catalogo/ver-geracao-retorno'
import { diffDeCopy, copyDeCamadas } from '@/lib/aprendizado/diff-copy'

/** O caso central do dono: a Generation produzida por texto semântico. */
const PEDIDO = { _slots: { 'headline-principal': 'Festival de Massas' }, _papeis: { headline: { content: 'Festival de Massas' } } }
const FV = { source: 'arte-rapida', slotValues: { Título: 'Festival de Massas' }, slotValuesRecebidos: PEDIDO }
/** Nada do PEDIDO pode aparecer como texto: nem as chaves do contrato, nem o id do slot, nem o papel. */
const VAZOU = /_slots|_papeis|headline-principal|"headline"|\[object Object\]/

describe('1. teste central: a copy visual chega aos consumidores; o pedido não', () => {
  it('aprendizado e pilar (textoDoPost) leem "Festival de Massas" e nada do pedido', () => {
    const t = textoDoPost({ fieldValues: FV })
    expect(t.texto).toContain('Festival de Massas')
    expect(t.texto).not.toMatch(VAZOU)
  })

  it('agendamento por Generation (lerProcedencia): visual e proposta saem de slotValues', () => {
    const p = lerProcedencia(FV, null)
    expect(p.copyVisual).toEqual({ Título: 'Festival de Massas' })
    expect(p.copyProposta).toEqual({ Título: 'Festival de Massas' })
  })

  it('troca de arte (textosDaGeneration) herda a copy visual', () => {
    expect(textosDaGeneration(FV)).toEqual({ Título: 'Festival de Massas' })
  })

  it('melhoria (extractExpectedTexts) confere pela copy visual', () => {
    const esperados = extractExpectedTexts(FV)
    expect(esperados).toContain('Festival de Massas')
    expect(JSON.stringify(esperados)).not.toMatch(VAZOU)
  })

  it('agenda (textosDaPeca de post sem página, pela arte da mídia) lê a copy visual', () => {
    const arte = arteDosFieldValues({ ...FV, layersSnapshot: [{ id: 't', name: 'Título', type: 'text', content: 'Festival de Massas', visible: true }] })
    const r = textosDaPeca({ pageId: null, slotValues: null, status: 'SCHEDULED', laterPostId: null, mediaUrls: ['https://a.png'], generationId: 'g', renderStatus: 'NOT_NEEDED' }, { slides: [{ url: 'https://a.png', arte }] })
    expect(r.textos).toEqual(['Festival de Massas'])
    expect(JSON.stringify(r)).not.toMatch(VAZOU)
  })
})

describe('D/E/R. slotValuesRecebidos nunca é corpus, nem com texto diferente da copy visual', () => {
  it('só slotValues contribui para o texto do aprendizado/pilar', () => {
    const t = textoDoPost({ fieldValues: { slotValues: { Título: 'Real' }, slotValuesRecebidos: { titulo: 'SÓ NO PEDIDO', _slots: { x: 'TAMBÉM NO PEDIDO' } } } })
    expect(t.texto).toContain('Real')
    expect(t.texto).not.toMatch(/SÓ NO PEDIDO|TAMBÉM NO PEDIDO/)
  })

  it('o PEDIDO de um SocialPost semântico não vira texto (as chaves do contrato e o que vai dentro)', () => {
    const t = textoDoPost({ slotValues: PEDIDO })
    expect(t.texto).not.toMatch(/Festival de Massas|headline/)
  })
})

describe('F/G/Q. procedência: visual de slotValues; proposta de copyDeAprendizado (ou visual) — nunca do pedido nem da prova', () => {
  it('com copyDeAprendizado, ela é a proposta; slotValuesRecebidos nunca é', () => {
    const p = lerProcedencia({ slotValues: { T: 'visual' }, copyDeAprendizado: { T: 'proposta' }, slotValuesRecebidos: { T: 'PEDIDO' }, layersSnapshot: [{ type: 'text', content: 'PROVA' }] }, null)
    expect(p.copyVisual).toEqual({ T: 'visual' })
    expect(p.copyProposta).toEqual({ T: 'proposta' })
    expect(JSON.stringify(p)).not.toMatch(/PEDIDO|PROVA/)
  })

  it('sem copy visual, o pedido não a substitui', () => {
    const p = lerProcedencia({ slotValuesRecebidos: { T: 'PEDIDO' } }, null)
    expect(p.copyVisual).toBeNull()
    expect(p.copyProposta).toBeNull()
  })
})

describe('N. Generation legada continua igual', () => {
  it('slotValues legado é visual e proposta, como sempre', () => {
    const p = lerProcedencia({ slotValues: { Título: 'Legado' } }, null)
    expect(p).toMatchObject({ copyVisual: { Título: 'Legado' }, copyProposta: { Título: 'Legado' } })
    expect(textosDaGeneration({ slotValues: { Título: 'Legado' } })).toEqual({ Título: 'Legado' })
  })
})

describe('S. ver-geracao não apresenta o pedido como copy final', () => {
  it('o retorno da página não traz slotValuesRecebidos nem o texto do pedido', () => {
    const r = montarRetornoDaPagina({ fieldValues: { ...FV, pageId: 'p1' }, pagina: { id: 'p1', name: 'P', templateId: 7 } as never, appUrl: 'https://s', projectId: 8, concluida: true })
    expect(JSON.stringify(r)).not.toMatch(/slotValuesRecebidos|headline-principal|_slots|_papeis/)
  })
})

/** Os arquivos de produção (sem testes). */
function fontes(): Array<{ arquivo: string; texto: string }> {
  const out: Array<{ arquivo: string; texto: string }> = []
  const andar = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) {
        if (n !== '__tests__' && n !== 'node_modules' && n !== 'generated') andar(p)
      } else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push({ arquivo: p.slice(process.cwd().length + 1), texto: readFileSync(p, 'utf8') })
    }
  }
  andar(join(process.cwd(), 'src'))
  return out
}

describe('B/K/L. quem grava slotValuesRecebidos, e ninguém o lê como texto', () => {
  const arquivos = fontes()

  it('só os dois escritores de CRIAÇÃO (arte-rápida e a Generation do post) gravam a chave', () => {
    const escritores = arquivos.filter((f) => /slotValuesRecebidos:/.test(f.texto)).map((f) => f.arquivo).sort()
    expect(escritores).toEqual(['src/lib/creatives/arte-rapida.ts', 'src/lib/posts/ensure-post-generation.ts'])
  })

  it('nenhum código de produção LÊ slotValuesRecebidos (é auditoria; consumidor de auditoria explícito ainda não existe)', () => {
    const leitores = arquivos.filter((f) => /\.slotValuesRecebidos\b|\[['"]slotValuesRecebidos['"]\]/.test(f.texto)).map((f) => f.arquivo)
    expect(leitores).toEqual([])
  })

  it('K/L. re-render e recomposição gravam por MERGE no banco (|| do jsonb) sem a chave: o pedido sobrevive', () => {
    for (const arquivo of ['src/lib/compositor/recompor.ts', 'src/lib/creatives/persist.ts']) {
      const t = readFileSync(join(process.cwd(), arquivo), 'utf8')
      expect(t, arquivo).toMatch(/mesclarFieldValuesDaArte\(/)
      expect(t, arquivo).not.toMatch(/slotValuesRecebidos/)
    }
    expect(readFileSync(join(process.cwd(), 'src/lib/creatives/mesclar-field-values.ts'), 'utf8')).toMatch(/"fieldValues" ELSE '\{\}'::jsonb END\) \|\| \$\{json\}::jsonb/)
  })
})

describe('M. refazer / duplicar de arte-ia: comportamento histórico (copy visual de slotValues), sem o pedido', () => {
  it('as duas portas só aceitam arte-ia e leem fv.slotValues — nunca slotValuesRecebidos', () => {
    for (const arquivo of ['src/app/api/projects/[projectId]/arte-ia/[generationId]/refazer/route.ts', 'src/lib/creatives/duplicar-para-bancada.ts']) {
      const t = readFileSync(join(process.cwd(), arquivo), 'utf8')
      expect(t, arquivo).toMatch(/'arte-ia'/)
      expect(t, arquivo).toMatch(/slotValues/)
      expect(t, arquivo).not.toMatch(/slotValuesRecebidos/)
    }
  })
})

describe('T. OUT_OF_SCOPE_FALSE_LEARNING_DIFF — só caracterizado, não corrigido no B1d', () => {
  it('copy proposta por layerId × copy final por nome: o diff acusa troca onde o texto é o mesmo (comportamento ATUAL)', () => {
    // A proposta guardada pela via não-semântica usa a chave do pedido (layerId); o lado final vem da página por nome.
    // Mesmo texto, chaves diferentes → "removido + adicionado". Registrado como fora do B1d: este teste só fixa o hoje.
    const final = copyDeCamadas([{ id: 'layer-123', name: 'Título', type: 'text', content: 'Noite do vinho', visible: true }])
    const d = diffDeCopy({ 'layer-123': 'Noite do vinho' } as never, final as never)
    expect(d.mudou).toBe(true)
  })
})
