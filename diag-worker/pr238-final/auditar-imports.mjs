// Auditoria ESTÁTICA dos imports transitivos de cada teste selecionado (esbuild, bundle com metafile; pacotes de
// node_modules ficam de fora). Falha se o grafo de algum teste alcança um módulo de fixture com dado real — inclusive
// `corpus-do-gate.ts`, cujo CORPUS_BASE lê o peca.json do piloto NO IMPORT.
// Uso: node diag-worker/pr238-final/auditar-imports.mjs <lista>... (relativo à raiz do repositório)
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
// Leitura por CAMINHO em tempo de execução (não aparece como import): todo módulo do grafo que cita a pasta da fixture.
const LEITURA_DE_FIXTURE = /fixtures['"]?\s*,\s*['"]piloto|fixtures\/piloto|piloto-2026-10-13|piloto-sintetico\//
const PROIBIDOS = [/direcao-de-arte\/__tests__\/fixtures\//, /direcao-de-arte\/__tests__\/suporte\/fixture(s-de-clientes)?\.ts$/, /brand\/__tests__\/fixtures\//, /^scripts\/fixtures\//, /fixtures-de-clientes/, /revisao\/__tests__\/suporte\/corpus-do-gate\.ts$/]
const arquivos = [...new Set(process.argv.slice(2).flatMap((l) => readFileSync(l, 'utf8').split('\n').filter(Boolean)))]
let violacoes = 0
const vistos = new Set()
for (const f of arquivos) {
  const r = await build({ entryPoints: [f], bundle: true, write: false, metafile: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', loader: { '.md': 'text', '.node': 'empty' }, tsconfig: 'tsconfig.json' })
  const entradas = Object.keys(r.metafile.inputs)
  entradas.forEach((e) => vistos.add(e))
  const ruins = entradas.filter((e) => PROIBIDOS.some((p) => p.test(e)))
  if (ruins.length) { violacoes++; console.log(`VIOLA ${f}: ${ruins.join(', ')}`) }
}
const fixtureLike = [...vistos].filter((e) => /fixture/i.test(e)).sort()
const lemPorCaminho = [...vistos].filter((e) => !e.startsWith('node_modules') && LEITURA_DE_FIXTURE.test(readFileSync(e, 'utf8'))).sort()
console.log(JSON.stringify({ testes: arquivos.length, modulosNoGrafo: vistos.size, violacoes, modulosComFixtureNoNome: fixtureLike, modulosQueCitamAPastaDaFixture: lemPorCaminho }, null, 1))
process.exit(violacoes ? 1 : 0)
