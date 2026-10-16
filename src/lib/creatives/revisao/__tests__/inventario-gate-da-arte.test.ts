/**
 * CP5b § 7.6 — H12: nenhum caminho de produção lê `gateDaArte` nem chama `gateDaMedida` para decidir.
 *  (a) a barreira por IMPORT (`no-restricted-imports` em `eslint.config.mjs`): arquivos de controle que importam
 *      `gateDaMedida` por alias, por caminho relativo de fora (`../revisao/gate`) e do mesmo diretório (`./gate`) FALHAM
 *      o lint; os consumidores nomeados passam;
 *  (b) o inventário por REGEX sobre `src/` — o que o lint não vê: a string `gateDaArte`, `import()` dinâmico,
 *      `require(` e reexportação (`export … from`) dos dois módulos fora das listas fechadas. Imprime arquivo e linha.
 * Quem quiser gravar ou ler o registro noutro lugar acrescenta o arquivo aqui E na regra do lint — e o PR diz por quê
 * (o primeiro produtor é o CP5c).
 */
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const PERMITIDOS_GATE_DA_ARTE = new Set(['src/lib/creatives/revisao/gate-registro.ts', 'src/lib/creatives/revisao/gate-persistido.ts', 'src/lib/mcp/catalogo/ver-geracao-retorno.ts'])
/** Quem pode tocar `gate-registro`/`gate` por import() dinâmico, require ou reexportação (ninguém, hoje). */
const PERMITIDOS_DINAMICO = new Set<string>([])

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return nome === 'node_modules' || nome === '.next' ? [] : arquivos(caminho)
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : []
  })
}

/**
 * import() dinâmico, require e reexportação dos dois módulos, por alias ou caminho relativo, com ou sem `.ts`, com
 * espaço ou quebra de linha entre `import`/`require` e `(` (Codex R3 do PR #240). Roda sobre o ARQUIVO inteiro, não
 * linha a linha. Limite dito: caminho montado em variável ou template literal não é detectável por regex.
 */
const ACESSO_DINAMICO = /(?:\b(?:import|require)\s*\(|\bexport\s+(?:\*|\{[^}]*\})\s+from)\s*['"][^'"]*(?:^|\/)(?:gate|gate-registro)(?:\.ts)?['"]/g

const raiz = process.cwd()
const fontes = () => arquivos(join(raiz, 'src')).map((c) => relative(raiz, c)).filter((c) => !/__tests__|\.test\.tsx?$/.test(c))

/** Varre o arquivo INTEIRO (um `import` pode quebrar linha antes do `(`) e devolve arquivo:linha de cada ocorrência. */
function ocorrencias(regex: RegExp, permitidos: Set<string>): string[] {
  const fora: string[] = []
  for (const c of fontes()) {
    if (permitidos.has(c)) continue
    const texto = readFileSync(join(raiz, c), 'utf8')
    for (const m of texto.matchAll(new RegExp(regex.source, 'g'))) {
      const linha = texto.slice(0, m.index).split('\n').length
      fora.push(`${c}:${linha}: ${m[0].replace(/\s+/g, ' ').trim()}`)
    }
  }
  return fora
}
const pega = (regex: RegExp, texto: string) => new RegExp(regex.source).test(texto)

describe('H12 (b) — inventário por regex', () => {
  it('a string `gateDaArte` só nos módulos permitidos', () => {
    expect(ocorrencias(/gateDaArte/g, PERMITIDOS_GATE_DA_ARTE)).toEqual([])
  })
  it('import() dinâmico, require e reexportação de gate / gate-registro: nenhum fora da lista', () => {
    expect(ocorrencias(ACESSO_DINAMICO, PERMITIDOS_DINAMICO)).toEqual([])
  })

  it('o detector pega import(), require e export … from, com e sem .ts, por alias e relativo (Codex R2 do PR #240)', () => {
    const pega_ = (l: string) => pega(ACESSO_DINAMICO, l)
    const casosQuePega = [
      "const g = await import('../revisao/gate')",
      "const g = await import('../revisao/gate.ts')",
      "const g = await import('@/lib/creatives/revisao/gate-registro')",
      "const g = await import(\"./gate\")",
      "const r = require('../gate-registro')",
      "export { lerGateDaArte } from './gate-registro'",
      "export * from '../revisao/gate'",
      "export { gateDaMedida as g } from '@/lib/creatives/revisao/gate.ts'",
    ]
    const pegaTambem = ["const g = await import ('../gate')", "const g = await import\n  ('../revisao/gate')", "const r = require (\n  './gate-registro'\n)", "export {\n  lerGateDaArte,\n} from '../gate-registro'"]
    const naoPega = ["import { x } from './gateway'", "const g = await import('../revisao/gate-fixtures')", "export * from './registro'", "// fala do gate em prosa", "const importante = ('gate')"]
    for (const l of [...casosQuePega, ...pegaTambem]) expect(pega_(l), l).toBe(true)
    for (const l of naoPega) expect(pega_(l), l).toBe(false)
  })
})

describe('H12 (a) — a barreira por import no lint', () => {
  const eslint = new ESLint({ cwd: raiz })
  const errosDe = async (codigo: string, filePath: string) => {
    const [r] = await eslint.lintText(codigo, { filePath: join(raiz, filePath) })
    return r.messages.filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message)
  }

  it('gateDaMedida por alias, por caminho relativo de fora e do mesmo diretório → o lint falha (também com `as`)', async () => {
    const casos: Array<[string, string]> = [
      ["import { gateDaMedida } from '@/lib/creatives/revisao/gate'\nexport const x = gateDaMedida\n", 'src/lib/creatives/controle.tmp.ts'],
      ["import { gateDaMedida as g } from '../revisao/gate'\nexport const x = g\n", 'src/lib/creatives/agendar/controle.tmp.ts'],
      ["import { gateDaMedida } from './gate'\nexport const x = gateDaMedida\n", 'src/lib/creatives/revisao/controle.tmp.ts'],
      ["import { lerGateDaArte } from '@/lib/creatives/revisao/gate-registro'\nexport const x = lerGateDaArte\n", 'src/lib/lotes/controle.tmp.ts'],
      ["import { decidirEMontarRegistro } from './gate-registro'\nexport const x = decidirEMontarRegistro\n", 'src/lib/creatives/revisao/controle.tmp.ts'],
      // Codex R1 do PR #240: de uma SUBPASTA de revisao/, `../gate` escapava de `**/revisao/gate`.
      ["import { gateDaMedida } from '../gate'\nexport const x = gateDaMedida\n", 'src/lib/creatives/revisao/subdir/controle.tmp.ts'],
      ["import { gateDaMedida as g } from '../../gate'\nexport const x = g\n", 'src/lib/creatives/revisao/a/b/controle.tmp.ts'],
      ["import { lerGateDaArte } from '../gate-registro'\nexport const x = lerGateDaArte\n", 'src/lib/creatives/revisao/subdir/controle.tmp.ts'],
      ["import { gateDaMedida } from '../../creatives/revisao/gate.ts'\nexport const x = gateDaMedida\n", 'src/lib/mcp/catalogo/controle.tmp.ts'],
    ]
    for (const [codigo, caminho] of casos) {
      const erros = await errosDe(codigo, caminho)
      expect(erros.length, `${caminho}: ${codigo}`).toBeGreaterThan(0)
      expect(erros[0]).toMatch(/CP5b/)
    }
  }, 60_000)

  it('os consumidores nomeados passam (e o próprio código deles também); gate-persistido não pode chamar gateDaMedida', async () => {
    expect(await errosDe("import { lerGateDaArte, validadeDoGate } from '../../creatives/revisao/gate-registro'\nexport const x = [lerGateDaArte, validadeDoGate]\n", 'src/lib/mcp/catalogo/ver-geracao-retorno.ts')).toEqual([])
    expect(await errosDe("import { gateDaMedida } from './gate'\nexport const x = gateDaMedida\n", 'src/lib/creatives/revisao/gate-registro.ts')).toEqual([])
    expect((await errosDe("import { gateDaMedida } from './gate'\nexport const x = gateDaMedida\n", 'src/lib/creatives/revisao/gate-persistido.ts')).length).toBeGreaterThan(0)
    // Um teste pode tudo.
    expect(await errosDe("import { gateDaMedida } from '../gate'\nexport const x = gateDaMedida\n", 'src/lib/creatives/revisao/__tests__/qualquer.test.ts')).toEqual([])
    for (const real of ['src/lib/creatives/revisao/gate-persistido.ts', 'src/lib/mcp/catalogo/ver-geracao-retorno.ts', 'src/lib/mcp/catalogo/arte-ia.ts', 'src/lib/creatives/revisao/gate-registro.ts']) {
      expect(await errosDe(readFileSync(join(raiz, real), 'utf8'), real), real).toEqual([])
    }
  }, 60_000)
})
