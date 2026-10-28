import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAPEIS_DA_MARCA } from '@/lib/brand/papeis-de-cor'
import { listarArquetipos } from '@/lib/compositor/arquetipos/catalogo'
import { ELEMENTOS_DO_ARQUETIPO, PAPEIS_DE_COR } from '@/lib/compositor/arquetipos/tipos'
import { segmentosDoPath } from '@/lib/vetor/tracar'
import { validarPathData } from '@/lib/vetor/validar'
import { CATEGORIAS_CANDIDATAS, ELEMENTOS_CANDIDATOS, ELEMENTOS_MULTICOR, MASCARAS_DE_IMAGEM, SHAPE_CATEGORIES, SHAPES_LIBRARY } from '../shapes-library'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const porId = (id: string) => ELEMENTOS_CANDIDATOS.find((e) => e.id === id)!

/** O catálogo vivo na base do CP-V2b (`main` 54fc701d): 37 itens, nesta ordem. */
const IDS_VIVOS = [
  'rectangle', 'rounded', 'circle', 'triangle', 'star', 'diamond', 'pentagon', 'hexagon', 'octagon', 'trapezoid',
  'parallelogram', 'semicircle', 'ring', 'cross', 'arrow', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down',
  'chevron-right', 'line', 'line-dashed', 'line-dotted', 'line-arrow', 'line-arrow-both', 'heart', 'sparkle', 'burst',
  'bolt', 'drop', 'pin', 'speech', 'cloud', 'blob', 'shield', 'tag', 'banner',
]
const IDS_DAS_MASCARAS = [
  'diamond', 'pentagon', 'hexagon', 'octagon', 'trapezoid', 'parallelogram', 'semicircle', 'ring', 'cross',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'chevron-right',
  'heart', 'sparkle', 'burst', 'bolt', 'drop', 'pin', 'speech', 'cloud', 'blob', 'shield', 'tag', 'banner',
]
const IDS_CANDIDATOS = [
  'fio-fino', 'moldura-fina', 'pilula-contorno', 'spark-4', 'onda-suave', 'sublinhado-suave', 'pontos', 'moldura-aberta',
  'cantoneiras', 'colchete',
]

describe('catálogo vivo (SHAPES_LIBRARY e SHAPE_CATEGORIES): os 37 legados + os 10 ativados (CP-V2c)', () => {
  it('os 37 legados primeiro, na ordem, com os campos da base intactos (sha256), mais versão e slot; depois os 10 e os multicor (CP-V5)', () => {
    expect(SHAPES_LIBRARY.map((s) => s.id)).toEqual([...IDS_VIVOS, ...IDS_CANDIDATOS, 'onda-base'])
    expect(SHAPES_LIBRARY.filter((s) => s.shapeType === 'svg-path')).toHaveLength(34)
    // sem os 2 campos que a ativação acrescenta, o JSON dos 37 é o da base 54fc701d, byte a byte
    const legados = SHAPES_LIBRARY.slice(0, 37).map(({ versao: _v, slots: _s, ...resto }) => resto)
    expect(sha(JSON.stringify(legados))).toBe('e58a7999fdcd0884e68c8f0743ee722561c5f5a4b79419fb742ee64379b0afdd')
    expect(SHAPES_LIBRARY.slice(37)).toEqual([...ELEMENTOS_CANDIDATOS, ...ELEMENTOS_MULTICOR])
  })

  it('papel e slot dos 37 (D3): básicas e decorativas → destaque; setas e linhas → texto; um canal só, versão 1, livres', () => {
    const papel = { basicas: 'destaque', decorativas: 'destaque', setas: 'texto', linhas: 'texto' } as const
    for (const s of SHAPES_LIBRARY.slice(0, 37)) {
      const rotulo = s.shapeType === 'line' ? 'Cor da linha' : 'Preenchimento'
      expect([s.id, s.versao, s.ajuste, s.slots]).toEqual([s.id, 1, undefined, [{ canal: 'preenchimento', papelPadrao: papel[s.category as keyof typeof papel], rotulo }]])
    }
    expect(SHAPES_LIBRARY.every((s) => (s.slots?.length ?? 0) > 0 && s.versao === 1)).toBe(true)
  })

  it('categorias do painel: as 4 legadas e as 5 dos candidatos que faltavam; toda categoria usada está na lista (nenhum item escondido)', () => {
    expect(SHAPE_CATEGORIES).toEqual([
      { id: 'basicas', label: 'Básicas' },
      { id: 'setas', label: 'Setas' },
      { id: 'linhas', label: 'Linhas' },
      { id: 'decorativas', label: 'Decorativas' },
      { id: 'formas', label: 'Formas' },
      { id: 'organicos', label: 'Orgânicos' },
      { id: 'destaques', label: 'Destaques' },
      { id: 'editorial', label: 'Editorial' },
      { id: 'ornamentos', label: 'Ornamentos' },
    ])
    expect(new Set(SHAPE_CATEGORIES.map((c) => c.id)).size).toBe(SHAPE_CATEGORIES.length)
    // o que o painel monta: cada categoria filtra os seus itens; a união é o catálogo inteiro
    const mostrados = SHAPE_CATEGORIES.flatMap((c) => SHAPES_LIBRARY.filter((s) => s.category === c.id).map((s) => s.id))
    expect(mostrados.sort()).toEqual(SHAPES_LIBRARY.map((s) => s.id).sort())
  })

  it('nenhum id candidato nas máscaras', () => {
    const candidatos = new Set(IDS_CANDIDATOS)
    expect(MASCARAS_DE_IMAGEM.filter((s) => candidatos.has(s.id))).toEqual([])
  })
})

describe('máscaras de imagem: lista explícita dos 26 svg-path legados', () => {
  it('os 26 ids, na ordem, com os mesmos paths da base', () => {
    expect(MASCARAS_DE_IMAGEM.map((s) => s.id)).toEqual(IDS_DAS_MASCARAS)
    // hash dos [id, pathData, pathFillRule] que a barra de imagem lia na base 54fc701d
    const lido = MASCARAS_DE_IMAGEM.map((s) => [s.id, s.pathData, s.pathFillRule ?? null])
    expect(sha(JSON.stringify(lido))).toBe('95e2b6cc078f9f95119f2333f7c995562ab4b4b20974ee032d43188c816dc988')
  })

  it('não deriva do catálogo vivo: a derivação antiga ("todo svg-path") daria os 26 + os 7 ativados + a onda-base', () => {
    const derivada = SHAPES_LIBRARY.filter((s) => s.shapeType === 'svg-path' && s.pathData)
    expect(derivada).toHaveLength(34)
    expect(MASCARAS_DE_IMAGEM.map((s) => s.id)).toEqual(derivada.map((s) => s.id).filter((id) => !IDS_CANDIDATOS.includes(id) && id !== 'onda-base'))
  })
})

describe('consumidores: a ativação é um ponto só, lido na fonte', () => {
  const fonte = (caminho: string) => readFileSync(join(process.cwd(), caminho), 'utf8')

  it('nenhum arquivo de produção além do catálogo usa o export candidato (os candidatos chegam pelo SHAPES_LIBRARY)', () => {
    const src = join(process.cwd(), 'src')
    const usam = (readdirSync(src, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !f.split('/').includes('__tests__') && f !== 'lib/assets/shapes-library.ts' && f !== 'lib/vetor/importar.ts')
      .filter((f) => /ELEMENTOS_CANDIDATOS|CATEGORIAS_CANDIDATAS|ElementoCandidato|CategoriaDoElemento/.test(readFileSync(join(src, f), 'utf8')))
    expect(usam).toEqual([])
  })

  it('o importador de SVG (CP-V6) EMITE o formato candidato e valida a categoria, mas nunca lê os itens do catálogo', () => {
    const importador = fonte('src/lib/vetor/importar.ts')
    expect(importador).toContain("import { CATEGORIAS_CANDIDATAS, type CategoriaDoElemento, type ElementoCandidato } from '@/lib/assets/shapes-library'")
    expect(importador).not.toMatch(/ELEMENTOS_CANDIDATOS|ELEMENTOS_MULTICOR|SHAPES_LIBRARY|FORMAS_LEGADAS|MASCARAS_DE_IMAGEM/)
  })

  it('a barra de imagem lê só as máscaras explícitas; o painel de formas segue no catálogo vivo', () => {
    const barra = fonte('src/components/templates/image-toolbar.tsx')
    expect(barra).toContain("import { MASCARAS_DE_IMAGEM } from '@/lib/assets/shapes-library'")
    expect(barra).not.toContain('SHAPES_LIBRARY')
    // desde o CP-V2d o painel é o "Elementos": lê o catálogo vivo pelo módulo do painel (`gruposDoPainel`)
    const painel = fonte('src/lib/assets/painel-de-elementos.ts')
    expect(painel).toContain("import { SHAPES_LIBRARY, type ShapeDefinition } from '@/lib/assets/shapes-library'")
    expect(fonte('src/components/templates/panels/elementos-panel.tsx')).toMatch(/import \{[^}]*\bgruposDoPainel\b[^}]*\} from '@\/lib\/assets\/painel-de-elementos'/)
  })
})

describe('catálogo candidato (ELEMENTOS_CANDIDATOS)', () => {
  it('10 ids únicos, sem colisão com os 37 legados: 3 presets nativos, 1 cópia de path e 6 svg-path novos', () => {
    expect(ELEMENTOS_CANDIDATOS.map((e) => e.id)).toEqual(IDS_CANDIDATOS)
    const vivos = new Set(SHAPES_LIBRARY.slice(0, 37).map((s) => s.id))
    expect(ELEMENTOS_CANDIDATOS.filter((e) => vivos.has(e.id))).toEqual([])

    expect(ELEMENTOS_CANDIDATOS.filter((e) => e.shapeType !== 'svg-path').map((e) => [e.id, e.shapeType])).toEqual([
      ['fio-fino', 'line'],
      ['moldura-fina', 'rectangle'],
      ['pilula-contorno', 'rounded-rectangle'],
    ])
    expect(porId('spark-4').pathData).toBe(SHAPES_LIBRARY.find((s) => s.id === 'sparkle')!.pathData)
    const pathsVivos = new Set(SHAPES_LIBRARY.slice(0, 37).map((s) => s.pathData).filter(Boolean))
    const novos = ELEMENTOS_CANDIDATOS.filter((e) => e.shapeType === 'svg-path' && !pathsVivos.has(e.pathData))
    expect(novos.map((e) => e.id)).toEqual(['onda-suave', 'sublinhado-suave', 'pontos', 'moldura-aberta', 'cantoneiras', 'colchete'])
    expect(new Set(novos.map((e) => e.pathData)).size).toBe(6)
  })

  it('categorias próprias, separadas das vivas, e todo candidato numa delas', () => {
    expect(CATEGORIAS_CANDIDATAS.map((c) => c.id)).toEqual(['linhas', 'formas', 'organicos', 'setas', 'destaques', 'editorial', 'ornamentos'])
    expect(new Set(CATEGORIAS_CANDIDATAS.map((c) => c.label)).size).toBe(CATEGORIAS_CANDIDATAS.length)
    expect(CATEGORIAS_CANDIDATAS).not.toBe(SHAPE_CATEGORIES)
    const ids = new Set(CATEGORIAS_CANDIDATAS.map((c) => c.id))
    for (const e of ELEMENTOS_CANDIDATOS) expect([e.id, ids.has(e.category)]).toEqual([e.id, true])
    expect(ELEMENTOS_CANDIDATOS.map((e) => [e.id, e.category])).toEqual([
      ['fio-fino', 'linhas'],
      ['moldura-fina', 'formas'],
      ['pilula-contorno', 'formas'],
      ['spark-4', 'ornamentos'],
      ['onda-suave', 'organicos'],
      ['sublinhado-suave', 'destaques'],
      ['pontos', 'ornamentos'],
      ['moldura-aberta', 'editorial'],
      ['cantoneiras', 'editorial'],
      ['colchete', 'editorial'],
    ])
  })

  it('todo pathData passa no validador, nos tetos (≤ 4 KB, ≤ 4 subpaths, ≤ 120 segmentos) e só tem comandos absolutos M L C Z', () => {
    const comPath = ELEMENTOS_CANDIDATOS.filter((e) => e.shapeType === 'svg-path')
    expect(comPath).toHaveLength(7)
    for (const e of comPath) {
      const d = e.pathData!
      const segmentos = segmentosDoPath(d)
      expect([e.id, validarPathData(d).ok]).toEqual([e.id, true])
      expect([e.id, /^[MLCZ\d.\s-]+$/.test(d)]).toEqual([e.id, true])
      expect([e.id, new TextEncoder().encode(d).length <= 4096]).toEqual([e.id, true])
      expect([e.id, segmentos.filter((s) => s.command === 'M').length <= 4]).toEqual([e.id, true])
      expect([e.id, segmentos.filter((s) => s.command !== 'M').length <= 120]).toEqual([e.id, true])
    }
    expect(ELEMENTOS_CANDIDATOS.filter((e) => e.shapeType !== 'svg-path' && e.pathData)).toEqual([])
  })

  it('slots coerentes com o canal físico: a line pinta por preenchimento; só contorno tem fill transparente', () => {
    for (const e of ELEMENTOS_CANDIDATOS) {
      const canais = e.slots.map((s) => s.canal)
      expect([e.id, canais.length > 0, new Set(canais).size === canais.length]).toEqual([e.id, true, true])
      for (const s of e.slots) {
        expect([e.id, PAPEIS_DA_MARCA.includes(s.papelPadrao), s.rotulo.length > 0]).toEqual([e.id, true, true])
      }
      const temContorno = canais.includes('contorno')
      const temPreenchimento = canais.includes('preenchimento')
      expect([e.id, e.fill === 'transparent']).toEqual([e.id, !temPreenchimento])
      expect([e.id, e.strokeColor !== undefined]).toEqual([e.id, temContorno])
      if (temContorno || e.shapeType === 'line') expect([e.id, (e.strokeWidth ?? 0) > 0]).toEqual([e.id, true])
    }
    expect(porId('fio-fino').slots).toEqual([{ canal: 'preenchimento', papelPadrao: 'texto', rotulo: 'Cor da linha' }])
    expect(ELEMENTOS_CANDIDATOS.map((e) => [e.id, e.slots.map((s) => `${s.canal}:${s.papelPadrao}`).join()])).toEqual([
      ['fio-fino', 'preenchimento:texto'],
      ['moldura-fina', 'contorno:texto'],
      ['pilula-contorno', 'contorno:texto'],
      ['spark-4', 'preenchimento:destaque'],
      ['onda-suave', 'contorno:destaque'],
      ['sublinhado-suave', 'contorno:destaque'],
      ['pontos', 'preenchimento:texto'],
      ['moldura-aberta', 'contorno:texto'],
      ['cantoneiras', 'contorno:destaque'],
      ['colchete', 'contorno:texto'],
    ])
  })

  it('ajuste, versão, pontas e raio: travados só o spark-4 e os pontos; a pílula tem raio de pílula', () => {
    expect(ELEMENTOS_CANDIDATOS.filter((e) => e.ajuste === 'travado').map((e) => e.id)).toEqual(['spark-4', 'pontos'])
    expect(ELEMENTOS_CANDIDATOS.every((e) => e.versao === 1)).toBe(true)
    expect(ELEMENTOS_CANDIDATOS.filter((e) => e.tracoPontas).map((e) => [e.id, e.tracoPontas])).toEqual([['sublinhado-suave', 'round']])
    // os dois renderers usam min(raio, min(w, h) / 2): com raio alto, o canto acompanha a altura
    expect(porId('pilula-contorno').raio).toBeGreaterThanOrEqual(1000)
    expect(ELEMENTOS_CANDIDATOS.filter((e) => e.raio !== undefined).map((e) => e.id)).toEqual(['pilula-contorno'])
  })

  it('palavras-chave em português e em inglês, minúsculas e sem repetição', () => {
    const minimo: Record<string, [string, string]> = {
      'fio-fino': ['fio', 'hairline'],
      'moldura-fina': ['moldura', 'frame'],
      'pilula-contorno': ['pilula', 'pill'],
      'spark-4': ['brilho', 'spark'],
      'onda-suave': ['onda', 'wave'],
      'sublinhado-suave': ['sublinhado', 'underline'],
      pontos: ['pontos', 'dots'],
      'moldura-aberta': ['canto', 'corner'],
      cantoneiras: ['cantoneiras', 'corners'],
      colchete: ['colchete', 'bracket'],
    }
    for (const e of ELEMENTOS_CANDIDATOS) {
      const [pt, en] = minimo[e.id]
      expect([e.id, e.keywords.includes(pt), e.keywords.includes(en)]).toEqual([e.id, true, true])
      expect([e.id, e.keywords.every((k) => k === k.toLowerCase() && k.trim() === k && k.length > 0)]).toEqual([e.id, true])
      expect([e.id, new Set(e.keywords).size]).toEqual([e.id, e.keywords.length])
    }
  })
})

describe('contrato publicado nos arquétipos (fio-fino, moldura-aberta, spark-4, cantoneiras, pilula-contorno)', () => {
  it('os tipos dos arquétipos não mudaram', () => {
    // O #16 (24/10) acrescenta as cantoneiras, presas à peça; o #5 (24/10), a pílula de contorno, que envolve o serviço.
    // Os de antes não mudam.
    expect([...ELEMENTOS_DO_ARQUETIPO]).toEqual(['fio-fino', 'moldura-aberta', 'spark-4', 'cantoneiras', 'pilula-contorno'])
    expect([...PAPEIS_DE_COR]).toEqual(['texto', 'destaque'])
    for (const p of PAPEIS_DE_COR) expect(PAPEIS_DA_MARCA).toContain(p)
  })

  it('todo elemento de arquétipo publicado existe no candidato, com o mesmo papel no seu único slot', () => {
    const declarados = listarArquetipos().flatMap((a) => (a.elementos ?? []).map((el) => [`${a.id}@${a.versao}`, el] as const))
    // O #15 (24/10) declara o segundo fio-fino publicado (um por item da lista); o #16, as cantoneiras e o terceiro fio; o
    // #16@2 (C2), as mesmas duas de novo (versão publicada ao lado — a lista conta versões); o #5, a pílula de contorno; os
    // 2 ids do #10 (IH, 25/10: `minimal-coluna-foto` e `minimal-coluna-foto-esquerda`), um fio-fino opcional cada → 6 fios.
    expect(declarados.map(([, el]) => el.tipo).sort()).toEqual(['cantoneiras', 'cantoneiras', 'fio-fino', 'fio-fino', 'fio-fino', 'fio-fino', 'fio-fino', 'fio-fino', 'moldura-aberta', 'pilula-contorno', 'spark-4'])
    for (const [chave, el] of declarados) {
      const e = porId(el.tipo)
      expect([chave, e.slots.length, e.slots[0].papelPadrao]).toEqual([chave, 1, el.corPorPapel])
    }
  })

  it('fio-fino é line livre; moldura-aberta é o ┌ livre; spark-4 é travado com o path do sparkle', () => {
    expect([porId('fio-fino').shapeType, porId('fio-fino').ajuste]).toEqual(['line', 'livre'])
    const moldura = porId('moldura-aberta')
    expect(moldura.ajuste).toBe('livre')
    // braço vertical à esquerda subindo até o canto (0,0), braço horizontal em cima: ┌ (canto superior-esquerdo)
    expect(segmentosDoPath(moldura.pathData!).map((s) => [s.command, ...s.points])).toEqual([
      ['M', 0, 100],
      ['L', 0, 0],
      ['L', 100, 0],
    ])
    expect(porId('spark-4').ajuste).toBe('travado')
  })
})
