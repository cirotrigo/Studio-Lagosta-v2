/**
 * PR #238, revisão do Codex (18/10/2026): `garantirFontesPadrao` marcava o processo como pronto ANTES de registrar,
 * e contava como registrado o `registerFromPath` que devolve `null` (1.0.x) ou `false` (0.1.x). Com a falha da
 * primeira chamada, o processo seguia sem fontes para sempre — a prova que falhou ("1 chamada, esperava 2"), agora
 * permanente, mais os casos `null`/`false`/exceção, registro PARCIAL e zero.
 *
 * O `GlobalFonts` é falso e registra cada chamada; o resto do addon é o real (createCanvas etc.). `vi.resetModules`
 * dá a cada teste um `canvas-renderer` novo (o estado do registro é por módulo). Os arquivos da Montserrat são os
 * empacotados no repositório.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FONT_CONFIG } from '@/lib/font-config'

vi.mock('@/lib/db', () => ({ db: {} }))

type Resposta = 'ok' | 'null' | 'false' | 'lanca'
const falso = vi.hoisted(() => ({
  chamadas: [] as Array<{ familia: string; peso: string }>,
  metodos: new Set<string>(),
  responder: (_familia: string, _peso: string, _n: number): 'ok' | 'null' | 'false' | 'lanca' => 'ok',
}))
vi.mock('@napi-rs/canvas', async (original) => {
  const m = await original<typeof import('@napi-rs/canvas')>()
  const alvo = {
    registerFromPath: (arquivo: string, familia: string) => {
      const peso = /Montserrat-(\d+)\.ttf$/.exec(arquivo)?.[1] ?? 'sistema'
      const n = falso.chamadas.filter((c) => c.familia === familia && c.peso === peso).length
      falso.chamadas.push({ familia, peso })
      if (peso === 'sistema') return { family: familia }
      const r = falso.responder(familia, peso, n)
      if (r === 'lanca') throw new Error(`falha simulada ${familia} ${peso}`)
      return r === 'null' ? null : r === 'false' ? false : { family: familia }
    },
    // Para `familiasNaoCarregadas`: o registro diz que a família existe (como o nativo faz com registro parcial).
    has: (familia: string) => familia !== 'FamiliaQueNaoExiste',
  }
  // Registra QUAIS métodos do GlobalFonts o registro padrão usa: os mocks dos pilotos (piloto-ponta-a-ponta,
  // piloto-sintetico) repassam só `families`, `has` e `registerFromPath`.
  const GlobalFonts = new Proxy(alvo, { get: (t, k) => (falso.metodos.add(String(k)), (t as Record<string, unknown>)[k as string]) })
  return { ...m, GlobalFonts }
})

const N = FONT_CONFIG.BUNDLED_MONTSERRAT_WEIGHTS.length
const daMontserrat = (familia: string) => falso.chamadas.filter((c) => c.familia === familia && c.peso !== 'sistema')
async function novoRenderer(responder: typeof falso.responder) {
  vi.resetModules()
  falso.chamadas = []
  falso.metodos = new Set()
  falso.responder = responder
  return import('@/lib/canvas-renderer')
}
afterEach(() => vi.restoreAllMocks())

describe('garantirFontesPadrao só dá o processo por pronto com todos os registros confirmados', () => {
  it('tudo registrado: completo, cada peso em Montserrat E na família genérica, e a segunda chamada não registra de novo', async () => {
    const { garantirFontesPadrao, FAMILIA_GENERICA_DO_FALLBACK } = await novoRenderer(() => 'ok')
    expect(garantirFontesPadrao()).toEqual({ esperados: N, montserrat: N, generica: N, completo: true })
    expect(daMontserrat('Montserrat').map((c) => c.peso)).toEqual([...FONT_CONFIG.BUNDLED_MONTSERRAT_WEIGHTS])
    expect(daMontserrat(FAMILIA_GENERICA_DO_FALLBACK).map((c) => c.peso)).toEqual([...FONT_CONFIG.BUNDLED_MONTSERRAT_WEIGHTS])
    const antes = falso.chamadas.length
    expect(garantirFontesPadrao().completo).toBe(true)
    expect(falso.chamadas.length).toBe(antes)
  })

  it('exceção na primeira chamada: incompleto, aviso alto, e a próxima chamada TENTA DE NOVO (2 chamadas) só o que faltou', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { garantirFontesPadrao } = await novoRenderer((familia, peso, n) => (familia === 'Montserrat' && peso === '400' && n === 0 ? 'lanca' : 'ok'))
    expect(garantirFontesPadrao()).toEqual({ esperados: N, montserrat: N - 1, generica: N, completo: false })
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('fontes padrão INCOMPLETAS'))
    expect(garantirFontesPadrao()).toEqual({ esperados: N, montserrat: N, generica: N, completo: true })
    expect(daMontserrat('Montserrat').filter((c) => c.peso === '400')).toHaveLength(2)
    expect(daMontserrat('Montserrat').filter((c) => c.peso === '700')).toHaveLength(1) // o que deu certo não duplica
  })

  it('null em TODOS (1.0.x recusa sem lançar): zero não conta como registrado, nunca completa e segue tentando', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { garantirFontesPadrao } = await novoRenderer(() => 'null')
    expect(garantirFontesPadrao()).toEqual({ esperados: N, montserrat: 0, generica: 0, completo: false })
    const antes = daMontserrat('Montserrat').length
    const sistemaAntes = falso.chamadas.filter((c) => c.peso === 'sistema').length
    expect(garantirFontesPadrao().completo).toBe(false)
    expect(daMontserrat('Montserrat').length).toBe(2 * antes)
    // As fontes do sistema que JÁ registraram não são registradas de novo a cada tentativa (revisão R1).
    expect(falso.chamadas.filter((c) => c.peso === 'sistema').length).toBe(sistemaAntes)
  })

  it('registro PARCIAL: `false` (0.1.x) num peso da Montserrat e `null` num peso da genérica deixam incompleto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { garantirFontesPadrao, FAMILIA_GENERICA_DO_FALLBACK } = await novoRenderer((familia, peso) =>
      familia === 'Montserrat' && peso === '700' ? 'false' : familia === FAMILIA_GENERICA_DO_FALLBACK && peso === '400' ? 'null' : 'ok',
    )
    expect(garantirFontesPadrao()).toEqual({ esperados: N, montserrat: N - 1, generica: N - 1, completo: false })
  })

  it('com as fontes padrão incompletas, familiasNaoCarregadas devolve TODAS as pedidas (a medida sai "não medida")', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { garantirFontesPadrao } = await novoRenderer((familia, peso) => (familia === 'Montserrat' && peso === '700' ? 'null' : 'ok'))
    expect(garantirFontesPadrao().completo).toBe(false) // como o registerProjectFonts faz antes de medir
    const { familiasNaoCarregadas } = await import('@/lib/posts/register-project-fonts')
    expect([...(await familiasNaoCarregadas(['Montserrat', 'sans-serif', 'Branley GC']))].sort()).toEqual(['Branley GC', 'Montserrat', 'sans-serif'])
  })

  it('com as fontes padrão completas, familiasNaoCarregadas devolve só as que o registro não tem', async () => {
    const { garantirFontesPadrao } = await novoRenderer(() => 'ok')
    expect(garantirFontesPadrao().completo).toBe(true)
    const { familiasNaoCarregadas } = await import('@/lib/posts/register-project-fonts')
    expect([...(await familiasNaoCarregadas(['Montserrat', 'sans-serif', 'FamiliaQueNaoExiste']))]).toEqual(['FamiliaQueNaoExiste'])
  })

  it('usa do GlobalFonts só `registerFromPath` — o que os mocks dos pilotos repassam ao objeto nativo', async () => {
    const { garantirFontesPadrao } = await novoRenderer(() => 'ok')
    garantirFontesPadrao()
    expect([...falso.metodos]).toEqual(['registerFromPath'])
  })
})
