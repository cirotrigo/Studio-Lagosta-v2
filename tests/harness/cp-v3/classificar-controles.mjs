// Roda cada controle negativo do harness do CP-V3 (`CP3_VARIANTE=M1…M11`) e classifica a execução:
// - VALIDO: cada falha esperada (`VARIANTES[x].esperadas`) aconteceu no teste dela, com a etiqueta `[Hx]`/`[Px]` na
//   mensagem (falha SEMÂNTICA nomeada). Outras falhas semânticas entram como colaterais, listadas.
// - INSENSIVEL: algum teste esperado passou com a variante.
// - INVALIDO: o bundle não montou (troca que não aplicou), houve erro global, ou QUALQUER teste falhou sem etiqueta
//   semântica (`[INFRA]`, timeout, erro de página, pré-condição não alcançada), esperado ou não. Nunca conta como
//   sensibilidade: uma rodada com infraestrutura quebrada não prova nada sobre o produto.
// `--grep=<regex>` roda só um SUBCONJUNTO declarado (saída `<variante>-subconjunto.json`); a rodada integral continua
// valendo como registro e nunca é escondida.
//
//   node tests/harness/cp-v3/classificar-controles.mjs <pasta-de-saida> [--grep=<regex>] [M1 M2 …]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [saida, ...resto] = process.argv.slice(2)
const grep = resto.find((a) => a.startsWith('--grep='))?.slice('--grep='.length)
const pedidas = resto.filter((a) => !a.startsWith('--grep='))
if (!saida) throw new Error('uso: classificar-controles.mjs <pasta-de-saida> [variantes…]')
mkdirSync(saida, { recursive: true })
const fonte = readFileSync(new URL('./cp-v3.spec.ts', import.meta.url), 'utf8')
const esperadasDe = Object.fromEntries(
  [...fonte.matchAll(/^ {2}(M\d+): \{[\s\S]*?esperadas: \[([^\]]*)\]/gm)].map((m) => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])]),
)
const variantes = pedidas.length ? pedidas : Object.keys(esperadasDe)

function testes(relatorio) {
  const lista = []
  const andar = (suite) => {
    for (const s of suite.suites ?? []) andar(s)
    for (const spec of suite.specs ?? []) {
      const r = spec.tests?.[0]?.results?.at(-1)
      lista.push({ titulo: spec.title, status: r?.status ?? 'nao-rodou', erro: (r?.errors ?? []).map((e) => e.message ?? '').join('\n') })
    }
  }
  for (const s of relatorio.suites ?? []) andar(s)
  return lista
}
const etiqueta = (titulo) => titulo.split(' ')[0]
const semCor = (t) => t.replace(/\u001b\[[0-9;]*m/g, '')

const resumo = []
for (const v of variantes) {
  const arquivo = path.join(saida, `${v}${grep ? '-subconjunto' : ''}.json`)
  let codigo = 0
  try {
    execFileSync('npx', ['playwright', 'test', '-c', 'tests/harness/cp-v3/playwright.config.ts', '--reporter=json', ...(grep ? ['-g', grep] : [])], {
      env: { ...process.env, CP3_VARIANTE: v, PLAYWRIGHT_JSON_OUTPUT_NAME: arquivo },
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch (e) {
    codigo = e.status ?? 1
  }
  let relatorio
  try {
    relatorio = JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch {
    resumo.push({ variante: v, exit: codigo, classe: 'INVALIDO', motivo: 'sem relatório JSON' })
    continue
  }
  const ts = testes(relatorio)
  const errosGlobais = (relatorio.errors ?? []).map((e) => semCor(e.message ?? '')).join('\n')
  const falhas = ts.filter((t) => t.status !== 'passed' && t.status !== 'skipped')
  const esperadas = esperadasDe[v] ?? []
  const semantica = (t) => /\[[HPU]\d+[a-z]?\]/.test(semCor(t.erro)) && !/\[(INFRA|INVALIDA)\]/.test(semCor(t.erro))
  const infra = falhas.filter((t) => !semantica(t))
  let classe
  let motivo = ''
  if (ts.length === 0 || errosGlobais.trim() !== '' || ts.every((t) => t.status === 'nao-rodou')) {
    classe = 'INVALIDO'
    motivo = semCor(errosGlobais).split('\n')[0] || 'nenhum teste rodou'
  } else if (infra.length) {
    classe = 'INVALIDO'
    motivo = `falha não semântica em ${infra.map((t) => etiqueta(t.titulo)).join(', ')} — ${(semCor(infra[0].erro).match(/\[(INFRA|INVALIDA)\][^\n]*/) ?? [semCor(infra[0].erro).split('\n')[0]])[0].slice(0, 160)}`
  } else {
    const detectadas = esperadas.filter((tag) => falhas.some((t) => etiqueta(t.titulo) === tag && semCor(t.erro).includes(`[${tag}`)))
    const faltando = esperadas.filter((tag) => !detectadas.includes(tag))
    if (faltando.length) {
      classe = 'INSENSIVEL'
      motivo = `passou sem detectar: ${faltando.join(', ')}`
    } else {
      classe = 'VALIDO'
    }
  }
  resumo.push({
    variante: v,
    subconjunto: grep ?? null,
    exit: codigo,
    classe,
    motivo,
    esperadas,
    falharam: falhas.map((t) => ({ teste: etiqueta(t.titulo), mensagem: (semCor(t.erro).match(/\[[A-Z]+\d*[a-z]?\][^\n]*/) ?? ['(sem etiqueta)'])[0] })),
    colaterais: falhas.map((t) => etiqueta(t.titulo)).filter((x) => !esperadas.includes(x)),
    passaram: ts.filter((t) => t.status === 'passed').length,
    total: ts.length,
  })
  console.log(`${v}: ${classe}${motivo ? ` (${motivo})` : ''}`)
}
writeFileSync(path.join(saida, grep ? 'resumo-subconjunto.json' : 'resumo.json'), JSON.stringify(resumo, null, 2))
