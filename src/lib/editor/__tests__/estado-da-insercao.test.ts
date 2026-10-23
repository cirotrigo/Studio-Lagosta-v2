/**
 * CP-V2c — o adaptador da inserção (carregando / erro / pronto) e as consultas que o alimentam. Puro, no Node: o
 * cliente HTTP é simulado (vi.mock) ou o `fetch` é trocado (vi.stubGlobal); nenhuma rede.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import type { Layer } from '@/types/template'
import { camadaParaInserir, estadoDaInsercao, type ConsultaDaMarca, type EstadoDaInsercao } from '../estado-da-insercao'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', async (original) => ({ ...(await original<typeof import('@/lib/api-client')>()), api: { get } }))

const { buscarPaleta, buscarPaletaEstrita } = await import('@/hooks/use-brand-colors')
const { buscarProjeto } = await import('@/hooks/use-project')

const P = 7
const PENDENTE: ConsultaDaMarca = { status: 'pending', data: undefined }
const FALHA: ConsultaDaMarca = { status: 'error', data: undefined }
const ok = (data: unknown): ConsultaDaMarca => ({ status: 'success', data })
const paleta = (cores: unknown, projectId = P) => ok({ projectId, cores })
const projeto = (extra: Record<string, unknown> = { assinatura: null }, id = P) => ok({ id, name: 'Projeto', ...extra })
const MARCA_DE_P = { cores: [{ id: 1, name: 'Laranja', hexCode: '#E8590C', projectId: P }, { id: 2, name: 'Creme', hexCode: '#F5EBDC', projectId: P }], assinatura: { fundo: '#0F2027' } }
const estado = (p: ConsultaDaMarca, j: ConsultaDaMarca, projectId = P) => estadoDaInsercao({ projectId, paleta: p, projeto: j })

const spark = SHAPES_LIBRARY.find((s) => s.id === 'spark-4')!
const contexto = { base: { id: 'nova', type: 'shape', name: 'Shape', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, style: {} } as Layer, canvas: { width: 1080, height: 1920 } }

/** O que o painel faz no clique: só `pronto` chega ao addLayer. */
function painel() {
  const inseridas: Layer[] = []
  return { inseridas, clicar: (e: EstadoDaInsercao) => { const c = camadaParaInserir(e, spark, contexto); if (c) inseridas.push(c) } }
}

describe('estadoDaInsercao: carregando', () => {
  it('paleta lenta ou assinatura (projeto) lenta → carregando; nada se insere', () => {
    expect(estado(PENDENTE, projeto())).toEqual({ estado: 'carregando' })
    expect(estado(paleta([]), PENDENTE)).toEqual({ estado: 'carregando' })
    expect(estado(PENDENTE, PENDENTE)).toEqual({ estado: 'carregando' })
    const p = painel()
    p.clicar(estado(PENDENTE, projeto()))
    expect(p.inseridas).toEqual([])
  })

  it('dado de OUTRO projectId nunca é usado: conta como carregando até chegar o do projeto atual', () => {
    expect(estado(paleta(MARCA_DE_P.cores, 99), projeto())).toEqual({ estado: 'carregando' })
    expect(estado(paleta([]), projeto({ assinatura: null }, 99))).toEqual({ estado: 'carregando' })
  })
})

describe('estadoDaInsercao: erro (nunca "marca sem cores")', () => {
  it('a consulta que falhou é indicada; as duas, as duas; falha vence o carregamento da outra', () => {
    expect(estado(FALHA, projeto())).toEqual({ estado: 'erro', falhas: ['paleta'] })
    expect(estado(paleta([]), FALHA)).toEqual({ estado: 'erro', falhas: ['projeto'] })
    expect(estado(FALHA, FALHA)).toEqual({ estado: 'erro', falhas: ['paleta', 'projeto'] })
    expect(estado(FALHA, PENDENTE)).toEqual({ estado: 'erro', falhas: ['paleta'] })
    // o dado velho que sobrevive a uma nova falha não libera nada: o status manda
    expect(estado({ status: 'error', data: { projectId: P, cores: [] } }, projeto())).toEqual({ estado: 'erro', falhas: ['paleta'] })
  })

  it('paleta que não é lista (HTML 200 como texto), sem marcação de projeto, ou cor sem hexCode em texto → erro da paleta', () => {
    for (const data of ['<!DOCTYPE html><html>sign-in</html>', [], null, { projectId: P, cores: '<html>' }, { cores: [] }, { projectId: P, cores: [{ name: 'X' }] }, { projectId: P, cores: [{ hexCode: 123 }] }, { projectId: P, cores: [null] }]) {
      expect([data, estado(ok(data), projeto())]).toEqual([data, { estado: 'erro', falhas: ['paleta'] }])
    }
  })

  it('projeto que chega como HTML (texto), sem id ou SEM a chave assinatura → erro do projeto', () => {
    for (const data of ['<!DOCTYPE html><html>sign-in</html>', null, [], { name: 'sem id', assinatura: null }, { id: P, name: 'sem a chave' }]) {
      expect([data, estado(paleta([]), ok(data))]).toEqual([data, { estado: 'erro', falhas: ['projeto'] }])
    }
  })

  it('no erro, o clique não cria camada', () => {
    const p = painel()
    p.clicar(estado(FALHA, projeto()))
    p.clicar(estado(paleta([]), ok('<html>')))
    expect(p.inseridas).toEqual([])
  })
})

describe('estadoDaInsercao: pronto', () => {
  it('com as duas respostas válidas do projeto atual: a marca crua, sem ausência', () => {
    const e = estado(paleta(MARCA_DE_P.cores), projeto({ assinatura: MARCA_DE_P.assinatura }))
    expect(e).toEqual({ estado: 'pronto', marca: { paleta: MARCA_DE_P.cores, assinaturaCrua: MARCA_DE_P.assinatura }, ausenciaConfirmada: false })
  })

  it('ausência CONFIRMADA (lista vazia válida e assinatura null, ou campos ausentes no JSON gravado) → pronto, com o padrão', () => {
    expect(estado(paleta([]), projeto({ assinatura: null }))).toEqual({ estado: 'pronto', marca: { paleta: [], assinaturaCrua: null }, ausenciaConfirmada: true })
    expect(estado(paleta([]), projeto({ assinatura: { geometria: {} } }))).toMatchObject({ estado: 'pronto', ausenciaConfirmada: true })
    expect(estado(paleta([]), projeto({ assinatura: { fundo: '#0F2027' } }))).toMatchObject({ estado: 'pronto', ausenciaConfirmada: false })
    expect(estado(paleta(MARCA_DE_P.cores), projeto({ assinatura: null }))).toMatchObject({ estado: 'pronto', ausenciaConfirmada: false })
  })

  it('hex inválido da marca não é erro: o resolvedor o ignora e segue a cadeia', () => {
    const e = estado(paleta([{ name: 'Ruim', hexCode: 'laranja' }]), projeto({ assinatura: { fundo: 'rgb(1,2,3)', destaque: { fill: '#zzz' } } }))
    expect(e).toMatchObject({ estado: 'pronto', ausenciaConfirmada: true })
    const p = painel()
    p.clicar(e)
    expect(p.inseridas[0].style!.fill).toBe('rgba(17, 17, 17, 1)') // o padrão do escuro: destaque sem viva cai no escuro
  })

  it('pronto constrói a camada final pelo construtor, com a cor da marca', () => {
    const p = painel()
    p.clicar(estado(paleta(MARCA_DE_P.cores), projeto({ assinatura: { fundo: '#0F2027', destaque: { fill: '#C0392B' } } })))
    expect(p.inseridas).toHaveLength(1)
    expect(p.inseridas[0].style).toMatchObject({ fill: 'rgba(192, 57, 43, 1)', vetor: { asset: { id: 'spark-4', versao: 1 }, papeis: { preenchimento: 'destaque' } }, manterProporcao: true })
  })
})

describe('chegada tardia e troca de projeto', () => {
  it('clique durante o carregamento não cria nada; a chegada dos dados não insere sozinha; só o clique seguinte insere, uma vez', () => {
    const p = painel()
    p.clicar(estado(PENDENTE, PENDENTE))
    p.clicar(estado(paleta(MARCA_DE_P.cores), PENDENTE))
    expect(p.inseridas).toHaveLength(0)
    const pronto = estado(paleta(MARCA_DE_P.cores), projeto({ assinatura: MARCA_DE_P.assinatura }))
    expect(p.inseridas).toHaveLength(0)
    p.clicar(pronto)
    expect(p.inseridas).toHaveLength(1)
    expect(p.inseridas[0].style!.fill).toBe('rgba(232, 89, 12, 1)') // a cor que chegou, não o padrão
  })

  it('troca de projeto SEM cache: volta a carregando; os dados velhos do outro projeto não entram', () => {
    const doProjetoA = { p: paleta(MARCA_DE_P.cores, P), j: projeto({ assinatura: MARCA_DE_P.assinatura }, P) }
    expect(estado(doProjetoA.p, doProjetoA.j, P).estado).toBe('pronto')
    expect(estado(PENDENTE, PENDENTE, 8)).toEqual({ estado: 'carregando' })
    expect(estado(doProjetoA.p, doProjetoA.j, 8)).toEqual({ estado: 'carregando' }) // até se o dado velho vazasse
  })

  it('troca de projeto COM cache válido do projeto novo: pronto com a marca dele', () => {
    const e = estado(paleta([{ name: 'Verde', hexCode: '#2E7D32' }], 8), projeto({ assinatura: null }, 8), 8)
    expect(e).toMatchObject({ estado: 'pronto', marca: { paleta: [{ name: 'Verde', hexCode: '#2E7D32' }], assinaturaCrua: null } })
  })
})

describe('consultas: variante estrita da paleta, queryFn padrão e projeto', () => {
  beforeEach(() => get.mockReset())

  it('queryFn PADRÃO (os 4 consumidores de hoje) segue devolvendo [] para o que não é lista', async () => {
    get.mockResolvedValueOnce('<!DOCTYPE html><html></html>')
    expect(await buscarPaleta(P)).toEqual([])
    get.mockResolvedValueOnce({ erro: 'x' })
    expect(await buscarPaleta(P)).toEqual([])
    get.mockResolvedValueOnce([{ hexCode: '#000000' }])
    expect(await buscarPaleta(P)).toEqual([{ hexCode: '#000000' }])
    expect(get).toHaveBeenLastCalledWith(`/api/projects/${P}/colors`)
  })

  it('variante ESTRITA: não-lista (HTML 200) e cor sem hexCode em texto LANÇAM; lista válida volta marcada com o projeto', async () => {
    get.mockResolvedValueOnce('<!DOCTYPE html><html></html>')
    await expect(buscarPaletaEstrita(P)).rejects.toThrow(/lista/)
    get.mockResolvedValueOnce([{ name: 'X' }])
    await expect(buscarPaletaEstrita(P)).rejects.toThrow(/hexCode/)
    get.mockResolvedValueOnce([null])
    await expect(buscarPaletaEstrita(P)).rejects.toThrow(/hexCode/)
    get.mockResolvedValueOnce([])
    expect(await buscarPaletaEstrita(P)).toEqual({ projectId: P, cores: [] })
    get.mockResolvedValueOnce([{ hexCode: 'nao-e-hex' }]) // texto inválido passa: o resolvedor ignora
    expect(await buscarPaletaEstrita(P)).toEqual({ projectId: P, cores: [{ hexCode: 'nao-e-hex' }] })
  })

  it('keys: a estrita é própria e fica sob o prefixo ["brand-colors", id], que as invalidações renovam', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/hooks/use-brand-colors.ts'), 'utf8')
    expect(fonte).toContain("queryKey: ['brand-colors', projectId],\n    queryFn: () => buscarPaleta(projectId),")
    expect(fonte).toContain("queryKey: ['brand-colors', projectId, 'estrita'],\n    queryFn: () => buscarPaletaEstrita(projectId),")
    const cliente = new QueryClient()
    cliente.setQueryData(['brand-colors', P], [])
    cliente.setQueryData(['brand-colors', P, 'estrita'], { projectId: P, cores: [] })
    cliente.setQueryData(['brand-colors', 8, 'estrita'], { projectId: 8, cores: [] })
    void cliente.invalidateQueries({ queryKey: ['brand-colors', P] })
    expect(cliente.getQueryState(['brand-colors', P])!.isInvalidated).toBe(true)
    expect(cliente.getQueryState(['brand-colors', P, 'estrita'])!.isInvalidated).toBe(true)
    expect(cliente.getQueryState(['brand-colors', 8, 'estrita'])!.isInvalidated).toBe(false)
  })

  it('a aba Marca invalida a paleta do editor ao criar e ao apagar cor', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/components/projects/project-assets-panel.tsx'), 'utf8')
    const secao = fonte.slice(fonte.indexOf('function ColorSection('))
    expect(secao.slice(0, secao.indexOf("toast({ title: 'Cor cadastrada'"))).toContain("invalidateQueries({ queryKey: ['brand-colors', projectId] })")
    const apagar = secao.slice(secao.indexOf('const deleteColor'))
    expect(apagar.slice(0, apagar.indexOf("toast({ title: 'Cor removida'"))).toContain("invalidateQueries({ queryKey: ['brand-colors', projectId] })")
  })

  it('projeto: o queryFn devolve o que o cliente HTTP devolve; HTML vira texto e o adaptador o trata como erro', async () => {
    get.mockResolvedValueOnce({ id: P, name: 'Projeto', assinatura: null })
    expect(await buscarProjeto(P)).toEqual({ id: P, name: 'Projeto', assinatura: null })
    get.mockResolvedValueOnce('<!DOCTYPE html><html></html>')
    const html = await buscarProjeto(P)
    expect(html).toBe('<!DOCTYPE html><html></html>')
    expect(estado(paleta([]), ok(html))).toEqual({ estado: 'erro', falhas: ['projeto'] })
    expect(await buscarProjeto(null)).toBeNull()
  })
})

describe('cliente HTTP real: como o HTML 200 de autenticação chega', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('HTML 200 volta como TEXTO (não lança): por isso as duas validações acima existem; 4xx/5xx lançam', async () => {
    const { api } = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!DOCTYPE html><html>sign-in</html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    expect(await api.get('/api/projects/7')).toBe('<!DOCTYPE html><html>sign-in</html>')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'falhou' }), { status: 500, headers: { 'content-type': 'application/json' } })))
    await expect(api.get('/api/projects/7/colors')).rejects.toThrow('falhou')
  })
})

describe('painel de formas: insere só pelo construtor, só em pronto, e refaz só o que falhou', () => {
  const fonte = readFileSync(join(process.cwd(), 'src/components/templates/panels/elementos-panel.tsx'), 'utf8')
  const insercao = fonte.slice(fonte.indexOf('const handleAddShape'), fonte.indexOf('const pronto ='))

  it('um addLayer, guardado pelo construtor; nenhuma leitura da vitrine', () => {
    expect(insercao).toContain("const camada = camadaParaInserir(estado, definition, { base: createDefaultLayer('shape'), canvas: design.canvas })")
    expect(insercao).toContain('if (camada) addLayer(camada)')
    expect(fonte.match(/addLayer\(/g)).toHaveLength(1)
    expect(fonte).not.toMatch(/definition\.(fill|strokeColor)|shape\.fill|\.strokeColor/)
  })

  it('a paleta é a variante estrita; os botões ficam desabilitados fora de pronto; "Tentar de novo" refaz só a consulta falhada', () => {
    expect(fonte).toContain('const paleta = useBrandColorsEstrita(projectId)')
    expect(fonte).not.toMatch(/useBrandColors\(/)
    expect(fonte).toContain('disabled={!pronto}')
    expect(fonte).toContain("if (estado.falhas.includes('paleta')) void paleta.refetch()")
    expect(fonte).toContain("if (estado.falhas.includes('projeto')) void projeto.refetch()")
  })
})
