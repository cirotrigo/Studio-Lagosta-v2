/**
 * CP-X2a — conferência cruzada do `lerCor` com o Chromium real (`CSS.supports` + `getComputedStyle`).
 *
 * Três propriedades:
 * 1. Sem aceite falso: se o `lerCor` lê uma cor, o Chromium a aceita E resolve para o mesmo `#rrggbb`/alfa
 *    (±1 por canal pelo arredondamento; alfa ±0,005).
 * 2. Compatibilidade com a UI: tudo que o campo de cor grava hoje (`corDigitadaParaGravar` com o
 *    `CSS.supports` real) é lido pelo `lerCor` — exceto as palavras de contexto, recusadas de propósito.
 * 3. Divergências (Chromium aceita, `lerCor` recusa) só nas categorias declaradas abaixo; categoria nova reprova.
 *
 * Hermético: bundle local do esbuild aberto por file://, rede bloqueada.
 *   npx playwright test -c tests/harness/cp-x2a/playwright.config.ts
 *   CPX2A_SAIDA=<dir> grava a tabela medida.
 */
import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { NOMES_DE_COR, PALAVRAS_DE_CONTEXTO } from '@/lib/vetor/cor'
import type { Avaliacao } from './entrada'

const RAIZ = path.resolve(__dirname, '../../..')
const enorme = '9'.repeat(400)

const ENTRADAS: string[] = [
  // hex
  '#abc', '#ABC', '#abcd', '#1a2b3c', '#1a2b3c80', '  #111  ', '#12345', '#ggg',
  // rgb
  'rgb(255, 0, 0)', 'rgba(17, 17, 17, 1)', 'rgba(26, 57, 135, 0.4)', 'RGB(1,2,3)', 'rgb(1 2 3)', 'rgb(1 2 3 / 0.5)', 'rgb(1 2 3 / 50%)',
  'rgba(1, 2, 3, 50%)', 'rgb(100%, 0%, 0%)', 'rgb(100% 0 0)', 'rgb(300, -5, 0)', 'rgba(0, 0, 0, 2)', 'rgb(0, 0, 0, 0)', 'rgb(127.6, 0, 0)', 'rgb(.5, 0, 0)',
  'rgb(1, 2)', 'rgb(1, 2%, 3)', 'rgb(1 2, 3)', 'rgb(1 2 3 4)', 'rgba(17, 17, 17, 1)827', 'rgb(1, 2, 3,)',
  // hsl
  'hsl(0, 100%, 50%)', 'hsl(120deg, 100%, 50%)', 'hsl(240 100% 50%)', 'hsla(10, 50%, 50%, 0.5)', 'hsl(10 50% 50% / 50%)', 'hsl(0.5turn, 100%, 50%)',
  'hsl(3.14159265rad, 100%, 50%)', 'hsl(200grad, 100%, 50%)', 'hsl(-120, 100%, 50%)', 'hsl(480, 100%, 50%)', 'hsl(0, 0%, 100%)', 'hsl(0deg, 100%)',
  // palavras
  'transparent', 'Transparent', ...PALAVRAS_DE_CONTEXTO, 'CurrentColor', 'banana', '',
  // fora da gramática da UI (o Chromium pode aceitar; o lerCor recusa de propósito)
  'none', 'rgb(none 0 0)', 'rgb(1e2, 0, 0)', 'hsl(0 100 50)', 'hsl(0, 100, 50)', 'lab(50% 0 0)', 'oklch(0.5 0.1 120)', 'hwb(0 0% 0%)', 'color(srgb 1 0 0)',
  // números extremos (achado do Codex: matiz que estoura)
  `hsl(${enorme}turn, 100%, 50%)`, `hsl(${'9'.repeat(308)}turn, 100%, 50%)`, `hsl(${'9'.repeat(306)}turn, 100%, 50%)`, `hsl(${enorme}, 100%, 50%)`,
  `rgb(${enorme}, 0, 0)`, `rgba(0, 0, 0, ${enorme})`,
  // os 148 nomes
  ...NOMES_DE_COR,
]

/** Categorias declaradas de divergência (Chromium aceita, lerCor recusa). */
function categoria(e: string): string | null {
  const t = e.trim().toLowerCase()
  if ((PALAVRAS_DE_CONTEXTO as readonly string[]).includes(t)) return 'palavra de contexto'
  if (/^(lab|lch|oklab|oklch|hwb|color)\(/.test(t)) return 'função fora da gramática da UI'
  if (/\bnone\b/.test(t)) return '`none` fora da gramática da UI'
  if (/\de\d/.test(t)) return 'notação científica fora da gramática da UI'
  if (/^hsla?\(/.test(t) && !/%.*%/.test(t)) return 'hsl com s/l sem % fora da gramática da UI'
  // medido: o Chromium resolve o matiz que estoura para vermelho (rgb(255, 0, 0)); o lerCor recusa em vez de inventar a cor
  if (/^hsla?\(9{300,}/.test(t)) return 'matiz não finito (overflow)'
  // medido: o Chromium aceita `rgb(1 2, 3)` (tolerância própria); a UI não grava essa forma
  const corpo = /^(?:rgba?|hsla?)\(([\s\S]*)\)$/.exec(t)?.[1]
  if (corpo && corpo.includes(',') && corpo.split(',').some((p) => /\S\s+\S/.test(p.trim()))) return 'sintaxe mista vírgula/espaço fora da gramática da UI'
  return null
}

/** O que a UI pode gravar e o lerCor recusa de propósito (o ajuste da UI do svg-path no X2b passa a exigir o lerCor). */
const RECUSA_DELIBERADA_NA_UI = ['palavra de contexto', 'matiz não finito (overflow)']

let pasta = ''
test.beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'cpx2a-cores-'))
  await build({
    entryPoints: [path.join(__dirname, 'entrada.ts')],
    bundle: true,
    outfile: path.join(pasta, 'cores.js'),
    format: 'iife',
    platform: 'browser',
    tsconfig: path.join(RAIZ, 'tsconfig.json'),
    logLevel: 'error',
  })
  writeFileSync(path.join(pasta, 'index.html'), '<!doctype html><meta charset="utf-8"><body><script src="cores.js"></script>')
})
test.afterAll(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true })
})

function rgbaComputada(s: string): [number, number, number, number] | null {
  const m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (!m) return null
  const p = m[1].split(',').map((x) => parseFloat(x.trim()))
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
}

test('lerCor × Chromium: sem aceite falso, compatível com a UI, divergências só as declaradas', async ({ page }) => {
  const externas: string[] = []
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('file:')) return route.continue()
    externas.push(url)
    return route.abort()
  })
  await page.goto(pathToFileURL(path.join(pasta, 'index.html')).href)
  await page.waitForFunction(() => typeof window.__avaliarCores === 'function')
  const tabela: Avaliacao[] = await page.evaluate((es) => window.__avaliarCores(es), ENTRADAS)

  const falsoAceite: unknown[] = []
  const valorDiferente: unknown[] = []
  const uiNaoLida: unknown[] = []
  const divergencias: Record<string, string[]> = {}
  const naoDeclaradas: string[] = []

  for (const a of tabela) {
    const rotulo = a.entrada.length > 60 ? `${a.entrada.slice(0, 40)}…(${a.entrada.length})` : a.entrada
    if (a.leitura !== null) {
      if (!a.suportada) falsoAceite.push(rotulo)
      const c = a.computada ? rgbaComputada(a.computada) : null
      if (a.leitura === 'transparente') {
        if (!c || c[3] !== 0) valorDiferente.push({ entrada: rotulo, computada: a.computada, leitura: a.leitura })
      } else if (c) {
        const h = a.leitura.hex
        const esperado = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
        const ok = esperado.every((v, i) => Math.abs(v - c[i]) <= 1) && Math.abs(a.leitura.alfa - c[3]) <= 0.005
        if (!ok) valorDiferente.push({ entrada: rotulo, computada: a.computada, leitura: a.leitura })
      }
    } else if (a.suportada) {
      const cat = categoria(a.entrada)
      if (cat) (divergencias[cat] ??= []).push(rotulo)
      else naoDeclaradas.push(rotulo)
    }
    if (a.uiGrava !== null && a.uiGravadaLida === null) {
      const cat = categoria(a.uiGrava)
      if (cat && RECUSA_DELIBERADA_NA_UI.includes(cat)) (divergencias[`UI grava, lerCor recusa: ${cat}`] ??= []).push(rotulo)
      else uiNaoLida.push({ entrada: rotulo, uiGrava: a.uiGrava })
    }
  }

  const resumo = { total: tabela.length, falsoAceite, valorDiferente, uiNaoLida, naoDeclaradas, divergencias, externas, medido: tabela.map((a) => ({ ...a, entrada: a.entrada.length > 60 ? `${a.entrada.slice(0, 40)}…(${a.entrada.length})` : a.entrada })) }
  const saida = process.env.CPX2A_SAIDA
  if (saida) {
    mkdirSync(saida, { recursive: true })
    writeFileSync(path.join(saida, 'cores-chromium.json'), JSON.stringify(resumo, null, 2))
  }

  expect(externas).toEqual([])
  expect(falsoAceite).toEqual([])
  expect(valorDiferente).toEqual([])
  expect(uiNaoLida).toEqual([])
  expect(naoDeclaradas).toEqual([])
  // as palavras de contexto são a divergência deliberada (D3): o Chromium aceita todas, o lerCor nenhuma
  expect((divergencias['palavra de contexto'] ?? []).map((e) => e.toLowerCase()).sort()).toEqual([...PALAVRAS_DE_CONTEXTO, 'currentcolor'].sort())
  // os 148 nomes resolvem no Chromium para o mesmo hex (coberto por valorDiferente) e nenhum é recusado
  expect(tabela.filter((a) => (NOMES_DE_COR as string[]).includes(a.entrada) && a.leitura === null)).toEqual([])
})
