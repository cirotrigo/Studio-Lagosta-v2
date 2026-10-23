import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORIAS_CANDIDATAS, MASCARAS_DE_IMAGEM, SHAPES_LIBRARY, type ShapeDefinition } from '../shapes-library'
import {
  CATEGORIAS_DO_PAINEL,
  OCULTOS_NO_PAINEL,
  SECOES_DO_PAINEL,
  TERMOS_DO_PAINEL,
  casaBusca,
  categoriaNoPainel,
  gruposDoPainel,
  normalizarBusca,
} from '../painel-de-elementos'

/** A tabela da §5 do preflight do V2d (D3, parte das categorias). */
const ESPERADO: Record<string, string> = {
  rectangle: 'formas', rounded: 'formas', circle: 'formas', triangle: 'formas', star: 'formas', diamond: 'formas',
  pentagon: 'formas', hexagon: 'formas', octagon: 'formas', trapezoid: 'formas', parallelogram: 'formas',
  semicircle: 'formas', ring: 'formas', cross: 'formas',
  arrow: 'setas', 'arrow-right': 'setas', 'arrow-left': 'setas', 'arrow-up': 'setas', 'arrow-down': 'setas', 'chevron-right': 'setas',
  line: 'linhas', 'line-dashed': 'linhas', 'line-dotted': 'linhas', 'line-arrow': 'linhas', 'line-arrow-both': 'linhas',
  heart: 'ornamentos', sparkle: 'ornamentos', burst: 'destaques', bolt: 'ornamentos', drop: 'organicos', pin: 'ornamentos',
  speech: 'destaques', cloud: 'organicos', blob: 'organicos', shield: 'ornamentos', tag: 'destaques', banner: 'destaques',
  'fio-fino': 'linhas', 'moldura-fina': 'formas', 'pilula-contorno': 'formas', 'spark-4': 'ornamentos', 'onda-suave': 'organicos',
  'sublinhado-suave': 'destaques', pontos: 'ornamentos', 'moldura-aberta': 'editorial', cantoneiras: 'editorial', colchete: 'editorial',
}
const ids = (termo: string) => gruposDoPainel(termo).flatMap((g) => g.itens.map((s) => s.id))

describe('categorias do painel (D3)', () => {
  it('os 47 itens caem na categoria da tabela', () => {
    expect(SHAPES_LIBRARY).toHaveLength(47)
    expect(Object.fromEntries(SHAPES_LIBRARY.map((s) => [s.id, categoriaNoPainel(s)]))).toEqual(ESPERADO)
  })

  it('7 categorias de catálogo com os ids e rótulos das candidatas; depois Outros e Marca', () => {
    expect(CATEGORIAS_DO_PAINEL).toEqual(CATEGORIAS_CANDIDATAS)
    expect(SECOES_DO_PAINEL.map((s) => s.id)).toEqual(['linhas', 'formas', 'organicos', 'setas', 'destaques', 'editorial', 'ornamentos', 'outros', 'marca'])
  })

  it('categoria desconhecida e decorativa nova sem id mapeado vão para Outros, e aparecem', () => {
    const xyz = { id: 'xyz', label: 'Sintético', shapeType: 'rectangle', category: 'xyz', fill: '#000' } as unknown as ShapeDefinition
    const deco = { id: 'nova-deco', label: 'Deco nova', shapeType: 'rectangle', category: 'decorativas', fill: '#000' } as ShapeDefinition
    expect([categoriaNoPainel(xyz), categoriaNoPainel(deco)]).toEqual(['outros', 'outros'])
    const grupos = gruposDoPainel('', [...SHAPES_LIBRARY, xyz, deco])
    expect(grupos.at(-1)).toEqual({ id: 'outros', label: 'Outros', itens: [xyz, deco] })
  })

  it('nomes de membros herdados (constructor, toString, __proto__, hasOwnProperty) em categoria e em id de decorativa vão para Outros e aparecem', () => {
    const herdados = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']
    const porCategoria = herdados.map((n) => ({ id: `cat-${n}`, label: `Cat ${n}`, shapeType: 'rectangle', category: n, fill: '#000' }) as unknown as ShapeDefinition)
    const porId = herdados.map((n) => ({ id: n, label: `Deco ${n}`, shapeType: 'rectangle', category: 'decorativas', fill: '#000' }) as ShapeDefinition)
    const sinteticos = [...porCategoria, ...porId]
    expect(sinteticos.map(categoriaNoPainel)).toEqual(sinteticos.map(() => 'outros'))
    // o id herdado também não pode quebrar a busca nem sumir com o item
    const grupos = gruposDoPainel('', [...SHAPES_LIBRARY, ...sinteticos])
    expect(grupos.at(-1)).toEqual({ id: 'outros', label: 'Outros', itens: sinteticos })
    expect(gruposDoPainel('deco', [...SHAPES_LIBRARY, ...porId]).flatMap((g) => g.itens.map((i) => i.id))).toEqual(herdados)
    // o catálogo real segue igual: 47 no catálogo, 46 exibidos, 26 máscaras
    expect([SHAPES_LIBRARY.length, gruposDoPainel().flatMap((g) => g.itens).length, MASCARAS_DE_IMAGEM.length]).toEqual([47, 46, 26])
  })

  it('nenhum item some: exibidos + ocultos = o catálogo inteiro; o sparkle é o único oculto; Outros vazio hoje', () => {
    const grupos = gruposDoPainel()
    const exibidos = grupos.flatMap((g) => g.itens.map((s) => s.id))
    expect(exibidos).toHaveLength(46)
    expect([...exibidos, ...OCULTOS_NO_PAINEL].sort()).toEqual(SHAPES_LIBRARY.map((s) => s.id).sort())
    expect(OCULTOS_NO_PAINEL).toEqual(['sparkle'])
    expect(grupos.map((g) => [g.id, g.itens.length])).toEqual([
      ['linhas', 6], ['formas', 16], ['organicos', 4], ['setas', 6], ['destaques', 5], ['editorial', 3], ['ornamentos', 6],
    ])
  })

  it('o sparkle continua no catálogo e nas 26 máscaras, com o mesmo path do spark-4', () => {
    const sparkle = SHAPES_LIBRARY.find((s) => s.id === 'sparkle')
    expect(MASCARAS_DE_IMAGEM.map((m) => m.id)).toHaveLength(26)
    expect(MASCARAS_DE_IMAGEM.find((m) => m.id === 'sparkle')?.pathData).toBe(sparkle?.pathData)
    expect(SHAPES_LIBRARY.find((s) => s.id === 'spark-4')?.pathData).toBe(sparkle?.pathData)
  })
})

describe('busca PT/EN sem acento', () => {
  it('normaliza acento, caixa e espaços', () => {
    expect(normalizarBusca('  CÍRCULO   Vazado ')).toBe('circulo vazado')
    expect(casaBusca(['Orgânicos'], 'organicos')).toBe(true)
    expect(casaBusca(['x'], '   ')).toBe(true)
    expect(casaBusca([null, undefined], 'a')).toBe(false)
  })

  it('os casos de aceite', () => {
    expect(ids('circulo')).toEqual(['circle', 'semicircle', 'ring'])
    expect(ids('círculo')).toEqual(ids('circulo'))
    expect(ids('  CÍRCULO ')).toEqual(ids('circulo'))
    expect(ids('circle')).toEqual(['circle', 'semicircle'])
    // substring: "arredONDAdo" também casa (Retângulo Arredondado); a busca não ranqueia
    expect(ids('onda')).toEqual(['rounded', 'onda-suave'])
    expect(ids('wave')).toEqual(['onda-suave'])
    expect(ids('sparkle')).toEqual(['spark-4'])
    expect(ids('brilho')).toEqual(['spark-4'])
    expect(ids('xyz')).toEqual([])
  })

  it('todo item exibido tem termo em português (o rótulo conta) e em inglês', () => {
    for (const s of SHAPES_LIBRARY.filter((s) => !OCULTOS_NO_PAINEL.includes(s.id))) {
      const termos = TERMOS_DO_PAINEL[s.id] ?? s.keywords ?? []
      expect([s.id, s.label.length > 0, termos.length > 0]).toEqual([s.id, true, true])
    }
    // o complemento cobre exatamente os 36 legados exibidos, sem id solto
    expect(Object.keys(TERMOS_DO_PAINEL).sort()).toEqual(SHAPES_LIBRARY.slice(0, 37).map((s) => s.id).filter((id) => id !== 'sparkle').sort())
  })
})

describe('fontes do rail e do painel (CP-V2d)', () => {
  const fonte = (caminho: string) => readFileSync(join(process.cwd(), caminho), 'utf8')
  const shell = fonte('src/components/templates/template-editor-shell.tsx')
  const painel = fonte('src/components/templates/panels/elementos-panel.tsx')
  const marca = fonte('src/components/templates/panels/marca-do-projeto.tsx')

  it('rail único: sem a chave "shapes", sem "Formas", e "Elementos" monta o painel novo no computador e no celular', () => {
    expect(shell).not.toMatch(/'shapes'|ShapesPanel|ElementsPanelContent|label="Formas"|'Formas'/)
    expect(shell.match(/activePanel === 'elements' && <ElementosPanel \/>/g)).toHaveLength(2)
    expect(existsSync(join(process.cwd(), 'src/components/templates/panels/shapes-panel.tsx'))).toBe(false)
  })

  it('o painel não faz fetch direto, não tem título duplicado e o D5 sai do adaptador', () => {
    // `refetch(` do React Query é permitido; `fetch(` solto, não
    for (const f of [painel, marca]) expect(f).not.toMatch(/(^|[^\w.])fetch\(/m)
    expect(painel).not.toMatch(/<h3/)
    expect(painel).toContain("estado.estado === 'pronto' && estado.ausenciaConfirmada")
  })

  it('a Marca lista pelo hook; envio e exclusão SÓ pelos hooks (CP-V2e): sem method, DELETE, POST nem FormData aqui', () => {
    expect(marca).toContain('useProjectElements(projectId)')
    expect(marca).toContain('useUploadProjectElement()')
    expect(marca).toContain('useConfirmarExclusaoDeElemento(projectId)')
    expect(marca).not.toMatch(/method:|DELETE|POST|FormData/)
    expect(marca.match(/addLayer\(/g)).toHaveLength(1)
  })
})

describe('fontes do CP-V2e: hooks, confirmação comum e órfão removido', () => {
  const fonte = (caminho: string) => readFileSync(join(process.cwd(), caminho), 'utf8')
  const marca = fonte('src/components/templates/panels/marca-do-projeto.tsx')
  const confirmacao = fonte('src/components/projects/confirmar-exclusao-de-elemento.tsx')
  const identidade = fonte('src/components/projects/project-assets-panel.tsx')

  it('a lixeira é IRMÃ do botão de inserir, só abre a confirmação, e nunca chama addLayer', () => {
    const insere = marca.indexOf('data-marca={elemento.id}')
    const lixeira = marca.indexOf('data-apagar={elemento.id}')
    expect(insere).toBeGreaterThan(0)
    expect(lixeira).toBeGreaterThan(insere)
    // o </button> do inserir fecha ANTES da lixeira abrir
    expect(marca.slice(insere, lixeira)).toContain('</button>')
    const blocoDaLixeira = marca.slice(lixeira, marca.indexOf('</button>', lixeira))
    expect(blocoDaLixeira).toContain('exclusao.pedir(')
    expect(blocoDaLixeira).not.toMatch(/addLayer|inserir\(|mutate/)
  })

  it('confirmação controlada: "Apagar" não é AlertDialogAction (que fecharia no clique) e Esc pendente é ignorado', () => {
    expect(confirmacao).not.toMatch(/<AlertDialogAction|^\s*AlertDialogAction,$/m)
    expect(confirmacao).toMatch(/onEscapeKeyDown=\{\(evento\) => \{\s*if \(ocupado\(\)\) evento\.preventDefault\(\)/)
    // `ocupado` lê a ref marcada no clique, não só o `isPending` (que chega à tela depois)
    expect(confirmacao).toContain('const ocupado = () => emVoo.current || pendente')
    expect(confirmacao).toContain('useDeleteProjectElement()')
    expect(confirmacao).not.toMatch(/(^|[^\w.])fetch\(/m)
  })

  it('Identidade visual: nenhum fetch DELETE para /elements/; exclusão pelo hook comum; envio e Drive invalidam as 3 keys', () => {
    expect(identidade).not.toMatch(/fetch\(`\/api\/projects\/\$\{projectId\}\/elements\/\$\{[^`]*`,\s*\{\s*method: 'DELETE'/)
    expect(identidade).not.toMatch(/deleteElement/)
    expect(identidade).toContain('useConfirmarExclusaoDeElemento(projectId)')
    // envio: o projeto da MUTAÇÃO (variáveis), nunca a closure da tela; Drive: o da invocação, no `finally`
    expect(identidade.match(/invalidarElementosDoProjeto\(queryClient, variables\.projectId\)/g)).toHaveLength(1)
    expect(identidade).toContain('uploadElement.mutate({ file, projectId })')
    expect(identidade.match(/invalidarElementosDoProjeto\(queryClient, projectId\)/g)).toHaveLength(1)
    expect(identidade).not.toMatch(/invalidateQueries\(\{ queryKey: \['project-assets', projectId, 'elements'\] \}\)/)
  })

  it('o painel antigo de Elementos (sem consumidor desde o V2d) não existe mais', () => {
    expect(existsSync(join(process.cwd(), 'src/components/templates/panels/elements-panel.tsx'))).toBe(false)
  })
})
